import { existsSync, readFileSync } from 'node:fs'
import { join } from 'node:path'

type BrandSlug = 'pluxy' | 'vivi' | 'trueclean'

interface PlatformConfig {
  enabled?: boolean
  access_token?: string
  ad_account_id?: string
  store?: string
  client_id?: string
  client_secret?: string
  report_key?: string
  customer_id?: string
}

interface BrandConfig {
  slug: BrandSlug
  name: string
  enabled?: boolean
  currency?: string
  timezone?: string
  platforms?: {
    meta?: PlatformConfig
    shopify?: PlatformConfig
    axon?: PlatformConfig
    google_ads?: PlatformConfig
  }
  costs?: {
    cogs_pct?: number
  }
}

interface PlatformDay {
  spend?: number
  revenue?: number
  purchases?: number
}

interface ShopifyDay {
  revenue?: number
  orders?: number
  returns?: number
}

interface PerformanceRow {
  date: string
  brandSlug: BrandSlug
  brandName: string
  revenue: number
  orders: number
  metaSpend: number
  axonSpend: number
  googleSpend: number
  totalAdSpend: number
  platformAttributedRevenue: number
  platformRoas: number
  blendedRoas: number
  cpa: number
  refunds: number
  cogs: number
  contributionAfterAds: number
  netProfit: number
  lastSync: string | null
}

const ALLOWED_EMAIL_KEYS = new Set(['iskander', 'nicolas', 'naomi'])
const BRAND_SLUGS: BrandSlug[] = ['pluxy', 'vivi', 'trueclean']
const LOCAL_PROFIT_APP_CONFIG_DIR = '/Users/iskanderzrouga/Desktop/Marketing Skills & Agents/profit-app/config/brands'
const LOCAL_PROFIT_APP_ENV_FILE = '/Users/iskanderzrouga/Desktop/Marketing Skills & Agents/profit-app/config/.env'
let localEnvCache: Record<string, string> | null = null

function jsonResponse(payload: unknown, status = 200) {
  return new Response(JSON.stringify(payload), {
    status,
    headers: { 'Content-Type': 'application/json' },
  })
}

function getSupabaseUrl() {
  return process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL
}

function getSupabaseAnonKey() {
  return process.env.SUPABASE_ANON_KEY || process.env.VITE_SUPABASE_ANON_KEY || process.env.VITE_SUPABASE_PUBLISHABLE_KEY
}

function parseEnvLine(line: string) {
  const match = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/)
  if (!match) return null
  const [, key, rawValue] = match
  let value = rawValue.trim()
  if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) {
    value = value.slice(1, -1)
  }
  return [key, value] as const
}

function getLocalEnv() {
  if (localEnvCache) return localEnvCache

  const envFile = process.env.BLUEBRANDS_PERFORMANCE_ENV_FILE || LOCAL_PROFIT_APP_ENV_FILE
  localEnvCache = {}

  if (!existsSync(envFile)) {
    return localEnvCache
  }

  for (const line of readFileSync(envFile, 'utf8').split(/\r?\n/)) {
    const parsed = parseEnvLine(line)
    if (parsed) {
      const [key, value] = parsed
      localEnvCache[key] = value
    }
  }

  return localEnvCache
}

function getServerEnv(name: string) {
  return process.env[name] || getLocalEnv()[name]
}

async function requireAllowedUser(req: Request) {
  const supabaseUrl = getSupabaseUrl()
  const anonKey = getSupabaseAnonKey()
  const auth = req.headers.get('Authorization')

  if (!supabaseUrl || !anonKey || !auth) {
    return { ok: false as const, status: 401, error: 'performance_auth_required' }
  }

  const response = await fetch(`${supabaseUrl}/auth/v1/user`, {
    headers: {
      apikey: anonKey,
      Authorization: auth,
    },
  })

  if (!response.ok) {
    return { ok: false as const, status: 401, error: 'performance_auth_invalid' }
  }

  const user = (await response.json()) as { email?: string }
  const localPart = user.email?.trim().toLowerCase().split('@')[0] ?? ''

  if (!ALLOWED_EMAIL_KEYS.has(localPart)) {
    return { ok: false as const, status: 403, error: 'performance_access_denied' }
  }

  return { ok: true as const, email: user.email ?? '', auth }
}

function getRequestRange(req: Request) {
  const url = new URL(req.url)
  const today = new Date()
  const to = url.searchParams.get('to') || new Date(today.getTime() - 24 * 60 * 60 * 1000).toISOString().slice(0, 10)
  const days = Math.max(1, Math.min(90, Number(url.searchParams.get('days') || 30)))
  const fromDate = new Date(`${to}T00:00:00`)
  fromDate.setDate(fromDate.getDate() - (days - 1))
  const from = url.searchParams.get('from') || fromDate.toISOString().slice(0, 10)

  return { from, to, days }
}

function parseBrandConfigs(raw: string) {
  const parsed = JSON.parse(raw) as BrandConfig[] | Record<string, BrandConfig>
  return Array.isArray(parsed) ? parsed : Object.values(parsed)
}

function loadBrandConfigs() {
  const raw = getServerEnv('BLUEBRANDS_PERFORMANCE_CONFIG_JSON')
  let configs: BrandConfig[]

  if (raw) {
    configs = parseBrandConfigs(raw)
  } else {
    const configDir = getServerEnv('BLUEBRANDS_PERFORMANCE_CONFIG_DIR') || LOCAL_PROFIT_APP_CONFIG_DIR
    if (!existsSync(configDir)) {
      throw new Error('BLUEBRANDS_PERFORMANCE_CONFIG_JSON or BLUEBRANDS_PERFORMANCE_CONFIG_DIR not configured')
    }

    configs = BRAND_SLUGS.map((slug) => JSON.parse(readFileSync(join(configDir, `${slug}.json`), 'utf8')) as BrandConfig)
  }

  return configs
    .filter((brand): brand is BrandConfig => BRAND_SLUGS.includes(brand.slug) && brand.enabled !== false)
    .sort((left, right) => BRAND_SLUGS.indexOf(left.slug) - BRAND_SLUGS.indexOf(right.slug))
}

async function supabaseUserFetch(path: string, auth: string, init: RequestInit = {}) {
  const supabaseUrl = getSupabaseUrl()
  const anonKey = getSupabaseAnonKey()

  if (!supabaseUrl || !anonKey) {
    throw new Error('Supabase client env is not configured')
  }

  return fetch(`${supabaseUrl}/rest/v1/${path}`, {
    ...init,
    headers: {
      apikey: anonKey,
      Authorization: auth,
      'Content-Type': 'application/json',
      ...(init.headers ?? {}),
    },
  })
}

function toNumber(value: unknown) {
  const number = Number(value ?? 0)
  return Number.isFinite(number) ? number : 0
}

function rowFromDb(row: Record<string, unknown>): PerformanceRow {
  return {
    date: String(row.date),
    brandSlug: String(row.brand_slug) as BrandSlug,
    brandName: String(row.brand_name),
    revenue: toNumber(row.revenue),
    orders: toNumber(row.orders),
    metaSpend: toNumber(row.meta_spend),
    axonSpend: toNumber(row.axon_spend),
    googleSpend: toNumber(row.google_spend),
    totalAdSpend: toNumber(row.total_ad_spend),
    platformAttributedRevenue: toNumber(row.platform_attributed_revenue),
    platformRoas: toNumber(row.platform_roas),
    blendedRoas: toNumber(row.blended_roas),
    cpa: toNumber(row.cpa),
    refunds: toNumber(row.refunds),
    cogs: toNumber(row.cogs),
    contributionAfterAds: toNumber(row.contribution_after_ads),
    netProfit: toNumber(row.net_profit),
    lastSync: typeof row.last_sync === 'string' ? row.last_sync : null,
  }
}

async function readRows(from: string, to: string, auth: string) {
  const brandList = BRAND_SLUGS.join(',')
  const response = await supabaseUserFetch(
    `performance_brand_day?select=*&brand_slug=in.(${brandList})&date=gte.${from}&date=lte.${to}&order=date.desc,brand_slug.asc`,
    auth,
  )

  if (!response.ok) {
    throw new Error(`Supabase read failed: ${await response.text()}`)
  }

  const rows = (await response.json()) as Array<Record<string, unknown>>
  return rows.map(rowFromDb)
}

async function metaDaily(brand: BrandConfig, since: string, until: string) {
  const meta = brand.platforms?.meta
  if (!meta?.enabled || !meta.access_token || !meta.ad_account_id) {
    return new Map<string, PlatformDay>()
  }

  const params = new URLSearchParams({
    fields: 'spend,purchase_roas,actions,action_values,cost_per_action_type',
    time_range: JSON.stringify({ since, until }),
    time_increment: '1',
    level: 'account',
    limit: '500',
    access_token: meta.access_token,
  })
  const apiVersion = getServerEnv('META_API_VERSION') || 'v22.0'
  const response = await fetch(`https://graph.facebook.com/${apiVersion}/${meta.ad_account_id}/insights?${params}`)

  if (!response.ok) {
    throw new Error(`${brand.slug} Meta failed: ${await response.text()}`)
  }

  const payload = (await response.json()) as { data?: Array<Record<string, unknown>> }
  const rows = new Map<string, PlatformDay>()

  for (const item of payload.data ?? []) {
    const date = String(item.date_start ?? '')
    if (!date) continue
    const actionValues = Array.isArray(item.action_values) ? item.action_values : []
    const actions = Array.isArray(item.actions) ? item.actions : []
    const revenue = actionValues.find((action) => (action as { action_type?: string }).action_type === 'omni_purchase') as { value?: string } | undefined
    const purchases = actions.find((action) => (action as { action_type?: string }).action_type === 'omni_purchase') as { value?: string } | undefined
    rows.set(date, {
      spend: toNumber(item.spend),
      revenue: toNumber(revenue?.value),
      purchases: toNumber(purchases?.value),
    })
  }

  return rows
}

async function shopifyToken(brand: BrandConfig) {
  const shopify = brand.platforms?.shopify
  if (!shopify?.enabled || !shopify.store || !shopify.client_id || !shopify.client_secret) {
    return null
  }

  const body = new URLSearchParams({
    grant_type: 'client_credentials',
    client_id: shopify.client_id,
    client_secret: shopify.client_secret,
  })

  const response = await fetch(`https://${shopify.store}/admin/oauth/access_token`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body,
  })

  if (!response.ok) {
    throw new Error(`${brand.slug} Shopify token failed: ${await response.text()}`)
  }

  const payload = (await response.json()) as { access_token?: string }
  return payload.access_token ?? null
}

async function shopifyql(brand: BrandConfig, token: string, query: string) {
  const store = brand.platforms?.shopify?.store
  const apiVersion = getServerEnv('SHOPIFY_API_VERSION') || 'unstable'
  const gql = `{ shopifyqlQuery(query: ${JSON.stringify(query)}) { parseErrors tableData { columns { name dataType } rows } } }`
  const response = await fetch(`https://${store}/admin/api/${apiVersion}/graphql.json`, {
    method: 'POST',
    headers: {
      'X-Shopify-Access-Token': token,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ query: gql }),
  })

  if (!response.ok) {
    throw new Error(`${brand.slug} ShopifyQL failed: ${await response.text()}`)
  }

  const payload = await response.json() as {
    data?: { shopifyqlQuery?: { parseErrors?: unknown[]; tableData?: { columns?: Array<{ name: string }>; rows?: unknown[][] } } }
  }
  const data = payload.data?.shopifyqlQuery
  if (!data || (Array.isArray(data.parseErrors) && data.parseErrors.length > 0)) {
    throw new Error(`${brand.slug} ShopifyQL parse failed`)
  }

  const columns = data.tableData?.columns?.map((column) => column.name) ?? []
  return (data.tableData?.rows ?? []).map((values) => Object.fromEntries(columns.map((column, index) => [column, values[index]])))
}

async function shopifyDaily(brand: BrandConfig, since: string, until: string) {
  const token = await shopifyToken(brand)
  if (!token) {
    return new Map<string, ShopifyDay>()
  }

  const salesRows = await shopifyql(
    brand,
    token,
    `FROM sales SHOW total_sales, gross_sales, net_sales, orders, discounts, returns, taxes GROUP BY day SINCE ${since} UNTIL ${until} ORDER BY day`,
  )
  const rows = new Map<string, ShopifyDay>()

  for (const item of salesRows) {
    const date = String(item.day ?? '').slice(0, 10)
    if (!date) continue
    const totalSales = toNumber(item.total_sales)
    const taxes = toNumber(item.taxes)
    rows.set(date, {
      revenue: totalSales - taxes,
      orders: toNumber(item.orders),
      returns: Math.abs(toNumber(item.returns)),
    })
  }

  return rows
}

async function axonDaily(brand: BrandConfig, since: string, until: string) {
  const axon = brand.platforms?.axon
  if (!axon?.enabled || !axon.report_key) {
    return new Map<string, PlatformDay>()
  }

  const timezone = brand.timezone || 'America/New_York'
  const todayUtc = toUtcDateString(new Date())
  const cutoff = addIsoDays(todayUtc, -27)
  const hourlySince = since > cutoff ? since : cutoff
  const hourlyUntil = until
  const dailySince = since
  const dailyUntil = until < addIsoDays(cutoff, -1) ? until : addIsoDays(cutoff, -1)
  const rows = new Map<string, PlatformDay>()

  if (hourlySince <= hourlyUntil) {
    const hardMin = addIsoDays(todayUtc, -29)
    const utcSince = maxIsoDate(addIsoDays(hourlySince, -1), hardMin)
    const utcUntil = minIsoDate(addIsoDays(hourlyUntil, 1), todayUtc)
    const payload = await fetchAxonReport(brand, axon.report_key, utcSince, utcUntil, 'day,hour,cost,impressions,clicks,roas_7d,sales_7d')

    for (const item of payload.results ?? []) {
      const utcDay = String(item.day ?? '').slice(0, 10)
      if (!utcDay) continue
      const localDate = getAxonLocalDate(utcDay, item.hour, timezone)
      if (localDate < hourlySince || localDate > hourlyUntil) continue
      addAxonRow(rows, localDate, item)
    }
  }

  if (dailySince <= dailyUntil) {
    try {
      const payload = await fetchAxonReport(brand, axon.report_key, dailySince, dailyUntil, 'day,cost,impressions,clicks,roas_7d,sales_7d')
      for (const item of payload.results ?? []) {
        const date = String(item.day ?? '').slice(0, 10)
        if (!date) continue
        addAxonRow(rows, date, item)
      }
    } catch {
      // Keep the precise hourly rows if the older UTC-daily fallback is unavailable.
    }
  }

  return rows
}

function toUtcDateString(date: Date) {
  return date.toISOString().slice(0, 10)
}

function addIsoDays(value: string, days: number) {
  const date = new Date(`${value}T00:00:00Z`)
  date.setUTCDate(date.getUTCDate() + days)
  return toUtcDateString(date)
}

function minIsoDate(left: string, right: string) {
  return left < right ? left : right
}

function maxIsoDate(left: string, right: string) {
  return left > right ? left : right
}

async function fetchAxonReport(brand: BrandConfig, reportKey: string, start: string, end: string, columns: string) {
  const params = new URLSearchParams({
    api_key: reportKey,
    start,
    end,
    columns,
    report_type: 'advertiser',
    format: 'json',
  })
  const response = await fetch(`https://r.applovin.com/report?${params}`)

  if (!response.ok) {
    throw new Error(`${brand.slug} AppLovin failed: ${await response.text()}`)
  }

  return (await response.json()) as { results?: Array<Record<string, unknown>> }
}

function getAxonLocalDate(utcDay: string, hour: unknown, timezone: string) {
  const rawHour = String(hour ?? '00:00')
  const [hourPart = '00', minutePart = '00'] = rawHour.split(':')
  const normalizedHour = hourPart.padStart(2, '0')
  const normalizedMinute = minutePart.padStart(2, '0')
  const utcDate = new Date(`${utcDay}T${normalizedHour}:${normalizedMinute}:00Z`)

  return formatDateInTimezone(utcDate, timezone)
}

function formatDateInTimezone(date: Date, timezone: string) {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: timezone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(date)
  const year = parts.find((part) => part.type === 'year')?.value ?? '1970'
  const month = parts.find((part) => part.type === 'month')?.value ?? '01'
  const day = parts.find((part) => part.type === 'day')?.value ?? '01'

  return `${year}-${month}-${day}`
}

function addAxonRow(rows: Map<string, PlatformDay>, date: string, item: Record<string, unknown>) {
  const current = rows.get(date) ?? {}
  const spend = toNumber(item.cost)
  const roasPercent = toNumber(item.roas_7d)
  rows.set(date, {
    spend: toNumber(current.spend) + spend,
    revenue: toNumber(current.revenue) + spend * (roasPercent / 100),
    purchases: toNumber(current.purchases) + toNumber(item.sales_7d),
  })
}

async function googleToken() {
  const refreshToken = getServerEnv('GOOGLE_REFRESH_TOKEN')
  if (!refreshToken) return null

  const response = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      refresh_token: refreshToken,
      client_id: getServerEnv('GOOGLE_CLIENT_ID') ?? '',
      client_secret: getServerEnv('GOOGLE_CLIENT_SECRET') ?? '',
      grant_type: 'refresh_token',
    }),
  })

  if (!response.ok) {
    throw new Error(`Google OAuth failed: ${await response.text()}`)
  }

  const payload = (await response.json()) as { access_token?: string }
  return payload.access_token ?? null
}

async function googleDaily(brand: BrandConfig, since: string, until: string) {
  const google = brand.platforms?.google_ads
  const developerToken = getServerEnv('GOOGLE_DEVELOPER_TOKEN')
  if (!google?.enabled || !google.customer_id || !developerToken) {
    return new Map<string, PlatformDay>()
  }

  const accessToken = await googleToken()
  if (!accessToken) {
    return new Map<string, PlatformDay>()
  }

  const customerId = google.customer_id.replace(/[^0-9]/g, '')
  const mcc = (getServerEnv('GOOGLE_MCC_ID') ?? '').replace(/[^0-9]/g, '')
  const response = await fetch(`https://googleads.googleapis.com/v21/customers/${customerId}/googleAds:searchStream`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${accessToken}`,
      'developer-token': developerToken,
      ...(mcc ? { 'login-customer-id': mcc } : {}),
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      query: `SELECT segments.date, metrics.cost_micros, metrics.conversions, metrics.conversions_value FROM customer WHERE segments.date BETWEEN '${since}' AND '${until}'`,
    }),
  })

  if (!response.ok) {
    throw new Error(`${brand.slug} Google Ads failed: ${await response.text()}`)
  }

  const payload = (await response.json()) as Array<{ results?: Array<Record<string, unknown>> }>
  const rows = new Map<string, PlatformDay>()

  for (const batch of payload) {
    for (const item of batch.results ?? []) {
      const segments = item.segments as { date?: string } | undefined
      const metrics = item.metrics as { costMicros?: string; conversions?: string; conversionsValue?: string } | undefined
      const date = segments?.date
      if (!date) continue
      const current = rows.get(date) ?? {}
      rows.set(date, {
        spend: toNumber(current.spend) + toNumber(metrics?.costMicros) / 1_000_000,
        revenue: toNumber(current.revenue) + toNumber(metrics?.conversionsValue),
        purchases: toNumber(current.purchases) + toNumber(metrics?.conversions),
      })
    }
  }

  return rows
}

function buildRows(brand: BrandConfig, maps: { meta: Map<string, PlatformDay>; shopify: Map<string, ShopifyDay>; axon: Map<string, PlatformDay>; google: Map<string, PlatformDay> }) {
  const dates = new Set([...maps.meta.keys(), ...maps.shopify.keys(), ...maps.axon.keys(), ...maps.google.keys()])
  const lastSync = new Date().toISOString()

  return [...dates].map((date) => {
    const meta = maps.meta.get(date) ?? {}
    const shopify = maps.shopify.get(date) ?? {}
    const axon = maps.axon.get(date) ?? {}
    const google = maps.google.get(date) ?? {}
    const revenue = toNumber(shopify.revenue)
    const orders = toNumber(shopify.orders)
    const metaSpend = toNumber(meta.spend)
    const axonSpend = toNumber(axon.spend)
    const googleSpend = toNumber(google.spend)
    const totalAdSpend = metaSpend + axonSpend + googleSpend
    const attributedRevenue = toNumber(meta.revenue) + toNumber(axon.revenue) + toNumber(google.revenue)
    const cogs = revenue * (toNumber(brand.costs?.cogs_pct) / 100)
    const contributionAfterAds = revenue - cogs - totalAdSpend

    return {
      brand_slug: brand.slug,
      brand_name: brand.name,
      date,
      revenue,
      orders,
      meta_spend: metaSpend,
      axon_spend: axonSpend,
      google_spend: googleSpend,
      total_ad_spend: totalAdSpend,
      platform_attributed_revenue: attributedRevenue,
      platform_roas: totalAdSpend > 0 ? attributedRevenue / totalAdSpend : 0,
      blended_roas: totalAdSpend > 0 ? revenue / totalAdSpend : 0,
      cpa: orders > 0 ? totalAdSpend / orders : 0,
      refunds: toNumber(shopify.returns),
      cogs,
      contribution_after_ads: contributionAfterAds,
      net_profit: contributionAfterAds,
      last_sync: lastSync,
      updated_at: lastSync,
    }
  })
}

async function upsertRows(rows: Array<Record<string, unknown>>, auth: string) {
  if (rows.length === 0) return

  const response = await supabaseUserFetch('performance_brand_day?on_conflict=brand_slug,date', auth, {
    method: 'POST',
    headers: { Prefer: 'resolution=merge-duplicates' },
    body: JSON.stringify(rows),
  })

  if (!response.ok) {
    throw new Error(`Supabase upsert failed: ${await response.text()}`)
  }
}

async function syncPerformance(from: string, to: string, auth: string) {
  const brands = loadBrandConfigs()
  const errors: string[] = []
  let rowsWritten = 0

  for (const brand of brands) {
    try {
      const [meta, shopify, axon, google] = await Promise.all([
        metaDaily(brand, from, to),
        shopifyDaily(brand, from, to),
        axonDaily(brand, from, to),
        googleDaily(brand, from, to),
      ])
      const rows = buildRows(brand, { meta, shopify, axon, google })
      await upsertRows(rows, auth)
      rowsWritten += rows.length
    } catch (error) {
      errors.push(`${brand.slug}: ${error instanceof Error ? error.message : 'unknown error'}`)
    }
  }

  return { rowsWritten, errors }
}

export default async function handler(req: Request): Promise<Response> {
  const access = await requireAllowedUser(req)
  if (!access.ok) {
    return jsonResponse({ error: access.error, rows: [] }, access.status)
  }

  const { from, to } = getRequestRange(req)

  try {
    if (req.method === 'POST') {
      const sync = await syncPerformance(from, to, access.auth)
      const rows = await readRows(from, to, access.auth)
      return jsonResponse({ rows, generatedAt: new Date().toISOString(), source: 'supabase', sync })
    }

    if (req.method === 'GET') {
      const rows = await readRows(from, to, access.auth)
      return jsonResponse({ rows, generatedAt: new Date().toISOString(), source: 'supabase' })
    }

    return jsonResponse({ error: 'Method not allowed', rows: [] }, 405)
  } catch (error) {
    return jsonResponse({
      error: error instanceof Error ? error.message : 'Performance API failed',
      rows: [],
      generatedAt: new Date().toISOString(),
    }, 500)
  }
}
