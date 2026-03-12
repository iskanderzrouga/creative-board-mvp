drop policy if exists "workspace_state_authenticated_insert" on public.workspace_state;
drop policy if exists "workspace_state_authenticated_update" on public.workspace_state;
drop policy if exists "workspace_state_manager_insert" on public.workspace_state;
drop policy if exists "workspace_state_manager_update" on public.workspace_state;

create policy "workspace_state_manager_insert"
on public.workspace_state
for insert
to authenticated
with check (
  exists (
    select 1
    from public.workspace_access access
    where access.email = public.current_request_email()
      and access.role_mode = 'manager'
  )
);

create policy "workspace_state_manager_update"
on public.workspace_state
for update
to authenticated
using (
  exists (
    select 1
    from public.workspace_access access
    where access.email = public.current_request_email()
      and access.role_mode = 'manager'
  )
)
with check (
  exists (
    select 1
    from public.workspace_access access
    where access.email = public.current_request_email()
      and access.role_mode = 'manager'
  )
);
