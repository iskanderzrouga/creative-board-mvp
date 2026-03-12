create or replace function public.current_request_email()
returns text
language sql
stable
as $$
  select lower(
    coalesce(
      (
        coalesce(current_setting('request.jwt.claims', true), '{}')::json ->> 'email'
      ),
      ''
    )
  );
$$;

create table if not exists public.workspace_access (
  email text primary key,
  role_mode text not null check (role_mode in ('manager', 'editor', 'observer')),
  editor_name text,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now()),
  constraint workspace_access_email_lowercase check (email = lower(email)),
  constraint workspace_access_editor_assignment check (
    (role_mode = 'editor' and editor_name is not null and length(trim(editor_name)) > 0)
    or (role_mode <> 'editor' and editor_name is null)
  )
);

alter table public.workspace_access enable row level security;

drop policy if exists "workspace_access_self_select" on public.workspace_access;

create policy "workspace_access_self_select"
on public.workspace_access
for select
to authenticated
using (email = public.current_request_email());

drop policy if exists "workspace_state_authenticated_select" on public.workspace_state;
drop policy if exists "workspace_state_authenticated_insert" on public.workspace_state;
drop policy if exists "workspace_state_authenticated_update" on public.workspace_state;

create policy "workspace_state_authenticated_select"
on public.workspace_state
for select
to authenticated
using (
  exists (
    select 1
    from public.workspace_access access
    where access.email = public.current_request_email()
  )
);

create policy "workspace_state_authenticated_insert"
on public.workspace_state
for insert
to authenticated
with check (
  exists (
    select 1
    from public.workspace_access access
    where access.email = public.current_request_email()
  )
);

create policy "workspace_state_authenticated_update"
on public.workspace_state
for update
to authenticated
using (
  exists (
    select 1
    from public.workspace_access access
    where access.email = public.current_request_email()
  )
)
with check (
  exists (
    select 1
    from public.workspace_access access
    where access.email = public.current_request_email()
  )
);

insert into public.workspace_access (email, role_mode, editor_name)
values ('iskander@bluebrands.co', 'manager', null)
on conflict (email) do update
set
  role_mode = excluded.role_mode,
  editor_name = excluded.editor_name,
  updated_at = timezone('utc', now());
