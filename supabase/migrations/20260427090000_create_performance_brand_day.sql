create table if not exists public.performance_brand_day (
  id uuid default gen_random_uuid() primary key,
  brand_slug text not null,
  brand_name text not null,
  date date not null,
  revenue numeric(14,2) not null default 0,
  orders integer not null default 0,
  meta_spend numeric(14,2) not null default 0,
  axon_spend numeric(14,2) not null default 0,
  google_spend numeric(14,2) not null default 0,
  total_ad_spend numeric(14,2) not null default 0,
  platform_attributed_revenue numeric(14,2) not null default 0,
  platform_roas numeric(10,4) not null default 0,
  blended_roas numeric(10,4) not null default 0,
  cpa numeric(10,2) not null default 0,
  refunds numeric(14,2) not null default 0,
  cogs numeric(14,2) not null default 0,
  contribution_after_ads numeric(14,2) not null default 0,
  net_profit numeric(14,2) not null default 0,
  last_sync timestamptz,
  created_at timestamptz default now(),
  updated_at timestamptz default now(),
  unique (brand_slug, date)
);

alter table public.performance_brand_day enable row level security;

drop policy if exists "performance_brand_day_authenticated_select" on public.performance_brand_day;

create policy "performance_brand_day_authenticated_select"
on public.performance_brand_day
for select
to authenticated
using (true);
