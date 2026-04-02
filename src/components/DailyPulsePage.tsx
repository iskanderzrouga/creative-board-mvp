import { useMemo, type ReactNode } from 'react'
import { PageHeader } from './PageHeader'
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
    <div className="page-shell pulse-page-shell">
      <PageHeader title="Daily Pulse" rightContent={headerUtilityContent} />
      <p className="pulse-subtitle">See what everyone is working on today.</p>

      <section className="pulse-controls">
        <label className="pulse-control-field">
          <span>Date</span>
          <input
            className="inline-input"
            type="date"
            value={selectedDate}
            onChange={(event) => onDateChange(event.target.value)}
          />
        </label>

        <label className="pulse-control-field">
          <span>Person</span>
          <select
            className="inline-select"
            value={personFilter}
            onChange={(event) => onPersonFilterChange(event.target.value)}
          >
            <option value="all">All</option>
            {peopleOptions.map((name) => (
              <option key={name} value={name}>
                {name}
              </option>
            ))}
          </select>
        </label>
      </section>

      <section className="pulse-feed" aria-live="polite">
        {loading ? <div className="dashboard-placeholder pulse-placeholder">Loading daily check-ins…</div> : null}
        {!loading && errorMessage ? <div className="dashboard-placeholder pulse-placeholder">{errorMessage}</div> : null}

        {!loading && !errorMessage && visibleItems.length === 0 ? (
          <div className="dashboard-placeholder pulse-placeholder">No team members match this filter.</div>
        ) : null}

        {!loading && !errorMessage
          ? visibleItems.map((item) =>
              item.checkin ? (
                <article key={`${item.member.name}-${item.checkin.id}`} className="pulse-card">
                  <header className="pulse-card-header">
                    <h3>{item.member.name}</h3>
                    <span>{formatSubmissionTime(item.checkin.created_at, timezone)}</span>
                  </header>
                  <dl className="pulse-card-content">
                    <div>
                      <dt>What did you work on yesterday?</dt>
                      <dd>{item.checkin.yesterday_work}</dd>
                    </div>
                    <div>
                      <dt>What are you working on today?</dt>
                      <dd>{item.checkin.today_plan}</dd>
                    </div>
                    <div>
                      <dt>Any blockers or roadblocks?</dt>
                      <dd>{item.checkin.blockers?.trim() ? item.checkin.blockers : 'No blockers reported.'}</dd>
                    </div>
                  </dl>
                </article>
              ) : (
                <article key={`${item.member.name}-missing`} className="pulse-card is-missing">
                  <header className="pulse-card-header">
                    <h3>{item.member.name}</h3>
                  </header>
                  <p className="pulse-missing-copy">Not yet checked in</p>
                </article>
              ),
            )
          : null}
      </section>
    </div>
  )
}
