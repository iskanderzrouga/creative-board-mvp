export type PerformanceBrandSlug = 'pluxy' | 'vivi' | 'trueclean'

export interface BrandDailyPerformanceRow {
  date: string
  brandSlug: PerformanceBrandSlug
  brandName: string
  revenue: number
  orders: number
  metaSpend: number
  axonSpend: number
  googleSpend: number
  totalAdSpend: number
  platformAttributedRevenue: number
  platformRoas: number
  blendedMer: number
  cpa: number
  refunds: number
  cogs: number
  contributionAfterAds: number
  netProfit: number
  lastSync: string | null
}

export interface BrandDailyPerformanceBundle {
  rows: BrandDailyPerformanceRow[]
  source: 'api' | 'demo'
  generatedAt: string
}

export const PERFORMANCE_BRANDS: Array<{ slug: PerformanceBrandSlug; name: string; color: string; tint: string }> = [
  { slug: 'pluxy', name: 'Pluxy', color: '#2563eb', tint: '#eff6ff' },
  { slug: 'vivi', name: 'Vivi', color: '#db2777', tint: '#fdf2f8' },
  { slug: 'trueclean', name: 'TrueClean', color: '#059669', tint: '#ecfdf5' },
]

const DEMO_ROWS: BrandDailyPerformanceRow[] = [
  {
    date: '2026-04-26',
    brandSlug: 'trueclean',
    brandName: 'TrueClean',
    revenue: 18420,
    orders: 386,
    metaSpend: 3120,
    axonSpend: 1980,
    googleSpend: 640,
    totalAdSpend: 5740,
    platformAttributedRevenue: 14380,
    platformRoas: 2.51,
    blendedMer: 3.21,
    cpa: 14.87,
    refunds: 320,
    cogs: 0,
    contributionAfterAds: 12680,
    netProfit: 12680,
    lastSync: '2026-04-27T00:18:00Z',
  },
  {
    date: '2026-04-26',
    brandSlug: 'pluxy',
    brandName: 'Pluxy',
    revenue: 9420,
    orders: 118,
    metaSpend: 1880,
    axonSpend: 740,
    googleSpend: 410,
    totalAdSpend: 3030,
    platformAttributedRevenue: 8110,
    platformRoas: 2.68,
    blendedMer: 3.11,
    cpa: 25.68,
    refunds: 120,
    cogs: 0,
    contributionAfterAds: 6390,
    netProfit: 6390,
    lastSync: '2026-04-27T00:18:00Z',
  },
  {
    date: '2026-04-26',
    brandSlug: 'vivi',
    brandName: 'Vivi',
    revenue: 2180,
    orders: 31,
    metaSpend: 610,
    axonSpend: 0,
    googleSpend: 0,
    totalAdSpend: 610,
    platformAttributedRevenue: 1540,
    platformRoas: 2.52,
    blendedMer: 3.57,
    cpa: 19.68,
    refunds: 0,
    cogs: 0,
    contributionAfterAds: 1570,
    netProfit: 1570,
    lastSync: '2026-04-27T00:18:00Z',
  },
]

function getDemoRows() {
  const today = new Date('2026-04-27T00:00:00Z')
  const rows: BrandDailyPerformanceRow[] = []

  for (let dayOffset = 1; dayOffset <= 60; dayOffset += 1) {
    const date = new Date(today)
    date.setUTCDate(today.getUTCDate() - dayOffset)
    const isoDate = date.toISOString().slice(0, 10)
    const dayFactor = 1 + Math.sin(dayOffset * 0.9) * 0.08

    DEMO_ROWS.forEach((base, brandIndex) => {
      const brandFactor = 1 + Math.cos((dayOffset + brandIndex) * 0.7) * 0.06
      const factor = dayFactor * brandFactor
      const revenue = Math.round(base.revenue * factor)
      const totalAdSpend = Math.round(base.totalAdSpend * (factor + 0.03))
      const platformAttributedRevenue = Math.round(base.platformAttributedRevenue * (factor + 0.01))
      const orders = Math.max(1, Math.round(base.orders * factor))

      rows.push({
        ...base,
        date: isoDate,
        revenue,
        orders,
        metaSpend: Math.round(base.metaSpend * (factor + 0.03)),
        axonSpend: Math.round(base.axonSpend * (factor + 0.02)),
        googleSpend: Math.round(base.googleSpend * factor),
        totalAdSpend,
        platformAttributedRevenue,
        platformRoas: totalAdSpend > 0 ? platformAttributedRevenue / totalAdSpend : 0,
        blendedMer: totalAdSpend > 0 ? revenue / totalAdSpend : 0,
        cpa: totalAdSpend > 0 ? totalAdSpend / orders : 0,
        refunds: Math.round(base.refunds * (1 + Math.sin(dayOffset) * 0.15)),
        contributionAfterAds: revenue - totalAdSpend,
        netProfit: revenue - totalAdSpend,
      })
    })
  }

  return rows
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

export async function loadBrandDailyPerformance(input: { from?: string; to?: string; days?: number } = {}): Promise<BrandDailyPerformanceBundle> {
  try {
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

    const query = params.toString()
    const response = await fetch(`/api/finance/bluebrands-performance${query ? `?${query}` : ''}`, {
      method: 'GET',
      headers: { Accept: 'application/json' },
    })

    if (response.ok) {
      const payload = (await response.json()) as { rows?: unknown; generatedAt?: unknown }
      const rows = Array.isArray(payload.rows) ? payload.rows.filter(isPerformanceRow) : []

      if (rows.length > 0) {
        return {
          rows,
          source: 'api',
          generatedAt: typeof payload.generatedAt === 'string' ? payload.generatedAt : new Date().toISOString(),
        }
      }
    }
  } catch {
    // Local Vite dev does not serve Vercel API functions; the UI still needs a realistic shell.
  }

  return {
    rows: getDemoRows(),
    source: 'demo',
    generatedAt: new Date().toISOString(),
  }
}
