import { useEffect, useMemo, useState, type ReactNode } from 'react'
import {
  classifyTransaction,
  createSubscription,
  deleteFinanceTransaction,
  deleteSubscription,
  getSubscriptionMonthlyBurn,
  loadFinanceData,
  syncFinanceFromSlash,
  updateSubscription,
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

const cardStyle = {
  background: '#12151B',
  border: '1px solid #1C2130',
  borderRadius: 8,
  color: '#E2E8F2',
}

const labelStyle = {
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

function tabStyle(active: boolean) {
  if (active) {
    return {
      background: '#3B82F6',
      color: '#fff',
      border: '1px solid #3B82F6',
      borderRadius: 6,
      padding: '8px 12px',
    }
  }
  return {
    background: 'transparent',
    color: '#5E6E85',
    border: '1px solid #1C2130',
    borderRadius: 6,
    padding: '8px 12px',
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
    <div style={{ ...cardStyle, display: 'grid', gridTemplateColumns: 'auto 1fr auto auto auto', gap: 12, alignItems: 'center', padding: 10 }}>
      <span style={{ color: isOut ? '#EF4444' : '#10B981', fontWeight: 700 }}>{isOut ? '↓' : '↑'}</span>
      <div style={{ minWidth: 0 }}>
        <div style={{ color: '#E2E8F2', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{transaction.description}</div>
        <div style={{ ...labelStyle, fontSize: 12 }}>{transaction.date}</div>
      </div>
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
      <span style={{ fontFamily: 'JetBrains Mono, ui-monospace, SFMono-Regular, Menlo, monospace', color: isOut ? '#EF4444' : '#10B981', fontWeight: 700 }}>{formatMoney(transaction.amount)}</span>
      <div style={{ display: 'flex', gap: 8 }}>
        {onClassify ? <button type="button" style={tabStyle(false)} onClick={() => onClassify(transaction.id)}>Classify</button> : null}
        {onDelete ? <button type="button" style={tabStyle(false)} onClick={() => onDelete(transaction.id)}>Delete</button> : null}
      </div>
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
  const [syncSummary, setSyncSummary] = useState('')
  const [logLines, setLogLines] = useState<string[]>([])
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
  const subBurn = getSubscriptionMonthlyBurn(subscriptions)

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

  const syncNow = async () => {
    setSyncing(true)
    setLogLines(['Starting sync…'])
    setSyncSummary('')

    try {
      const result = await syncFinanceFromSlash()
      setSyncSummary(`${result.imported} imported · ${result.duplicates} dupes skipped · ${result.needReview} need review`)
      setLogLines((lines) => [...lines, 'Sync complete'])
      setAccounts(result.accounts)
      await reloadData()
    } catch (error) {
      setLogLines((lines) => [...lines, error instanceof Error ? error.message : 'Sync failed'])
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
    <div
      style={{
        background: '#0B0D11',
        color: '#E2E8F2',
        minHeight: '100vh',
        padding: '24px',
        marginLeft: '-24px',
        marginRight: '-24px',
        marginTop: '-24px',
        marginBottom: '-24px',
      }}
    >
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
        <h1 style={{ margin: 0, color: '#E2E8F2' }}>Finance</h1>
        <div>{headerUtilityContent}</div>
      </div>

      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: 16 }}>
        {([
          ['dashboard', 'Dashboard'],
          ['ledger', 'Daily Ledger'],
          ['subscriptions', 'Subscriptions'],
          ['triage', 'Triage'],
          ['search', 'Search'],
        ] as const).map(([value, label]) => (
          <button key={value} type="button" onClick={() => setTab(value)} style={tabStyle(tab === value)}>
            {label}
          </button>
        ))}
      </div>

      {errorMessage ? <div style={{ ...cardStyle, padding: 12, marginBottom: 12, color: '#F59E0B' }}>{errorMessage}</div> : null}

      {tab === 'dashboard' ? (
        <section style={{ display: 'grid', gap: 12 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
            <button type="button" onClick={syncNow} disabled={syncing} style={{ background: '#3B82F6', color: '#fff', borderRadius: 6, border: '1px solid #3B82F6', padding: '8px 12px' }}>
              {syncing ? 'Syncing…' : '⚡ Sync Now'}
            </button>
            <span style={labelStyle}>{syncSummary}</span>
          </div>

          {logLines.length > 0 ? <div style={{ ...cardStyle, padding: 10 }}>{logLines.join(' · ')}</div> : null}

          {accounts.length > 0 ? (
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: 12 }}>
              {accounts.map((account) => (
                <div key={account.id} style={{ ...cardStyle, padding: 12 }}>
                  <div style={{ color: '#E2E8F2' }}>{account.name}</div>
                  <div style={labelStyle}>Available</div>
                  <div style={{ fontFamily: 'JetBrains Mono, ui-monospace, SFMono-Regular, Menlo, monospace' }}>{formatMoney(account.availableBalance)}</div>
                </div>
              ))}
            </div>
          ) : null}

          {unclassified.length > 0 ? (
            <div style={{ border: '1px solid #F59E0B', background: '#F59E0B26', borderRadius: 8, padding: 10, display: 'flex', justifyContent: 'space-between' }}>
              <span style={{ color: '#F59E0B' }}>{unclassified.length} transactions need classification.</span>
              <button type="button" style={tabStyle(false)} onClick={() => setTab('triage')}>Review →</button>
            </div>
          ) : null}

          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(170px, 1fr))', gap: 12 }}>
            <div style={{ ...cardStyle, padding: 12 }}><div style={labelStyle}>Month In</div><div style={{ color: '#10B981', fontFamily: 'JetBrains Mono, ui-monospace, SFMono-Regular, Menlo, monospace' }}>{formatMoney(monthIn)}</div></div>
            <div style={{ ...cardStyle, padding: 12 }}><div style={labelStyle}>Month Out</div><div style={{ color: '#EF4444', fontFamily: 'JetBrains Mono, ui-monospace, SFMono-Regular, Menlo, monospace' }}>{formatMoney(monthOut)}</div></div>
            <div style={{ ...cardStyle, padding: 12 }}><div style={labelStyle}>Net Flow</div><div style={{ color: monthNet >= 0 ? '#10B981' : '#EF4444', fontFamily: 'JetBrains Mono, ui-monospace, SFMono-Regular, Menlo, monospace' }}>{formatMoney(monthNet)}</div></div>
            <div style={{ ...cardStyle, padding: 12 }}><div style={labelStyle}>OpEx</div><div style={{ color: '#8B5CF6', fontFamily: 'JetBrains Mono, ui-monospace, SFMono-Regular, Menlo, monospace' }}>{formatMoney(opEx)}</div><div style={labelStyle}>Sal {formatMoney(salaryOpEx)} · Subs {formatMoney(subsOpEx)} · Ads {formatMoney(adsOpEx)}</div></div>
            <div style={{ ...cardStyle, padding: 12 }}><div style={labelStyle}>Sub Burn /mo</div><div style={{ color: '#8B5CF6', fontFamily: 'JetBrains Mono, ui-monospace, SFMono-Regular, Menlo, monospace' }}>{formatMoney(subBurn)}</div><div style={labelStyle}>{activeSubscriptions.length} active</div></div>
          </div>

          <div style={{ display: 'grid', gap: 8 }}>
            <h3 style={{ margin: 0, color: '#E2E8F2' }}>Today</h3>
            {todaysTransactions.map((transaction) => <TransactionRow key={transaction.id} transaction={transaction} onDelete={async (id) => { await deleteFinanceTransaction(id); await reloadData() }} />)}
          </div>
        </section>
      ) : null}

      {tab === 'ledger' ? (
        <section style={{ display: 'grid', gap: 12 }}>
          <input type="date" value={selectedDate} onChange={(event) => setSelectedDate(event.target.value)} style={inputStyle} />
          <div style={{ ...cardStyle, padding: 10, display: 'flex', gap: 12 }}>
            <span style={labelStyle}>In <strong style={{ color: '#10B981', fontFamily: 'JetBrains Mono, ui-monospace, SFMono-Regular, Menlo, monospace' }}>{formatMoney(selectedTransactions.filter((t) => t.direction === 'in').reduce((sum, t) => sum + t.amount, 0))}</strong></span>
            <span style={labelStyle}>Out <strong style={{ color: '#EF4444', fontFamily: 'JetBrains Mono, ui-monospace, SFMono-Regular, Menlo, monospace' }}>{formatMoney(selectedTransactions.filter((t) => t.direction === 'out').reduce((sum, t) => sum + t.amount, 0))}</strong></span>
          </div>
          <div style={{ display: 'grid', gap: 8 }}>{selectedTransactions.map((transaction) => <TransactionRow key={transaction.id} transaction={transaction} onDelete={async (id) => { await deleteFinanceTransaction(id); await reloadData() }} />)}</div>
          <div style={{ ...cardStyle, padding: 10, maxHeight: 260, overflowY: 'auto' }}>
            {groupedByDate.map(([date, items]) => {
              const dayIn = items.filter((t) => t.direction === 'in').reduce((sum, t) => sum + t.amount, 0)
              const dayOut = items.filter((t) => t.direction === 'out').reduce((sum, t) => sum + t.amount, 0)
              const hasUnclassified = items.some((t) => t.category === 'unclassified')
              return (
                <button key={date} type="button" style={{ ...tabStyle(false), width: '100%', display: 'flex', justifyContent: 'space-between', marginBottom: 6 }} onClick={() => setSelectedDate(date)}>
                  <span>{date} {hasUnclassified ? <span style={{ color: '#F59E0B' }}>●</span> : null}</span>
                  <span style={{ fontFamily: 'JetBrains Mono, ui-monospace, SFMono-Regular, Menlo, monospace' }}>+{formatMoney(dayIn)} / -{formatMoney(dayOut)}</span>
                </button>
              )
            })}
          </div>
        </section>
      ) : null}

      {tab === 'subscriptions' ? (
        <section style={{ display: 'grid', gap: 12 }}>
          <div style={{ ...cardStyle, padding: 12, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <div>
              <div style={labelStyle}>Monthly Burn</div>
              <div style={{ color: '#8B5CF6', fontFamily: 'JetBrains Mono, ui-monospace, SFMono-Regular, Menlo, monospace' }}>{formatMoney(subBurn)}</div>
            </div>
            <button type="button" style={tabStyle(true)} onClick={() => setSubscriptionModalOpen(true)}>+ Subscription</button>
          </div>
          <div style={{ display: 'grid', gap: 8 }}>
            {subscriptions.map((subscription) => (
              <div key={subscription.id} style={{ ...cardStyle, padding: 10, display: 'grid', gridTemplateColumns: '1fr auto auto auto', alignItems: 'center', gap: 10 }}>
                <div>
                  <div style={{ color: '#E2E8F2' }}>{subscription.name}</div>
                  <div style={labelStyle}>{subscription.platform} · {subscription.frequency}</div>
                </div>
                <div style={{ fontFamily: 'JetBrains Mono, ui-monospace, SFMono-Regular, Menlo, monospace' }}>{formatMoney(subscription.amount)}</div>
                <button type="button" style={tabStyle(false)} onClick={async () => { await updateSubscription(subscription.id, { active: !subscription.active }); await reloadData() }}>{subscription.active ? 'Active' : 'Off'}</button>
                <button type="button" style={tabStyle(false)} onClick={async () => { await deleteSubscription(subscription.id); await reloadData() }}>Delete</button>
              </div>
            ))}
          </div>
          <div style={{ ...cardStyle, padding: 12 }}>
            <h3 style={{ margin: '0 0 8px 0', color: '#E2E8F2' }}>Learned Patterns</h3>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
              {patterns.map((pattern) => (
                <span key={pattern.id} style={{ border: `1px solid ${CATEGORY_COLORS[pattern.category]}`, color: CATEGORY_COLORS[pattern.category], background: `${CATEGORY_COLORS[pattern.category]}26`, borderRadius: 999, padding: '4px 10px', fontSize: 12 }}>
                  {pattern.pattern}
                </span>
              ))}
            </div>
          </div>
        </section>
      ) : null}

      {tab === 'triage' ? (
        <section style={{ display: 'grid', gap: 12 }}>
          {unclassified.length === 0 ? <div style={{ ...cardStyle, padding: 12, color: '#10B981' }}>✅ All Clear</div> : unclassified.map((transaction) => (
            <TransactionRow key={transaction.id} transaction={transaction} onDelete={async (id) => { await deleteFinanceTransaction(id); await reloadData() }} onClassify={(id) => setTriageTarget(transactions.find((t) => t.id === id) ?? null)} />
          ))}
        </section>
      ) : null}

      {tab === 'search' ? (
        <section style={{ display: 'grid', gap: 12 }}>
          <input type="search" placeholder="Search descriptions..." value={searchQuery} onChange={(event) => setSearchQuery(event.target.value)} style={inputStyle} />
          <div style={{ display: 'grid', gap: 8 }}>
            {searchResults.map((transaction) => (
              <div key={transaction.id} style={{ ...cardStyle, padding: 10 }}>
                <span style={labelStyle}>{transaction.date} — </span>
                <span style={{ color: '#E2E8F2' }}>{transaction.description}</span>
              </div>
            ))}
          </div>
        </section>
      ) : null}

      {triageTarget ? (
        <div className="modal-backdrop" role="dialog" aria-modal="true" style={{ background: 'rgba(0,0,0,0.75)' }}>
          <div className="modal-card" style={{ ...cardStyle, background: '#12151B', border: '1px solid #1C2130', maxWidth: 520 }}>
            <h3 style={{ color: '#E2E8F2', marginTop: 0 }}>Classify transaction</h3>
            <p style={{ color: '#E2E8F2' }}><strong>{triageTarget.description}</strong></p>
            <p style={labelStyle}>{triageTarget.date} · {triageTarget.direction === 'out' ? 'Out' : 'In'} · <span style={{ fontFamily: 'JetBrains Mono, ui-monospace, SFMono-Regular, Menlo, monospace', color: triageTarget.direction === 'out' ? '#EF4444' : '#10B981' }}>{formatMoney(triageTarget.amount)}</span></p>
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
          <div className="modal-card" style={{ ...cardStyle, background: '#12151B', border: '1px solid #1C2130', maxWidth: 460 }}>
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
  )
}
