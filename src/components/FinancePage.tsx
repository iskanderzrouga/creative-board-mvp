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
import { PageHeader } from './PageHeader'

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

const shellStyle = {
  background: 'var(--bg-shell, #0f172a)',
  border: '1px solid var(--line-shell, rgba(148, 163, 184, 0.25))',
  borderRadius: 12,
  padding: 12,
}

const cardStyle = {
  border: '1px solid var(--line-shell, rgba(148, 163, 184, 0.25))',
  background: 'var(--bg-surface, #111827)',
  borderRadius: 10,
  padding: 12,
}

function formatMoney(value: number) {
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
    maximumFractionDigits: 2,
  }).format(value)
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
    <div style={{ ...cardStyle, display: 'grid', gridTemplateColumns: 'auto 1fr auto auto auto', gap: 12, alignItems: 'center', padding: '10px 12px' }}>
      <span style={{ color: isOut ? '#EF4444' : '#10B981', fontWeight: 700 }}>{isOut ? '↓' : '↑'}</span>
      <div style={{ minWidth: 0 }}>
        <div style={{ color: 'var(--text-strong)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{transaction.description}</div>
        <div style={{ color: 'var(--muted)', fontSize: 12 }}>{transaction.date}</div>
      </div>
      <span style={{ background: `${CATEGORY_COLORS[transaction.category]}26`, color: CATEGORY_COLORS[transaction.category], border: `1px solid ${CATEGORY_COLORS[transaction.category]}66`, borderRadius: 999, padding: '3px 8px', fontSize: 12, whiteSpace: 'nowrap' }}>{CATEGORY_LABELS[transaction.category]}</span>
      <span style={{ fontFamily: 'JetBrains Mono, ui-monospace, SFMono-Regular, Menlo, monospace', color: isOut ? '#EF4444' : '#10B981', fontWeight: 700 }}>{formatMoney(transaction.amount)}</span>
      <div style={{ display: 'flex', gap: 8 }}>
        {onClassify ? <button type="button" className="secondary-button" onClick={() => onClassify(transaction.id)}>Classify</button> : null}
        {onDelete ? <button type="button" className="ghost-button" style={{ opacity: 0.7 }} onClick={() => onDelete(transaction.id)}>Delete</button> : null}
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

  const currentMonthPrefix = new Date().toISOString().slice(0, 7)
  const monthTransactions = useMemo(
    () => transactions.filter((transaction) => transaction.date.startsWith(currentMonthPrefix)),
    [transactions, currentMonthPrefix],
  )

  const monthIn = monthTransactions
    .filter((transaction) => transaction.direction === 'in')
    .reduce((sum, transaction) => sum + transaction.amount, 0)
  const monthOut = monthTransactions
    .filter((transaction) => transaction.direction === 'out')
    .reduce((sum, transaction) => sum + transaction.amount, 0)
  const monthNet = monthIn - monthOut
  const opEx = monthTransactions
    .filter((transaction) => transaction.direction === 'out' && ['salary', 'subscription', 'ad_spend', 'cogs', 'one_time'].includes(transaction.category))
    .reduce((sum, transaction) => sum + transaction.amount, 0)
  const salaryOpEx = monthTransactions
    .filter((transaction) => transaction.direction === 'out' && transaction.category === 'salary')
    .reduce((sum, transaction) => sum + transaction.amount, 0)
  const subsOpEx = monthTransactions
    .filter((transaction) => transaction.direction === 'out' && transaction.category === 'subscription')
    .reduce((sum, transaction) => sum + transaction.amount, 0)
  const adsOpEx = monthTransactions
    .filter((transaction) => transaction.direction === 'out' && transaction.category === 'ad_spend')
    .reduce((sum, transaction) => sum + transaction.amount, 0)

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
    setSyncSummary('')
    setLogLines(['Starting sync…', 'Requesting Slash transactions + accounts…'])

    try {
      const result = await syncFinanceFromSlash()
      setLogLines((lines) => [...lines, `Imported ${result.imported} transactions`, `Skipped ${result.duplicates} duplicates`, `${result.needReview} need review`])
      setSyncSummary(`${result.imported} imported · ${result.duplicates} dupes skipped · ${result.needReview} need review`)
      setAccounts(result.accounts)
      await reloadData()
    } catch (error) {
      const message = error instanceof Error && error.message === 'supabase-not-configured'
        ? 'Supabase is not configured for this environment.'
        : error instanceof Error
          ? error.message
          : 'Sync failed'
      setLogLines((lines) => [...lines, message])
    } finally {
      setSyncing(false)
    }
  }

  const onClassifyCategory = async (category: FinanceCategory) => {
    if (!triageTarget) {
      return
    }

    await classifyTransaction(triageTarget.id, category)
    await reloadData()
    setTriageTarget((current) => {
      const queue = transactions.filter(
        (transaction) => transaction.category === 'unclassified' && transaction.id !== current?.id,
      )
      return queue[0] ?? null
    })
  }

  const handleDeleteTransaction = async (id: string) => {
    await deleteFinanceTransaction(id)
    await reloadData()
  }

  const saveSubscription = async () => {
    const amount = Number(subAmount)
    if (!subName.trim() || !Number.isFinite(amount) || amount <= 0) {
      return
    }

    await createSubscription({
      name: subName,
      amount,
      frequency: subFrequency,
      platform: subPlatform,
    })

    setSubName('')
    setSubAmount('')
    setSubFrequency('monthly')
    setSubPlatform('')
    setSubscriptionModalOpen(false)
    await reloadData()
  }

  return (
    <div className="page-shell" style={{ display: 'grid', gap: 12 }}>
      <PageHeader title="Finance" rightContent={headerUtilityContent} />

      <div style={{ ...shellStyle, display: 'flex', gap: 8, flexWrap: 'wrap' }}>
        {([
          ['dashboard', 'Dashboard'],
          ['ledger', 'Daily Ledger'],
          ['subscriptions', 'Subscriptions'],
          ['triage', 'Triage'],
          ['search', 'Search'],
        ] as const).map(([value, label]) => (
          <button key={value} type="button" className={tab === value ? 'primary-button' : 'secondary-button'} onClick={() => setTab(value)}>
            {label}
          </button>
        ))}
      </div>

      {errorMessage ? <div style={{ ...cardStyle, borderColor: '#EF444477', color: '#FCA5A5' }}>{errorMessage}</div> : null}

      {tab === 'dashboard' ? (
        <section style={{ display: 'grid', gap: 12 }}>
          <div style={{ ...shellStyle, display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
            <button type="button" className="primary-button" onClick={syncNow} disabled={syncing}>{syncing ? 'Syncing…' : '⚡ Sync Now'}</button>
            {syncSummary ? <span style={{ color: 'var(--muted-strong)' }}>{syncSummary}</span> : null}
          </div>

          {logLines.length > 0 ? <div style={cardStyle}>{logLines.join(' · ')}</div> : null}

          {accounts.length > 0 ? (
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: 12 }}>
              {accounts.map((account) => (
                <div key={account.id} style={cardStyle}>
                  <div style={{ color: 'var(--text-strong)', marginBottom: 4 }}>{account.name}</div>
                  <div style={{ color: 'var(--muted)' }}>Available</div>
                  <div style={{ fontFamily: 'JetBrains Mono, ui-monospace, SFMono-Regular, Menlo, monospace' }}>{formatMoney(account.availableBalance)}</div>
                </div>
              ))}
            </div>
          ) : null}

          {unclassified.length > 0 ? (
            <div style={{ border: '1px solid #F59E0B88', background: '#F59E0B26', borderRadius: 10, padding: 12, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <span>{unclassified.length} transactions need classification.</span>
              <button type="button" className="secondary-button" onClick={() => setTab('triage')}>Review →</button>
            </div>
          ) : null}

          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(170px, 1fr))', gap: 12 }}>
            <div style={cardStyle}><div style={{ color: 'var(--muted)' }}>Month In</div><div style={{ color: '#10B981', fontFamily: 'JetBrains Mono, ui-monospace, SFMono-Regular, Menlo, monospace' }}>{formatMoney(monthIn)}</div></div>
            <div style={cardStyle}><div style={{ color: 'var(--muted)' }}>Month Out</div><div style={{ color: '#EF4444', fontFamily: 'JetBrains Mono, ui-monospace, SFMono-Regular, Menlo, monospace' }}>{formatMoney(monthOut)}</div></div>
            <div style={cardStyle}><div style={{ color: 'var(--muted)' }}>Net Flow</div><div style={{ color: monthNet >= 0 ? '#10B981' : '#EF4444', fontFamily: 'JetBrains Mono, ui-monospace, SFMono-Regular, Menlo, monospace' }}>{formatMoney(monthNet)}</div></div>
            <div style={cardStyle}><div style={{ color: 'var(--muted)' }}>OpEx</div><div style={{ color: '#8B5CF6', fontFamily: 'JetBrains Mono, ui-monospace, SFMono-Regular, Menlo, monospace' }}>{formatMoney(opEx)}</div><div style={{ color: 'var(--muted)', fontSize: 12 }}>Sal {formatMoney(salaryOpEx)} · Subs {formatMoney(subsOpEx)} · Ads {formatMoney(adsOpEx)}</div></div>
            <div style={cardStyle}><div style={{ color: 'var(--muted)' }}>Sub Burn /mo</div><div style={{ color: '#8B5CF6', fontFamily: 'JetBrains Mono, ui-monospace, SFMono-Regular, Menlo, monospace' }}>{formatMoney(subBurn)}</div><div style={{ color: 'var(--muted)', fontSize: 12 }}>{activeSubscriptions.length} active</div></div>
          </div>

          <div style={{ display: 'grid', gap: 8 }}>
            <h3 style={{ margin: 0 }}>Today</h3>
            {todaysTransactions.map((transaction) => <TransactionRow key={transaction.id} transaction={transaction} onDelete={handleDeleteTransaction} />)}
          </div>
        </section>
      ) : null}

      {tab === 'ledger' ? (
        <section style={{ display: 'grid', gap: 12 }}>
          <input type="date" className="search-input" value={selectedDate} onChange={(event) => setSelectedDate(event.target.value)} />
          <div style={{ ...shellStyle, display: 'flex', gap: 12, flexWrap: 'wrap' }}>
            <span>In: <strong style={{ color: '#10B981', fontFamily: 'JetBrains Mono, ui-monospace, SFMono-Regular, Menlo, monospace' }}>{formatMoney(selectedTransactions.filter((transaction) => transaction.direction === 'in').reduce((sum, transaction) => sum + transaction.amount, 0))}</strong></span>
            <span>Out: <strong style={{ color: '#EF4444', fontFamily: 'JetBrains Mono, ui-monospace, SFMono-Regular, Menlo, monospace' }}>{formatMoney(selectedTransactions.filter((transaction) => transaction.direction === 'out').reduce((sum, transaction) => sum + transaction.amount, 0))}</strong></span>
            <span>Net: <strong style={{ color: selectedTransactions.reduce((sum, transaction) => sum + (transaction.direction === 'in' ? transaction.amount : -transaction.amount), 0) >= 0 ? '#10B981' : '#EF4444', fontFamily: 'JetBrains Mono, ui-monospace, SFMono-Regular, Menlo, monospace' }}>{formatMoney(selectedTransactions.reduce((sum, transaction) => sum + (transaction.direction === 'in' ? transaction.amount : -transaction.amount), 0))}</strong></span>
          </div>
          <div style={{ display: 'grid', gap: 8 }}>{selectedTransactions.map((transaction) => <TransactionRow key={transaction.id} transaction={transaction} onDelete={handleDeleteTransaction} />)}</div>

          <div style={{ ...cardStyle, maxHeight: 260, overflowY: 'auto', padding: 10 }}>
            {groupedByDate.map(([date, items]) => {
              const dayIn = items.filter((transaction) => transaction.direction === 'in').reduce((sum, transaction) => sum + transaction.amount, 0)
              const dayOut = items.filter((transaction) => transaction.direction === 'out').reduce((sum, transaction) => sum + transaction.amount, 0)
              const hasUnclassified = items.some((transaction) => transaction.category === 'unclassified')
              return (
                <button key={date} type="button" className="ghost-button" onClick={() => setSelectedDate(date)} style={{ display: 'flex', width: '100%', justifyContent: 'space-between', padding: '8px 6px' }}>
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
          <div style={{ ...shellStyle, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <div>
              <div style={{ color: 'var(--muted)' }}>Monthly Burn</div>
              <div style={{ color: '#8B5CF6', fontFamily: 'JetBrains Mono, ui-monospace, SFMono-Regular, Menlo, monospace' }}>{formatMoney(subBurn)}</div>
            </div>
            <button type="button" className="primary-button" onClick={() => setSubscriptionModalOpen(true)}>+ Subscription</button>
          </div>

          <div style={{ display: 'grid', gap: 8 }}>
            {subscriptions.map((subscription) => (
              <div key={subscription.id} style={{ ...cardStyle, padding: 10, display: 'grid', gridTemplateColumns: '1fr auto auto auto', alignItems: 'center', gap: 10 }}>
                <div>
                  <div>{subscription.name}</div>
                  <div style={{ color: 'var(--muted)', fontSize: 12 }}>{subscription.platform} · {subscription.frequency}</div>
                </div>
                <div style={{ fontFamily: 'JetBrains Mono, ui-monospace, SFMono-Regular, Menlo, monospace' }}>{formatMoney(subscription.amount)}</div>
                <button type="button" className="secondary-button" onClick={async () => { await updateSubscription(subscription.id, { active: !subscription.active }); await reloadData() }}>{subscription.active ? 'Active' : 'Off'}</button>
                <button type="button" className="ghost-button" onClick={async () => { await deleteSubscription(subscription.id); await reloadData() }}>Delete</button>
              </div>
            ))}
          </div>

          <div style={cardStyle}>
            <h3 style={{ margin: '0 0 8px 0' }}>Learned Patterns</h3>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
              {patterns.map((pattern) => (
                <span key={pattern.id} style={{ border: `1px solid ${CATEGORY_COLORS[pattern.category]}66`, color: CATEGORY_COLORS[pattern.category], background: `${CATEGORY_COLORS[pattern.category]}26`, borderRadius: 999, padding: '4px 10px', fontSize: 12 }}>
                  {pattern.pattern}
                </span>
              ))}
            </div>
          </div>
        </section>
      ) : null}

      {tab === 'triage' ? (
        <section style={{ display: 'grid', gap: 12 }}>
          {unclassified.length === 0
            ? <div style={{ border: '1px solid #10B98188', background: '#10B98126', borderRadius: 10, padding: 12 }}>✅ All Clear</div>
            : unclassified.map((transaction) => (
                <TransactionRow key={transaction.id} transaction={transaction} onDelete={handleDeleteTransaction} onClassify={(id) => setTriageTarget(transactions.find((candidate) => candidate.id === id) ?? null)} />
              ))}
        </section>
      ) : null}

      {tab === 'search' ? (
        <section style={{ display: 'grid', gap: 12 }}>
          <input type="search" className="search-input" placeholder="Search descriptions..." value={searchQuery} onChange={(event) => setSearchQuery(event.target.value)} />
          <div style={{ display: 'grid', gap: 8 }}>
            {searchResults.map((transaction) => (
              <div key={transaction.id} style={cardStyle}>
                <span style={{ color: 'var(--muted)' }}>{transaction.date} — </span>
                <span>{transaction.description}</span>
              </div>
            ))}
          </div>
        </section>
      ) : null}

      {triageTarget ? (
        <div className="modal-backdrop" role="dialog" aria-modal="true">
          <div className="modal-card" style={{ ...cardStyle, maxWidth: 520, background: 'var(--bg-surface, #111827)' }}>
            <h3 style={{ marginTop: 0 }}>Classify transaction</h3>
            <p><strong>{triageTarget.description}</strong></p>
            <p style={{ color: 'var(--muted)' }}>{triageTarget.date} · {triageTarget.direction === 'out' ? 'Out' : 'In'} · <span style={{ fontFamily: 'JetBrains Mono, ui-monospace, SFMono-Regular, Menlo, monospace' }}>{formatMoney(triageTarget.amount)}</span></p>
            <div style={{ display: 'grid', gap: 8 }}>
              <button type="button" className="secondary-button" onClick={() => void onClassifyCategory('subscription')}>🔄 Subscription (recurring tool/service)</button>
              <button type="button" className="secondary-button" onClick={() => void onClassifyCategory('salary')}>👤 Salary / Payroll</button>
              <button type="button" className="secondary-button" onClick={() => void onClassifyCategory('ad_spend')}>📢 Ad Spend (Meta, Google, etc.)</button>
              <button type="button" className="secondary-button" onClick={() => void onClassifyCategory('one_time')}>📌 One-Time Expense</button>
              <button type="button" className="secondary-button" onClick={() => void onClassifyCategory('cogs')}>📦 COGS / Product Cost</button>
              <button type="button" className="secondary-button" onClick={() => void onClassifyCategory('revenue')}>💰 Revenue</button>
              <button type="button" className="secondary-button" onClick={() => void onClassifyCategory('refund')}>↩️ Refund</button>
            </div>
            <div style={{ marginTop: 12 }}>
              <button type="button" className="ghost-button" onClick={() => setTriageTarget(null)}>Close</button>
            </div>
          </div>
        </div>
      ) : null}

      {subscriptionModalOpen ? (
        <div className="modal-backdrop" role="dialog" aria-modal="true">
          <div className="modal-card" style={{ ...cardStyle, maxWidth: 460, background: 'var(--bg-surface, #111827)' }}>
            <h3 style={{ marginTop: 0 }}>New Subscription</h3>
            <div style={{ display: 'grid', gap: 10 }}>
              <input className="search-input" placeholder="Name" value={subName} onChange={(event) => setSubName(event.target.value)} />
              <input className="search-input" placeholder="Amount" inputMode="decimal" value={subAmount} onChange={(event) => setSubAmount(event.target.value)} />
              <select className="search-input" value={subFrequency} onChange={(event) => setSubFrequency(event.target.value as SubscriptionFrequency)}>
                <option value="weekly">weekly</option>
                <option value="monthly">monthly</option>
                <option value="yearly">yearly</option>
              </select>
              <input className="search-input" placeholder="Platform / Category" value={subPlatform} onChange={(event) => setSubPlatform(event.target.value)} />
            </div>
            <div style={{ display: 'flex', gap: 8, marginTop: 12 }}>
              <button type="button" className="primary-button" onClick={() => void saveSubscription()}>Save</button>
              <button type="button" className="ghost-button" onClick={() => setSubscriptionModalOpen(false)}>Cancel</button>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  )
}
