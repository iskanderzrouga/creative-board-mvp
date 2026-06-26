// Per-product P&L for brands whose Meta campaign names + Shopify SKUs encode the
// product (currently TrueClean). This endpoint is INTENTIONALLY isolated from
// api/finance/bluebrands-performance.ts (the scheduled brand-day sync) so a bug
// here can never corrupt the cached brand-level numbers. It computes live from
// Meta (campaign level) + Shopify (order line items) on request.
//
// The cost model below is the one reconciled with the user + the May carrier
// invoice (2026-06-26): CaptureCards $0.45/card, box-count shipping; Swoosh 'N
// Shine kit costs + rate-card shipping; 10-yr refill 40 cartridges (~$26) + ~$90
// heavy shipping; 3.39% effective Shopify Payments fee; 5% / 3% refund reserve.
// When the main engine gains product-scoped shipping these should be unified.

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

interface PlatformConfig {
  enabled?: boolean
  access_token?: string
  ad_account_id?: string
  store?: string
  client_id?: string
  client_secret?: string
}
interface BrandConfig {
  slug: string
  name: string
  enabled?: boolean
  timezone?: string
  platforms?: { meta?: PlatformConfig; shopify?: PlatformConfig }
}

interface ProductPL {
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

const DEFAULT_ALLOWED_EMAILS = ['iskander@bluebrands.co', 'nicolas@bluebrands.co', 'naomi@bluebrands.co']
const PAYMENT_FEE_RATE = 0.0339 // effective, from payouts export
const CARD_COST = 0.45
const REFILL_40_SHIPPING = 88 // heavy 10-yr refill (40 cartridges, ~6.5kg)
const SNS_REFUND_RESERVE = 0.05
const CC_REFUND_RESERVE = 0.03

const PRODUCTS: Record<string, { name: string; color: string; reserve: number }> = {
  sns: { name: 'Swoosh N Shine', color: '#059669', reserve: SNS_REFUND_RESERVE },
  cc: { name: 'CaptureCards', color: '#2563eb', reserve: CC_REFUND_RESERVE },
}

const SNS_US_KIT_SHIPPING: Record<number, number> = { 1: 12.3, 2: 17.8, 3: 25.0, 4: 32.4 }
const CC_BOX_SHIPPING: Record<number, number> = { 1: 6.04, 2: 7.5, 3: 9.0, 4: 10.9, 5: 12.8, 6: 14.4, 7: 16.2, 8: 16.8, 9: 18.6 }

function jsonResponse(payload: unknown, status = 200) {
  return new Response(JSON.stringify(payload), { status, headers: { 'Content-Type': 'application/json' } })
}
function sendJson(res: HandlerResponse | undefined, payload: unknown, status = 200) {
  if (!res) return jsonResponse(payload, status)
  res.setHeader?.('Content-Type', 'application/json')
  if (typeof res.status === 'function' && typeof res.json === 'function') {
    res.status(status)
    res.json(payload)
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
  if (isFetchRequest(req)) return req.headers.get(name)
  const value = req.headers?.[name.toLowerCase()] ?? req.headers?.[name]
  return Array.isArray(value) ? value[0] ?? null : value ?? null
}
function getRequestUrl(req: HandlerRequest) {
  return new URL(req.url || '/', 'https://editors-board.local')
}
function getServerEnv(name: string) {
  return process.env[name]
}
function getSupabaseUrl() {
  return process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL
}
function getSupabaseAnonKey() {
  return process.env.SUPABASE_ANON_KEY || process.env.VITE_SUPABASE_ANON_KEY || process.env.VITE_SUPABASE_PUBLISHABLE_KEY
}
function getAllowedEmails() {
  const configured = getServerEnv('PERFORMANCE_ALLOWED_EMAILS') || getServerEnv('FINANCE_ALLOWED_EMAILS')
  const values = configured
    ? configured.split(',').map((email) => email.trim().toLowerCase()).filter(Boolean)
    : DEFAULT_ALLOWED_EMAILS
  return new Set(values)
}
async function requireAllowedUser(req: HandlerRequest) {
  const supabaseUrl = getSupabaseUrl()
  const anonKey = getSupabaseAnonKey()
  const auth = getHeader(req, 'authorization')
  if (!supabaseUrl || !anonKey || !auth) {
    return { ok: false as const, status: 401, error: 'performance_auth_required' }
  }
  const response = await fetch(`${supabaseUrl}/auth/v1/user`, { headers: { apikey: anonKey, Authorization: auth } })
  if (!response.ok) return { ok: false as const, status: 401, error: 'performance_auth_invalid' }
  const user = (await response.json()) as { email?: string }
  const email = user.email?.trim().toLowerCase() ?? ''
  if (!email || !getAllowedEmails().has(email)) return { ok: false as const, status: 403, error: 'performance_access_denied' }
  return { ok: true as const, email }
}

function loadBrandConfig(slug: string): BrandConfig | null {
  const raw = getServerEnv('BLUEBRANDS_PERFORMANCE_CONFIG_JSON')
  if (!raw) throw new Error('BLUEBRANDS_PERFORMANCE_CONFIG_JSON not configured')
  const parsed = JSON.parse(raw) as BrandConfig[] | Record<string, BrandConfig>
  const configs = Array.isArray(parsed) ? parsed : Object.values(parsed)
  return configs.find((brand) => brand.slug === slug && brand.enabled !== false) ?? null
}

function toNumber(value: unknown) {
  const n = Number(value ?? 0)
  return Number.isFinite(n) ? n : 0
}

async function fetchJson<T>(url: string, init: RequestInit = {}): Promise<{ ok: boolean; status: number; data: T; raw: string }> {
  const response = await fetch(url, init)
  const raw = await response.text()
  let data: unknown = {}
  try {
    data = raw.trim() ? JSON.parse(raw) : {}
  } catch {
    data = {}
  }
  return { ok: response.ok, status: response.status, data: data as T, raw }
}

function getRange(req: HandlerRequest) {
  const url = getRequestUrl(req)
  const today = new Date()
  const to = url.searchParams.get('to') || today.toISOString().slice(0, 10)
  const days = Math.max(1, Math.min(120, Number(url.searchParams.get('days') || 30)))
  const fromDate = new Date(`${to}T00:00:00Z`)
  fromDate.setUTCDate(fromDate.getUTCDate() - (days - 1))
  const from = url.searchParams.get('from') || fromDate.toISOString().slice(0, 10)
  return { from, to }
}

function formatDateInTimezone(date: Date, timezone: string) {
  const parts = new Intl.DateTimeFormat('en-US', { timeZone: timezone, year: 'numeric', month: '2-digit', day: '2-digit' }).formatToParts(date)
  const year = parts.find((p) => p.type === 'year')?.value ?? '1970'
  const month = parts.find((p) => p.type === 'month')?.value ?? '01'
  const day = parts.find((p) => p.type === 'day')?.value ?? '01'
  return `${year}-${month}-${day}`
}
function addIsoDays(value: string, days: number) {
  const date = new Date(`${value}T00:00:00Z`)
  date.setUTCDate(date.getUTCDate() + days)
  return date.toISOString().slice(0, 10)
}

// ── Product cost model ──────────────────────────────────────────────────────
function productForSku(sku: string): 'sns' | 'cc' | null {
  const s = sku.toUpperCase()
  if (s.startsWith('CC-DM')) return 'cc'
  if (/^TC-(U-SNS|SNS|RF|TABS)/.test(s)) return 'sns'
  return null
}
function productForCampaign(name: string): 'sns' | 'cc' | null {
  const n = name.toUpperCase()
  if (n.startsWith('CC')) return 'cc'
  if (n.includes('WASHER')) return null
  return 'sns'
}
function kitMultiplier(sku: string) {
  const s = sku.toUpperCase()
  const modern = s.match(/SNS-0?([1-9])(?:-|$)/)
  if (modern) return Number(modern[1])
  const legacy = s.match(/TC-SNS-[A-Z]+-([1-9])$/)
  if (legacy) return Number(legacy[1])
  return 1
}
function cardsInSku(sku: string) {
  const m = sku.toUpperCase().match(/^CC-DM-(?:AOV-)?(\d+)C$/)
  return m ? Number(m[1]) : 0
}
function lineCogs(sku: string, quantity: number, date: string) {
  const s = sku.toUpperCase()
  if (s === 'TC-RF-40') return quantity * 0.65 * 40
  if (s.startsWith('TC-RF-3')) return quantity * 0.65 * 3
  if (s.startsWith('TC-RF-4')) return quantity * 0.65 * 4
  const cards = cardsInSku(s)
  if (cards) return quantity * CARD_COST * cards
  if (s.startsWith('TC-TABS')) return 0
  if (/^TC-U-SNS-0[1-4]-N$/.test(s)) return quantity * kitMultiplier(s) * (2.5 + 0.65 * 2)
  if (/^TC-U-SNS-0[1-4]$/.test(s) || /^TC-SNS-[A-Z]+-[1-4]$/.test(s)) {
    const cartridge = date <= '2026-05-02' ? 1.0 : 0.65
    return quantity * kitMultiplier(s) * (2.5 + cartridge * 4)
  }
  return 0
}
function snsKitShipping(country: string, province: string, kits: number) {
  if (kits <= 0) return 0
  if (country === 'US' && province !== 'AK' && province !== 'HI') {
    return SNS_US_KIT_SHIPPING[kits] ?? 32.4 + (kits - 4) * 6.5
  }
  if (country === 'US') return kits === 2 ? 31.4 : 0
  if (country === 'CA') return ({ 2: 17.7, 4: 32.8 } as Record<number, number>)[kits] ?? 0
  return 0
}
function ccBoxShipping(boxes: number) {
  if (boxes <= 0) return 0
  return CC_BOX_SHIPPING[boxes] ?? 18.6 + (boxes - 9) * 2
}

interface ShopLineItem { sku?: string | null; quantity?: number | string | null; discountedTotalSet?: { shopMoney?: { amount?: string | null } | null } | null }
interface ShopOrder {
  createdAt?: string | null
  cancelledAt?: string | null
  displayFulfillmentStatus?: string | null
  shippingAddress?: { countryCodeV2?: string | null; provinceCode?: string | null } | null
  lineItems?: { edges?: Array<{ node?: ShopLineItem | null }> } | null
}
interface ShopOrdersPayload { orders?: { pageInfo?: { hasNextPage?: boolean; endCursor?: string | null }; edges?: Array<{ node?: ShopOrder | null }> } }

async function shopifyToken(shopify: PlatformConfig) {
  const body = new URLSearchParams({ grant_type: 'client_credentials', client_id: shopify.client_id ?? '', client_secret: shopify.client_secret ?? '' })
  const response = await fetchJson<{ access_token?: string }>(`https://${shopify.store}/admin/oauth/access_token`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body,
  })
  if (!response.ok || !response.data.access_token) throw new Error(`Shopify token failed (${response.status})`)
  return response.data.access_token
}

async function shopifyByProduct(brand: BrandConfig, from: string, to: string, acc: Record<string, ProductPL>) {
  const shopify = brand.platforms?.shopify
  if (!shopify?.store || !shopify.client_id || !shopify.client_secret) throw new Error('Shopify config missing')
  const token = await shopifyToken(shopify)
  const timezone = brand.timezone || 'America/New_York'
  const store = shopify.store
  const apiVersion = getServerEnv('SHOPIFY_API_VERSION') || 'unstable'
  const query = `query($cursor:String,$q:String!){orders(first:100,after:$cursor,query:$q,sortKey:CREATED_AT){pageInfo{hasNextPage endCursor} edges{node{createdAt cancelledAt displayFulfillmentStatus shippingAddress{countryCodeV2 provinceCode} lineItems(first:50){edges{node{sku quantity discountedTotalSet{shopMoney{amount}}}}}}}}}`
  const orderQuery = `created_at:>=${from} created_at:<${addIsoDays(to, 1)}`
  let cursor: string | null = null
  let page = 0
  while (page < 40) {
    page += 1
    const response = await fetchJson<{ data?: ShopOrdersPayload; errors?: Array<{ message?: string }> }>(`https://${store}/admin/api/${apiVersion}/graphql.json`, {
      method: 'POST',
      headers: { 'X-Shopify-Access-Token': token, 'Content-Type': 'application/json' },
      body: JSON.stringify({ query, variables: { cursor, q: orderQuery } }),
    })
    if (!response.ok || response.data.errors?.length) throw new Error(`Shopify orders failed: ${response.data.errors?.[0]?.message ?? response.status}`)
    const orders = response.data.data?.orders
    for (const edge of orders?.edges ?? []) {
      const order = edge.node
      if (!order?.createdAt) continue
      const fulfillment = (order.displayFulfillmentStatus ?? '').toUpperCase()
      if (order.cancelledAt && !fulfillment.includes('FULFILLED')) continue
      const date = formatDateInTimezone(new Date(order.createdAt), timezone)
      if (date < from || date > to) continue
      const country = (order.shippingAddress?.countryCodeV2 ?? '').toUpperCase()
      const province = (order.shippingAddress?.provinceCode ?? '').toUpperCase()
      let snsKits = 0
      let ccCards = 0
      const present: Record<string, boolean> = {}
      for (const lineEdge of order.lineItems?.edges ?? []) {
        const line = lineEdge.node
        const sku = (line?.sku ?? '').trim()
        const quantity = toNumber(line?.quantity)
        if (!sku || quantity <= 0) continue
        const product = productForSku(sku)
        if (!product) continue
        present[product] = true
        const revenue = toNumber(line?.discountedTotalSet?.shopMoney?.amount)
        const bucket = acc[product]
        bucket.revenue += revenue
        bucket.units += quantity
        bucket.productCogs += lineCogs(sku, quantity, date)
        const upper = sku.toUpperCase()
        if (product === 'sns' && /^TC-(U-)?SNS/.test(upper)) snsKits += kitMultiplier(upper) * quantity
        if (upper === 'TC-RF-40') bucket.shippingCost += REFILL_40_SHIPPING * quantity
        if (product === 'cc') ccCards += cardsInSku(upper) * quantity
      }
      if (present.sns) acc.sns.orders += 1
      if (present.cc) acc.cc.orders += 1
      if (snsKits > 0) acc.sns.shippingCost += snsKitShipping(country, province, snsKits)
      if (ccCards > 0) acc.cc.shippingCost += ccBoxShipping(Math.round(ccCards / 4))
    }
    if (!orders?.pageInfo?.hasNextPage || !orders.pageInfo.endCursor) break
    cursor = orders.pageInfo.endCursor
  }
}

async function metaByProduct(brand: BrandConfig, from: string, to: string, acc: Record<string, ProductPL>) {
  const meta = brand.platforms?.meta
  if (!meta?.access_token || !meta.ad_account_id) return
  const apiVersion = getServerEnv('META_API_VERSION') || 'v22.0'
  const params = new URLSearchParams({
    fields: 'campaign_name,spend',
    time_range: JSON.stringify({ since: from, until: to }),
    level: 'campaign',
    limit: '500',
    access_token: meta.access_token,
  })
  let url: string | null = `https://graph.facebook.com/${apiVersion}/${meta.ad_account_id}/insights?${params}`
  while (url) {
    const response = await fetchJson<{ data?: Array<{ campaign_name?: string; spend?: string }>; paging?: { next?: string } }>(url)
    if (!response.ok) throw new Error(`Meta insights failed (${response.status})`)
    for (const row of response.data.data ?? []) {
      const product = productForCampaign(row.campaign_name ?? '')
      if (!product) continue
      acc[product].adSpend += toNumber(row.spend)
    }
    url = response.data.paging?.next ?? null
  }
}

function emptyProduct(key: string): ProductPL {
  return {
    key,
    name: PRODUCTS[key].name,
    color: PRODUCTS[key].color,
    revenue: 0,
    units: 0,
    orders: 0,
    productCogs: 0,
    shippingCost: 0,
    paymentFees: 0,
    refundReserve: 0,
    contribution: 0,
    adSpend: 0,
    netProfit: 0,
    roas: 0,
    breakevenRoas: 0,
    contributionMargin: 0,
    netMargin: 0,
  }
}

function finalize(product: ProductPL) {
  product.paymentFees = product.revenue * PAYMENT_FEE_RATE
  product.refundReserve = product.revenue * PRODUCTS[product.key].reserve
  product.contribution = product.revenue - product.productCogs - product.shippingCost - product.paymentFees - product.refundReserve
  product.netProfit = product.contribution - product.adSpend
  product.roas = product.adSpend > 0 ? product.revenue / product.adSpend : 0
  product.breakevenRoas = product.contribution > 0 ? product.revenue / product.contribution : 0
  product.contributionMargin = product.revenue > 0 ? product.contribution / product.revenue : 0
  product.netMargin = product.revenue > 0 ? product.netProfit / product.revenue : 0
  return product
}

export default async function handler(req: HandlerRequest, res?: HandlerResponse): Promise<Response | undefined> {
  try {
    const access = await requireAllowedUser(req)
    if (!access.ok) return sendJson(res, { error: access.error, products: [] }, access.status)

    const url = getRequestUrl(req)
    const brandSlug = (url.searchParams.get('brand') || 'trueclean').toLowerCase()
    if (brandSlug !== 'trueclean') {
      return sendJson(res, { products: [], unsupported: true, error: 'Per-product breakdown is only configured for TrueClean.' })
    }

    const brand = loadBrandConfig(brandSlug)
    if (!brand) return sendJson(res, { products: [], error: `Brand ${brandSlug} not configured` }, 404)

    const { from, to } = getRange(req)
    const acc: Record<string, ProductPL> = { sns: emptyProduct('sns'), cc: emptyProduct('cc') }

    await Promise.all([
      shopifyByProduct(brand, from, to, acc),
      metaByProduct(brand, from, to, acc),
    ])

    const products = Object.values(acc).map(finalize).sort((a, b) => b.adSpend - a.adSpend)
    return sendJson(res, {
      brandSlug,
      from,
      to,
      generatedAt: new Date().toISOString(),
      products,
      assumptions: { paymentFeeRate: PAYMENT_FEE_RATE, refundReserve: { sns: SNS_REFUND_RESERVE, cc: CC_REFUND_RESERVE } },
    })
  } catch (error) {
    return sendJson(res, { error: error instanceof Error ? error.message : 'Product P&L failed', products: [] }, 500)
  }
}
