alter table public.workspace_access
  add column if not exists workspace_id text not null default 'primary';

update public.workspace_access
set workspace_id = 'primary'
where workspace_id is null or length(trim(workspace_id)) = 0;

alter table public.workspace_access
  drop constraint if exists workspace_access_workspace_id_not_blank,
  drop constraint if exists workspace_access_pkey;

alter table public.workspace_access
  add constraint workspace_access_workspace_id_not_blank
    check (length(trim(workspace_id)) > 0),
  add constraint workspace_access_pkey
    primary key (workspace_id, email);

create or replace function public.current_user_can_read_workspace(target_workspace_id text)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.workspace_access access
    where access.workspace_id = target_workspace_id
      and access.email = public.current_request_email()
  );
$$;

create or replace function public.current_user_is_workspace_owner(target_workspace_id text)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.workspace_access access
    where access.workspace_id = target_workspace_id
      and access.email = public.current_request_email()
      and access.role_mode = 'owner'
  );
$$;

create or replace function public.current_user_can_write_workspace_state(target_workspace_id text)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.workspace_access access
    where access.workspace_id = target_workspace_id
      and access.email = public.current_request_email()
      and access.role_mode in ('owner', 'manager')
  );
$$;

grant execute on function public.current_user_can_read_workspace(text) to authenticated;
grant execute on function public.current_user_is_workspace_owner(text) to authenticated;
grant execute on function public.current_user_can_write_workspace_state(text) to authenticated;

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
using (public.current_user_is_workspace_owner(workspace_id));

create policy "workspace_access_owner_insert"
on public.workspace_access
for insert
to authenticated
with check (public.current_user_is_workspace_owner(workspace_id));

create policy "workspace_access_owner_update"
on public.workspace_access
for update
to authenticated
using (public.current_user_is_workspace_owner(workspace_id))
with check (public.current_user_is_workspace_owner(workspace_id));

create policy "workspace_access_owner_delete"
on public.workspace_access
for delete
to authenticated
using (public.current_user_is_workspace_owner(workspace_id));

drop policy if exists "workspace_state_authenticated_select" on public.workspace_state;
drop policy if exists "workspace_state_authenticated_insert" on public.workspace_state;
drop policy if exists "workspace_state_authenticated_update" on public.workspace_state;
drop policy if exists "workspace_state_manager_insert" on public.workspace_state;
drop policy if exists "workspace_state_manager_update" on public.workspace_state;
drop policy if exists "workspace_state_owner_manager_insert" on public.workspace_state;
drop policy if exists "workspace_state_owner_manager_update" on public.workspace_state;

create policy "workspace_state_member_select"
on public.workspace_state
for select
to authenticated
using (public.current_user_can_read_workspace(workspace_id));

create policy "workspace_state_owner_manager_insert"
on public.workspace_state
for insert
to authenticated
with check (public.current_user_can_write_workspace_state(workspace_id));

create policy "workspace_state_owner_manager_update"
on public.workspace_state
for update
to authenticated
using (public.current_user_can_write_workspace_state(workspace_id))
with check (public.current_user_can_write_workspace_state(workspace_id));

drop policy if exists "workspace_backlog_authenticated_select" on public.workspace_backlog;
drop policy if exists "workspace_backlog_owner_manager_insert" on public.workspace_backlog;
drop policy if exists "workspace_backlog_owner_manager_update" on public.workspace_backlog;

create policy "workspace_backlog_member_select"
on public.workspace_backlog
for select
to authenticated
using (public.current_user_can_read_workspace(workspace_id));

create policy "workspace_backlog_owner_manager_insert"
on public.workspace_backlog
for insert
to authenticated
with check (public.current_user_can_write_workspace_state(workspace_id));

create policy "workspace_backlog_owner_manager_update"
on public.workspace_backlog
for update
to authenticated
using (public.current_user_can_write_workspace_state(workspace_id))
with check (public.current_user_can_write_workspace_state(workspace_id));

create or replace function public.prevent_last_owner_removal()
returns trigger
language plpgsql
as $$
begin
  if (tg_op = 'DELETE' and old.role_mode = 'owner')
    or (
      tg_op = 'UPDATE'
      and old.role_mode = 'owner'
      and (new.role_mode <> 'owner' or new.workspace_id <> old.workspace_id)
    ) then
    if (
      select count(*)
      from public.workspace_access access
      where access.workspace_id = old.workspace_id
        and access.role_mode = 'owner'
        and access.email <> old.email
    ) = 0 then
      raise exception 'Cannot remove the last workspace owner';
    end if;
  end if;

  return coalesce(new, old);
end;
$$;

drop trigger if exists guard_last_owner on public.workspace_access;

create trigger guard_last_owner
before update or delete on public.workspace_access
for each row execute function public.prevent_last_owner_removal();
