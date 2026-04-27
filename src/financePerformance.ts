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
  contributionAfterAds: number
  netProfit: number
  lastSync: string | null
}

export interface BrandDailyPerformanceBundle {
  rows: BrandDailyPerformanceRow[]
  source: 'supabase'
  generatedAt: string
  error?: string
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
      sync?: BrandDailyPerformanceBundle['sync']
    }
    const rows = Array.isArray(payload.rows) ? payload.rows.filter(isPerformanceRow) : []

    return {
      rows,
      source: 'supabase',
      generatedAt: typeof payload.generatedAt === 'string' ? payload.generatedAt : new Date().toISOString(),
      error: response.ok ? undefined : stringifyApiError(payload.error),
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
