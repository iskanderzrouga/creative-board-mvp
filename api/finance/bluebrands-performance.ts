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
  roas?: number
  cpa?: number
}

interface ShopifyDay {
  revenue?: number
  totalSales?: number
  grossSales?: number
  netSales?: number
  orders?: number
  aov?: number
  discounts?: number
  returns?: number
  taxes?: number
  shipping?: number
  sessions?: number
  cvr?: number
}

interface PerformanceRow {
  date: string
  brandSlug: BrandSlug
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

interface JsonFetchResult<T> {
  ok: boolean
  status: number
  data: T
  raw: string
}

type HandlerRequest = Request | {
  method?: string
  url?: string
  headers?: Record<string, string | string[] | undefined>
}

type HandlerResponse = {
  status?: (status: number) => HandlerResponse
  setHeader?: (name: string, value: string) => void
  json?: (payload: unknown) => void
  end?: (body?: string) => void
  statusCode?: number
}

const ALLOWED_EMAIL_KEYS = new Set(['iskander', 'nicolas', 'naomi'])
const BRAND_SLUGS: BrandSlug[] = ['pluxy', 'vivi', 'trueclean']

function jsonResponse(payload: unknown, status = 200) {
  return new Response(JSON.stringify(payload), {
    status,
    headers: { 'Content-Type': 'application/json' },
  })
}

function sendJson(res: HandlerResponse | undefined, payload: unknown, status = 200) {
  if (!res) {
    return jsonResponse(payload, status)
  }

  res.setHeader?.('Content-Type', 'application/json')

  if (typeof res.status === 'function' && typeof res.json === 'function') {
    res.status(status).json(payload)
    return undefined
  }

  res.statusCode = status
  res.end?.(JSON.stringify(payload))
  return undefined
}

function isFetchRequest(req: HandlerRequest): req is Request {
  return typeof (req as Request).headers?.get === 'function'
}

function getHeader(req: HandlerRequest, name: string) {
  if (isFetchRequest(req)) {
    return req.headers.get(name)
  }

  const lowerName = name.toLowerCase()
  const value = req.headers?.[lowerName] ?? req.headers?.[name]

  if (Array.isArray(value)) {
    return value[0] ?? null
  }

  return value ?? null
}

function getMethod(req: HandlerRequest) {
  return (req.method || 'GET').toUpperCase()
}

function getRequestUrl(req: HandlerRequest) {
  return new URL(req.url || '/', 'https://editors-board.local')
}

function getTodayInTimezone(timeZone: string) {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(new Date())
  const year = parts.find((part) => part.type === 'year')?.value ?? '1970'
  const month = parts.find((part) => part.type === 'month')?.value ?? '01'
  const day = parts.find((part) => part.type === 'day')?.value ?? '01'

  return `${year}-${month}-${day}`
}

function getSupabaseUrl() {
  return process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL
}

function getSupabaseAnonKey() {
  return process.env.SUPABASE_ANON_KEY || process.env.VITE_SUPABASE_ANON_KEY || process.env.VITE_SUPABASE_PUBLISHABLE_KEY
}

function getSupabaseServiceKey() {
  return getServerEnv('SUPABASE_SERVICE_ROLE_KEY')
}

function getServerEnv(name: string) {
  return process.env[name]
}

async function requireAllowedUser(req: HandlerRequest) {
  const supabaseUrl = getSupabaseUrl()
  const anonKey = getSupabaseAnonKey()
  const auth = getHeader(req, 'authorization')

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

function getRequestRange(req: HandlerRequest) {
  const url = getRequestUrl(req)
  const to = url.searchParams.get('to') || addIsoDays(getTodayInTimezone('America/New_York'), -1)
  const days = Math.max(1, Math.min(90, Number(url.searchParams.get('days') || 1)))
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
  if (!raw) {
    throw new Error('BLUEBRANDS_PERFORMANCE_CONFIG_JSON not configured in Vercel')
  }
  const configs = parseBrandConfigs(raw)

  return configs
    .filter((brand): brand is BrandConfig => BRAND_SLUGS.includes(brand.slug) && brand.enabled !== false)
    .sort((left, right) => BRAND_SLUGS.indexOf(left.slug) - BRAND_SLUGS.indexOf(right.slug))
}

async function supabaseRestFetch(path: string, auth: string, init: RequestInit = {}, useServiceRole = false) {
  const supabaseUrl = getSupabaseUrl()
  const anonKey = getSupabaseAnonKey()
  const serviceKey = useServiceRole ? getSupabaseServiceKey() : ''

  if (!supabaseUrl || (!anonKey && !serviceKey)) {
    throw new Error('Supabase client env is not configured')
  }

  const apikey = serviceKey || anonKey
  const authorization = serviceKey ? `Bearer ${serviceKey}` : auth

  return fetch(`${supabaseUrl}/rest/v1/${path}`, {
    ...init,
    headers: {
      apikey,
      Authorization: authorization,
      'Content-Type': 'application/json',
      ...(init.headers ?? {}),
    },
  })
}

function toNumber(value: unknown) {
  const number = Number(value ?? 0)
  return Number.isFinite(number) ? number : 0
}

function parseJson(raw: string) {
  if (!raw.trim()) return {}
  return JSON.parse(raw)
}

async function fetchJson<T>(url: string, init: RequestInit = {}): Promise<JsonFetchResult<T>> {
  const response = await fetch(url, init)
  const raw = await response.text()
  return {
    ok: response.ok,
    status: response.status,
    data: parseJson(raw) as T,
    raw,
  }
}

function apiErrorMessage(data: unknown, raw: string) {
  if (data && typeof data === 'object') {
    const maybe = data as { error?: unknown; message?: unknown }
    if (typeof maybe.message === 'string') return maybe.message
    if (maybe.error && typeof maybe.error === 'object') {
      const nested = maybe.error as { message?: unknown; error?: unknown }
      if (typeof nested.message === 'string') return nested.message
      if (typeof nested.error === 'string') return nested.error
    }
    if (typeof maybe.error === 'string') return maybe.error
  }
  return raw.slice(0, 300)
}

function rowFromDb(row: Record<string, unknown>): PerformanceRow {
  return {
    date: String(row.date),
    brandSlug: String(row.brand_slug) as BrandSlug,
    brandName: String(row.brand_name),
    revenue: toNumber(row.revenue),
    orders: toNumber(row.orders),
    metaSpend: toNumber(row.meta_spend),
    metaRevenue: toNumber(row.meta_revenue),
    metaPurchases: toNumber(row.meta_purchases),
    metaRoas: toNumber(row.meta_roas),
    metaCpa: toNumber(row.meta_cpa),
    axonSpend: toNumber(row.axon_spend),
    axonRevenue: toNumber(row.axon_revenue),
    axonPurchases: toNumber(row.axon_purchases),
    axonRoas: toNumber(row.axon_roas),
    axonCpa: toNumber(row.axon_cpa),
    googleSpend: toNumber(row.google_spend),
    googleRevenue: toNumber(row.google_revenue),
    googlePurchases: toNumber(row.google_purchases),
    googleRoas: toNumber(row.google_roas),
    googleCpa: toNumber(row.google_cpa),
    totalAdSpend: toNumber(row.total_ad_spend),
    platformAttributedRevenue: toNumber(row.platform_attributed_revenue),
    platformRoas: toNumber(row.platform_roas),
    blendedRoas: toNumber(row.blended_roas),
    cpa: toNumber(row.cpa),
    totalSales: toNumber(row.total_sales),
    grossSales: toNumber(row.gross_sales),
    netSales: toNumber(row.net_sales),
    aov: toNumber(row.aov),
    discounts: toNumber(row.discounts),
    refunds: toNumber(row.refunds),
    taxes: toNumber(row.taxes),
    shipping: toNumber(row.shipping),
    sessions: toNumber(row.sessions),
    cvr: toNumber(row.cvr),
    cogs: toNumber(row.cogs),
    contributionAfterAds: toNumber(row.contribution_after_ads),
    netProfit: toNumber(row.net_profit),
    lastSync: typeof row.last_sync === 'string' ? row.last_sync : null,
  }
}

async function readRows(from: string, to: string, auth: string, useServiceRole = false) {
  const brandList = BRAND_SLUGS.join(',')
  const response = await supabaseRestFetch(
    `performance_brand_day?select=*&brand_slug=in.(${brandList})&date=gte.${from}&date=lte.${to}&order=date.desc,brand_slug.asc`,
    auth,
    {},
    useServiceRole,
  )

  if (!response.ok) {
    throw new Error(`Supabase read failed: ${await response.text()}`)
  }

  const rows = (await response.json()) as Array<Record<string, unknown>>
  return rows.map(rowFromDb)
}

async function metaDaily(brand: BrandConfig, since: string, until: string) {
  const meta = brand.platforms?.meta
  if (!meta || meta.enabled === false) {
    return new Map<string, PlatformDay>()
  }
  if (!meta.access_token || !meta.ad_account_id) {
    throw new Error(`${brand.slug} Meta config missing access_token or ad_account_id`)
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
  const response = await fetchJson<{ data?: Array<Record<string, unknown>> }>(`https://graph.facebook.com/${apiVersion}/${meta.ad_account_id}/insights?${params}`)

  if (!response.ok) {
    throw new Error(`${brand.slug} Meta failed (${response.status}): ${apiErrorMessage(response.data, response.raw)}`)
  }

  const payload = response.data
  const rows = new Map<string, PlatformDay>()

  for (const item of payload.data ?? []) {
    const date = String(item.date_start ?? '')
    if (!date) continue
    const actionValues = Array.isArray(item.action_values) ? item.action_values : []
    const actions = Array.isArray(item.actions) ? item.actions : []
    const purchaseRoas = Array.isArray(item.purchase_roas) ? item.purchase_roas : []
    const costPerAction = Array.isArray(item.cost_per_action_type) ? item.cost_per_action_type : []
    const revenue = actionValues.find((action) => (action as { action_type?: string }).action_type === 'omni_purchase') as { value?: string } | undefined
    const purchases = actions.find((action) => (action as { action_type?: string }).action_type === 'omni_purchase') as { value?: string } | undefined
    const roas = purchaseRoas.find((action) => (action as { action_type?: string }).action_type === 'omni_purchase') as { value?: string } | undefined
    const cpa = costPerAction.find((action) => (action as { action_type?: string }).action_type === 'omni_purchase') as { value?: string } | undefined
    rows.set(date, {
      spend: toNumber(item.spend),
      revenue: toNumber(revenue?.value),
      purchases: toNumber(purchases?.value),
      roas: toNumber(roas?.value),
      cpa: toNumber(cpa?.value),
    })
  }

  return rows
}

async function shopifyToken(brand: BrandConfig) {
  const shopify = brand.platforms?.shopify
  if (!shopify || shopify.enabled === false) {
    return null
  }
  if (!shopify.store || !shopify.client_id || !shopify.client_secret) {
    throw new Error(`${brand.slug} Shopify config missing store, client_id, or client_secret`)
  }

  const body = new URLSearchParams({
    grant_type: 'client_credentials',
    client_id: shopify.client_id,
    client_secret: shopify.client_secret,
  })

  const response = await fetchJson<{ access_token?: string }>(`https://${shopify.store}/admin/oauth/access_token`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body,
  })

  if (!response.ok) {
    throw new Error(`${brand.slug} Shopify token failed (${response.status}): ${apiErrorMessage(response.data, response.raw)}`)
  }

  const payload = response.data
  if (!payload.access_token) {
    throw new Error(`${brand.slug} Shopify token response did not include access_token`)
  }

  return payload.access_token
}

async function shopifyql(brand: BrandConfig, token: string, query: string) {
  const store = brand.platforms?.shopify?.store
  const apiVersion = getServerEnv('SHOPIFY_API_VERSION') || 'unstable'
  const gql = `{ shopifyqlQuery(query: ${JSON.stringify(query)}) { parseErrors tableData { columns { name dataType } rows } } }`
  const response = await fetchJson<{
    data?: {
      shopifyqlQuery?: {
        parseErrors?: unknown[]
        tableData?: {
          columns?: Array<{ name: string }>
          rows?: Array<unknown[] | Record<string, unknown>>
        }
      }
    }
  }>(`https://${store}/admin/api/${apiVersion}/graphql.json`, {
    method: 'POST',
    headers: {
      'X-Shopify-Access-Token': token,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ query: gql }),
  })

  if (!response.ok) {
    throw new Error(`${brand.slug} ShopifyQL failed (${response.status}): ${apiErrorMessage(response.data, response.raw)}`)
  }

  const payload = response.data
  const data = payload.data?.shopifyqlQuery
  if (!data || (Array.isArray(data.parseErrors) && data.parseErrors.length > 0)) {
    throw new Error(`${brand.slug} ShopifyQL parse failed: ${JSON.stringify(data?.parseErrors ?? null)}`)
  }

  const columns = data.tableData?.columns?.map((column) => column.name) ?? []
  return (data.tableData?.rows ?? []).map((values) => {
    if (Array.isArray(values)) {
      return Object.fromEntries(columns.map((column, index) => [column, values[index]]))
    }

    if (values && typeof values === 'object') {
      return values
    }

    return {}
  })
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
  const sessionRows = await shopifyql(
    brand,
    token,
    `FROM sessions SHOW sessions, conversion_rate GROUP BY day SINCE ${since} UNTIL ${until} ORDER BY day`,
  ).catch(() => [])
  const rows = new Map<string, ShopifyDay>()

  for (const item of salesRows) {
    const date = String(item.day ?? '').slice(0, 10)
    if (!date) continue
    const totalSales = toNumber(item.total_sales)
    const grossSales = toNumber(item.gross_sales)
    const netSales = toNumber(item.net_sales)
    const taxes = toNumber(item.taxes)
    const discounts = Math.abs(toNumber(item.discounts))
    const returns = Math.abs(toNumber(item.returns))
    const orders = toNumber(item.orders)
    const revenue = totalSales - taxes
    rows.set(date, {
      revenue,
      totalSales,
      grossSales,
      netSales,
      orders,
      aov: orders > 0 ? revenue / orders : 0,
      discounts,
      returns,
      taxes,
      shipping: totalSales - netSales - taxes,
      sessions: 0,
      cvr: 0,
    })
  }

  for (const item of sessionRows) {
    const date = String(item.day ?? '').slice(0, 10)
    if (!date) continue
    const current = rows.get(date) ?? {}
    rows.set(date, {
      ...current,
      sessions: toNumber(item.sessions),
      cvr: toNumber(item.conversion_rate),
    })
  }

  return rows
}

async function axonDaily(brand: BrandConfig, since: string, until: string) {
  const axon = brand.platforms?.axon
  if (!axon || axon.enabled === false) {
    return new Map<string, PlatformDay>()
  }
  if (!axon.report_key) {
    throw new Error(`${brand.slug} AppLovin config missing report_key`)
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
  const response = await fetchJson<{ results?: Array<Record<string, unknown>> }>(`https://r.applovin.com/report?${params}`)

  if (!response.ok) {
    throw new Error(`${brand.slug} AppLovin failed (${response.status}): ${apiErrorMessage(response.data, response.raw)}`)
  }

  return response.data
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
  const next = rows.get(date) ?? {}
  const nextSpend = toNumber(next.spend)
  const nextPurchases = toNumber(next.purchases)
  rows.set(date, {
    ...next,
    roas: nextSpend > 0 ? toNumber(next.revenue) / nextSpend : 0,
    cpa: nextPurchases > 0 ? nextSpend / nextPurchases : 0,
  })
}

async function googleToken() {
  const refreshToken = getServerEnv('GOOGLE_REFRESH_TOKEN')
  if (!refreshToken) return null

  const response = await fetchJson<{ access_token?: string }>('https://oauth2.googleapis.com/token', {
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
    throw new Error(`Google OAuth failed (${response.status}): ${apiErrorMessage(response.data, response.raw)}`)
  }

  const payload = response.data
  return payload.access_token ?? null
}

async function googleDaily(brand: BrandConfig, since: string, until: string) {
  const google = brand.platforms?.google_ads
  const developerToken = getServerEnv('GOOGLE_DEVELOPER_TOKEN')
  if (!google || google.enabled === false) {
    return new Map<string, PlatformDay>()
  }
  if (!google.customer_id) {
    throw new Error(`${brand.slug} Google Ads config missing customer_id`)
  }
  if (!developerToken) {
    throw new Error('Google Ads config missing GOOGLE_DEVELOPER_TOKEN')
  }

  const accessToken = await googleToken()
  if (!accessToken) {
    throw new Error('Google Ads config missing GOOGLE_REFRESH_TOKEN')
  }

  const customerId = google.customer_id.replace(/[^0-9]/g, '')
  const mcc = (getServerEnv('GOOGLE_MCC_ID') ?? '').replace(/[^0-9]/g, '')
  const response = await fetchJson<Array<{ results?: Array<Record<string, unknown>> }>>(`https://googleads.googleapis.com/v21/customers/${customerId}/googleAds:searchStream`, {
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
    throw new Error(`${brand.slug} Google Ads failed (${response.status}): ${apiErrorMessage(response.data, response.raw)}`)
  }

  const payload = response.data
  const rows = new Map<string, PlatformDay>()

  for (const batch of payload) {
    for (const item of batch.results ?? []) {
      const segments = item.segments as { date?: string } | undefined
      const metrics = item.metrics as { costMicros?: string; conversions?: string; conversionsValue?: string } | undefined
      const date = segments?.date
      if (!date) continue
      const current = rows.get(date) ?? {}
      const spend = toNumber(current.spend) + toNumber(metrics?.costMicros) / 1_000_000
      const revenue = toNumber(current.revenue) + toNumber(metrics?.conversionsValue)
      const purchases = toNumber(current.purchases) + toNumber(metrics?.conversions)
      rows.set(date, {
        spend,
        revenue,
        purchases,
        roas: spend > 0 ? revenue / spend : 0,
        cpa: purchases > 0 ? spend / purchases : 0,
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
    const metaRevenue = toNumber(meta.revenue)
    const metaPurchases = toNumber(meta.purchases)
    const axonSpend = toNumber(axon.spend)
    const axonRevenue = toNumber(axon.revenue)
    const axonPurchases = toNumber(axon.purchases)
    const googleSpend = toNumber(google.spend)
    const googleRevenue = toNumber(google.revenue)
    const googlePurchases = toNumber(google.purchases)
    const totalAdSpend = metaSpend + axonSpend + googleSpend
    const attributedRevenue = metaRevenue + axonRevenue + googleRevenue
    const cogs = revenue * (toNumber(brand.costs?.cogs_pct) / 100)
    const contributionAfterAds = revenue - cogs - totalAdSpend

    return {
      brand_slug: brand.slug,
      brand_name: brand.name,
      date,
      revenue,
      orders,
      meta_spend: metaSpend,
      meta_revenue: metaRevenue,
      meta_purchases: metaPurchases,
      meta_roas: toNumber(meta.roas) || (metaSpend > 0 ? metaRevenue / metaSpend : 0),
      meta_cpa: toNumber(meta.cpa) || (metaPurchases > 0 ? metaSpend / metaPurchases : 0),
      axon_spend: axonSpend,
      axon_revenue: axonRevenue,
      axon_purchases: axonPurchases,
      axon_roas: toNumber(axon.roas) || (axonSpend > 0 ? axonRevenue / axonSpend : 0),
      axon_cpa: toNumber(axon.cpa) || (axonPurchases > 0 ? axonSpend / axonPurchases : 0),
      google_spend: googleSpend,
      google_revenue: googleRevenue,
      google_purchases: googlePurchases,
      google_roas: toNumber(google.roas) || (googleSpend > 0 ? googleRevenue / googleSpend : 0),
      google_cpa: toNumber(google.cpa) || (googlePurchases > 0 ? googleSpend / googlePurchases : 0),
      total_ad_spend: totalAdSpend,
      platform_attributed_revenue: attributedRevenue,
      platform_roas: totalAdSpend > 0 ? attributedRevenue / totalAdSpend : 0,
      blended_roas: totalAdSpend > 0 ? revenue / totalAdSpend : 0,
      cpa: orders > 0 ? totalAdSpend / orders : 0,
      total_sales: toNumber(shopify.totalSales),
      gross_sales: toNumber(shopify.grossSales),
      net_sales: toNumber(shopify.netSales),
      aov: toNumber(shopify.aov) || (orders > 0 ? revenue / orders : 0),
      discounts: toNumber(shopify.discounts),
      refunds: toNumber(shopify.returns),
      taxes: toNumber(shopify.taxes),
      shipping: toNumber(shopify.shipping),
      sessions: toNumber(shopify.sessions),
      cvr: toNumber(shopify.cvr),
      cogs,
      contribution_after_ads: contributionAfterAds,
      net_profit: contributionAfterAds,
      last_sync: lastSync,
      updated_at: lastSync,
    }
  })
}

async function upsertRows(rows: Array<Record<string, unknown>>, auth: string, useServiceRole = false) {
  if (rows.length === 0) return

  const response = await supabaseRestFetch(
    'performance_brand_day?on_conflict=brand_slug,date',
    auth,
    {
      method: 'POST',
      headers: { Prefer: 'resolution=merge-duplicates' },
      body: JSON.stringify(rows),
    },
    useServiceRole,
  )

  if (!response.ok) {
    throw new Error(`Supabase upsert failed: ${await response.text()}`)
  }
}

async function syncPerformance(from: string, to: string, auth: string, useServiceRole = false) {
  const brands = loadBrandConfigs()
  const errors: string[] = []
  let rowsWritten = 0

  for (const brand of brands) {
    const [meta, shopify, axon, google] = await Promise.all([
      metaDaily(brand, from, to).catch((error) => {
        errors.push(`${brand.slug} meta: ${error instanceof Error ? error.message : 'unknown error'}`)
        return new Map<string, PlatformDay>()
      }),
      shopifyDaily(brand, from, to).catch((error) => {
        errors.push(`${brand.slug} shopify: ${error instanceof Error ? error.message : 'unknown error'}`)
        return new Map<string, ShopifyDay>()
      }),
      axonDaily(brand, from, to).catch((error) => {
        errors.push(`${brand.slug} axon: ${error instanceof Error ? error.message : 'unknown error'}`)
        return new Map<string, PlatformDay>()
      }),
      googleDaily(brand, from, to).catch((error) => {
        errors.push(`${brand.slug} google: ${error instanceof Error ? error.message : 'unknown error'}`)
        return new Map<string, PlatformDay>()
      }),
    ])
    const rows = buildRows(brand, { meta, shopify, axon, google })

    try {
      await upsertRows(rows, auth, useServiceRole)
      rowsWritten += rows.length
    } catch (error) {
      errors.push(`${brand.slug} supabase: ${error instanceof Error ? error.message : 'unknown error'}`)
    }
  }

  return { rowsWritten, errors }
}

export default async function handler(req: HandlerRequest, res?: HandlerResponse): Promise<Response | undefined> {
  try {
    const access = await requireAllowedUser(req)
    if (!access.ok) {
      return sendJson(res, { error: access.error, rows: [] }, access.status)
    }

    const { from, to } = getRequestRange(req)
    const method = getMethod(req)

    if (method === 'POST') {
      const sync = await syncPerformance(from, to, access.auth, Boolean(getSupabaseServiceKey()))
      const rows = await readRows(from, to, access.auth, Boolean(getSupabaseServiceKey()))
      return sendJson(res, { rows, generatedAt: new Date().toISOString(), source: 'supabase', sync })
    }

    if (method === 'GET') {
      const rows = await readRows(from, to, access.auth, Boolean(getSupabaseServiceKey()))
      return sendJson(res, { rows, generatedAt: new Date().toISOString(), source: 'supabase' })
    }

    return sendJson(res, { error: 'Method not allowed', rows: [] }, 405)
  } catch (error) {
    console.error('bluebrands performance api failed', error)
    return sendJson(res, {
      error: error instanceof Error ? error.message : 'Performance API failed',
      rows: [],
      generatedAt: new Date().toISOString(),
    }, 500)
  }
}
