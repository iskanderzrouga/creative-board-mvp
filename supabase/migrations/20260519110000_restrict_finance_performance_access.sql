create or replace function public.is_finance_allowed_email()
returns boolean
language sql
stable
as $$
  select public.current_request_email() = any (
    array[
      'iskander@bluebrands.co',
      'nicolas@bluebrands.co',
      'naomi@bluebrands.co'
    ]
  );
$$;

drop policy if exists "finance_transactions_authenticated_select" on public.finance_transactions;
drop policy if exists "finance_transactions_authenticated_insert" on public.finance_transactions;
drop policy if exists "finance_transactions_authenticated_update" on public.finance_transactions;
drop policy if exists "finance_transactions_authenticated_delete" on public.finance_transactions;
drop policy if exists "finance_transactions_allowed_select" on public.finance_transactions;
drop policy if exists "finance_transactions_allowed_insert" on public.finance_transactions;
drop policy if exists "finance_transactions_allowed_update" on public.finance_transactions;
drop policy if exists "finance_transactions_allowed_delete" on public.finance_transactions;

create policy "finance_transactions_allowed_select"
on public.finance_transactions
for select
to authenticated
using (public.is_finance_allowed_email());

create policy "finance_transactions_allowed_insert"
on public.finance_transactions
for insert
to authenticated
with check (public.is_finance_allowed_email());

create policy "finance_transactions_allowed_update"
on public.finance_transactions
for update
to authenticated
using (public.is_finance_allowed_email())
with check (public.is_finance_allowed_email());

create policy "finance_transactions_allowed_delete"
on public.finance_transactions
for delete
to authenticated
using (public.is_finance_allowed_email());

drop policy if exists "finance_subscriptions_authenticated_select" on public.finance_subscriptions;
drop policy if exists "finance_subscriptions_authenticated_insert" on public.finance_subscriptions;
drop policy if exists "finance_subscriptions_authenticated_update" on public.finance_subscriptions;
drop policy if exists "finance_subscriptions_authenticated_delete" on public.finance_subscriptions;
drop policy if exists "finance_subscriptions_allowed_select" on public.finance_subscriptions;
drop policy if exists "finance_subscriptions_allowed_insert" on public.finance_subscriptions;
drop policy if exists "finance_subscriptions_allowed_update" on public.finance_subscriptions;
drop policy if exists "finance_subscriptions_allowed_delete" on public.finance_subscriptions;

create policy "finance_subscriptions_allowed_select"
on public.finance_subscriptions
for select
to authenticated
using (public.is_finance_allowed_email());

create policy "finance_subscriptions_allowed_insert"
on public.finance_subscriptions
for insert
to authenticated
with check (public.is_finance_allowed_email());

create policy "finance_subscriptions_allowed_update"
on public.finance_subscriptions
for update
to authenticated
using (public.is_finance_allowed_email())
with check (public.is_finance_allowed_email());

create policy "finance_subscriptions_allowed_delete"
on public.finance_subscriptions
for delete
to authenticated
using (public.is_finance_allowed_email());

drop policy if exists "finance_patterns_authenticated_select" on public.finance_patterns;
drop policy if exists "finance_patterns_authenticated_insert" on public.finance_patterns;
drop policy if exists "finance_patterns_authenticated_update" on public.finance_patterns;
drop policy if exists "finance_patterns_authenticated_delete" on public.finance_patterns;
drop policy if exists "finance_patterns_allowed_select" on public.finance_patterns;
drop policy if exists "finance_patterns_allowed_insert" on public.finance_patterns;
drop policy if exists "finance_patterns_allowed_update" on public.finance_patterns;
drop policy if exists "finance_patterns_allowed_delete" on public.finance_patterns;

create policy "finance_patterns_allowed_select"
on public.finance_patterns
for select
to authenticated
using (public.is_finance_allowed_email());

create policy "finance_patterns_allowed_insert"
on public.finance_patterns
for insert
to authenticated
with check (public.is_finance_allowed_email());

create policy "finance_patterns_allowed_update"
on public.finance_patterns
for update
to authenticated
using (public.is_finance_allowed_email())
with check (public.is_finance_allowed_email());

create policy "finance_patterns_allowed_delete"
on public.finance_patterns
for delete
to authenticated
using (public.is_finance_allowed_email());

drop policy if exists "auth_select" on public.finance_subscription_meta;
drop policy if exists "auth_insert" on public.finance_subscription_meta;
drop policy if exists "auth_update" on public.finance_subscription_meta;
drop policy if exists "auth_delete" on public.finance_subscription_meta;
drop policy if exists "finance_subscription_meta_allowed_select" on public.finance_subscription_meta;
drop policy if exists "finance_subscription_meta_allowed_insert" on public.finance_subscription_meta;
drop policy if exists "finance_subscription_meta_allowed_update" on public.finance_subscription_meta;
drop policy if exists "finance_subscription_meta_allowed_delete" on public.finance_subscription_meta;

create policy "finance_subscription_meta_allowed_select"
on public.finance_subscription_meta
for select
to authenticated
using (public.is_finance_allowed_email());

create policy "finance_subscription_meta_allowed_insert"
on public.finance_subscription_meta
for insert
to authenticated
with check (public.is_finance_allowed_email());

create policy "finance_subscription_meta_allowed_update"
on public.finance_subscription_meta
for update
to authenticated
using (public.is_finance_allowed_email())
with check (public.is_finance_allowed_email());

create policy "finance_subscription_meta_allowed_delete"
on public.finance_subscription_meta
for delete
to authenticated
using (public.is_finance_allowed_email());

drop policy if exists "performance_brand_day_allowed_select" on public.performance_brand_day;
drop policy if exists "performance_brand_day_allowed_insert" on public.performance_brand_day;
drop policy if exists "performance_brand_day_allowed_update" on public.performance_brand_day;

create policy "performance_brand_day_allowed_select"
on public.performance_brand_day
for select
to authenticated
using (public.is_finance_allowed_email());

create policy "performance_brand_day_allowed_insert"
on public.performance_brand_day
for insert
to authenticated
with check (public.is_finance_allowed_email());

create policy "performance_brand_day_allowed_update"
on public.performance_brand_day
for update
to authenticated
using (public.is_finance_allowed_email())
with check (public.is_finance_allowed_email());

drop policy if exists "performance_cost_rules_allowed_select" on public.performance_cost_rules;
drop policy if exists "performance_cost_rules_allowed_insert" on public.performance_cost_rules;
drop policy if exists "performance_cost_rules_allowed_update" on public.performance_cost_rules;
drop policy if exists "performance_cost_rules_allowed_delete" on public.performance_cost_rules;

create policy "performance_cost_rules_allowed_select"
on public.performance_cost_rules
for select
to authenticated
using (public.is_finance_allowed_email());

create policy "performance_cost_rules_allowed_insert"
on public.performance_cost_rules
for insert
to authenticated
with check (public.is_finance_allowed_email());

create policy "performance_cost_rules_allowed_update"
on public.performance_cost_rules
for update
to authenticated
using (public.is_finance_allowed_email())
with check (public.is_finance_allowed_email());

create policy "performance_cost_rules_allowed_delete"
on public.performance_cost_rules
for delete
to authenticated
using (public.is_finance_allowed_email());
