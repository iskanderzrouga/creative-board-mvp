import { useEffect, useMemo, useState, type ReactNode } from 'react'
import {
  classifyTransaction,
  createSubscription,
  deleteFinanceTransaction,
  loadFinanceData,
  syncFinanceFromSlash,
  type FinanceAccount,
  type FinanceCategory,
  type FinancePattern,
  type FinanceSubscription,
  type FinanceTransaction,
  type SubscriptionFrequency,
} from '../finance'

const CATEGORY_LABELS: Record<FinanceCategory, string> = {
  unclassified: 'Needs Review',
  subscription: 'Subscription',
  salary: 'Salary',
  one_time: 'One-Time',
  revenue: 'Revenue',
  refund: 'Refund',
  ad_spend: 'Ad Spend',
  cogs: 'COGS',
}

const CATEGORY_COLORS: Record<FinanceCategory, string> = {
  unclassified: '#F59E0B',
  subscription: '#8B5CF6',
  salary: '#3B82F6',
  one_time: '#EF4444',
  revenue: '#10B981',
  refund: '#06B6D4',
  ad_spend: '#F97316',
  cogs: '#EC4899',
}

type FinanceTab = 'dashboard' | 'ledger' | 'subscriptions' | 'triage' | 'search'

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
          background: `${CATEGORY_COLORS[transaction.category]}26`,
          color: CATEGORY_COLORS[transaction.category],
          border: `1px solid ${CATEGORY_COLORS[transaction.category]}`,
          borderRadius: 999,
          padding: '3px 8px',
          fontSize: 12,
          whiteSpace: 'nowrap',
        }}>
          {CATEGORY_LABELS[transaction.category]}
        </span>
        <span style={{ ...moneyStyle, color: isOut ? '#EF4444' : '#10B981', fontWeight: 700 }}>{formatMoney(transaction.amount)}</span>
        {onClassify ? <button type="button" style={tabStyle(false)} onClick={() => onClassify(transaction.id)}>Classify</button> : null}
        {onDelete ? <button type="button" style={tabStyle(false)} onClick={() => onDelete(transaction.id)}>Delete</button> : null}
      </div>
    </div>
  )
}

function StatCard({ label, value, valueColor, subText }: { label: string; value: string; valueColor: string; subText?: string }) {
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

  const reloadData = async () => {
    try {
      const data = await loadFinanceData()
      setTransactions(data.transactions)
      setSubscriptions(data.subscriptions)
      setPatterns(data.patterns)
      setErrorMessage(null)
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : 'Could not load finance data')
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
  const opEx = monthTx.filter((transaction) => transaction.direction === 'out' && ['salary', 'subscription', 'ad_spend', 'cogs', 'one_time'].includes(transaction.category)).reduce((sum, transaction) => sum + transaction.amount, 0)
  const salaryOpEx = monthTx.filter((transaction) => transaction.direction === 'out' && transaction.category === 'salary').reduce((sum, transaction) => sum + transaction.amount, 0)
  const subsOpEx = monthTx.filter((transaction) => transaction.direction === 'out' && transaction.category === 'subscription').reduce((sum, transaction) => sum + transaction.amount, 0)
  const adsOpEx = monthTx.filter((transaction) => transaction.direction === 'out' && transaction.category === 'ad_spend').reduce((sum, transaction) => sum + transaction.amount, 0)
  const activeSubscriptions = subscriptions.filter((subscription) => subscription.active)

  const today = new Date().toISOString().slice(0, 10)
  const todaysTransactions = transactions.filter((transaction) => transaction.date === today)
  const selectedTransactions = transactions.filter((transaction) => transaction.date === selectedDate)
  const unclassified = transactions.filter((transaction) => transaction.category === 'unclassified')

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

    transactions
      .filter((transaction) => transaction.category === 'subscription' && transaction.direction === 'out')
      .forEach((transaction) => {
        const key = transaction.description.trim().toLowerCase()
        const rows = detectedByDescription.get(key) ?? []
        rows.push(transaction)
        detectedByDescription.set(key, rows)
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
        name: mostRecent.description,
        amount: mostRecent.amount,
        frequency,
        lastChargeDate: mostRecent.date,
        totalThisMonth,
        isManual: false,
      }
    })

    const manualRows = activeSubscriptions.map((subscription) => ({
      id: `manual-${subscription.id}`,
      name: subscription.name,
      amount: subscription.amount,
      frequency: subscription.frequency as InferredSubscriptionFrequency,
      lastChargeDate: null,
      totalThisMonth: 0,
      isManual: true,
    }))

    return [...detectedRows, ...manualRows].sort((a, b) => a.name.localeCompare(b.name))
  }, [transactions, activeSubscriptions, monthPrefix])

  const subscriptionsMonthlyBurn = useMemo(
    () => subscriptionRows.reduce((sum, row) => sum + projectToMonthly(row.amount, row.frequency), 0),
    [subscriptionRows],
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
    await classifyTransaction(triageTarget.id, category)
    await reloadData()
    setTriageTarget(null)
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
              <StatCard label="OpEx" value={formatMoney(opEx)} valueColor="#8B5CF6" subText={`Sal ${formatMoney(salaryOpEx)} · Subs ${formatMoney(subsOpEx)} · Ads ${formatMoney(adsOpEx)}`} />
              <StatCard label="Sub Burn /mo" value={formatMoney(subscriptionsMonthlyBurn)} valueColor="#8B5CF6" subText={`${subscriptionRows.length} tracked`} />
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
                    await deleteFinanceTransaction(id)
                    await reloadData()
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
            <div>{selectedTransactions.map((transaction) => <TransactionRow key={transaction.id} transaction={transaction} onDelete={async (id) => { await deleteFinanceTransaction(id); await reloadData() }} />)}</div>
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
              <button type="button" style={tabStyle(true)} onClick={() => setSubscriptionModalOpen(true)}>+ Subscription</button>
            </div>

            <div style={{ display: 'grid', gap: 8 }}>
              {subscriptionRows.length === 0 ? (
                <div style={{ ...cardBase, borderRadius: 7, padding: '20px 14px', color: '#5E6E85', textAlign: 'center' }}>
                  No subscriptions detected yet. Add one manually or classify transactions as subscription.
                </div>
              ) : subscriptionRows.map((subscription) => (
                <div key={subscription.id} style={{ background: '#12151B', border: '1px solid #1C2130', borderRadius: 7, padding: '12px 14px', display: 'flex', justifyContent: 'space-between', gap: 16 }}>
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
                  <div style={{ textAlign: 'right', flexShrink: 0 }}>
                    <div style={{ ...moneyStyle, color: '#8B5CF6', fontWeight: 700 }}>{formatMoney(subscription.amount)}</div>
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
                  <span key={pattern.id} style={{ border: `1px solid ${CATEGORY_COLORS[pattern.category]}`, color: CATEGORY_COLORS[pattern.category], background: `${CATEGORY_COLORS[pattern.category]}26`, borderRadius: 999, padding: '4px 10px', fontSize: 11 }}>
                    {pattern.pattern}
                  </span>
                ))}
              </div>
            </details>
          </section>
        ) : null}

        {tab === 'triage' ? (
          <section>
            {unclassified.length === 0 ? <div style={{ ...cardBase, padding: 32, textAlign: 'center', color: '#5E6E85' }}>✅ All Clear</div> : unclassified.map((transaction) => (
              <TransactionRow key={transaction.id} transaction={transaction} onDelete={async (id) => { await deleteFinanceTransaction(id); await reloadData() }} onClassify={(id) => setTriageTarget(transactions.find((t) => t.id === id) ?? null)} />
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
                <button type="button" style={tabStyle(false)} onClick={() => void onClassify('subscription')}>🔄 Subscription (recurring tool/service)</button>
                <button type="button" style={tabStyle(false)} onClick={() => void onClassify('salary')}>👤 Salary / Payroll</button>
                <button type="button" style={tabStyle(false)} onClick={() => void onClassify('ad_spend')}>📢 Ad Spend (Meta, Google, etc.)</button>
                <button type="button" style={tabStyle(false)} onClick={() => void onClassify('one_time')}>📌 One-Time Expense</button>
                <button type="button" style={tabStyle(false)} onClick={() => void onClassify('cogs')}>📦 COGS / Product Cost</button>
                <button type="button" style={tabStyle(false)} onClick={() => void onClassify('revenue')}>💰 Revenue</button>
                <button type="button" style={tabStyle(false)} onClick={() => void onClassify('refund')}>↩️ Refund</button>
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
                <input style={inputStyle} placeholder="Platform / Category" value={subPlatform} onChange={(event) => setSubPlatform(event.target.value)} />
              </div>
              <div style={{ display: 'flex', gap: 8, marginTop: 12 }}>
                <button type="button" style={tabStyle(true)} onClick={async () => {
                  const amount = Number(subAmount)
                  if (!subName.trim() || !Number.isFinite(amount) || amount <= 0) {
                    return
                  }
                  await createSubscription({ name: subName, amount, frequency: subFrequency, platform: subPlatform })
                  setSubName('')
                  setSubAmount('')
                  setSubFrequency('monthly')
                  setSubPlatform('')
                  setSubscriptionModalOpen(false)
                  await reloadData()
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
