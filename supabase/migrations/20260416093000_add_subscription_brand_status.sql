-- Add brand and status to manually tracked subscriptions
ALTER TABLE finance_subscriptions
  ADD COLUMN IF NOT EXISTS brand TEXT DEFAULT 'Unassigned',
  ADD COLUMN IF NOT EXISTS status TEXT DEFAULT 'active'
    CHECK (status IN ('active', 'inactive', 'cancelled'));

-- New table for auto-detected subscriptions (grouped by description)
-- Uses description as the key since auto-detected subs come from grouping transactions
CREATE TABLE IF NOT EXISTS finance_subscription_meta (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  description_key TEXT NOT NULL UNIQUE,
  brand TEXT DEFAULT 'Unassigned',
  status TEXT DEFAULT 'active' CHECK (status IN ('active', 'inactive', 'cancelled')),
  updated_at TIMESTAMPTZ DEFAULT now(),
  created_at TIMESTAMPTZ DEFAULT now()
);

ALTER TABLE finance_subscription_meta ENABLE ROW LEVEL SECURITY;
CREATE POLICY "auth_select" ON finance_subscription_meta FOR SELECT TO authenticated USING (true);
CREATE POLICY "auth_insert" ON finance_subscription_meta FOR INSERT TO authenticated WITH CHECK (true);
CREATE POLICY "auth_update" ON finance_subscription_meta FOR UPDATE TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY "auth_delete" ON finance_subscription_meta FOR DELETE TO authenticated USING (true);
