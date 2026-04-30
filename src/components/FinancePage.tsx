import { useEffect, useMemo, useState, type CSSProperties, type ReactNode } from 'react'
import {
  PERFORMANCE_BRANDS,
  loadBrandDailyPerformance,
  syncBrandDailyPerformance,
  type BrandDailyPerformanceRow,
  type PerformanceBrandSlug,
} from '../financePerformance'

interface FinancePageProps {
  headerUtilityContent?: ReactNode
}

type BrandFilter = PerformanceBrandSlug | 'all'
type DatePreset =
  | 'today'
  | 'yesterday'
  | 'last7'
  | 'last14'
  | 'last28'
  | 'last30'
  | 'thisWeek'
  | 'lastWeek'
  | 'thisMonth'
  | 'lastMonth'
  | 'custom'

interface DateRange {
  from: string
  to: string
}

interface DailyTrendRow {
  date: string
  revenue: number
  totalAdSpend: number
  blendedRoas: number
  contributionAfterAds: number
}

const DATE_PRESETS: Array<{ value: DatePreset; label: string }> = [
  { value: 'today', label: 'Today' },
  { value: 'yesterday', label: 'Yesterday' },
  { value: 'last7', label: 'Last 7 days' },
  { value: 'last14', label: 'Last 14 days' },
  { value: 'last28', label: 'Last 28 days' },
  { value: 'last30', label: 'Last 30 days' },
  { value: 'thisWeek', label: 'This week' },
  { value: 'lastWeek', label: 'Last week' },
  { value: 'thisMonth', label: 'This month' },
  { value: 'lastMonth', label: 'Last month' },
  { value: 'custom', label: 'Custom' },
]

const brandColor = new Map(PERFORMANCE_BRANDS.map((brand) => [brand.slug, brand.color]))
const brandTint = new Map(PERFORMANCE_BRANDS.map((brand) => [brand.slug, brand.tint]))
const brandName = new Map(PERFORMANCE_BRANDS.map((brand) => [brand.slug, brand.name]))

const shopifyBlue = '#1f76f2'
const shopifyGreen = '#10b981'
const shopifyRed = '#dc2626'
const ink = '#202223'
const subdued = '#5f6f82'
const hairline = '#dde3ea'

const pageShell: CSSProperties = {
  background: '#f5f6f7',
  minHeight: '100vh',
  margin: '-24px',
  color: ink,
  fontFamily: "'Inter', -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif",
}

const pageInner: CSSProperties = {
  maxWidth: 1040,
  margin: '0 auto',
  padding: '30px 24px 56px',
}

const panelStyle: CSSProperties = {
  background: '#ffffff',
  border: '1px solid #e7ebef',
  borderRadius: 8,
  boxShadow: '0 1px 2px rgba(15, 23, 42, 0.04), 0 8px 22px rgba(15, 23, 42, 0.04)',
}

const numericStyle: CSSProperties = {
  fontVariantNumeric: 'tabular-nums',
  letterSpacing: 0,
}

const controlButtonStyle: CSSProperties = {
  border: '1px solid #cfd7e2',
  background: '#ffffff',
  color: '#344054',
  borderRadius: 6,
  minHeight: 30,
  padding: '0 10px',
  fontSize: 13,
  fontWeight: 500,
  cursor: 'pointer',
  boxShadow: '0 1px 1px rgba(15, 23, 42, 0.03)',
}

function formatMoney(value: number, maximumFractionDigits = 0) {
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
    maximumFractionDigits,
  }).format(value)
}

function formatNumber(value: number) {
  return new Intl.NumberFormat('en-US').format(value)
}

function formatPercent(value: number) {
  return Number.isFinite(value) ? `${value.toFixed(1)}%` : '—'
}

function formatMetric(value: number) {
  return Number.isFinite(value) && value > 0 ? `${value.toFixed(2)}x` : '—'
}

function formatDate(value: string) {
  const parsed = new Date(`${value}T00:00:00`)
  if (Number.isNaN(parsed.getTime())) {
    return value
  }
  return parsed.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
}

function formatLongDate(value: string) {
  const parsed = new Date(`${value}T00:00:00`)
  if (Number.isNaN(parsed.getTime())) {
    return value
  }
  return parsed.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' })
}

function formatEstDateTime(value: string) {
  if (!value) {
    return '-'
  }

  const parsed = new Date(value)
  if (Number.isNaN(parsed.getTime())) {
    return value
  }

  return `${parsed.toLocaleString('en-US', {
    timeZone: 'America/New_York',
    month: 'numeric',
    day: 'numeric',
    year: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  })} EST`
}

function getTodayInEst() {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: 'America/New_York',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(new Date())
  const year = parts.find((part) => part.type === 'year')?.value ?? '1970'
  const month = parts.find((part) => part.type === 'month')?.value ?? '01'
  const day = parts.find((part) => part.type === 'day')?.value ?? '01'

  return `${year}-${month}-${day}`
}

function toIsoDate(date: Date) {
  const year = date.getFullYear()
  const month = String(date.getMonth() + 1).padStart(2, '0')
  const day = String(date.getDate()).padStart(2, '0')
  return `${year}-${month}-${day}`
}

function addDays(value: string, days: number) {
  const date = new Date(`${value}T00:00:00`)
  date.setDate(date.getDate() + days)
  return toIsoDate(date)
}

function monthStart(value: string) {
  const date = new Date(`${value}T00:00:00`)
  date.setDate(1)
  return toIsoDate(date)
}

function getPresetRange(preset: DatePreset, anchorDate: string): DateRange {
  const date = new Date(`${anchorDate}T00:00:00`)
  const day = date.getDay()
  const month = date.getMonth()
  const year = date.getFullYear()

  switch (preset) {
    case 'today':
      return { from: anchorDate, to: anchorDate }
    case 'yesterday': {
      const yesterday = addDays(anchorDate, -1)
      return { from: yesterday, to: yesterday }
    }
    case 'last7':
      return { from: addDays(anchorDate, -6), to: anchorDate }
    case 'last14':
      return { from: addDays(anchorDate, -13), to: anchorDate }
    case 'last28':
      return { from: addDays(anchorDate, -27), to: anchorDate }
    case 'last30':
      return { from: addDays(anchorDate, -29), to: anchorDate }
    case 'thisWeek':
      return { from: addDays(anchorDate, -day), to: anchorDate }
    case 'lastWeek': {
      const end = addDays(anchorDate, -(day + 1))
      return { from: addDays(end, -6), to: end }
    }
    case 'thisMonth':
      return { from: monthStart(anchorDate), to: anchorDate }
    case 'lastMonth': {
      const firstOfThisMonth = new Date(year, month, 1)
      const lastOfPreviousMonth = new Date(firstOfThisMonth)
      lastOfPreviousMonth.setDate(0)
      const firstOfPreviousMonth = new Date(lastOfPreviousMonth)
      firstOfPreviousMonth.setDate(1)
      return { from: toIsoDate(firstOfPreviousMonth), to: toIsoDate(lastOfPreviousMonth) }
    }
    case 'custom':
      return { from: anchorDate, to: anchorDate }
    default:
      return { from: addDays(anchorDate, -29), to: anchorDate }
  }
}

function getPresetLabel(preset: DatePreset) {
  return DATE_PRESETS.find((item) => item.value === preset)?.label ?? 'Custom'
}

function getRangeLabel(range: DateRange) {
  return `${formatDate(range.from)} - ${formatDate(range.to)}`
}

function getChange(current: number, prior: number) {
  if (!Number.isFinite(prior) || prior === 0) {
    return null
  }
  return ((current - prior) / prior) * 100
}

function sumRows(rows: BrandDailyPerformanceRow[]) {
  const totals = rows.reduce(
    (acc, row) => ({
      revenue: acc.revenue + row.revenue,
      orders: acc.orders + row.orders,
      metaSpend: acc.metaSpend + row.metaSpend,
      metaRevenue: acc.metaRevenue + row.metaRevenue,
      metaPurchases: acc.metaPurchases + row.metaPurchases,
      axonSpend: acc.axonSpend + row.axonSpend,
      axonRevenue: acc.axonRevenue + row.axonRevenue,
      axonPurchases: acc.axonPurchases + row.axonPurchases,
      googleSpend: acc.googleSpend + row.googleSpend,
      googleRevenue: acc.googleRevenue + row.googleRevenue,
      googlePurchases: acc.googlePurchases + row.googlePurchases,
      totalAdSpend: acc.totalAdSpend + row.totalAdSpend,
      platformAttributedRevenue: acc.platformAttributedRevenue + row.platformAttributedRevenue,
      totalSales: acc.totalSales + row.totalSales,
      grossSales: acc.grossSales + row.grossSales,
      netSales: acc.netSales + row.netSales,
      discounts: acc.discounts + row.discounts,
      refunds: acc.refunds + row.refunds,
      taxes: acc.taxes + row.taxes,
      shipping: acc.shipping + row.shipping,
      sessions: acc.sessions + row.sessions,
      cogs: acc.cogs + row.cogs,
      contributionAfterAds: acc.contributionAfterAds + row.contributionAfterAds,
      netProfit: acc.netProfit + row.netProfit,
    }),
    {
      revenue: 0,
      orders: 0,
      metaSpend: 0,
      metaRevenue: 0,
      metaPurchases: 0,
      axonSpend: 0,
      axonRevenue: 0,
      axonPurchases: 0,
      googleSpend: 0,
      googleRevenue: 0,
      googlePurchases: 0,
      totalAdSpend: 0,
      platformAttributedRevenue: 0,
      totalSales: 0,
      grossSales: 0,
      netSales: 0,
      discounts: 0,
      refunds: 0,
      taxes: 0,
      shipping: 0,
      sessions: 0,
      cogs: 0,
      contributionAfterAds: 0,
      netProfit: 0,
    },
  )

  return {
    ...totals,
    platformRoas: totals.totalAdSpend > 0 ? totals.platformAttributedRevenue / totals.totalAdSpend : 0,
    blendedRoas: totals.totalAdSpend > 0 ? totals.revenue / totals.totalAdSpend : 0,
    cpa: totals.orders > 0 ? totals.totalAdSpend / totals.orders : 0,
    contributionMargin: totals.revenue > 0 ? totals.contributionAfterAds / totals.revenue : 0,
    aov: totals.orders > 0 ? totals.revenue / totals.orders : 0,
    cvr: totals.sessions > 0 ? (totals.orders / totals.sessions) * 100 : 0,
    metaRoas: totals.metaSpend > 0 ? totals.metaRevenue / totals.metaSpend : 0,
    metaCpa: totals.metaPurchases > 0 ? totals.metaSpend / totals.metaPurchases : 0,
    axonRoas: totals.axonSpend > 0 ? totals.axonRevenue / totals.axonSpend : 0,
    axonCpa: totals.axonPurchases > 0 ? totals.axonSpend / totals.axonPurchases : 0,
    googleRoas: totals.googleSpend > 0 ? totals.googleRevenue / totals.googleSpend : 0,
    googleCpa: totals.googlePurchases > 0 ? totals.googleSpend / totals.googlePurchases : 0,
  }
}

function latestDate(rows: BrandDailyPerformanceRow[]) {
  return rows.reduce((latest, row) => (row.date > latest ? row.date : latest), rows[0]?.date ?? '')
}

function buildDailyTrendRows(rows: BrandDailyPerformanceRow[]): DailyTrendRow[] {
  const grouped = rows.reduce<Record<string, BrandDailyPerformanceRow[]>>((acc, row) => {
    acc[row.date] = [...(acc[row.date] ?? []), row]
    return acc
  }, {})

  return Object.entries(grouped)
    .map(([date, dateRows]) => {
      const totals = sumRows(dateRows)
      return {
        date,
        revenue: totals.revenue,
        totalAdSpend: totals.totalAdSpend,
        blendedRoas: totals.blendedRoas,
        contributionAfterAds: totals.contributionAfterAds,
      }
    })
    .sort((left, right) => left.date.localeCompare(right.date))
}

function StatTile({
  label,
  value,
  helper,
  accent = shopifyBlue,
  trend,
}: {
  label: string
  value: string
  helper?: string
  accent?: string
  trend?: number[]
}) {
  return (
    <div style={{ ...panelStyle, padding: 12, minWidth: 0, minHeight: 164, display: 'grid', alignContent: 'space-between' }}>
      <div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 7, minHeight: 22 }}>
          <MetricMark color={accent} />
          <span style={{ color: '#465a70', fontSize: 13, fontWeight: 500 }}>{label}</span>
        </div>
        <div style={{ ...numericStyle, color: ink, fontSize: 27, lineHeight: 1.15, fontWeight: 650, marginTop: 20 }}>{value}</div>
        {helper ? <div style={{ color: subdued, fontSize: 12, lineHeight: 1.35, marginTop: 6 }}>{helper}</div> : null}
      </div>
      {trend ? <MetricSparkline values={trend} color={accent} /> : null}
    </div>
  )
}

function MetricMark({ color }: { color: string }) {
  return (
    <span aria-hidden="true" style={{ position: 'relative', width: 16, height: 16, display: 'inline-block', flex: '0 0 auto' }}>
      <span style={{ position: 'absolute', left: 1, top: 2, width: 5, height: 5, borderRadius: 999, background: color }} />
      <span style={{ position: 'absolute', right: 1, top: 2, width: 5, height: 5, borderRadius: 999, background: '#13c296' }} />
      <span style={{ position: 'absolute', left: 1, bottom: 2, width: 5, height: 5, borderRadius: 999, background: '#1687f7' }} />
      <span style={{ position: 'absolute', right: 1, bottom: 2, width: 5, height: 5, borderRadius: 999, background: '#f59e0b' }} />
    </span>
  )
}

function MetricSparkline({ values, color }: { values: number[]; color: string }) {
  const points = values.slice(-7)
  const safePoints = points.length > 1 ? points : [points[0] ?? 0, points[0] ?? 0]
  const max = Math.max(...safePoints, 1)
  const min = Math.min(...safePoints, 0)
  const span = Math.max(max - min, 1)
  const polyline = safePoints
    .map((value, index) => {
      const x = safePoints.length === 1 ? 0 : (index / (safePoints.length - 1)) * 100
      const y = 34 - ((value - min) / span) * 26
      return `${x},${y}`
    })
    .join(' ')

  return (
    <svg viewBox="0 0 100 38" aria-hidden="true" style={{ width: '100%', height: 42, display: 'block', marginTop: 18 }}>
      <polyline points={polyline} fill="none" stroke={color} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  )
}

function MiniSparkline({ rows, color }: { rows: BrandDailyPerformanceRow[]; color: string }) {
  const points = rows
    .slice()
    .sort((left, right) => left.date.localeCompare(right.date))
    .slice(-7)
    .map((row) => row.revenue)

  return <MetricSparkline values={points} color={color} />
}

function BrandCard({
  rows,
  brandSlug,
}: {
  rows: BrandDailyPerformanceRow[]
  brandSlug: PerformanceBrandSlug
}) {
  const totals = sumRows(rows)
  const color = brandColor.get(brandSlug) ?? shopifyBlue

  return (
    <div style={{ ...panelStyle, padding: 12, minHeight: 164, display: 'grid', alignContent: 'space-between' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', gap: 14, alignItems: 'flex-start' }}>
        <div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 7 }}>
            <MetricMark color={color} />
            <span style={{ color: '#465a70', fontSize: 13, fontWeight: 500 }}>{brandName.get(brandSlug) ?? brandSlug}</span>
          </div>
        </div>
        <span style={{ color, background: brandTint.get(brandSlug), border: `1px solid ${color}22`, borderRadius: 999, padding: '3px 7px', fontSize: 11, fontWeight: 650 }}>
          {rows.length} days
        </span>
      </div>
      <div style={{ marginTop: 20 }}>
        <div style={{ ...numericStyle, color: ink, fontSize: 27, lineHeight: 1.15, fontWeight: 650 }}>{formatMoney(totals.revenue)}</div>
        <div style={{ color: subdued, fontSize: 12, lineHeight: 1.35, marginTop: 6 }}>
          {formatMoney(totals.totalAdSpend)} spend · {formatNumber(totals.orders)} orders
        </div>
      </div>
      <div>
        <MiniSparkline rows={rows} color={color} />
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, minmax(0, 1fr))', gap: 10 }}>
        <div>
          <div style={{ color: subdued, fontSize: 11 }}>Platform ROAS</div>
          <strong style={{ ...numericStyle, color: ink, fontSize: 15, fontWeight: 650 }}>{formatMetric(totals.platformRoas)}</strong>
        </div>
        <div>
          <div style={{ color: subdued, fontSize: 11 }}>Blended ROAS</div>
          <strong style={{ ...numericStyle, color: ink, fontSize: 15, fontWeight: 650 }}>{formatMetric(totals.blendedRoas)}</strong>
        </div>
        <div>
          <div style={{ color: subdued, fontSize: 11 }}>CPA</div>
          <strong style={{ ...numericStyle, color: ink, fontSize: 15, fontWeight: 650 }}>{formatMoney(totals.cpa, 2)}</strong>
        </div>
      </div>
    </div>
  )
}

function PerformanceTrend({ rows }: { rows: BrandDailyPerformanceRow[] }) {
  const dailyRows = buildDailyTrendRows(rows).slice(-30)
  const values = dailyRows.flatMap((row) => [row.revenue, row.totalAdSpend])
  const maxValue = Math.max(...values, 1)
  const maxRoas = Math.max(...dailyRows.map((row) => row.blendedRoas), 1)
  const width = 620
  const height = 180
  const topPadding = 20
  const bottomPadding = 32
  const chartHeight = height - topPadding - bottomPadding

  const xFor = (index: number) => dailyRows.length === 1 ? width / 2 : (index / (dailyRows.length - 1)) * width
  const moneyYFor = (value: number) => topPadding + chartHeight - (value / maxValue) * chartHeight
  const roasYFor = (value: number) => topPadding + chartHeight - (value / maxRoas) * chartHeight

  const moneyPointsFor = (key: 'revenue' | 'totalAdSpend') => dailyRows
    .map((row, index) => {
      return `${xFor(index)},${moneyYFor(row[key])}`
    })
    .join(' ')

  const roasPoints = dailyRows
    .map((row, index) => {
      return `${xFor(index)},${roasYFor(row.blendedRoas)}`
    })
    .join(' ')
  const latest = dailyRows[dailyRows.length - 1]

  return (
    <section style={{ ...panelStyle, padding: 16, minHeight: 250 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12, alignItems: 'flex-start' }}>
        <div>
          <h2 style={{ margin: 0, color: ink, fontSize: 16, lineHeight: 1.2, fontWeight: 550, letterSpacing: 0 }}>Revenue, Spend, ROAS</h2>
          <div style={{ color: subdued, fontSize: 12, marginTop: 4 }}>{dailyRows.length} day trend</div>
        </div>
        <div style={{ display: 'flex', gap: 12, color: subdued, fontSize: 12, fontWeight: 550, flexWrap: 'wrap', justifyContent: 'flex-end' }}>
          <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}><span style={{ width: 18, height: 3, background: shopifyBlue }} />Revenue</span>
          <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}><span style={{ width: 18, height: 3, background: '#f97316' }} />Spend</span>
          <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}><span style={{ width: 18, height: 3, background: shopifyGreen }} />ROAS {latest ? formatMetric(latest.blendedRoas) : ''}</span>
        </div>
      </div>
      <div style={{ marginTop: 16, overflow: 'hidden' }}>
        <svg viewBox={`0 0 ${width} ${height}`} role="img" aria-label="Revenue, spend, and blended ROAS trend" style={{ width: '100%', height: 210, display: 'block' }}>
          {[0, 1, 2, 3].map((line) => {
            const y = topPadding + (chartHeight / 3) * line
            return <line key={line} x1="0" x2={width} y1={y} y2={y} stroke={hairline} strokeWidth="1" />
          })}
          <polyline points={moneyPointsFor('revenue')} fill="none" stroke={shopifyBlue} strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" />
          <polyline points={moneyPointsFor('totalAdSpend')} fill="none" stroke="#f97316" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" />
          <polyline points={roasPoints} fill="none" stroke={shopifyGreen} strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" strokeDasharray="5 4" />
          {dailyRows.map((row, index) => {
            if (dailyRows.length <= 8 || index % Math.ceil(dailyRows.length / 6) === 0 || index === dailyRows.length - 1) {
              return (
                <text key={row.date} x={xFor(index)} y={height - 9} textAnchor={index === 0 ? 'start' : index === dailyRows.length - 1 ? 'end' : 'middle'} fill={subdued} fontSize="11">
                  {formatDate(row.date)}
                </text>
              )
            }
            return null
          })}
        </svg>
      </div>
    </section>
  )
}

function PlatformBreakdown({ rows }: { rows: BrandDailyPerformanceRow[] }) {
  const totals = sumRows(rows)
  const platforms = [
    { name: 'Meta', spend: totals.metaSpend, revenue: totals.metaRevenue, purchases: totals.metaPurchases, roas: totals.metaRoas, cpa: totals.metaCpa },
    { name: 'Axon', spend: totals.axonSpend, revenue: totals.axonRevenue, purchases: totals.axonPurchases, roas: totals.axonRoas, cpa: totals.axonCpa },
    { name: 'Google', spend: totals.googleSpend, revenue: totals.googleRevenue, purchases: totals.googlePurchases, roas: totals.googleRoas, cpa: totals.googleCpa },
  ].filter((platform) => platform.spend > 0 || platform.revenue > 0 || platform.purchases > 0)
  const attributionShare = totals.revenue > 0 ? (totals.platformAttributedRevenue / totals.revenue) * 100 : 0

  return (
    <section style={{ ...panelStyle, overflow: 'hidden' }}>
      <div style={{ padding: '15px 16px', borderBottom: `1px solid ${hairline}`, display: 'flex', justifyContent: 'space-between', gap: 12 }}>
        <div>
          <h2 style={{ margin: 0, color: ink, fontSize: 16, lineHeight: 1.2, fontWeight: 550, letterSpacing: 0 }}>Platform Breakdown</h2>
          <div style={{ color: subdued, fontSize: 12, marginTop: 4 }}>Self-reported attribution compared against Shopify actuals.</div>
        </div>
        <span style={{ color: subdued, fontSize: 12, whiteSpace: 'nowrap' }}>{formatPercent(attributionShare)} attributed</span>
      </div>
      <div style={{ overflowX: 'auto' }}>
        <table style={{ width: '100%', minWidth: 760, borderCollapse: 'collapse', fontSize: 12 }}>
          <thead>
            <tr style={{ color: subdued, background: '#fbfcfd', textAlign: 'left' }}>
              {['Platform', 'Spend', 'Attributed Revenue', 'Purchases', 'Platform ROAS', 'CPA'].map((heading) => (
                <th key={heading} style={{ padding: '11px 12px', fontWeight: 650, borderBottom: `1px solid ${hairline}`, whiteSpace: 'nowrap' }}>{heading}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {platforms.map((platform) => (
              <tr key={platform.name} style={{ borderBottom: '1px solid #eef1f6' }}>
                <td style={{ padding: '12px', color: ink, fontWeight: 550 }}>{platform.name}</td>
                <td style={{ ...numericStyle, padding: '12px', color: ink }}>{formatMoney(platform.spend)}</td>
                <td style={{ ...numericStyle, padding: '12px', color: ink }}>{formatMoney(platform.revenue)}</td>
                <td style={{ ...numericStyle, padding: '12px', color: '#465a70' }}>{formatNumber(platform.purchases)}</td>
                <td style={{ ...numericStyle, padding: '12px', color: platform.roas >= 2 ? '#047857' : '#b45309', fontWeight: 650 }}>{formatMetric(platform.roas)}</td>
                <td style={{ ...numericStyle, padding: '12px', color: '#465a70' }}>{platform.cpa > 0 ? formatMoney(platform.cpa, 2) : '—'}</td>
              </tr>
            ))}
            <tr style={{ borderBottom: '1px solid #eef1f6', background: '#fbfcfe' }}>
              <td style={{ padding: '12px', color: ink, fontWeight: 650 }}>Total attributed</td>
              <td style={{ padding: '12px', color: subdued }}>—</td>
              <td style={{ ...numericStyle, padding: '12px', color: ink, fontWeight: 650 }}>{formatMoney(totals.platformAttributedRevenue)}</td>
              <td style={{ padding: '12px', color: subdued }}>—</td>
              <td style={{ ...numericStyle, padding: '12px', color: ink, fontWeight: 650 }}>{formatMetric(totals.platformRoas)}</td>
              <td style={{ padding: '12px', color: subdued }}>—</td>
            </tr>
            <tr style={{ background: '#ecfdf5' }}>
              <td style={{ padding: '12px', color: '#047857', fontWeight: 650 }}>Shopify actual</td>
              <td style={{ padding: '12px', color: '#047857' }}>—</td>
              <td style={{ ...numericStyle, padding: '12px', color: '#047857', fontWeight: 650 }}>{formatMoney(totals.revenue)}</td>
              <td style={{ ...numericStyle, padding: '12px', color: '#047857', fontWeight: 650 }}>{formatNumber(totals.orders)}</td>
              <td style={{ ...numericStyle, padding: '12px', color: '#047857', fontWeight: 650 }}>{formatMetric(totals.blendedRoas)} blended</td>
              <td style={{ ...numericStyle, padding: '12px', color: '#047857', fontWeight: 650 }}>{totals.cpa > 0 ? formatMoney(totals.cpa, 2) : '—'}</td>
            </tr>
          </tbody>
        </table>
      </div>
    </section>
  )
}

function ShopifyExtras({ rows }: { rows: BrandDailyPerformanceRow[] }) {
  const totals = sumRows(rows)

  return (
    <section>
      <SectionHeading title="Store" />
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(210px, 1fr))', gap: 14 }}>
        {[
          ['AOV', totals.aov > 0 ? formatMoney(totals.aov, 2) : '—'],
          ['Gross sales', formatMoney(totals.grossSales)],
          ['Net sales', formatMoney(totals.netSales)],
          ['Discounts', formatMoney(totals.discounts)],
          ['Taxes', formatMoney(totals.taxes)],
          ['Refunds', formatMoney(totals.refunds)],
          ['Sessions', totals.sessions > 0 ? formatNumber(totals.sessions) : '—'],
          ['CVR', totals.cvr > 0 ? formatPercent(totals.cvr) : '—'],
        ].map(([label, value]) => (
          <div key={label} style={{ ...panelStyle, padding: 12, minHeight: 116, display: 'grid', alignContent: 'space-between', minWidth: 0 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 7 }}>
              <MetricMark color={shopifyGreen} />
              <span style={{ color: '#465a70', fontSize: 13, fontWeight: 500 }}>{label}</span>
            </div>
            <div style={{ ...numericStyle, color: ink, fontSize: 26, lineHeight: 1.15, fontWeight: 650 }}>{value}</div>
          </div>
        ))}
      </div>
    </section>
  )
}

function SectionHeading({ title, aside }: { title: string; aside?: ReactNode }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, margin: '0 0 14px' }}>
      <div style={{ display: 'inline-flex', alignItems: 'center', gap: 8 }}>
        <span aria-hidden="true" style={{ width: 14, height: 14, borderRadius: 3, background: '#6b7280', transform: 'rotate(-12deg)', display: 'inline-block' }} />
        <h2 style={{ margin: 0, color: ink, fontSize: 20, lineHeight: 1.2, fontWeight: 550, letterSpacing: 0 }}>{title}</h2>
      </div>
      {aside ? <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>{aside}</div> : null}
    </div>
  )
}

function buildAlerts(rows: BrandDailyPerformanceRow[]) {
  const byBrand = PERFORMANCE_BRANDS.map((brand) => {
    const brandRows = rows.filter((row) => row.brandSlug === brand.slug).sort((left, right) => right.date.localeCompare(left.date))
    return { brand, today: brandRows[0], yesterday: brandRows[1] }
  })

  const alerts: Array<{ title: string; detail: string; tone: '#b45309' | '#be123c' | '#047857' | '#334155' }> = []

  byBrand.forEach(({ brand, today, yesterday }) => {
    if (!today || !yesterday) {
      return
    }

    const spendChange = getChange(today.totalAdSpend, yesterday.totalAdSpend)
    const roasChange = getChange(today.blendedRoas, yesterday.blendedRoas)
    const refundChange = getChange(today.refunds, yesterday.refunds)

    if (roasChange !== null && roasChange < -12) {
      alerts.push({
        title: `${brand.name} ROAS drop`,
        detail: `Blended ROAS softened. Check spend mix before scaling.`,
        tone: '#be123c',
      })
    }

    if (spendChange !== null && spendChange > 18) {
      alerts.push({
        title: `${brand.name} spend spike`,
        detail: `${spendChange.toFixed(1)}% more ad spend than yesterday.`,
        tone: '#b45309',
      })
    }

    if (refundChange !== null && refundChange > 25 && today.refunds > 0) {
      alerts.push({
        title: `${brand.name} refunds up`,
        detail: `${formatMoney(today.refunds)} refunds logged for ${formatDate(today.date)}.`,
        tone: '#b45309',
      })
    }
  })

  if (alerts.length === 0) {
    alerts.push({
      title: 'No major anomalies',
      detail: 'Revenue, spend, and refunds are inside the expected daily range.',
      tone: '#047857',
    })
  }

  return alerts.slice(0, 5)
}

export function FinancePage({ headerUtilityContent }: FinancePageProps) {
  const [rows, setRows] = useState<BrandDailyPerformanceRow[]>([])
  const [generatedAt, setGeneratedAt] = useState('')
  const [errorMessage, setErrorMessage] = useState<string | null>(null)
  const [syncSummary, setSyncSummary] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)
  const [refreshing, setRefreshing] = useState(false)
  const [brandFilter, setBrandFilter] = useState<BrandFilter>('all')
  const [datePreset, setDatePreset] = useState<DatePreset>('yesterday')
  const [customRange, setCustomRange] = useState<DateRange | null>(null)
  const [pickerOpen, setPickerOpen] = useState(false)
  const [draftPreset, setDraftPreset] = useState<DatePreset>('yesterday')
  const [draftRange, setDraftRange] = useState<DateRange | null>(null)
  const anchorDate = getTodayInEst()
  const defaultRange = useMemo(() => getPresetRange('yesterday', anchorDate), [anchorDate])

  const loadPerformance = async (range: DateRange | null, showRefresh = false) => {
    const nextRange = range ?? defaultRange

    if (showRefresh) {
      setRefreshing(true)
    } else {
      setLoading(true)
    }

    try {
      const data = showRefresh
        ? await syncBrandDailyPerformance(nextRange)
        : await loadBrandDailyPerformance(nextRange)
      const sourceErrors = data.sync?.errors ?? []
      setRows(data.rows)
      setGeneratedAt(data.generatedAt)
      setErrorMessage(data.error ?? (sourceErrors.length > 0 ? sourceErrors.slice(0, 3).join(' · ') : null))
      setSyncSummary(data.sync ? `${data.sync.rowsWritten} live rows refreshed${data.sync.errors.length > 0 ? ` · ${data.sync.errors.length} source error(s)` : ''}` : null)
    } finally {
      setLoading(false)
      setRefreshing(false)
    }
  }

  useEffect(() => {
    void loadPerformance(defaultRange)
  }, [defaultRange.from, defaultRange.to])

  const activeRange = useMemo(() => {
    if (datePreset === 'custom' && customRange) {
      return customRange
    }
    return getPresetRange(datePreset, anchorDate)
  }, [anchorDate, customRange, datePreset])

  const visibleRows = useMemo(
    () => rows
      .filter((row) => row.date >= activeRange.from && row.date <= activeRange.to && (brandFilter === 'all' || row.brandSlug === brandFilter))
      .sort((left, right) => {
        if (left.date !== right.date) {
          return right.date.localeCompare(left.date)
        }
        return left.brandName.localeCompare(right.brandName)
      }),
    [rows, activeRange.from, activeRange.to, brandFilter],
  )

  const totals = useMemo(() => sumRows(visibleRows), [visibleRows])
  const alerts = useMemo(() => buildAlerts(visibleRows), [visibleRows])
  const latestVisibleDate = latestDate(visibleRows)
  const latestRows = visibleRows.filter((row) => row.date === latestVisibleDate)
  const dailyTrendRows = useMemo(() => buildDailyTrendRows(visibleRows), [visibleRows])
  const showPerformanceTrend = dailyTrendRows.length > 1
  const displayedBrands = brandFilter === 'all'
    ? PERFORMANCE_BRANDS
    : PERFORMANCE_BRANDS.filter((brand) => brand.slug === brandFilter)

  const openDatePicker = () => {
    setDraftPreset(datePreset)
    setDraftRange(datePreset === 'custom' && customRange ? customRange : activeRange)
    setPickerOpen(true)
  }

  const applyDatePicker = () => {
    const nextRange = draftRange ?? getPresetRange(draftPreset, anchorDate)
    setDatePreset(draftPreset)
    setCustomRange(draftPreset === 'custom' ? nextRange : null)
    setPickerOpen(false)
    void loadPerformance(nextRange)
  }

  const refreshPerformance = () => {
    void loadPerformance(activeRange, true)
  }

  return (
    <div style={pageShell}>
      <div style={pageInner}>
        <header style={{ minHeight: 46, display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 14, marginBottom: 34, flexWrap: 'wrap' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
            <h1 style={{ color: '#2f3a4a', fontSize: 20, lineHeight: 1.2, margin: 0, fontWeight: 500, letterSpacing: 0 }}>
              Summary
            </h1>
            <button
              type="button"
              onClick={openDatePicker}
              style={controlButtonStyle}
            >
              {getPresetLabel(datePreset)}
            </button>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap', justifyContent: 'flex-end' }}>
            {headerUtilityContent}
            <span style={{
              ...controlButtonStyle,
              display: 'inline-flex',
              alignItems: 'center',
              color: errorMessage ? '#b45309' : '#16794f',
              cursor: 'default',
            }}>
              {errorMessage ? 'Live data unavailable' : 'Live data'}
            </span>
            <button
              type="button"
              onClick={refreshPerformance}
              disabled={refreshing || loading}
              style={{
                ...controlButtonStyle,
                borderColor: shopifyBlue,
                background: refreshing || loading ? '#dbeafe' : '#ffffff',
                color: shopifyBlue,
                cursor: refreshing || loading ? 'wait' : 'pointer',
                minWidth: 82,
              }}
            >
              {refreshing || loading ? 'Syncing' : 'Refresh'}
            </button>
          </div>
        </header>

        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap', marginBottom: 20 }}>
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
            <button
              type="button"
              onClick={() => setBrandFilter('all')}
              style={{
                ...controlButtonStyle,
                borderColor: brandFilter === 'all' ? shopifyBlue : '#cfd7e2',
                background: brandFilter === 'all' ? '#eef6ff' : '#ffffff',
                color: brandFilter === 'all' ? shopifyBlue : '#465a70',
                fontWeight: brandFilter === 'all' ? 650 : 500,
              }}
            >
              All brands
            </button>
            {PERFORMANCE_BRANDS.map((brand) => (
              <button
                key={brand.slug}
                type="button"
                onClick={() => setBrandFilter(brand.slug)}
                style={{
                  ...controlButtonStyle,
                  borderColor: brandFilter === brand.slug ? brand.color : '#cfd7e2',
                  background: brandFilter === brand.slug ? brand.tint : '#ffffff',
                  color: brandFilter === brand.slug ? brand.color : '#465a70',
                  fontWeight: brandFilter === brand.slug ? 650 : 500,
                }}
              >
                {brand.name}
              </button>
            ))}
          </div>
          <div style={{ color: subdued, fontSize: 12 }}>
            {loading ? 'Loading daily tracker...' : `Last refresh ${formatEstDateTime(generatedAt)}`}
          </div>
        </div>

        {errorMessage ? (
          <div style={{ ...panelStyle, padding: '14px 16px', marginBottom: 20, borderColor: '#fbbf24', background: '#fffbeb', color: '#92400e', fontSize: 13, lineHeight: 1.5 }}>
            {errorMessage}
          </div>
        ) : null}

        {syncSummary ? (
          <div style={{ padding: '15px 16px', marginBottom: 20, background: shopifyBlue, color: '#ffffff', borderRadius: 0, boxShadow: '0 8px 18px rgba(31, 118, 242, 0.18)', fontSize: 13, lineHeight: 1.5 }}>
            {syncSummary}
          </div>
        ) : null}

        <section style={{ marginBottom: 58 }}>
          <SectionHeading title="Pins" />
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: 14 }}>
            <StatTile
              label="Revenue"
              value={formatMoney(totals.revenue)}
              helper={`${formatNumber(totals.orders)} orders · ${getRangeLabel(activeRange)}`}
              accent={shopifyGreen}
              trend={dailyTrendRows.map((row) => row.revenue)}
            />
            <StatTile
              label="Ad Spend"
              value={formatMoney(totals.totalAdSpend)}
              helper={`Meta ${formatMoney(totals.metaSpend)} · Axon ${formatMoney(totals.axonSpend)} · Google ${formatMoney(totals.googleSpend)}`}
              accent={shopifyBlue}
              trend={dailyTrendRows.map((row) => row.totalAdSpend)}
            />
            <StatTile
              label="Blended ROAS"
              value={formatMetric(totals.blendedRoas)}
              helper="Shopify revenue ÷ total paid spend"
              accent={totals.blendedRoas >= 2 ? shopifyGreen : shopifyRed}
              trend={dailyTrendRows.map((row) => row.blendedRoas)}
            />
            <StatTile
              label="Contribution"
              value={formatMoney(totals.contributionAfterAds)}
              helper={`${(totals.contributionMargin * 100).toFixed(1)}% after ads`}
              accent="#64748b"
              trend={dailyTrendRows.map((row) => row.contributionAfterAds)}
            />
          </div>
        </section>

        {brandFilter === 'all' ? (
          <section style={{ marginBottom: 58 }}>
            <SectionHeading title="Brands" />
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(270px, 1fr))', gap: 14 }}>
              {displayedBrands.map((brand) => (
                <BrandCard
                  key={brand.slug}
                  brandSlug={brand.slug}
                  rows={visibleRows.filter((row) => row.brandSlug === brand.slug)}
                />
              ))}
            </div>
          </section>
        ) : null}

        <div style={{ marginBottom: 58 }}>
          <ShopifyExtras rows={visibleRows} />
        </div>

        {showPerformanceTrend ? (
          <div style={{ marginBottom: 58 }}>
            <PerformanceTrend rows={visibleRows} />
          </div>
        ) : null}

        <div style={{ marginBottom: 58 }}>
          <PlatformBreakdown rows={visibleRows} />
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(min(100%, 300px), 1fr))', gap: 14, alignItems: 'start' }}>
          <section style={{ ...panelStyle, overflow: 'hidden' }}>
            <div style={{ padding: '15px 16px', borderBottom: `1px solid ${hairline}`, display: 'flex', justifyContent: 'space-between', gap: 12 }}>
              <div>
                <h2 style={{ margin: 0, color: ink, fontSize: 16, lineHeight: 1.2, fontWeight: 550, letterSpacing: 0 }}>Daily Tracker</h2>
                <div style={{ color: subdued, fontSize: 12, marginTop: 4 }}>
                  Platform ROAS is attributed ad revenue ÷ paid spend. Blended ROAS is Shopify revenue ÷ paid spend.
                  {' '}Dates are shown in EST.
                </div>
              </div>
              <span style={{ color: subdued, fontSize: 12, whiteSpace: 'nowrap' }}>
                {visibleRows.length} rows
              </span>
            </div>
            <div style={{ overflowX: 'auto' }}>
              <table style={{ width: '100%', minWidth: 1240, borderCollapse: 'collapse', fontSize: 12 }}>
                <thead>
                  <tr style={{ color: subdued, background: '#fbfcfd', textAlign: 'left' }}>
                    {['Date', 'Brand', 'Shopify Revenue', 'Orders', 'AOV', 'Meta', 'Axon', 'Google', 'Total Spend', 'Platform ROAS', 'Blended ROAS', 'CPA', 'Refunds', 'Contribution'].map((heading) => (
                      <th key={heading} style={{ padding: '11px 12px', fontWeight: 650, borderBottom: `1px solid ${hairline}`, whiteSpace: 'nowrap' }}>{heading}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {visibleRows.map((row) => {
                    const color = brandColor.get(row.brandSlug) ?? shopifyBlue
                    return (
                      <tr key={`${row.date}-${row.brandSlug}`} style={{ borderBottom: '1px solid #eef1f4' }}>
                        <td style={{ padding: '12px', color: ink, fontWeight: 550, whiteSpace: 'nowrap' }}>{formatLongDate(row.date)}</td>
                        <td style={{ padding: '12px', whiteSpace: 'nowrap' }}>
                          <span style={{ display: 'inline-flex', alignItems: 'center', gap: 7, color: ink, fontWeight: 550 }}>
                            <span style={{ width: 8, height: 8, borderRadius: '50%', background: color }} />
                            {row.brandName}
                          </span>
                        </td>
                        <td style={{ ...numericStyle, padding: '12px', color: ink, fontWeight: 550 }}>{formatMoney(row.revenue)}</td>
                        <td style={{ ...numericStyle, padding: '12px', color: '#465a70' }}>{formatNumber(row.orders)}</td>
                        <td style={{ ...numericStyle, padding: '12px', color: '#465a70' }}>{row.aov > 0 ? formatMoney(row.aov, 2) : '—'}</td>
                        <td style={{ ...numericStyle, padding: '12px', color: '#465a70' }}>{formatMoney(row.metaSpend)}</td>
                        <td style={{ ...numericStyle, padding: '12px', color: '#465a70' }}>{row.axonSpend > 0 ? formatMoney(row.axonSpend) : '—'}</td>
                        <td style={{ ...numericStyle, padding: '12px', color: '#465a70' }}>{row.googleSpend > 0 ? formatMoney(row.googleSpend) : '—'}</td>
                        <td style={{ ...numericStyle, padding: '12px', color: ink, fontWeight: 550 }}>{formatMoney(row.totalAdSpend)}</td>
                        <td style={{ ...numericStyle, padding: '12px', color: row.platformRoas >= 2 ? '#047857' : '#b45309', fontWeight: 650 }}>{formatMetric(row.platformRoas)}</td>
                        <td style={{ ...numericStyle, padding: '12px', color: row.blendedRoas >= 2 ? '#047857' : '#b45309', fontWeight: 650 }}>{formatMetric(row.blendedRoas)}</td>
                        <td style={{ ...numericStyle, padding: '12px', color: '#465a70' }}>{formatMoney(row.cpa, 2)}</td>
                        <td style={{ ...numericStyle, padding: '12px', color: row.refunds > 0 ? '#be123c' : subdued }}>{row.refunds > 0 ? formatMoney(row.refunds) : '—'}</td>
                        <td style={{ ...numericStyle, padding: '12px', color: row.contributionAfterAds >= 0 ? '#047857' : '#be123c', fontWeight: 650 }}>{formatMoney(row.contributionAfterAds)}</td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
          </section>

          <aside style={{ display: 'grid', gap: 14 }}>
            <section style={{ ...panelStyle, padding: 16 }}>
              <h2 style={{ margin: 0, color: ink, fontSize: 16, lineHeight: 1.2, fontWeight: 550, letterSpacing: 0 }}>Alerts</h2>
              <div style={{ display: 'grid', gap: 10, marginTop: 14 }}>
                {alerts.map((alert) => (
                  <div key={`${alert.title}-${alert.detail}`} style={{ border: `1px solid ${hairline}`, borderLeft: `3px solid ${alert.tone}`, borderRadius: 7, padding: '11px 12px', background: '#ffffff' }}>
                    <div style={{ color: ink, fontWeight: 650, fontSize: 13 }}>{alert.title}</div>
                    <div style={{ color: subdued, fontSize: 12, lineHeight: 1.45, marginTop: 4 }}>{alert.detail}</div>
                  </div>
                ))}
              </div>
            </section>

            <section style={{ ...panelStyle, padding: 16 }}>
              <h2 style={{ margin: 0, color: ink, fontSize: 16, lineHeight: 1.2, fontWeight: 550, letterSpacing: 0 }}>Latest Day</h2>
              <div style={{ color: subdued, fontSize: 12, marginTop: 4 }}>{latestVisibleDate ? formatLongDate(latestVisibleDate) : '-'}</div>
              <div style={{ display: 'grid', gap: 10, marginTop: 14 }}>
                {latestRows.map((row) => (
                  <div key={row.brandSlug} style={{ display: 'flex', justifyContent: 'space-between', gap: 12, alignItems: 'center' }}>
                    <span style={{ color: ink, fontWeight: 550 }}>{row.brandName}</span>
                    <span style={{ ...numericStyle, color: ink, fontWeight: 650 }}>{formatMetric(row.blendedRoas)}</span>
                  </div>
                ))}
              </div>
            </section>
          </aside>
        </div>

        {pickerOpen ? (
          <div
            role="dialog"
            aria-modal="true"
            aria-label="Pick date range"
            style={{
              position: 'fixed',
              inset: 0,
              background: 'rgba(15, 23, 42, 0.28)',
              zIndex: 50,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              padding: 24,
            }}
          >
            <div style={{ ...panelStyle, width: 'min(760px, 100%)', padding: 0, overflow: 'hidden' }}>
              <div style={{ display: 'grid', gridTemplateColumns: '210px minmax(0, 1fr)', minHeight: 430 }}>
                <aside style={{ borderRight: '1px solid #e4e8f0', padding: 18, background: '#fbfcfe' }}>
                  <div style={{ color: '#111827', fontSize: 13, fontWeight: 850, marginBottom: 12 }}>Recently used</div>
                  <div style={{ display: 'grid', gap: 6 }}>
                    {DATE_PRESETS.map((preset) => {
                      const isActive = draftPreset === preset.value
                      return (
                        <button
                          key={preset.value}
                          type="button"
                          onClick={() => {
                            const nextRange = preset.value === 'custom'
                              ? (draftRange ?? activeRange)
                              : getPresetRange(preset.value, anchorDate)
                            setDraftPreset(preset.value)
                            setDraftRange(nextRange)
                          }}
                          style={{
                            border: 'none',
                            background: isActive ? '#eef6ff' : 'transparent',
                            color: '#172033',
                            borderRadius: 7,
                            padding: '8px 9px',
                            display: 'flex',
                            gap: 9,
                            alignItems: 'center',
                            fontSize: 13,
                            fontWeight: isActive ? 850 : 650,
                            cursor: 'pointer',
                            textAlign: 'left',
                          }}
                        >
                          <span
                            style={{
                              width: 18,
                              height: 18,
                              borderRadius: '50%',
                              border: `1px solid ${isActive ? '#1d75bd' : '#cbd5e1'}`,
                              background: isActive ? '#1d75bd' : '#ffffff',
                              boxShadow: isActive ? 'inset 0 0 0 4px #ffffff' : 'none',
                              flex: '0 0 auto',
                            }}
                          />
                          {preset.label}
                        </button>
                      )
                    })}
                  </div>
                </aside>

                <section style={{ padding: 22 }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 12, marginBottom: 20 }}>
                    <div>
                      <h2 style={{ margin: 0, color: '#111827', fontSize: 18, letterSpacing: 0 }}>Date range</h2>
                      <div style={{ color: '#697386', fontSize: 12, marginTop: 4 }}>Dates are shown in EST.</div>
                    </div>
                    <div style={{ color: '#111827', fontSize: 13, fontWeight: 850 }}>
                      {getPresetLabel(draftPreset)}
                    </div>
                  </div>

                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, marginBottom: 16 }}>
                    <label style={{ display: 'grid', gap: 7, color: '#697386', fontSize: 12, fontWeight: 800 }}>
                      Start date
                      <input
                        type="date"
                        value={(draftRange ?? activeRange).from}
                        onChange={(event) => {
                          setDraftPreset('custom')
                          setDraftRange({ ...(draftRange ?? activeRange), from: event.target.value })
                        }}
                        style={{ border: '1px solid #cbd5e1', borderRadius: 6, padding: '10px 11px', color: '#172033', fontSize: 13 }}
                      />
                    </label>
                    <label style={{ display: 'grid', gap: 7, color: '#697386', fontSize: 12, fontWeight: 800 }}>
                      End date
                      <input
                        type="date"
                        value={(draftRange ?? activeRange).to}
                        onChange={(event) => {
                          setDraftPreset('custom')
                          setDraftRange({ ...(draftRange ?? activeRange), to: event.target.value })
                        }}
                        style={{ border: '1px solid #cbd5e1', borderRadius: 6, padding: '10px 11px', color: '#172033', fontSize: 13 }}
                      />
                    </label>
                  </div>

                  <div style={{ border: '1px solid #e4e8f0', borderRadius: 8, overflow: 'hidden', marginTop: 18 }}>
                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7, 1fr)', background: '#fbfcfe', color: '#697386', fontSize: 11, fontWeight: 850 }}>
                      {['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'].map((day) => (
                        <div key={day} style={{ padding: '9px 0', textAlign: 'center' }}>{day}</div>
                      ))}
                    </div>
                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7, 1fr)', gap: 4, padding: 10 }}>
                      {Array.from({ length: 35 }).map((_, index) => {
                        const range = draftRange ?? activeRange
                        const end = new Date(`${range.to}T00:00:00`)
                        end.setDate(end.getDate() - 34 + index)
                        const iso = toIsoDate(end)
                        const inRange = iso >= range.from && iso <= range.to
                        const isEdge = iso === range.from || iso === range.to
                        return (
                          <button
                            key={iso}
                            type="button"
                            onClick={() => {
                              const current = draftRange ?? activeRange
                              const next = iso < current.from || iso === current.to ? { from: iso, to: current.to } : { from: current.from, to: iso }
                              setDraftPreset('custom')
                              setDraftRange(next.from <= next.to ? next : { from: next.to, to: next.from })
                            }}
                            style={{
                              border: 'none',
                              borderRadius: isEdge ? 6 : 4,
                              background: isEdge ? '#1d75bd' : inRange ? '#dbeafe' : '#ffffff',
                              color: isEdge ? '#ffffff' : '#172033',
                              padding: '7px 0',
                              fontSize: 12,
                              fontWeight: isEdge ? 850 : 650,
                              cursor: 'pointer',
                            }}
                          >
                            {end.getDate()}
                          </button>
                        )
                      })}
                    </div>
                  </div>

                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: 22, gap: 12 }}>
                    <div style={{ color: '#697386', fontSize: 12 }}>
                      {(draftRange ?? activeRange).from} - {(draftRange ?? activeRange).to}
                    </div>
                    <div style={{ display: 'flex', gap: 8 }}>
                      <button
                        type="button"
                        onClick={() => setPickerOpen(false)}
                        style={{ border: '1px solid #cbd5e1', background: '#ffffff', color: '#172033', borderRadius: 6, padding: '9px 14px', fontWeight: 750, cursor: 'pointer' }}
                      >
                        Cancel
                      </button>
                      <button
                        type="button"
                        onClick={applyDatePicker}
                        style={{ border: '1px solid #1d75bd', background: '#1d75bd', color: '#ffffff', borderRadius: 6, padding: '9px 14px', fontWeight: 850, cursor: 'pointer' }}
                      >
                        Update
                      </button>
                    </div>
                  </div>
                </section>
              </div>
            </div>
          </div>
        ) : null}
      </div>
    </div>
  )
}
