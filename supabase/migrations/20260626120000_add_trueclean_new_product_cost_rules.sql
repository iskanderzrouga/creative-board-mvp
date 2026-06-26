-- TrueClean expanded its catalog beyond the Swoosh 'N Shine toilet line:
--   * CaptureCards dust-mite traps (CC-DM-*)        — new ad-driven product
--   * Washing Machine Reset enzyme tablets          — new ad-driven product
--   * Swoosh Tabs (TC-TABS-*)                        — accessory / upsell
--   * 3-cartridge refill pack (TC-RF-3*)             — straggler SKU, no rule
--
-- Before this migration none of these SKUs matched a product cost rule, so the
-- engine booked $0 COGS for them (profit overstated) AND counted them as toilet
-- "kits" toward the SNS shipping table (a card mailer billed like an $11.60 kit).
--
-- These rules fix BOTH: they register every SKU and set count_for_shipping=false
-- so non-kit products no longer borrow the toilet shipping rates.
--
-- Cost status (2026-06-26):
--   * CaptureCards — COSTED. 0.45 USD/card (current batch: 6,000 pieces @ 1.80 USD
--     per 4-card box). Modeled as cartridge_unit_cost x cards_per_pack. When the
--     6k batch depletes the price drops — add a dated rule above these then.
--   * WasherReset — PAUSED (product discontinued, supplier order cancelled).
--   * Swoosh Tabs / 3-refill — Tabs still stubbed at 0 (needs_cost); refill costed
--     at 0.65/cartridge.
--
-- NOTE: CaptureCards SHIPPING (US "Normal line", by box count = cards/4):
--   1=$6.04, 2=$7.50, 3=$9.00, 4=$10.90, 5=$12.80, 6=$14.40, 7=$16.20,
--   8=$16.80, 9=$18.60, and +$2.00 per box beyond 9.
-- It is NOT wired here — the shipping engine is order-level and not yet product-
-- scoped. It lands with the product-aware shipping change + the per-product
-- breakdown. Until then cards book $0 shipping in the blended brand row.
--
-- Also pending in the engine (not a cost rule): payment fee should be Shopify
-- Payments (2.9% + $0.30/order, currently a flat 2.6%), and refund reserve should
-- be per-product (3% CaptureCards / 5% Swoosh 'N Shine, currently a flat 5%).

insert into public.performance_cost_rules (
  brand_slug, cost_type, label, status, priority,
  region_key, country_code, province_codes,
  sku_pattern, title_pattern, variant_pattern,
  min_kit_quantity, max_kit_quantity, kit_multiplier, cartridges_per_kit,
  dispenser_unit_cost, cartridge_unit_cost, fixed_cost, per_extra_kit_cost,
  effective_from, effective_to, notes, metadata
) values
  (
    'trueclean', 'product', 'CaptureCards dust-mite 4-card pack', 'active', 7,
    null, null, '{}',
    '^CC-DM-(AOV-)?4C$', null, null,
    null, null, 1, 4,
    0, 0.45, 0, null,
    null, null,
    'CaptureCards 4-card pack = 1 box (incl. AOV variant). COGS = quantity x cartridge_unit_cost x 4. Current batch: 6,000 pieces at 1.80 USD/box = 0.45 USD/card. Add a dated rule above this when the batch depletes and the price changes.',
    '{"source":"user_cost_input","product":"capturecards","pack_cards":4,"cards_per_box":4,"cost_per_box":1.80,"batch_pieces":6000,"batch":"current","count_for_shipping":false}'
  ),
  (
    'trueclean', 'product', 'CaptureCards dust-mite 8-card pack', 'active', 7,
    null, null, '{}',
    '^CC-DM-8C$', null, null,
    null, null, 1, 8,
    0, 0.45, 0, null,
    null, null,
    'CaptureCards 8-card pack = 2 boxes. COGS = quantity x cartridge_unit_cost x 8. Current batch 0.45 USD/card (1.80 USD/box).',
    '{"source":"user_cost_input","product":"capturecards","pack_cards":8,"cards_per_box":4,"cost_per_box":1.80,"batch_pieces":6000,"batch":"current","count_for_shipping":false}'
  ),
  (
    'trueclean', 'product', 'CaptureCards dust-mite 12-card pack', 'active', 7,
    null, null, '{}',
    '^CC-DM-12C$', null, null,
    null, null, 1, 12,
    0, 0.45, 0, null,
    null, null,
    'CaptureCards 12-card pack = 3 boxes. COGS = quantity x cartridge_unit_cost x 12. Current batch 0.45 USD/card (1.80 USD/box).',
    '{"source":"user_cost_input","product":"capturecards","pack_cards":12,"cards_per_box":4,"cost_per_box":1.80,"batch_pieces":6000,"batch":"current","count_for_shipping":false}'
  ),
  (
    'trueclean', 'product', 'CaptureCards dust-mite 20-card pack', 'active', 7,
    null, null, '{}',
    '^CC-DM-(AOV-)?20C$', null, null,
    null, null, 1, 20,
    0, 0.45, 0, null,
    null, null,
    'CaptureCards 20-card pack = 5 boxes (incl. AOV variant). COGS = quantity x cartridge_unit_cost x 20. Current batch 0.45 USD/card (1.80 USD/box).',
    '{"source":"user_cost_input","product":"capturecards","pack_cards":20,"cards_per_box":4,"cost_per_box":1.80,"batch_pieces":6000,"batch":"current","count_for_shipping":false}'
  ),
  (
    'trueclean', 'product', 'WasherReset enzyme tablets', 'paused', 7,
    null, null, '{}',
    null, 'Washing Machine Reset|WasherReset|Enzyme Cleaning', null,
    null, null, 1, null,
    null, null, 0, null,
    null, null,
    'PAUSED 2026-06-26: product discontinued, supplier order cancelled. Rule kept inactive for history; no COGS tracked. Re-activate and set fixed_cost if the product returns.',
    '{"source":"user_cost_input","product":"washerreset","status":"paused","count_for_shipping":false}'
  ),
  (
    'trueclean', 'product', 'Swoosh Tabs', 'active', 7,
    null, null, '{}',
    '^TC-TABS', null, null,
    null, null, 1, null,
    null, null, 0, null,
    null, null,
    'Swoosh Tabs accessory (TC-TABS-1PK..4PK-6M). COGS = quantity x fixed_cost. NEEDS COST: set fixed_cost (split into per-pack rules if cost varies by pack size).',
    '{"source":"user_cost_input","product":"swoosh_tabs","needs_cost":true,"count_for_shipping":false}'
  ),
  (
    'trueclean', 'product', 'TrueClean 3-refill cartridge pack - current cartridge cost', 'active', 6,
    null, null, '{}',
    '^TC-RF-3', 'Refills', null,
    null, null, 1, 3,
    0, 0.65, 0, null,
    '2026-05-03', null,
    'Three cartridge refill pack at current 0.65 USD cartridge cost (mirrors the 4-refill pack rule).',
    '{"source":"user_cost_input","offer":"3_refill_pack","cartridge_batch":"current","count_for_shipping":false}'
  )
on conflict (brand_slug, label) do update
set
  cost_type = excluded.cost_type,
  status = excluded.status,
  priority = excluded.priority,
  region_key = excluded.region_key,
  country_code = excluded.country_code,
  province_codes = excluded.province_codes,
  sku_pattern = excluded.sku_pattern,
  title_pattern = excluded.title_pattern,
  variant_pattern = excluded.variant_pattern,
  min_kit_quantity = excluded.min_kit_quantity,
  max_kit_quantity = excluded.max_kit_quantity,
  kit_multiplier = excluded.kit_multiplier,
  cartridges_per_kit = excluded.cartridges_per_kit,
  dispenser_unit_cost = excluded.dispenser_unit_cost,
  cartridge_unit_cost = excluded.cartridge_unit_cost,
  fixed_cost = excluded.fixed_cost,
  per_extra_kit_cost = excluded.per_extra_kit_cost,
  effective_from = excluded.effective_from,
  effective_to = excluded.effective_to,
  notes = excluded.notes,
  metadata = excluded.metadata,
  updated_at = now();


-- ──────────────────────────────────────────────────────────────────────────
-- Corrections to existing Swoosh 'N Shine rules (confirmed with the user +
-- the May carrier invoice, 2026-06-26).
-- ──────────────────────────────────────────────────────────────────────────

-- 10-YEAR REFILL COGS double-count fix.
-- User confirmed: 1 cartridge lasts ~3 months -> 4/year -> 40 per 10-year supply.
-- TC-RF-40 is 40 cartridges TOTAL. The rule's metadata.offer='10_year_refill'
-- made the engine multiply by the title's "4x" ON TOP of the 40 cartridges/kit
-- (160 -> ~$104/unit). Pin kit_multiplier = 1 so COGS = 40 x cartridge cost (~$26).
update public.performance_cost_rules
set kit_multiplier = 1,
    notes = coalesce(notes, '') || ' [2026-06-26: pinned kit_multiplier=1 — 40 cartridges total (~$26/unit), the "4x" in the title is not an extra multiplier. NOTE: this is a heavy item (~6.5kg) that ships ~$90+ in actuals but currently books $0 shipping; real refill shipping needs the product-scoped shipping change.]',
    updated_at = now()
where brand_slug = 'trueclean'
  and label in (
    'TrueClean 10-year refill supply - first 10k cartridge batch',
    'TrueClean 10-year refill supply - current cartridge cost'
  );

-- Swoosh 'N Shine US contiguous shipping refreshed to the current rate card
-- (June 26 2026), which the May invoice actuals confirm within ~5%.
update public.performance_cost_rules set fixed_cost = 12.30,
  notes = 'US contiguous 1-kit shipping refreshed to 12.30 (rate card 2026-06-26; May invoice actual avg 11.19).', updated_at = now()
  where brand_slug = 'trueclean' and label = 'TrueClean US contiguous 1 kit';
update public.performance_cost_rules set fixed_cost = 17.80,
  notes = 'US contiguous 2-kit shipping refreshed to 17.80 (rate card 2026-06-26; May invoice actual avg 18.25).', updated_at = now()
  where brand_slug = 'trueclean' and label = 'TrueClean US contiguous 2 kits';
update public.performance_cost_rules set fixed_cost = 25.00,
  notes = 'US contiguous 3-kit shipping refreshed to 25.00 (rate card 2026-06-26; May invoice actual avg 25.91).', updated_at = now()
  where brand_slug = 'trueclean' and label = 'TrueClean US contiguous 3 kits';
update public.performance_cost_rules set fixed_cost = 32.40,
  notes = 'US contiguous 4-kit shipping refreshed to 32.40 (rate card 2026-06-26; May invoice actual avg 34.03).', updated_at = now()
  where brand_slug = 'trueclean' and label = 'TrueClean US contiguous 4 kits';
update public.performance_cost_rules set fixed_cost = 32.40, per_extra_kit_cost = 6.50,
  notes = 'US contiguous 5+ kit shipping: base 32.40 at 4 kits + 6.50 per extra kit (from May invoice actuals: 5=37.72, 6=46.19, 8=61.11).', updated_at = now()
  where brand_slug = 'trueclean' and label = 'TrueClean US contiguous 5+ kits';
