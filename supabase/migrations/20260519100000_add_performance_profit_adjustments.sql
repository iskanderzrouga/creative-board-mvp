alter table public.performance_brand_day
  add column if not exists contribution_margin numeric(10,4) not null default 0,
  add column if not exists refund_reserve numeric(14,2) not null default 0,
  add column if not exists processing_fees numeric(14,2) not null default 0,
  add column if not exists net_profit_margin numeric(10,4) not null default 0;

update public.performance_brand_day
set
  contribution_margin = case
    when revenue > 0 then contribution_after_ads / revenue
    else 0
  end,
  refund_reserve = revenue * 0.05,
  processing_fees = revenue * 0.026,
  net_profit = contribution_after_ads - (revenue * 0.05) - (revenue * 0.026),
  net_profit_margin = case
    when revenue > 0 then (contribution_after_ads - (revenue * 0.05) - (revenue * 0.026)) / revenue
    else 0
  end;
