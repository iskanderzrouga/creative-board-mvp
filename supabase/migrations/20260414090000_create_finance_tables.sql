create table if not exists public.finance_transactions (
  id uuid default gen_random_uuid() primary key,
  slash_id text unique,
  description text not null,
  amount numeric(12,2) not null,
  direction text not null check (direction in ('in', 'out')),
  date date not null,
  category text not null default 'unclassified'
    check (category in ('unclassified','subscription','salary','one_time','revenue','refund','ad_spend','cogs')),
  source text not null default 'slash' check (source in ('slash', 'manual')),
  status text default 'posted',
  created_at timestamptz default now()
);

create table if not exists public.finance_subscriptions (
  id uuid default gen_random_uuid() primary key,
  name text not null,
  amount numeric(12,2) not null,
  frequency text not null check (frequency in ('weekly', 'monthly', 'yearly')),
  platform text default '',
  active boolean default true,
  created_at timestamptz default now()
);

create table if not exists public.finance_patterns (
  id uuid default gen_random_uuid() primary key,
  pattern text not null unique,
  category text not null,
  created_at timestamptz default now()
);

alter table public.finance_transactions enable row level security;
alter table public.finance_subscriptions enable row level security;
alter table public.finance_patterns enable row level security;

drop policy if exists "finance_transactions_authenticated_select" on public.finance_transactions;
drop policy if exists "finance_transactions_authenticated_insert" on public.finance_transactions;
drop policy if exists "finance_transactions_authenticated_update" on public.finance_transactions;
drop policy if exists "finance_transactions_authenticated_delete" on public.finance_transactions;

create policy "finance_transactions_authenticated_select"
on public.finance_transactions
for select
to authenticated
using (true);

create policy "finance_transactions_authenticated_insert"
on public.finance_transactions
for insert
to authenticated
with check (true);

create policy "finance_transactions_authenticated_update"
on public.finance_transactions
for update
to authenticated
using (true)
with check (true);

create policy "finance_transactions_authenticated_delete"
on public.finance_transactions
for delete
to authenticated
using (true);

drop policy if exists "finance_subscriptions_authenticated_select" on public.finance_subscriptions;
drop policy if exists "finance_subscriptions_authenticated_insert" on public.finance_subscriptions;
drop policy if exists "finance_subscriptions_authenticated_update" on public.finance_subscriptions;
drop policy if exists "finance_subscriptions_authenticated_delete" on public.finance_subscriptions;

create policy "finance_subscriptions_authenticated_select"
on public.finance_subscriptions
for select
to authenticated
using (true);

create policy "finance_subscriptions_authenticated_insert"
on public.finance_subscriptions
for insert
to authenticated
with check (true);

create policy "finance_subscriptions_authenticated_update"
on public.finance_subscriptions
for update
to authenticated
using (true)
with check (true);

create policy "finance_subscriptions_authenticated_delete"
on public.finance_subscriptions
for delete
to authenticated
using (true);

drop policy if exists "finance_patterns_authenticated_select" on public.finance_patterns;
drop policy if exists "finance_patterns_authenticated_insert" on public.finance_patterns;
drop policy if exists "finance_patterns_authenticated_update" on public.finance_patterns;
drop policy if exists "finance_patterns_authenticated_delete" on public.finance_patterns;

create policy "finance_patterns_authenticated_select"
on public.finance_patterns
for select
to authenticated
using (true);

create policy "finance_patterns_authenticated_insert"
on public.finance_patterns
for insert
to authenticated
with check (true);

create policy "finance_patterns_authenticated_update"
on public.finance_patterns
for update
to authenticated
using (true)
with check (true);

create policy "finance_patterns_authenticated_delete"
on public.finance_patterns
for delete
to authenticated
using (true);
