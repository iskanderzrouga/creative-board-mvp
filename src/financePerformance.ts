import { getSupabaseClient } from './supabase'

export type PerformanceBrandSlug = 'pluxy' | 'vivi' | 'trueclean'

export interface BrandDailyPerformanceRow {
  date: string
  brandSlug: PerformanceBrandSlug
  brandName: string
  revenue: number
  orders: number
  metaSpend: number
  metaRevenue: number
  metaPurchases: number
  metaRoas: number
  metaCpa: number
  axonSpend: number
  axonRevenue: number
  axonPurchases: number
  axonRoas: number
  axonCpa: number
  googleSpend: number
  googleRevenue: number
  googlePurchases: number
  googleRoas: number
  googleCpa: number
  totalAdSpend: number
  platformAttributedRevenue: number
  platformRoas: number
  blendedRoas: number
  cpa: number
  totalSales: number
  grossSales: number
  netSales: number
  aov: number
  discounts: number
  refunds: number
  taxes: number
  shipping: number
  sessions: number
  cvr: number
  cogs: number
  productCogs: number
  shippingCost: number
  variableCost: number
  costRulesApplied: Record<string, number>
  contributionAfterAds: number
  contributionMargin: number
  refundReserve: number
  processingFees: number
  netProfit: number
  netProfitMargin: number
  lastSync: string | null
}

export type PerformanceCostType = 'product' | 'shipping'
export type PerformanceCostRuleStatus = 'active' | 'paused'

export interface PerformanceCostRule {
  id: string
  brandSlug: PerformanceBrandSlug
  costType: PerformanceCostType
  label: string
  status: PerformanceCostRuleStatus
  priority: number
  regionKey: string | null
  countryCode: string | null
  provinceCodes: string[]
  skuPattern: string | null
  titlePattern: string | null
  variantPattern: string | null
  minKitQuantity: number | null
  maxKitQuantity: number | null
  kitMultiplier: number | null
  cartridgesPerKit: number | null
  dispenserUnitCost: number | null
  cartridgeUnitCost: number | null
  fixedCost: number | null
  perExtraKitCost: number | null
  effectiveFrom: string | null
  effectiveTo: string | null
  notes: string | null
  metadata: Record<string, unknown>
  createdAt: string | null
  updatedAt: string | null
}

export type PerformanceConnectionPlatform = 'shopify' | 'meta' | 'axon' | 'google_ads'
export type PerformanceConnectionStatus = 'healthy' | 'delayed' | 'no_data' | 'error' | 'not_configured'

export interface PerformanceConnectionHealth {
  brandSlug: PerformanceBrandSlug
  brandName: string
  platform: PerformanceConnectionPlatform
  platformLabel: string
  accountLabel: string
  status: PerformanceConnectionStatus
  detail: string
  lastPulledAt: string | null
  rowsPulled: number
}

export interface BrandDailyPerformanceBundle {
  rows: BrandDailyPerformanceRow[]
  source: 'supabase'
  generatedAt: string
  error?: string
  connections?: PerformanceConnectionHealth[]
  sync?: {
    rowsWritten: number
    errors: string[]
  }
}

export const PERFORMANCE_BRANDS: Array<{ slug: PerformanceBrandSlug; name: string; color: string; tint: string }> = [
  { slug: 'pluxy', name: 'Pluxy', color: '#2563eb', tint: '#eff6ff' },
  { slug: 'vivi', name: 'Vivi', color: '#db2777', tint: '#fdf2f8' },
  { slug: 'trueclean', name: 'TrueClean', color: '#059669', tint: '#ecfdf5' },
]

async function getAccessToken() {
  const supabase = getSupabaseClient()
  if (!supabase) {
    return null
  }

  const { data } = await supabase.auth.getSession()
  return data.session?.access_token ?? null
}

function stringifyApiError(error: unknown) {
  if (!error) {
    return 'Performance data unavailable'
  }

  if (typeof error === 'string') {
    return error
  }

  if (typeof error === 'object') {
    const maybeError = error as { message?: unknown; error?: unknown; details?: unknown; hint?: unknown; code?: unknown }
    const parts = [maybeError.message, maybeError.error, maybeError.details, maybeError.hint, maybeError.code]
      .filter((part): part is string => typeof part === 'string' && part.trim().length > 0)

    if (parts.length > 0) {
      return parts.join(' · ')
    }

    try {
      return JSON.stringify(error)
    } catch {
      return 'Performance data unavailable'
    }
  }

  return String(error)
}

function isPerformanceRow(value: unknown): value is BrandDailyPerformanceRow {
  if (!value || typeof value !== 'object') {
    return false
  }

  const row = value as Partial<BrandDailyPerformanceRow>
  return (
    typeof row.date === 'string' &&
    typeof row.brandSlug === 'string' &&
    typeof row.brandName === 'string' &&
    typeof row.revenue === 'number' &&
    typeof row.totalAdSpend === 'number'
  )
}

function isPerformanceConnection(value: unknown): value is PerformanceConnectionHealth {
  if (!value || typeof value !== 'object') {
    return false
  }

  const connection = value as Partial<PerformanceConnectionHealth>
  return (
    typeof connection.brandSlug === 'string' &&
    typeof connection.brandName === 'string' &&
    typeof connection.platform === 'string' &&
    typeof connection.platformLabel === 'string' &&
    typeof connection.accountLabel === 'string' &&
    typeof connection.status === 'string' &&
    typeof connection.detail === 'string' &&
    (typeof connection.lastPulledAt === 'string' || connection.lastPulledAt === null) &&
    typeof connection.rowsPulled === 'number'
  )
}

function toNumberOrNull(value: unknown) {
  if (value === null || value === undefined || value === '') {
    return null
  }

  const number = Number(value)
  return Number.isFinite(number) ? number : null
}

function toStringOrNull(value: unknown) {
  return typeof value === 'string' && value.trim().length > 0 ? value : null
}

function toStringArray(value: unknown) {
  return Array.isArray(value)
    ? value.filter((item): item is string => typeof item === 'string')
    : []
}

function toMetadata(value: unknown) {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? value as Record<string, unknown>
    : {}
}

function mapCostRuleFromDb(row: Record<string, unknown>): PerformanceCostRule {
  return {
    id: String(row.id),
    brandSlug: String(row.brand_slug) as PerformanceBrandSlug,
    costType: String(row.cost_type) as PerformanceCostType,
    label: String(row.label ?? ''),
    status: String(row.status ?? 'active') as PerformanceCostRuleStatus,
    priority: Number(row.priority ?? 100),
    regionKey: toStringOrNull(row.region_key),
    countryCode: toStringOrNull(row.country_code),
    provinceCodes: toStringArray(row.province_codes),
    skuPattern: toStringOrNull(row.sku_pattern),
    titlePattern: toStringOrNull(row.title_pattern),
    variantPattern: toStringOrNull(row.variant_pattern),
    minKitQuantity: toNumberOrNull(row.min_kit_quantity),
    maxKitQuantity: toNumberOrNull(row.max_kit_quantity),
    kitMultiplier: toNumberOrNull(row.kit_multiplier),
    cartridgesPerKit: toNumberOrNull(row.cartridges_per_kit),
    dispenserUnitCost: toNumberOrNull(row.dispenser_unit_cost),
    cartridgeUnitCost: toNumberOrNull(row.cartridge_unit_cost),
    fixedCost: toNumberOrNull(row.fixed_cost),
    perExtraKitCost: toNumberOrNull(row.per_extra_kit_cost),
    effectiveFrom: toStringOrNull(row.effective_from),
    effectiveTo: toStringOrNull(row.effective_to),
    notes: toStringOrNull(row.notes),
    metadata: toMetadata(row.metadata),
    createdAt: toStringOrNull(row.created_at),
    updatedAt: toStringOrNull(row.updated_at),
  }
}

function mapCostRuleToDb(rule: PerformanceCostRule) {
  return {
    brand_slug: rule.brandSlug,
    cost_type: rule.costType,
    label: rule.label,
    status: rule.status,
    priority: rule.priority,
    region_key: rule.regionKey || null,
    country_code: rule.countryCode || null,
    province_codes: rule.provinceCodes,
    sku_pattern: rule.skuPattern || null,
    title_pattern: rule.titlePattern || null,
    variant_pattern: rule.variantPattern || null,
    min_kit_quantity: rule.minKitQuantity,
    max_kit_quantity: rule.maxKitQuantity,
    kit_multiplier: rule.kitMultiplier,
    cartridges_per_kit: rule.cartridgesPerKit,
    dispenser_unit_cost: rule.dispenserUnitCost,
    cartridge_unit_cost: rule.cartridgeUnitCost,
    fixed_cost: rule.fixedCost,
    per_extra_kit_cost: rule.perExtraKitCost,
    effective_from: rule.effectiveFrom || null,
    effective_to: rule.effectiveTo || null,
    notes: rule.notes || null,
    metadata: rule.metadata,
  }
}

async function requestPerformance(
  method: 'GET' | 'POST',
  input: { from?: string; to?: string; days?: number } = {},
): Promise<BrandDailyPerformanceBundle> {
  const params = new URLSearchParams()
  if (input.from) {
    params.set('from', input.from)
  }
  if (input.to) {
    params.set('to', input.to)
  }
  if (input.days) {
    params.set('days', String(input.days))
  }

  const token = await getAccessToken()
  if (!token) {
    return {
      rows: [],
      source: 'supabase',
      generatedAt: new Date().toISOString(),
      error: 'Sign in with a real Supabase session to load performance data.',
    }
  }

  try {
    const query = params.toString()
    const response = await fetch(`/api/finance/bluebrands-performance${query ? `?${query}` : ''}`, {
      method,
      headers: {
        Accept: 'application/json',
        Authorization: `Bearer ${token}`,
      },
    })
    const payload = (await response.json().catch(() => ({}))) as {
      rows?: unknown
      generatedAt?: unknown
      error?: unknown
      connections?: unknown
      sync?: BrandDailyPerformanceBundle['sync']
    }
    const rows = Array.isArray(payload.rows) ? payload.rows.filter(isPerformanceRow) : []
    const connections = Array.isArray(payload.connections)
      ? payload.connections.filter(isPerformanceConnection)
      : undefined

    return {
      rows,
      source: 'supabase',
      generatedAt: typeof payload.generatedAt === 'string' ? payload.generatedAt : new Date().toISOString(),
      error: response.ok ? undefined : stringifyApiError(payload.error),
      connections,
      sync: payload.sync,
    }
  } catch (error) {
    return {
      rows: [],
      source: 'supabase',
      generatedAt: new Date().toISOString(),
      error: error instanceof Error ? error.message : 'Performance data unavailable',
    }
  }
}

export function loadBrandDailyPerformance(input: { from?: string; to?: string; days?: number } = {}) {
  return requestPerformance('GET', input)
}

export function syncBrandDailyPerformance(input: { from?: string; to?: string; days?: number } = {}) {
  return requestPerformance('POST', input)
}

export interface ProductPLRow {
  key: string
  name: string
  color: string
  revenue: number
  units: number
  orders: number
  productCogs: number
  shippingCost: number
  paymentFees: number
  refundReserve: number
  contribution: number
  adSpend: number
  netProfit: number
  roas: number
  breakevenRoas: number
  contributionMargin: number
  netMargin: number
}

export interface ProductPLBundle {
  products: ProductPLRow[]
  brandSlug: string
  from?: string
  to?: string
  generatedAt?: string
  unsupported?: boolean
  error?: string
}

const PRODUCT_PL_SUPPORTED_BRANDS: PerformanceBrandSlug[] = ['trueclean']

export function brandSupportsProductPL(brandSlug: PerformanceBrandSlug) {
  return PRODUCT_PL_SUPPORTED_BRANDS.includes(brandSlug)
}

export async function loadProductPL(
  brandSlug: PerformanceBrandSlug,
  input: { from?: string; to?: string } = {},
): Promise<ProductPLBundle> {
  const token = await getAccessToken()
  if (!token) {
    return { products: [], brandSlug, error: 'Sign in with a real Supabase session to load product P&L.' }
  }

  const params = new URLSearchParams({ brand: brandSlug })
  if (input.from) params.set('from', input.from)
  if (input.to) params.set('to', input.to)

  try {
    const response = await fetch(`/api/finance/trueclean-product-pl?${params.toString()}`, {
      headers: { Accept: 'application/json', Authorization: `Bearer ${token}` },
    })
    const payload = (await response.json().catch(() => ({}))) as Partial<ProductPLBundle>
    return {
      products: Array.isArray(payload.products) ? payload.products : [],
      brandSlug,
      from: payload.from,
      to: payload.to,
      generatedAt: payload.generatedAt,
      unsupported: payload.unsupported,
      error: response.ok ? payload.error : stringifyApiError(payload.error ?? `Request failed (${response.status})`),
    }
  } catch (error) {
    return { products: [], brandSlug, error: error instanceof Error ? error.message : 'Product P&L unavailable' }
  }
}

export async function loadPerformanceCostRules() {
  const supabase = getSupabaseClient()
  if (!supabase) {
    return { rules: [] as PerformanceCostRule[], error: 'Sign in with a real Supabase session to load cost rules.' }
  }

  const { data, error } = await supabase
    .from('performance_cost_rules')
    .select('*')
    .order('brand_slug', { ascending: true })
    .order('cost_type', { ascending: true })
    .order('priority', { ascending: true })
    .order('label', { ascending: true })

  if (error) {
    return { rules: [] as PerformanceCostRule[], error: error.message }
  }

  return {
    rules: (data ?? []).map((row) => mapCostRuleFromDb(row as Record<string, unknown>)),
    error: null,
  }
}

export async function savePerformanceCostRule(rule: PerformanceCostRule) {
  const supabase = getSupabaseClient()
  if (!supabase) {
    throw new Error('Sign in with a real Supabase session to save cost rules.')
  }

  if (rule.id.startsWith('draft-')) {
    const { data, error } = await supabase
      .from('performance_cost_rules')
      .insert(mapCostRuleToDb(rule))
      .select('*')
      .single()

    if (error) {
      throw error
    }

    return mapCostRuleFromDb(data as Record<string, unknown>)
  }

  const { data, error } = await supabase
    .from('performance_cost_rules')
    .update(mapCostRuleToDb(rule))
    .eq('id', rule.id)
    .select('*')
    .single()

  if (error) {
    throw error
  }

  return mapCostRuleFromDb(data as Record<string, unknown>)
}

export async function deletePerformanceCostRule(rule: PerformanceCostRule) {
  if (rule.id.startsWith('draft-')) {
    return
  }

  const supabase = getSupabaseClient()
  if (!supabase) {
    throw new Error('Sign in with a real Supabase session to delete cost rules.')
  }

  const { error } = await supabase
    .from('performance_cost_rules')
    .delete()
    .eq('id', rule.id)

  if (error) {
    throw error
  }
}
