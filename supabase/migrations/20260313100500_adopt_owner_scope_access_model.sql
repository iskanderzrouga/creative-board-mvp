alter table public.workspace_access
  add column if not exists scope_mode text not null default 'all-portfolios',
  add column if not exists scope_assignments jsonb not null default '[]'::jsonb;

update public.workspace_access
set scope_mode = coalesce(scope_mode, 'all-portfolios'),
    scope_assignments = coalesce(scope_assignments, '[]'::jsonb);

update public.workspace_access
set role_mode = 'contributor'
where role_mode = 'editor';

update public.workspace_access
set role_mode = 'viewer'
where role_mode = 'observer';

do $$
begin
  if not exists (
    select 1
    from public.workspace_access access
    where access.role_mode = 'owner'
  ) then
    update public.workspace_access
    set
      role_mode = 'owner',
      scope_mode = 'all-portfolios',
      scope_assignments = '[]'::jsonb,
      updated_at = timezone('utc', now())
    where email = (
      select access.email
      from public.workspace_access access
      where access.role_mode = 'manager'
      order by access.created_at asc, access.email asc
      limit 1
    );
  end if;
end;
$$;

alter table public.workspace_access
  drop constraint if exists workspace_access_role_mode_check,
  drop constraint if exists workspace_access_editor_assignment,
  drop constraint if exists workspace_access_contributor_identity,
  drop constraint if exists workspace_access_scope_mode_check,
  drop constraint if exists workspace_access_scope_assignments_is_array;

alter table public.workspace_access
  add constraint workspace_access_role_mode_check
    check (role_mode in ('owner', 'manager', 'contributor', 'viewer')),
  add constraint workspace_access_contributor_identity
    check (
      (role_mode = 'contributor' and editor_name is not null and length(trim(editor_name)) > 0)
      or (role_mode <> 'contributor' and editor_name is null)
    ),
  add constraint workspace_access_scope_mode_check
    check (scope_mode in ('all-portfolios', 'selected-portfolios', 'selected-brands')),
  add constraint workspace_access_scope_assignments_is_array
    check (jsonb_typeof(scope_assignments) = 'array');

create or replace function public.current_user_is_workspace_owner()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.workspace_access access
    where access.email = public.current_request_email()
      and access.role_mode = 'owner'
  );
$$;

create or replace function public.current_user_can_write_workspace_state()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.workspace_access access
    where access.email = public.current_request_email()
      and access.role_mode in ('owner', 'manager')
  );
$$;

grant execute on function public.current_user_is_workspace_owner() to authenticated;
grant execute on function public.current_user_can_write_workspace_state() to authenticated;

drop policy if exists "workspace_access_self_select" on public.workspace_access;
drop policy if exists "workspace_access_manager_select" on public.workspace_access;
drop policy if exists "workspace_access_manager_insert" on public.workspace_access;
drop policy if exists "workspace_access_manager_update" on public.workspace_access;
drop policy if exists "workspace_access_manager_delete" on public.workspace_access;
drop policy if exists "workspace_access_owner_select" on public.workspace_access;
drop policy if exists "workspace_access_owner_insert" on public.workspace_access;
drop policy if exists "workspace_access_owner_update" on public.workspace_access;
drop policy if exists "workspace_access_owner_delete" on public.workspace_access;

create policy "workspace_access_self_select"
on public.workspace_access
for select
to authenticated
using (email = public.current_request_email());

create policy "workspace_access_owner_select"
on public.workspace_access
for select
to authenticated
using (public.current_user_is_workspace_owner());

create policy "workspace_access_owner_insert"
on public.workspace_access
for insert
to authenticated
with check (public.current_user_is_workspace_owner());

create policy "workspace_access_owner_update"
on public.workspace_access
for update
to authenticated
using (public.current_user_is_workspace_owner())
with check (public.current_user_is_workspace_owner());

create policy "workspace_access_owner_delete"
on public.workspace_access
for delete
to authenticated
using (public.current_user_is_workspace_owner());

drop policy if exists "workspace_state_manager_insert" on public.workspace_state;
drop policy if exists "workspace_state_manager_update" on public.workspace_state;
drop policy if exists "workspace_state_owner_manager_insert" on public.workspace_state;
drop policy if exists "workspace_state_owner_manager_update" on public.workspace_state;

create policy "workspace_state_owner_manager_insert"
on public.workspace_state
for insert
to authenticated
with check (public.current_user_can_write_workspace_state());

create policy "workspace_state_owner_manager_update"
on public.workspace_state
for update
to authenticated
using (public.current_user_can_write_workspace_state())
with check (public.current_user_can_write_workspace_state());

create or replace function public.prevent_last_owner_removal()
returns trigger
language plpgsql
as $$
begin
  if (tg_op = 'DELETE' and old.role_mode = 'owner')
    or (tg_op = 'UPDATE' and old.role_mode = 'owner' and new.role_mode <> 'owner') then
    if (
      select count(*)
      from public.workspace_access access
      where access.role_mode = 'owner'
        and access.email <> old.email
    ) = 0 then
      raise exception 'Cannot remove the last workspace owner';
    end if;
  end if;

  return coalesce(new, old);
end;
$$;

drop trigger if exists guard_last_manager on public.workspace_access;
drop trigger if exists guard_last_owner on public.workspace_access;

create trigger guard_last_owner
before update or delete on public.workspace_access
for each row execute function public.prevent_last_owner_removal();
