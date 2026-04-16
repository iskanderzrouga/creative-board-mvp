import { getSupabaseClient } from './supabase'

export const FINANCE_CATEGORIES = [
  'unclassified',
  'subscription',
  'salary',
  'one_time',
  'revenue',
  'refund',
  'ad_spend',
  'cogs',
] as const

export type FinanceCategory = (typeof FINANCE_CATEGORIES)[number]
export type FinanceDirection = 'in' | 'out'
export type SubscriptionFrequency = 'weekly' | 'monthly' | 'yearly'
export const SUBSCRIPTION_BRANDS = [
  'Unassigned',
  'Blue Brands',
  'BrandLab',
  'Pluxy',
  'TrueClean',
  'Thaura',
  'ViVi',
  'Zura',
] as const
export const SUBSCRIPTION_STATUSES = [
  { value: 'active', label: 'Active', color: '#10B981' },
  { value: 'inactive', label: 'Inactive', color: '#F59E0B' },
  { value: 'cancelled', label: 'Cancelled', color: '#EF4444' },
] as const
export type SubscriptionBrand = (typeof SUBSCRIPTION_BRANDS)[number]
export type SubscriptionStatus = (typeof SUBSCRIPTION_STATUSES)[number]['value']

export interface FinanceTransaction {
  id: string
  slash_id: string | null
  description: string
  amount: number
  direction: FinanceDirection
  date: string
  category: FinanceCategory
  source: 'slash' | 'manual'
  status: string | null
  created_at: string
}

export interface FinanceSubscription {
  id: string
  name: string
  amount: number
  frequency: SubscriptionFrequency
  platform: string
  active: boolean
  brand: SubscriptionBrand
  status: SubscriptionStatus
  created_at: string
}

export interface FinanceSubscriptionMeta {
  id: string
  description_key: string
  brand: SubscriptionBrand
  status: SubscriptionStatus
  updated_at: string
  created_at: string
}

export interface FinancePattern {
  id: string
  pattern: string
  category: FinanceCategory
  created_at: string
}

export interface FinanceAccount {
  id: string
  name: string
  availableBalance: number
  postedBalance: number
}

interface SlashTransactionRaw {
  id?: string
  amountCents?: number | string
  description?: string
  merchantName?: string
  merchant?: { name?: string }
  memo?: string
  postedAt?: string
  createdAt?: string
  date?: string
  status?: string
}

interface SlashAccountRaw {
  id?: string
  name?: string
  availableBalance?: { amountCents?: number }
  postedBalance?: { amountCents?: number }
}

interface SyncResponsePayload {
  transactions?: unknown
  accounts?: unknown
  error?: string
}

export interface FinanceSyncSummary {
  imported: number
  duplicates: number
  needReview: number
  accounts: FinanceAccount[]
}

export interface FinanceDataBundle {
  transactions: FinanceTransaction[]
  subscriptions: FinanceSubscription[]
  patterns: FinancePattern[]
  subscriptionMeta: Record<string, Pick<FinanceSubscriptionMeta, 'brand' | 'status'>>
}

function getRequiredSupabase() {
  const supabase = getSupabaseClient()
  if (!supabase) {
    throw new Error('supabase-not-configured')
  }
  return supabase
}

function normalizeEnvelopeArray<T>(value: unknown, nestedKey?: string): T[] {
  if (Array.isArray(value)) {
    return value as T[]
  }

  if (!value || typeof value !== 'object') {
    return []
  }

  const record = value as Record<string, unknown>
  if (Array.isArray(record.data)) {
    return record.data as T[]
  }

  if (nestedKey && Array.isArray(record[nestedKey])) {
    return record[nestedKey] as T[]
  }

  return []
}

function toIsoDate(input?: string) {
  if (!input) {
    return new Date().toISOString().slice(0, 10)
  }

  const parsed = new Date(input)
  if (Number.isNaN(parsed.getTime())) {
    return new Date().toISOString().slice(0, 10)
  }

  return parsed.toISOString().slice(0, 10)
}

function normalizeDescription(item: SlashTransactionRaw) {
  return (
    item.description?.trim() ||
    item.merchantName?.trim() ||
    item.merchant?.name?.trim() ||
    item.memo?.trim() ||
    'Unknown'
  )
}

function safeWords(value: string) {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, ' ')
    .split(/\s+/)
    .filter(Boolean)
}

function buildPattern(description: string) {
  const words = safeWords(description)
  return words.slice(0, 3).join(' ')
}

function matchesPattern(description: string, pattern: string) {
  if (!pattern.trim()) {
    return false
  }

  return description.toLowerCase().includes(pattern.toLowerCase())
}

function frequencyToMonthly(amount: number, frequency: SubscriptionFrequency) {
  if (frequency === 'weekly') {
    return amount * 52 / 12
  }
  if (frequency === 'yearly') {
    return amount / 12
  }
  return amount
}

export function getSubscriptionMonthlyBurn(subscriptions: FinanceSubscription[]) {
  return subscriptions
    .filter((subscription) => subscription.active)
    .reduce((total, subscription) => total + frequencyToMonthly(subscription.amount, subscription.frequency), 0)
}

export async function loadFinanceData(): Promise<FinanceDataBundle> {
  const supabase = getSupabaseClient()
  if (!supabase) {
    return { transactions: [], subscriptions: [], patterns: [], subscriptionMeta: {} }
  }

  const [transactionsResult, subscriptionsResult, patternsResult, subscriptionMeta] = await Promise.all([
    supabase.from('finance_transactions').select('*').order('date', { ascending: false }),
    supabase.from('finance_subscriptions').select('*').order('created_at', { ascending: false }),
    supabase.from('finance_patterns').select('*').order('created_at', { ascending: false }),
    loadSubscriptionMeta(),
  ])

  if (transactionsResult.error) {
    throw transactionsResult.error
  }
  if (subscriptionsResult.error) {
    throw subscriptionsResult.error
  }
  if (patternsResult.error) {
    throw patternsResult.error
  }

  console.log('[finance] first tx amount:', transactionsResult.data?.[0]?.amount)

  return {
    transactions: (transactionsResult.data ?? []) as FinanceTransaction[],
    subscriptions: (subscriptionsResult.data ?? []) as FinanceSubscription[],
    patterns: (patternsResult.data ?? []) as FinancePattern[],
    subscriptionMeta,
  }
}

function normalizeDescriptionKey(descriptionKey: string) {
  return descriptionKey.trim().toLowerCase()
}

export async function loadSubscriptionMeta() {
  const supabase = getSupabaseClient()
  if (!supabase) {
    return {} as Record<string, Pick<FinanceSubscriptionMeta, 'brand' | 'status'>>
  }

  const result = await supabase
    .from('finance_subscription_meta')
    .select('description_key, brand, status')

  if (result.error) {
    throw result.error
  }

  return (result.data ?? []).reduce<Record<string, Pick<FinanceSubscriptionMeta, 'brand' | 'status'>>>((acc, row) => {
    const key = normalizeDescriptionKey(row.description_key)
    acc[key] = {
      brand: (row.brand ?? 'Unassigned') as SubscriptionBrand,
      status: (row.status ?? 'active') as SubscriptionStatus,
    }
    return acc
  }, {})
}

export async function upsertSubscriptionMeta(
  descriptionKey: string,
  updates: { brand?: SubscriptionBrand; status?: SubscriptionStatus },
) {
  const supabase = getRequiredSupabase()
  const payload = {
    description_key: normalizeDescriptionKey(descriptionKey),
    ...(updates.brand ? { brand: updates.brand } : {}),
    ...(updates.status ? { status: updates.status } : {}),
    updated_at: new Date().toISOString(),
  }

  const { error } = await supabase
    .from('finance_subscription_meta')
    .upsert(payload, { onConflict: 'description_key' })

  if (error) {
    throw error
  }
}

export async function deleteFinanceTransaction(id: string) {
  const supabase = getSupabaseClient()
  if (!supabase) {
    return
  }

  const { error } = await supabase.from('finance_transactions').delete().eq('id', id)
  if (error) {
    throw error
  }
}

export async function syncFinanceFromSlash(dateFrom?: number): Promise<FinanceSyncSummary> {
  const supabase = getRequiredSupabase()

  const response = await fetch('/api/finance/sync', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ dateFrom }),
  })

  const payload = await response.json() as SyncResponsePayload
  if (!response.ok) {
    throw new Error(payload.error || 'Finance sync failed')
  }

  const rawTransactions = normalizeEnvelopeArray<SlashTransactionRaw>(
    payload.transactions,
    'transactions',
  )
  const rawAccounts = normalizeEnvelopeArray<SlashAccountRaw>(payload.accounts, 'accounts')

  const existing = await supabase
    .from('finance_transactions')
    .select('id, slash_id, description, amount, date, category')

  if (existing.error) {
    throw existing.error
  }

  const patternsResult = await supabase
    .from('finance_patterns')
    .select('pattern, category')
    .order('created_at', { ascending: false })

  if (patternsResult.error) {
    throw patternsResult.error
  }

  const existingBySlashId = new Set(
    (existing.data ?? [])
      .map((transaction) => transaction.slash_id)
      .filter((value): value is string => Boolean(value)),
  )
  const existingComposite = new Set(
    (existing.data ?? []).map(
      (transaction) => `${transaction.date}|${transaction.description.toLowerCase()}|${Number(transaction.amount).toFixed(2)}`,
    ),
  )

  const patterns = (patternsResult.data ?? []) as Array<{ pattern: string; category: FinanceCategory }>
  const inserts: Array<Record<string, unknown>> = []
  let duplicates = 0

  for (const item of rawTransactions) {
    const slashId = item.id?.trim() || null
    // Slash uses amountCents — negative = debit (out), positive = credit (in)
    const amountCentsRaw = item.amountCents ?? 0
    const amountCents = typeof amountCentsRaw === 'number' ? amountCentsRaw : parseFloat(amountCentsRaw) || 0
    const description = normalizeDescription(item)
    const date = toIsoDate(item.postedAt || item.date || item.createdAt)
    const amount = Math.abs(amountCents ?? 0) / 100
    const direction: FinanceDirection = (amountCents ?? 0) < 0 ? 'out' : 'in'
    const compositeKey = `${date}|${description.toLowerCase()}|${amount.toFixed(2)}`

    if ((slashId && existingBySlashId.has(slashId)) || existingComposite.has(compositeKey)) {
      duplicates += 1
      continue
    }

    const matchedPattern = patterns.find((patternItem) => matchesPattern(description, patternItem.pattern))

    inserts.push({
      slash_id: slashId,
      description,
      amount,
      direction,
      date,
      category: matchedPattern?.category ?? 'unclassified',
      source: 'slash',
      status: item.status || 'posted',
    })

    if (slashId) {
      existingBySlashId.add(slashId)
    }
    existingComposite.add(compositeKey)
  }

  if (inserts.length > 0) {
    const { error } = await supabase.from('finance_transactions').insert(inserts)
    if (error) {
      throw error
    }
  }

  const unclassifiedResult = await supabase
    .from('finance_transactions')
    .select('id', { count: 'exact', head: true })
    .eq('category', 'unclassified')

  if (unclassifiedResult.error) {
    throw unclassifiedResult.error
  }

  const accounts = rawAccounts.map((account, index) => ({
    id: account.id || `account-${index + 1}`,
    name: account.name?.trim() || 'Account',
    availableBalance: Math.abs((account.availableBalance?.amountCents ?? 0) / 100),
    postedBalance: Math.abs((account.postedBalance?.amountCents ?? 0) / 100),
  }))

  return {
    imported: inserts.length,
    duplicates,
    needReview: unclassifiedResult.count ?? 0,
    accounts,
  }
}

export async function classifyTransaction(transactionId: string, category: FinanceCategory) {
  const supabase = getRequiredSupabase()

  const targetResult = await supabase
    .from('finance_transactions')
    .select('id, description')
    .eq('id', transactionId)
    .maybeSingle()

  if (targetResult.error) {
    throw targetResult.error
  }

  if (!targetResult.data) {
    return { updated: 0, pattern: '' }
  }

  const pattern = buildPattern(targetResult.data.description)

  const updateTarget = await supabase
    .from('finance_transactions')
    .update({ category })
    .eq('id', transactionId)

  if (updateTarget.error) {
    throw updateTarget.error
  }

  if (pattern) {
    const patternUpsert = await supabase
      .from('finance_patterns')
      .upsert({ pattern, category }, { onConflict: 'pattern' })

    if (patternUpsert.error) {
      throw patternUpsert.error
    }

    const relatedRows = await supabase
      .from('finance_transactions')
      .select('id, description')
      .eq('category', 'unclassified')

    if (relatedRows.error) {
      throw relatedRows.error
    }

    const matchingIds = (relatedRows.data ?? [])
      .filter((row) => matchesPattern(row.description, pattern))
      .map((row) => row.id)

    if (matchingIds.length > 0) {
      const applyMatches = await supabase
        .from('finance_transactions')
        .update({ category })
        .in('id', matchingIds)

      if (applyMatches.error) {
        throw applyMatches.error
      }
    }

    return { updated: matchingIds.length + 1, pattern }
  }

  return { updated: 1, pattern: '' }
}

export async function createSubscription(input: {
  name: string
  amount: number
  frequency: SubscriptionFrequency
  platform: string
  brand: SubscriptionBrand
  status: SubscriptionStatus
}) {
  const supabase = getRequiredSupabase()

  const { error } = await supabase.from('finance_subscriptions').insert({
    name: input.name.trim(),
    amount: input.amount,
    frequency: input.frequency,
    platform: input.platform.trim(),
    active: input.status !== 'cancelled',
    brand: input.brand,
    status: input.status,
  })

  if (error) {
    throw error
  }
}

export async function updateSubscription(
  id: string,
  updates: Partial<Pick<FinanceSubscription, 'name' | 'amount' | 'frequency' | 'platform' | 'active' | 'brand' | 'status'>>,
) {
  const supabase = getRequiredSupabase()

  const { error } = await supabase.from('finance_subscriptions').update(updates).eq('id', id)
  if (error) {
    throw error
  }
}

export async function deleteSubscription(id: string) {
  const supabase = getRequiredSupabase()

  const { error } = await supabase.from('finance_subscriptions').delete().eq('id', id)
  if (error) {
    throw error
  }
}
