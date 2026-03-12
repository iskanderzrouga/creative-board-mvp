create or replace function public.current_user_is_workspace_manager()
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
      and access.role_mode = 'manager'
  );
$$;

create or replace function public.is_workspace_email_allowed(candidate_email text)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.workspace_access access
    where access.email = lower(trim(candidate_email))
  );
$$;

grant execute on function public.current_user_is_workspace_manager() to authenticated;
grant execute on function public.is_workspace_email_allowed(text) to anon, authenticated;

drop policy if exists "workspace_access_self_select" on public.workspace_access;
drop policy if exists "workspace_access_manager_select" on public.workspace_access;
drop policy if exists "workspace_access_manager_insert" on public.workspace_access;
drop policy if exists "workspace_access_manager_update" on public.workspace_access;
drop policy if exists "workspace_access_manager_delete" on public.workspace_access;

create policy "workspace_access_self_select"
on public.workspace_access
for select
to authenticated
using (email = public.current_request_email());

create policy "workspace_access_manager_select"
on public.workspace_access
for select
to authenticated
using (public.current_user_is_workspace_manager());

create policy "workspace_access_manager_insert"
on public.workspace_access
for insert
to authenticated
with check (public.current_user_is_workspace_manager());

create policy "workspace_access_manager_update"
on public.workspace_access
for update
to authenticated
using (public.current_user_is_workspace_manager())
with check (public.current_user_is_workspace_manager());

create policy "workspace_access_manager_delete"
on public.workspace_access
for delete
to authenticated
using (public.current_user_is_workspace_manager());
