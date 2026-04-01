create table if not exists public.workspace_backlog (
  workspace_id text primary key,
  state jsonb not null,
  updated_at timestamptz not null default timezone('utc', now())
);

alter table public.workspace_backlog enable row level security;

create policy "workspace_backlog_authenticated_select"
on public.workspace_backlog
for select
to authenticated
using (true);

create policy "workspace_backlog_owner_manager_insert"
on public.workspace_backlog
for insert
to authenticated
with check (public.current_user_can_write_workspace_state());

create policy "workspace_backlog_owner_manager_update"
on public.workspace_backlog
for update
to authenticated
using (public.current_user_can_write_workspace_state())
with check (public.current_user_can_write_workspace_state());

create trigger workspace_backlog_set_updated_at
before insert or update on public.workspace_backlog
for each row
execute function public.touch_workspace_state_updated_at();
