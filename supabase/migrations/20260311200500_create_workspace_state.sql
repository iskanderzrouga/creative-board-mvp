create table if not exists public.workspace_state (
  workspace_id text primary key,
  state jsonb not null,
  updated_at timestamptz not null default timezone('utc', now())
);

alter table public.workspace_state enable row level security;

drop policy if exists "workspace_state_authenticated_select" on public.workspace_state;
drop policy if exists "workspace_state_authenticated_insert" on public.workspace_state;
drop policy if exists "workspace_state_authenticated_update" on public.workspace_state;

create policy "workspace_state_authenticated_select"
on public.workspace_state
for select
to authenticated
using (true);

create policy "workspace_state_authenticated_insert"
on public.workspace_state
for insert
to authenticated
with check (true);

create policy "workspace_state_authenticated_update"
on public.workspace_state
for update
to authenticated
using (true)
with check (true);
