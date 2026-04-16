-- Drop the old CHECK constraint on category, add a new one with expanded categories
ALTER TABLE finance_transactions
  DROP CONSTRAINT IF EXISTS finance_transactions_category_check;

ALTER TABLE finance_transactions
  ADD CONSTRAINT finance_transactions_category_check
  CHECK (category IN (
    'unclassified', 'subscription', 'salary', 'one_time', 'revenue', 'refund',
    'ad_spend', 'cogs', 'taxes', 'affiliate', 'hr', 'internal_transfer'
  ));
