import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import {
  CAT,
  FINANCE_CATEGORY_COLORS,
  FINANCE_CATEGORY_LABELS,
  SUBSCRIPTION_BRANDS,
  SUBSCRIPTION_STATUSES,
  autoClassifyWithSeedRules,
  classifyTransaction,
  createSubscription,
  deleteFinanceTransaction,
  loadFinanceData,
  syncFinanceFromSlash,
  updateSubscription,
  upsertSubscriptionMeta,
  type FinanceAccount,
  type FinanceCategory,
  type FinancePattern,
  type FinanceSubscription,
  type FinanceTransaction,
  type SubscriptionBrand,
  type SubscriptionFrequency,
  type SubscriptionStatus,
} from '../finance'

type FinanceTab = 'dashboard' | 'ledger' | 'subscriptions' | 'triage' | 'search'

const TRIAGE_OPTIONS: Array<{ c: FinanceCategory; i: string; l: string }> = [
  { c: CAT.SUBSCRIPTION, i: '🔄', l: 'Subscription (recurring tool/service)' },
  { c: CAT.SALARY, i: '👤', l: 'Salary / Payroll' },
  { c: CAT.AD_SPEND, i: '📢', l: 'Ad Spend (Meta, Google, etc.)' },
  { c: CAT.ONE_TIME, i: '📌', l: 'One-Time Expense' },
  { c: CAT.COGS, i: '📦', l: 'COGS / Product Cost' },
  { c: CAT.REVENUE, i: '💰', l: 'Revenue' },
  { c: CAT.REFUND, i: '↩️', l: 'Refund' },
  { c: CAT.TAXES, i: '🏛️', l: 'Taxes (state, federal, sales tax)' },
  { c: CAT.AFFILIATE, i: '🤝', l: 'Affiliate payout' },
  { c: CAT.HR, i: '👔', l: 'HR (recruiting, benefits)' },
  { c: CAT.INTERNAL_TRANSFER, i: '🔄', l: 'Internal Transfer (between accounts)' },
]

interface FinancePageProps {
  headerUtilityContent?: ReactNode
}

const moneyStyle = {
  fontFamily: "'JetBrains Mono', monospace",
}

const cardBase = {
  background: '#12151B',
  border: '1px solid #1C2130',
  borderRadius: 8,
}

const labelMuted = {
  color: '#5E6E85',
}

const inputStyle = {
  background: '#0B0D11',
  border: '1px solid #1C2130',
  color: '#E2E8F2',
  borderRadius: 6,
  padding: '8px 10px',
}
const subscriptionSelectStyle = {
  background: '#0B0D11',
  border: '1px solid #1C2130',
  color: '#E2E8F2',
  borderRadius: 5,
  padding: '5px 9px',
  fontSize: 11,
  cursor: 'pointer',
}

function formatMoney(value: number) {
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
    maximumFractionDigits: 2,
  }).format(value)
}

function formatShortDate(value: string) {
  const parsed = new Date(`${value}T00:00:00`)
  if (Number.isNaN(parsed.getTime())) {
    return value
  }
  return parsed.toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
  })
}

type InferredSubscriptionFrequency = SubscriptionFrequency | 'biweekly' | '—'

function projectToMonthly(amount: number, frequency: InferredSubscriptionFrequency) {
  if (frequency === 'weekly') {
    return amount * 52 / 12
  }
  if (frequency === 'biweekly') {
    return amount * 26 / 12
  }
  if (frequency === 'yearly') {
    return amount / 12
  }
  return amount
}

function inferFrequency(mostRecentDate: string, previousDate?: string): InferredSubscriptionFrequency {
  if (!previousDate) {
    return '—'
  }

  const newest = new Date(`${mostRecentDate}T00:00:00`)
  const prior = new Date(`${previousDate}T00:00:00`)
  const gapDays = Math.abs(newest.getTime() - prior.getTime()) / (1000 * 60 * 60 * 24)

  if (gapDays < 10) {
    return 'weekly'
  }
  if (gapDays <= 20) {
    return 'biweekly'
  }
  if (gapDays <= 45) {
    return 'monthly'
  }
  return 'yearly'
}

function tabStyle(active: boolean) {
  return {
    background: active ? '#3B82F6' : 'transparent',
    color: active ? '#FFFFFF' : '#5E6E85',
    border: active ? '1px solid #3B82F6' : '1px solid #1C2130',
    padding: '8px 16px',
    fontSize: '13px',
    fontWeight: 600,
    borderRadius: '6px',
    cursor: 'pointer',
    whiteSpace: 'nowrap' as const,
  }
}

function TransactionRow({
  transaction,
  onDelete,
  onClassify,
}: {
  transaction: FinanceTransaction
  onDelete?: (id: string) => void
  onClassify?: (id: string) => void
}) {
  const isOut = transaction.direction === 'out'
  return (
    <div style={{ ...cardBase, borderRadius: 7, padding: '12px 14px', marginBottom: 6, display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, minWidth: 0, flex: 1 }}>
        <span style={{ color: isOut ? '#EF4444' : '#10B981', fontWeight: 700 }}>{isOut ? '↓' : '↑'}</span>
        <div style={{ minWidth: 0 }}>
          <div style={{ color: '#E2E8F2', overflow: 'hidden', textOverflow: 'ellipsis' }}>{transaction.description}</div>
          <div style={{ ...labelMuted, fontSize: 12 }}>{transaction.date}</div>
        </div>
      </div>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
        <span style={{
          background: `${FINANCE_CATEGORY_COLORS[transaction.category]}26`,
          color: FINANCE_CATEGORY_COLORS[transaction.category],
          border: `1px solid ${FINANCE_CATEGORY_COLORS[transaction.category]}`,
          borderRadius: 999,
          padding: '3px 8px',
          fontSize: 12,
          whiteSpace: 'nowrap',
        }}>
          {FINANCE_CATEGORY_LABELS[transaction.category]}
        </span>
        <span style={{ ...moneyStyle, color: isOut ? '#EF4444' : '#10B981', fontWeight: 700 }}>{formatMoney(transaction.amount)}</span>
        {onClassify ? <button type="button" style={tabStyle(false)} onClick={() => onClassify(transaction.id)}>Classify</button> : null}
        {onDelete ? <button type="button" style={tabStyle(false)} onClick={() => onDelete(transaction.id)}>Delete</button> : null}
      </div>
    </div>
  )
}

function StatCard({ label, value, valueColor, subText }: { label: string; value: string; valueColor: string; subText?: ReactNode }) {
  return (
    <div style={{ ...cardBase, flex: '1 1 160px', minWidth: '0', padding: '16px 18px' }}>
      <div style={{ fontSize: '11px', textTransform: 'uppercase', letterSpacing: '0.07em', color: '#5E6E85', marginBottom: '6px' }}>{label}</div>
      <div style={{ ...moneyStyle, fontSize: '22px', fontWeight: 700, color: valueColor }}>{value}</div>
      {subText ? <div style={{ fontSize: '12px', color: '#5E6E85', marginTop: '4px' }}>{subText}</div> : null}
    </div>
  )
}

export function FinancePage({ headerUtilityContent }: FinancePageProps) {
  const [tab, setTab] = useState<FinanceTab>('dashboard')
  const [transactions, setTransactions] = useState<FinanceTransaction[]>([])
  const [subscriptions, setSubscriptions] = useState<FinanceSubscription[]>([])
  const [patterns, setPatterns] = useState<FinancePattern[]>([])
  const [subscriptionMeta, setSubscriptionMeta] = useState<Record<string, { brand: SubscriptionBrand; status: SubscriptionStatus }>>({})
  const [accounts, setAccounts] = useState<FinanceAccount[]>([])
  const [syncing, setSyncing] = useState(false)
  const [syncSummary, setSyncSummary] = useState('Ready to sync')
  const [errorMessage, setErrorMessage] = useState<string | null>(null)
  const [selectedDate, setSelectedDate] = useState(() => new Date().toISOString().slice(0, 10))
  const [searchQuery, setSearchQuery] = useState('')
  const [triageTarget, setTriageTarget] = useState<FinanceTransaction | null>(null)
  const [subscriptionModalOpen, setSubscriptionModalOpen] = useState(false)
  const [subName, setSubName] = useState('')
  const [subAmount, setSubAmount] = useState('')
  const [subFrequency, setSubFrequency] = useState<SubscriptionFrequency>('monthly')
  const [subPlatform, setSubPlatform] = useState('')
  const [subBrand, setSubBrand] = useState<SubscriptionBrand>('Unassigned')
  const [subStatus, setSubStatus] = useState<SubscriptionStatus>('active')
  const [subscriptionBrandFilter, setSubscriptionBrandFilter] = useState<'all' | SubscriptionBrand>('all')
  const [subscriptionStatusFilter, setSubscriptionStatusFilter] = useState<'all' | SubscriptionStatus>('active')
  const [seedClassifyMessage, setSeedClassifyMessage] = useState('')
  const financeDirtyRef = useRef(false)
  const financePendingWritesRef = useRef(0)
  const financeLoadSeqRef = useRef(0)
  const latestMutationSeqRef = useRef(0)

  const reloadData = async () => {
    const loadSeq = financeLoadSeqRef.current + 1
    financeLoadSeqRef.current = loadSeq
    try {
      const data = await loadFinanceData()
      if (financeDirtyRef.current) {
        console.warn('[finance sync] skipping remote replace — dirty')
        return
      }
      if (loadSeq < latestMutationSeqRef.current) {
        console.warn('[finance sync] skipping remote replace — stale load')
        return
      }
      setTransactions(data.transactions)
      setSubscriptions(data.subscriptions)
      setPatterns(data.patterns)
      setSubscriptionMeta(data.subscriptionMeta)
      setErrorMessage(null)
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : 'Could not load finance data')
    }
  }

  const runFinanceMutation = async (label: string, action: () => Promise<void>) => {
    financePendingWritesRef.current += 1
    financeDirtyRef.current = true
    latestMutationSeqRef.current += 1
    console.log('[finance save] saving', {
      label,
      count: financePendingWritesRef.current,
      timestamp: new Date().toISOString(),
    })
    try {
      await action()
      console.log('[finance save] success', { label })
    } finally {
      financePendingWritesRef.current = Math.max(0, financePendingWritesRef.current - 1)
      if (financePendingWritesRef.current === 0) {
        financeDirtyRef.current = false
      }
    }
  }

  useEffect(() => {
    void reloadData()
  }, [])

  const monthPrefix = new Date().toISOString().slice(0, 7)
  const monthTx = useMemo(() => transactions.filter((transaction) => transaction.date.startsWith(monthPrefix)), [transactions, monthPrefix])

  const monthIn = monthTx.filter((transaction) => transaction.direction === 'in').reduce((sum, transaction) => sum + transaction.amount, 0)
  const monthOut = monthTx.filter((transaction) => transaction.direction === 'out').reduce((sum, transaction) => sum + transaction.amount, 0)
  const monthNet = monthIn - monthOut
  const mSal = monthTx.filter((transaction) => transaction.direction === 'out' && transaction.category === CAT.SALARY).reduce((sum, transaction) => sum + transaction.amount, 0)
  const mSub = monthTx.filter((transaction) => transaction.direction === 'out' && transaction.category === CAT.SUBSCRIPTION).reduce((sum, transaction) => sum + transaction.amount, 0)
  const mAds = monthTx.filter((transaction) => transaction.direction === 'out' && transaction.category === CAT.AD_SPEND).reduce((sum, transaction) => sum + transaction.amount, 0)
  const mCogs = monthTx.filter((transaction) => transaction.direction === 'out' && transaction.category === CAT.COGS).reduce((sum, transaction) => sum + transaction.amount, 0)
  const mOne = monthTx.filter((transaction) => transaction.direction === 'out' && transaction.category === CAT.ONE_TIME).reduce((sum, transaction) => sum + transaction.amount, 0)
  const mTax = monthTx.filter((transaction) => transaction.direction === 'out' && transaction.category === CAT.TAXES).reduce((sum, transaction) => sum + transaction.amount, 0)
  const mAff = monthTx.filter((transaction) => transaction.direction === 'out' && transaction.category === CAT.AFFILIATE).reduce((sum, transaction) => sum + transaction.amount, 0)
  const mHR = monthTx.filter((transaction) => transaction.direction === 'out' && transaction.category === CAT.HR).reduce((sum, transaction) => sum + transaction.amount, 0)
  const opEx = mSal + mSub + mAds + mCogs + mOne + mTax + mAff + mHR
  const today = new Date().toISOString().slice(0, 10)
  const todaysTransactions = transactions.filter((transaction) => transaction.date === today)
  const selectedTransactions = transactions.filter((transaction) => transaction.date === selectedDate)
  const unclassified = transactions.filter((transaction) => transaction.category === CAT.UNCLASSIFIED)

  const monthOutflowBreakdown = useMemo(() => {
    const totals = new Map<FinanceCategory, number>()

    monthTx
      .filter((transaction) => transaction.direction === 'out')
      .forEach((transaction) => {
        totals.set(transaction.category, (totals.get(transaction.category) ?? 0) + transaction.amount)
      })

    const totalOutflow = Array.from(totals.values()).reduce((sum, amount) => sum + amount, 0)
    const icons: Record<FinanceCategory, string> = {
      [CAT.UNCLASSIFIED]: '❓',
      [CAT.SUBSCRIPTION]: '🔄',
      [CAT.SALARY]: '👤',
      [CAT.ONE_TIME]: '📌',
      [CAT.REVENUE]: '💰',
      [CAT.REFUND]: '↩️',
      [CAT.AD_SPEND]: '📢',
      [CAT.COGS]: '📦',
      [CAT.TAXES]: '🏛️',
      [CAT.AFFILIATE]: '🤝',
      [CAT.HR]: '👔',
      [CAT.INTERNAL_TRANSFER]: '🔄',
    }

    return Array.from(totals.entries())
      .filter(([, amount]) => amount > 0)
      .sort((a, b) => b[1] - a[1])
      .map(([category, amount]) => ({
        category,
        icon: icons[category],
        label: FINANCE_CATEGORY_LABELS[category],
        amount,
        percentage: totalOutflow > 0 ? (amount / totalOutflow) * 100 : 0,
      }))
  }, [monthTx])

  const groupedByDate = useMemo(() => {
    const map = new Map<string, FinanceTransaction[]>()
    transactions.forEach((transaction) => {
      const rows = map.get(transaction.date) ?? []
      rows.push(transaction)
      map.set(transaction.date, rows)
    })
    return Array.from(map.entries()).sort(([a], [b]) => (a > b ? -1 : 1))
  }, [transactions])

  const searchResults = useMemo(() => {
    const normalized = searchQuery.trim().toLowerCase()
    if (!normalized) {
      return []
    }
    return transactions.filter((transaction) => transaction.description.toLowerCase().includes(normalized))
  }, [searchQuery, transactions])

  const subscriptionRows = useMemo(() => {
    const detectedByDescription = new Map<string, FinanceTransaction[]>()
    const subscriptionTransactions = transactions.filter(
      (transaction) => transaction.category === 'subscription' && transaction.direction === 'out',
    )

    subscriptionTransactions.forEach((transaction) => {
        const key = transaction.description.trim().toLowerCase()
        const rows = detectedByDescription.get(key) ?? []
        rows.push(transaction)
        detectedByDescription.set(key, rows)
      })

    const groupedDebug = Array.from(detectedByDescription.entries()).map(([description, rows]) => ({
      description,
      count: rows.length,
      dates: rows.map((row) => row.date),
    }))
    console.log('[subs debug]', {
      totalTx: transactions.length,
      subTx: transactions.filter((transaction) => transaction.category === 'subscription').length,
      grouped: groupedDebug,
    })

    const detectedRows = Array.from(detectedByDescription.entries()).map(([key, groupedTransactions]) => {
      const sorted = [...groupedTransactions].sort((a, b) => (a.date > b.date ? -1 : 1))
      const mostRecent = sorted[0]
      const previous = sorted[1]
      const frequency = inferFrequency(mostRecent.date, previous?.date)
      const totalThisMonth = sorted
        .filter((transaction) => transaction.date.startsWith(monthPrefix))
        .reduce((sum, transaction) => sum + transaction.amount, 0)

      return {
        id: `auto-${key}`,
        descriptionKey: key,
        subscriptionId: null,
        name: mostRecent.description,
        amount: mostRecent.amount,
        frequency,
        lastChargeDate: mostRecent.date,
        totalThisMonth,
        isManual: false,
        brand: subscriptionMeta[key]?.brand ?? 'Unassigned',
        status: subscriptionMeta[key]?.status ?? 'active',
      }
    })

    const manualRows = subscriptions.map((subscription) => ({
      id: `manual-${subscription.id}`,
      descriptionKey: null,
      subscriptionId: subscription.id,
      name: subscription.name,
      amount: subscription.amount,
      frequency: subscription.frequency as InferredSubscriptionFrequency,
      lastChargeDate: null,
      totalThisMonth: 0,
      isManual: true,
      brand: subscription.brand ?? 'Unassigned',
      status: subscription.status ?? (subscription.active ? 'active' : 'inactive'),
    }))

    return [...detectedRows, ...manualRows].sort((a, b) => a.name.localeCompare(b.name))
  }, [transactions, subscriptions, monthPrefix, subscriptionMeta])

  const filteredSubscriptionRows = useMemo(
    () => subscriptionRows.filter((row) => {
      if (subscriptionBrandFilter !== 'all' && row.brand !== subscriptionBrandFilter) {
        return false
      }
      if (subscriptionStatusFilter !== 'all' && row.status !== subscriptionStatusFilter) {
        return false
      }
      return true
    }),
    [subscriptionRows, subscriptionBrandFilter, subscriptionStatusFilter],
  )

  const subscriptionsMonthlyBurn = useMemo(
    () => filteredSubscriptionRows
      .filter((row) => row.status === 'active')
      .reduce((sum, row) => sum + projectToMonthly(row.amount, row.frequency), 0),
    [filteredSubscriptionRows],
  )

  const syncNow = async () => {
    setSyncing(true)
    setSyncSummary('Syncing…')
    try {
      const result = await syncFinanceFromSlash()
      setSyncSummary(`${result.imported} imported · ${result.duplicates} dupes skipped · ${result.needReview} need review`)
      setAccounts(result.accounts)
      await reloadData()
    } catch (error) {
      setSyncSummary(error instanceof Error ? error.message : 'Sync failed')
    } finally {
      setSyncing(false)
    }
  }

  const onClassify = async (category: FinanceCategory) => {
    if (!triageTarget) {
      return
    }
    await runFinanceMutation('classify-transaction', async () => {
      await classifyTransaction(triageTarget.id, category)
      await reloadData()
    })
    setTriageTarget(null)
  }

  const onAutoClassifySeedRules = async () => {
    const updated = await (async () => {
      let nextUpdated = 0
      await runFinanceMutation('auto-classify-seed-rules', async () => {
        nextUpdated = await autoClassifyWithSeedRules()
        await reloadData()
      })
      return nextUpdated
    })()
    setSeedClassifyMessage(`Auto-classified ${updated} transactions using seed rules`)
  }

  return (
    <div style={{ background: '#0B0D11', minHeight: '100vh', marginLeft: '-24px', marginRight: '-24px', marginTop: '-24px', marginBottom: '-24px' }}>
      <div style={{ maxWidth: '900px', margin: '0 auto', padding: '24px 20px', color: '#E2E8F2' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <h1 style={{ fontSize: '24px', fontWeight: 800, marginBottom: '20px', letterSpacing: '-0.02em', marginTop: 0, color: '#E2E8F2' }}>Finance</h1>
          <div>{headerUtilityContent}</div>
        </div>

        <div style={{ display: 'flex', gap: '8px', marginBottom: '20px', overflowX: 'auto' }}>
          {([
            ['dashboard', 'Dashboard'],
            ['ledger', 'Daily Ledger'],
            ['subscriptions', 'Subscriptions'],
            ['triage', 'Triage'],
            ['search', 'Search'],
          ] as const).map(([value, label]) => (
            <button key={value} type="button" onClick={() => setTab(value)} style={tabStyle(tab === value)}>{label}</button>
          ))}
        </div>

        {errorMessage ? <div style={{ ...cardBase, color: '#F59E0B', padding: 12, marginBottom: 16 }}>{errorMessage}</div> : null}

        {tab === 'dashboard' ? (
          <section>
            <div style={{ background: '#161B28', border: '1px solid #2A3040', borderRadius: '10px', padding: '16px 20px', marginBottom: '20px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <span style={{ color: '#5E6E85' }}>{syncSummary}</span>
              <button type="button" onClick={syncNow} disabled={syncing} style={{ background: '#3B82F6', color: '#FFFFFF', border: 'none', borderRadius: 6, padding: '8px 12px', cursor: 'pointer' }}>
                {syncing ? 'Syncing…' : '⚡ Sync Now'}
              </button>
            </div>

            <div style={{ display: 'flex', gap: '12px', flexWrap: 'wrap', marginBottom: '24px' }}>
              <StatCard label="Month In" value={formatMoney(monthIn)} valueColor="#10B981" />
              <StatCard label="Month Out" value={formatMoney(monthOut)} valueColor="#EF4444" />
              <StatCard label="Net Flow" value={formatMoney(monthNet)} valueColor={monthNet >= 0 ? '#10B981' : '#EF4444'} />
            </div>

            <div style={{ display: 'flex', gap: '12px', flexWrap: 'wrap', marginBottom: '24px' }}>
              <StatCard
                label="OpEx"
                value={formatMoney(opEx)}
                valueColor="#8B5CF6"
                subText={(
                  <div style={{ display: 'grid', gap: 4 }}>
                    <div>{`Sal ${formatMoney(mSal)} · Subs ${formatMoney(mSub)} · Ads ${formatMoney(mAds)} · Tax ${formatMoney(mTax)} · COGS ${formatMoney(mCogs)}`}</div>
                    <div>{`HR ${formatMoney(mHR)} · Affiliate ${formatMoney(mAff)} · One-Time ${formatMoney(mOne)}`}</div>
                  </div>
                )}
              />
              <StatCard label="Sub Burn /mo" value={formatMoney(subscriptionsMonthlyBurn)} valueColor="#8B5CF6" subText={`${subscriptionRows.length} tracked`} />
            </div>

            <div style={{ background: '#12151B', border: '1px solid #1C2130', borderRadius: 8, padding: '14px 16px', marginBottom: '24px' }}>
              <div style={{ fontSize: 12, fontWeight: 700, color: '#E2E8F2', marginBottom: 10 }}>This Month — Outflows by Category</div>
              {monthOutflowBreakdown.length === 0 ? (
                <div style={{ color: '#5E6E85', fontSize: 12 }}>No outflow categories this month.</div>
              ) : monthOutflowBreakdown.map((row) => (
                <div key={row.category} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '6px 0', borderBottom: '1px solid #1C2130' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                    <span>{row.icon}</span>
                    <span style={{ color: '#E2E8F2' }}>{row.label}</span>
                  </div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                    <span style={{ ...moneyStyle, color: '#E2E8F2' }}>{formatMoney(row.amount)}</span>
                    <span style={{ color: '#5E6E85', minWidth: 42, textAlign: 'right', fontSize: 12 }}>{row.percentage.toFixed(0)}%</span>
                  </div>
                </div>
              ))}
            </div>

            {accounts.length > 0 ? (
              <div style={{ ...cardBase, padding: 12, marginBottom: 16 }}>
                {accounts.map((account) => (
                  <div key={account.id} style={{ display: 'flex', justifyContent: 'space-between', padding: '6px 0', borderBottom: '1px solid #1C2130' }}>
                    <span>{account.name}</span>
                    <span style={{ ...moneyStyle }}>{formatMoney(account.availableBalance)}</span>
                  </div>
                ))}
              </div>
            ) : null}

            <h3 style={{ fontSize: '11px', textTransform: 'uppercase', letterSpacing: '0.07em', color: '#5E6E85', fontWeight: 700, marginBottom: '10px' }}>Today</h3>

            {todaysTransactions.length === 0 ? (
              <div style={{ ...cardBase, padding: '32px', textAlign: 'center', color: '#5E6E85' }}>No transactions for today yet.</div>
            ) : (
              todaysTransactions.map((transaction) => (
                <TransactionRow
                  key={transaction.id}
                  transaction={transaction}
                  onDelete={async (id) => {
                    await runFinanceMutation('delete-transaction', async () => {
                      await deleteFinanceTransaction(id)
                      await reloadData()
                    })
                  }}
                />
              ))
            )}
          </section>
        ) : null}

        {tab === 'ledger' ? (
          <section style={{ display: 'grid', gap: 12 }}>
            <input type="date" value={selectedDate} onChange={(event) => setSelectedDate(event.target.value)} style={inputStyle} />
            <div style={{ ...cardBase, padding: 10, display: 'flex', gap: 12 }}>
              <span style={labelMuted}>In <strong style={{ ...moneyStyle, color: '#10B981' }}>{formatMoney(selectedTransactions.filter((t) => t.direction === 'in').reduce((sum, t) => sum + t.amount, 0))}</strong></span>
              <span style={labelMuted}>Out <strong style={{ ...moneyStyle, color: '#EF4444' }}>{formatMoney(selectedTransactions.filter((t) => t.direction === 'out').reduce((sum, t) => sum + t.amount, 0))}</strong></span>
            </div>
            <div>{selectedTransactions.map((transaction) => <TransactionRow key={transaction.id} transaction={transaction} onDelete={async (id) => {
              await runFinanceMutation('delete-transaction', async () => {
                await deleteFinanceTransaction(id)
                await reloadData()
              })
            }} />)}</div>
            <div style={{ ...cardBase, padding: 10, maxHeight: 260, overflowY: 'auto' }}>
              {groupedByDate.map(([date, items]) => {
                const dayIn = items.filter((t) => t.direction === 'in').reduce((sum, t) => sum + t.amount, 0)
                const dayOut = items.filter((t) => t.direction === 'out').reduce((sum, t) => sum + t.amount, 0)
                const hasUnclassified = items.some((t) => t.category === 'unclassified')
                return (
                  <button key={date} type="button" style={{ ...tabStyle(false), width: '100%', display: 'flex', justifyContent: 'space-between', marginBottom: 6 }} onClick={() => setSelectedDate(date)}>
                    <span>{date} {hasUnclassified ? <span style={{ color: '#F59E0B' }}>●</span> : null}</span>
                    <span style={moneyStyle}>+{formatMoney(dayIn)} / -{formatMoney(dayOut)}</span>
                  </button>
                )
              })}
            </div>
          </section>
        ) : null}

        {tab === 'subscriptions' ? (
          <section style={{ display: 'grid', gap: 12 }}>
            <div style={{ ...cardBase, padding: 16, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <div>
                <div style={{ ...labelMuted, fontSize: 12, textTransform: 'uppercase', letterSpacing: '0.06em' }}>Monthly Burn</div>
                <div style={{ ...moneyStyle, color: '#8B5CF6', fontSize: 30, fontWeight: 700 }}>{formatMoney(subscriptionsMonthlyBurn)}</div>
              </div>
              <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap', justifyContent: 'flex-end' }}>
                <select style={subscriptionSelectStyle} value={subscriptionBrandFilter} onChange={(event) => setSubscriptionBrandFilter(event.target.value as 'all' | SubscriptionBrand)}>
                  <option value="all">All brands</option>
                  {SUBSCRIPTION_BRANDS.map((brand) => <option key={brand} value={brand}>{brand}</option>)}
                </select>
                <select style={subscriptionSelectStyle} value={subscriptionStatusFilter} onChange={(event) => setSubscriptionStatusFilter(event.target.value as 'all' | SubscriptionStatus)}>
                  <option value="all">All statuses</option>
                  {SUBSCRIPTION_STATUSES.map((status) => <option key={status.value} value={status.value}>{status.label}</option>)}
                </select>
                <button type="button" style={tabStyle(true)} onClick={() => setSubscriptionModalOpen(true)}>+ Subscription</button>
              </div>
            </div>

            <div style={{ display: 'grid', gap: 8 }}>
              {filteredSubscriptionRows.length === 0 ? (
                <div style={{ ...cardBase, borderRadius: 7, padding: '20px 14px', color: '#5E6E85', textAlign: 'center' }}>
                  <div style={{ marginBottom: 10 }}>No subscriptions yet. Go to Triage and classify recurring charges as Subscription.</div>
                  <button type="button" style={tabStyle(false)} onClick={() => setTab('triage')}>Open Triage</button>
                </div>
              ) : filteredSubscriptionRows.map((subscription) => (
                <div key={subscription.id} style={{ background: '#12151B', border: '1px solid #1C2130', borderRadius: 7, padding: '12px 14px', display: 'flex', justifyContent: 'space-between', gap: 16, flexWrap: 'wrap', opacity: subscription.status === 'cancelled' ? 0.5 : 1 }}>
                  <div style={{ minWidth: 0 }}>
                    <div style={{ color: '#E2E8F2', fontWeight: 700, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{subscription.name}</div>
                    <div style={{ marginTop: 4, display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
                      <span style={{ color: '#5E6E85', fontSize: 12 }}>{subscription.frequency}</span>
                      {subscription.isManual ? (
                        <span style={{ color: '#5E6E85', border: '1px solid #1C2130', borderRadius: 999, fontSize: 10, padding: '1px 6px', textTransform: 'uppercase', letterSpacing: '0.04em' }}>manual</span>
                      ) : null}
                      <span style={{ color: '#5E6E85', fontSize: 12 }}>This month: {formatMoney(subscription.totalThisMonth)}</span>
                    </div>
                  </div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
                    <select
                      style={subscriptionSelectStyle}
                      value={subscription.brand}
                      onChange={async (event) => {
                        const brand = event.target.value as SubscriptionBrand
                            if (subscription.isManual && subscription.subscriptionId) {
                              setSubscriptions((previous) => previous.map((item) => item.id === subscription.subscriptionId ? { ...item, brand } : item))
                              await runFinanceMutation('update-subscription-brand', async () => {
                                await updateSubscription(subscription.subscriptionId!, { brand })
                              })
                              return
                            }
                            if (subscription.descriptionKey) {
                              setSubscriptionMeta((previous) => ({ ...previous, [subscription.descriptionKey as string]: { brand, status: subscription.status } }))
                              await runFinanceMutation('upsert-subscription-meta-brand', async () => {
                                await upsertSubscriptionMeta(subscription.descriptionKey!, { brand })
                              })
                            }
                          }}
                    >
                      {SUBSCRIPTION_BRANDS.map((brand) => <option key={brand} value={brand}>{brand}</option>)}
                    </select>
                    <div style={{ position: 'relative' }}>
                      <span
                        style={{
                          position: 'absolute',
                          left: 8,
                          top: '50%',
                          width: 6,
                          height: 6,
                          borderRadius: '50%',
                          transform: 'translateY(-50%)',
                          background: SUBSCRIPTION_STATUSES.find((status) => status.value === subscription.status)?.color ?? '#10B981',
                        }}
                      />
                      <select
                        style={{ ...subscriptionSelectStyle, paddingLeft: 20 }}
                        value={subscription.status}
                        onChange={async (event) => {
                          const status = event.target.value as SubscriptionStatus
                            if (subscription.isManual && subscription.subscriptionId) {
                              setSubscriptions((previous) => previous.map((item) => item.id === subscription.subscriptionId ? {
                                ...item,
                                status,
                                active: status === 'active',
                              } : item))
                              await runFinanceMutation('update-subscription-status', async () => {
                                await updateSubscription(subscription.subscriptionId!, { status, active: status === 'active' })
                              })
                              return
                            }
                            if (subscription.descriptionKey) {
                              setSubscriptionMeta((previous) => ({ ...previous, [subscription.descriptionKey as string]: { brand: subscription.brand, status } }))
                              await runFinanceMutation('upsert-subscription-meta-status', async () => {
                                await upsertSubscriptionMeta(subscription.descriptionKey!, { status })
                              })
                            }
                          }}
                      >
                        {SUBSCRIPTION_STATUSES.map((status) => <option key={status.value} value={status.value}>{status.label}</option>)}
                      </select>
                    </div>
                  </div>
                  <div style={{ textAlign: 'right', flexShrink: 0 }}>
                    <div style={{ ...moneyStyle, color: '#8B5CF6', fontWeight: 700, textDecoration: subscription.status === 'cancelled' ? 'line-through' : 'none' }}>{formatMoney(subscription.amount)}</div>
                    <div style={{ color: '#5E6E85', fontSize: 12, marginTop: 4 }}>
                      {subscription.lastChargeDate ? `Last: ${formatShortDate(subscription.lastChargeDate)}` : 'Last: —'}
                    </div>
                  </div>
                </div>
              ))}
            </div>
            <details style={{ ...cardBase, padding: 12 }}>
              <summary style={{ color: '#5E6E85', cursor: 'pointer', fontSize: 12, textTransform: 'uppercase', letterSpacing: '0.06em' }}>Learned Patterns (debug)</summary>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, marginTop: 10 }}>
                {patterns.map((pattern) => (
                  <span key={pattern.id} style={{ border: `1px solid ${FINANCE_CATEGORY_COLORS[pattern.category]}`, color: FINANCE_CATEGORY_COLORS[pattern.category], background: `${FINANCE_CATEGORY_COLORS[pattern.category]}26`, borderRadius: 999, padding: '4px 10px', fontSize: 11 }}>
                    {pattern.pattern}
                  </span>
                ))}
              </div>
            </details>
          </section>
        ) : null}

        {tab === 'triage' ? (
          <section>
            <div style={{ marginBottom: 12, display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap' }}>
              <button
                type="button"
                style={{ background: '#10B981', color: '#fff', padding: '8px 14px', borderRadius: 5, fontSize: 12, fontWeight: 700, border: 'none', cursor: 'pointer' }}
                onClick={() => void onAutoClassifySeedRules()}
              >
                Auto-classify using seed rules
              </button>
              {seedClassifyMessage ? <span style={{ color: '#5E6E85', fontSize: 12 }}>{seedClassifyMessage}</span> : null}
            </div>
            {unclassified.length === 0 ? <div style={{ ...cardBase, padding: 32, textAlign: 'center', color: '#5E6E85' }}>✅ All Clear</div> : unclassified.map((transaction) => (
              <TransactionRow key={transaction.id} transaction={transaction} onDelete={async (id) => {
                await runFinanceMutation('delete-transaction', async () => {
                  await deleteFinanceTransaction(id)
                  await reloadData()
                })
              }} onClassify={(id) => setTriageTarget(transactions.find((t) => t.id === id) ?? null)} />
            ))}
          </section>
        ) : null}

        {tab === 'search' ? (
          <section style={{ display: 'grid', gap: 12 }}>
            <input type="search" placeholder="Search descriptions..." value={searchQuery} onChange={(event) => setSearchQuery(event.target.value)} style={inputStyle} />
            <div>
              {searchResults.map((transaction) => (
                <div key={transaction.id} style={{ ...cardBase, padding: 10, marginBottom: 6 }}>
                  <span style={labelMuted}>{transaction.date} — </span>
                  <span style={{ color: '#E2E8F2' }}>{transaction.description}</span>
                </div>
              ))}
            </div>
          </section>
        ) : null}

        {triageTarget ? (
          <div className="modal-backdrop" role="dialog" aria-modal="true" style={{ background: 'rgba(0,0,0,0.75)' }}>
            <div className="modal-card" style={{ ...cardBase, maxWidth: 520 }}>
              <h3 style={{ color: '#E2E8F2', marginTop: 0 }}>Classify transaction</h3>
              <p style={{ color: '#E2E8F2' }}><strong>{triageTarget.description}</strong></p>
              <p style={labelMuted}>{triageTarget.date} · {triageTarget.direction === 'out' ? 'Out' : 'In'} · <span style={{ ...moneyStyle, color: triageTarget.direction === 'out' ? '#EF4444' : '#10B981' }}>{formatMoney(triageTarget.amount)}</span></p>
              <div style={{ display: 'grid', gap: 8 }}>
                {TRIAGE_OPTIONS.map((option) => (
                  <button key={option.c} type="button" style={tabStyle(false)} onClick={() => void onClassify(option.c)}>
                    {`${option.i} ${option.l}`}
                  </button>
                ))}
              </div>
              <div style={{ marginTop: 12 }}>
                <button type="button" style={tabStyle(false)} onClick={() => setTriageTarget(null)}>Close</button>
              </div>
            </div>
          </div>
        ) : null}

        {subscriptionModalOpen ? (
          <div className="modal-backdrop" role="dialog" aria-modal="true" style={{ background: 'rgba(0,0,0,0.75)' }}>
            <div className="modal-card" style={{ ...cardBase, maxWidth: 460 }}>
              <h3 style={{ marginTop: 0, color: '#E2E8F2' }}>New Subscription</h3>
              <div style={{ display: 'grid', gap: 10 }}>
                <input style={inputStyle} placeholder="Name" value={subName} onChange={(event) => setSubName(event.target.value)} />
                <input style={inputStyle} placeholder="Amount" inputMode="decimal" value={subAmount} onChange={(event) => setSubAmount(event.target.value)} />
                <select style={inputStyle} value={subFrequency} onChange={(event) => setSubFrequency(event.target.value as SubscriptionFrequency)}>
                  <option value="weekly">weekly</option>
                  <option value="monthly">monthly</option>
                  <option value="yearly">yearly</option>
                </select>
                <select style={inputStyle} value={subBrand} onChange={(event) => setSubBrand(event.target.value as SubscriptionBrand)}>
                  {SUBSCRIPTION_BRANDS.map((brand) => <option key={brand} value={brand}>{brand}</option>)}
                </select>
                <select style={inputStyle} value={subStatus} onChange={(event) => setSubStatus(event.target.value as SubscriptionStatus)}>
                  {SUBSCRIPTION_STATUSES.map((status) => <option key={status.value} value={status.value}>{status.label}</option>)}
                </select>
                <input style={inputStyle} placeholder="Platform / Category" value={subPlatform} onChange={(event) => setSubPlatform(event.target.value)} />
              </div>
              <div style={{ display: 'flex', gap: 8, marginTop: 12 }}>
                <button type="button" style={tabStyle(true)} onClick={async () => {
                  const amount = Number(subAmount)
                  if (!subName.trim() || !Number.isFinite(amount) || amount <= 0) {
                    return
                  }
                  await runFinanceMutation('create-subscription', async () => {
                    await createSubscription({ name: subName, amount, frequency: subFrequency, platform: subPlatform, brand: subBrand, status: subStatus })
                    setSubName('')
                    setSubAmount('')
                    setSubFrequency('monthly')
                    setSubBrand('Unassigned')
                    setSubStatus('active')
                    setSubPlatform('')
                    setSubscriptionModalOpen(false)
                    await reloadData()
                  })
                }}>Save</button>
                <button type="button" style={tabStyle(false)} onClick={() => setSubscriptionModalOpen(false)}>Cancel</button>
              </div>
            </div>
          </div>
        ) : null}
      </div>
    </div>
  )
}
