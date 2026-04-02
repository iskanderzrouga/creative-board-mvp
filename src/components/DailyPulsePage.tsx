import { useMemo, type ReactNode } from 'react'
import type { DailyPulseFeedItem } from '../board'

interface DailyPulsePageProps {
  timezone: string
  selectedDate: string
  personFilter: string
  peopleOptions: string[]
  feedItems: DailyPulseFeedItem[]
  loading: boolean
  errorMessage: string | null
  headerUtilityContent?: ReactNode
  onDateChange: (date: string) => void
  onPersonFilterChange: (value: string) => void
}

function formatSubmissionTime(value: string, timezone: string) {
  return new Intl.DateTimeFormat('en-US', {
    timeZone: timezone,
    hour: 'numeric',
    minute: '2-digit',
  }).format(new Date(value))
}

export function DailyPulsePage({
  timezone,
  selectedDate,
  personFilter,
  peopleOptions,
  feedItems,
  loading,
  errorMessage,
  headerUtilityContent,
  onDateChange,
  onPersonFilterChange,
}: DailyPulsePageProps) {
  const visibleItems = useMemo(() => {
    if (personFilter === 'all') {
      return feedItems
    }

    return feedItems.filter((item) => item.member.name === personFilter)
  }, [feedItems, personFilter])

  return (
    <div className="page-shell pulse-page-shell" style={{ color: '#1a1a1a' }}>
      <div className="page-header">
        <div>
          <h1 style={{ color: '#1a1a1a' }}>Daily Pulse</h1>
        </div>
        <div className="page-header-actions">{headerUtilityContent}</div>
      </div>
      <p className="pulse-subtitle" style={{ color: '#1a1a1a' }}>
        See what everyone is working on today.
      </p>

      <section className="pulse-controls">
        <label className="pulse-control-field">
          <span style={{ color: '#1a1a1a' }}>Date</span>
          <input
            className="inline-input"
            type="date"
            value={selectedDate}
            onChange={(event) => onDateChange(event.target.value)}
            style={{ color: '#1a1a1a' }}
          />
        </label>

        <label className="pulse-control-field">
          <span style={{ color: '#1a1a1a' }}>Person</span>
          <select
            className="inline-select"
            value={personFilter}
            onChange={(event) => onPersonFilterChange(event.target.value)}
            style={{ color: '#1a1a1a' }}
          >
            <option value="all" style={{ color: '#1a1a1a' }}>
              All
            </option>
            {peopleOptions.map((name) => (
              <option key={name} value={name} style={{ color: '#1a1a1a' }}>
                {name}
              </option>
            ))}
          </select>
        </label>
      </section>

      <section className="pulse-feed" aria-live="polite">
        {loading ? (
          <div className="dashboard-placeholder pulse-placeholder" style={{ color: '#1a1a1a' }}>
            Loading daily check-ins…
          </div>
        ) : null}
        {!loading && errorMessage ? (
          <div className="dashboard-placeholder pulse-placeholder" style={{ color: '#1a1a1a' }}>
            {errorMessage}
          </div>
        ) : null}

        {!loading && !errorMessage && visibleItems.length === 0 ? (
          <div className="dashboard-placeholder pulse-placeholder" style={{ color: '#1a1a1a' }}>
            No team members match this filter.
          </div>
        ) : null}

        {!loading && !errorMessage
          ? visibleItems.map((item) =>
              item.checkin ? (
                <article key={`${item.member.name}-${item.checkin.id}`} className="pulse-card">
                  <header className="pulse-card-header">
                    <h3 style={{ color: '#1a1a1a' }}>{item.member.name}</h3>
                    <span style={{ color: '#1a1a1a' }}>{formatSubmissionTime(item.checkin.created_at, timezone)}</span>
                  </header>
                  <dl className="pulse-card-content">
                    <div>
                      <dt style={{ color: '#1a1a1a' }}>What did you work on yesterday?</dt>
                      <dd style={{ color: '#1a1a1a' }}>{item.checkin.yesterday_work}</dd>
                    </div>
                    <div>
                      <dt style={{ color: '#1a1a1a' }}>What are you working on today?</dt>
                      <dd style={{ color: '#1a1a1a' }}>{item.checkin.today_plan}</dd>
                    </div>
                    <div>
                      <dt style={{ color: '#1a1a1a' }}>Any blockers or roadblocks?</dt>
                      <dd style={{ color: '#1a1a1a' }}>
                        {item.checkin.blockers?.trim() ? item.checkin.blockers : 'No blockers reported.'}
                      </dd>
                    </div>
                  </dl>
                </article>
              ) : (
                <article key={`${item.member.name}-missing`} className="pulse-card is-missing">
                  <header className="pulse-card-header">
                    <h3 style={{ color: '#1a1a1a' }}>{item.member.name}</h3>
                  </header>
                  <p className="pulse-missing-copy" style={{ color: '#1a1a1a' }}>
                    Not yet checked in
                  </p>
                </article>
              ),
            )
          : null}
      </section>
    </div>
  )
}
