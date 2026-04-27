drop policy if exists "performance_brand_day_authenticated_select" on public.performance_brand_day;
drop policy if exists "performance_brand_day_allowed_select" on public.performance_brand_day;
drop policy if exists "performance_brand_day_allowed_insert" on public.performance_brand_day;
drop policy if exists "performance_brand_day_allowed_update" on public.performance_brand_day;

create policy "performance_brand_day_allowed_select"
on public.performance_brand_day
for select
to authenticated
using (
  split_part(public.current_request_email(), '@', 1) in ('iskander', 'nicolas', 'naomi')
);

create policy "performance_brand_day_allowed_insert"
on public.performance_brand_day
for insert
to authenticated
with check (
  split_part(public.current_request_email(), '@', 1) in ('iskander', 'nicolas', 'naomi')
);

create policy "performance_brand_day_allowed_update"
on public.performance_brand_day
for update
to authenticated
using (
  split_part(public.current_request_email(), '@', 1) in ('iskander', 'nicolas', 'naomi')
)
with check (
  split_part(public.current_request_email(), '@', 1) in ('iskander', 'nicolas', 'naomi')
);
