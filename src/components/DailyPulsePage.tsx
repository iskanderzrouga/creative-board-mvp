import { useMemo, useState, type ReactNode } from 'react'
import { PageHeader } from './PageHeader'
import type { DailyPulseFeedItem } from '../board'
import {
  normalizeDailyPulseRange,
  type DailyPulseDateRange,
} from '../dailyCheckins'

interface DailyPulsePageProps {
  timezone: string
  selectedRange: DailyPulseDateRange
  todayDate: string
  personFilter: string
  peopleOptions: string[]
  feedItems: DailyPulseFeedItem[]
  loading: boolean
  errorMessage: string | null
  headerUtilityContent?: ReactNode
  onDateRangeChange: (range: DailyPulseDateRange) => void
  onPersonFilterChange: (value: string) => void
}

type DatePreset =
  | 'today'
  | 'yesterday'
  | 'last7'
  | 'last14'
  | 'thisWeek'
  | 'lastWeek'
  | 'custom'

const DATE_PRESETS: Array<{ value: DatePreset; label: string }> = [
  { value: 'today', label: 'Today' },
  { value: 'yesterday', label: 'Yesterday' },
  { value: 'last7', label: 'Last 7 days' },
  { value: 'last14', label: 'Last 14 days' },
  { value: 'thisWeek', label: 'This week' },
  { value: 'lastWeek', label: 'Last week' },
  { value: 'custom', label: 'Custom' },
]

function toIsoDate(date: Date) {
  const year = date.getFullYear()
  const month = String(date.getMonth() + 1).padStart(2, '0')
  const day = String(date.getDate()).padStart(2, '0')
  return `${year}-${month}-${day}`
}

function addDays(value: string, days: number) {
  const date = new Date(`${value}T00:00:00`)
  date.setDate(date.getDate() + days)
  return toIsoDate(date)
}

function getFallbackToday() {
  return toIsoDate(new Date())
}

function getPresetRange(preset: DatePreset, anchorDate: string): DailyPulseDateRange {
  const safeAnchorDate = anchorDate || getFallbackToday()
  const date = new Date(`${safeAnchorDate}T00:00:00`)
  const day = date.getDay()

  switch (preset) {
    case 'today':
      return { from: safeAnchorDate, to: safeAnchorDate }
    case 'yesterday': {
      const yesterday = addDays(safeAnchorDate, -1)
      return { from: yesterday, to: yesterday }
    }
    case 'last7':
      return { from: addDays(safeAnchorDate, -6), to: safeAnchorDate }
    case 'last14':
      return { from: addDays(safeAnchorDate, -13), to: safeAnchorDate }
    case 'thisWeek':
      return { from: addDays(safeAnchorDate, -day), to: safeAnchorDate }
    case 'lastWeek': {
      const end = addDays(safeAnchorDate, -(day + 1))
      return { from: addDays(end, -6), to: end }
    }
    case 'custom':
      return { from: safeAnchorDate, to: safeAnchorDate }
    default:
      return { from: safeAnchorDate, to: safeAnchorDate }
  }
}

function getPresetLabel(preset: DatePreset) {
  return DATE_PRESETS.find((item) => item.value === preset)?.label ?? 'Custom'
}

function formatShortDate(value: string) {
  const parsed = new Date(`${value}T12:00:00Z`)
  if (Number.isNaN(parsed.getTime())) {
    return value
  }

  return parsed.toLocaleDateString('en-US', { timeZone: 'UTC', month: 'short', day: 'numeric' })
}

function formatRangeLabel(range: DailyPulseDateRange) {
  if (range.from === range.to) {
    return formatShortDate(range.from)
  }

  return `${formatShortDate(range.from)} - ${formatShortDate(range.to)}`
}

function formatDayLabel(value: string) {
  const parsed = new Date(`${value}T12:00:00Z`)
  if (Number.isNaN(parsed.getTime())) {
    return value
  }

  return parsed.toLocaleDateString('en-US', {
    timeZone: 'UTC',
    weekday: 'long',
    month: 'long',
    day: 'numeric',
  })
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
  selectedRange,
  todayDate,
  personFilter,
  peopleOptions,
  feedItems,
  loading,
  errorMessage,
  headerUtilityContent,
  onDateRangeChange,
  onPersonFilterChange,
}: DailyPulsePageProps) {
  const [datePreset, setDatePreset] = useState<DatePreset>('today')
  const [pickerOpen, setPickerOpen] = useState(false)
  const [draftPreset, setDraftPreset] = useState<DatePreset>('today')
  const [draftRange, setDraftRange] = useState<DailyPulseDateRange>(selectedRange)
  const normalizedSelectedRange = normalizeDailyPulseRange(selectedRange)
  const visibleItems = useMemo(() => {
    if (personFilter === 'all') {
      return feedItems
    }

    return feedItems.filter((item) => item.member.name === personFilter)
  }, [feedItems, personFilter])
  const groupedDays = useMemo(() => {
    const byDate = new Map<string, DailyPulseFeedItem[]>()

    visibleItems.forEach((item) => {
      const group = byDate.get(item.date) ?? []
      group.push(item)
      byDate.set(item.date, group)
    })

    return Array.from(byDate.entries())
      .sort(([left], [right]) => right.localeCompare(left))
      .map(([date, items]) => ({
        date,
        submittedItems: items.filter((item) => item.checkin),
        missingItems: items.filter((item) => !item.checkin),
      }))
  }, [visibleItems])

  const openDatePicker = () => {
    setDraftPreset(datePreset)
    setDraftRange(normalizedSelectedRange)
    setPickerOpen(true)
  }

  const applyDatePicker = () => {
    const nextRange = normalizeDailyPulseRange(
      draftPreset === 'custom' ? draftRange : getPresetRange(draftPreset, todayDate),
    )
    setDatePreset(draftPreset)
    setPickerOpen(false)
    onDateRangeChange(nextRange)
  }

  return (
    <div className="page-shell pulse-page-shell">
      <PageHeader title="Daily Pulse" rightContent={headerUtilityContent} />

      <section className="pulse-toolbar" aria-label="Daily Pulse filters">
        <p className="pulse-subtitle">See what everyone is working on today.</p>

        <div className="pulse-controls">
          <div className="pulse-control-field pulse-date-picker">
            <span>Date range</span>
            <button className="pulse-date-trigger" type="button" onClick={openDatePicker}>
              {getPresetLabel(datePreset)} · {formatRangeLabel(normalizedSelectedRange)}
            </button>

            {pickerOpen ? (
              <div className="pulse-date-popover" role="dialog" aria-label="Daily Pulse date range">
                <div className="pulse-date-preset-grid">
                  {DATE_PRESETS.map((preset) => (
                    <button
                      key={preset.value}
                      type="button"
                      className={draftPreset === preset.value ? 'is-active' : ''}
                      onClick={() => {
                        setDraftPreset(preset.value)
                        setDraftRange(getPresetRange(preset.value, todayDate))
                      }}
                    >
                      {preset.label}
                    </button>
                  ))}
                </div>

                <div className="pulse-date-inputs">
                  <label>
                    <span>From</span>
                    <input
                      type="date"
                      value={draftRange.from}
                      onChange={(event) => {
                        setDraftPreset('custom')
                        setDraftRange((current) => ({ ...current, from: event.target.value }))
                      }}
                    />
                  </label>
                  <label>
                    <span>To</span>
                    <input
                      type="date"
                      value={draftRange.to}
                      onChange={(event) => {
                        setDraftPreset('custom')
                        setDraftRange((current) => ({ ...current, to: event.target.value }))
                      }}
                    />
                  </label>
                </div>

                <div className="pulse-date-actions">
                  <button type="button" onClick={() => setPickerOpen(false)}>
                    Cancel
                  </button>
                  <button type="button" className="is-primary" onClick={applyDatePicker}>
                    Apply
                  </button>
                </div>
              </div>
            ) : null}
          </div>

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
        </div>
      </section>

      <section className="pulse-feed" aria-live="polite">
        {loading ? (
          <div className="dashboard-placeholder">Loading daily check-ins…</div>
        ) : null}
        {!loading && errorMessage ? (
          <div className="dashboard-placeholder">{errorMessage}</div>
        ) : null}

        {!loading && !errorMessage && visibleItems.length === 0 ? (
          <div className="dashboard-placeholder">No team members match this filter.</div>
        ) : null}

        {!loading && !errorMessage
          ? groupedDays.map((group) => (
              <section key={group.date} className="pulse-day-group">
                <header className="pulse-day-header">
                  <h2>{formatDayLabel(group.date)}</h2>
                  <span>
                    {group.submittedItems.length} checked in · {group.missingItems.length} pending
                  </span>
                </header>

                {group.submittedItems.map((item) => {
                  if (!item.checkin) {
                    return null
                  }

                  return (
                    <article key={`${item.date}-${item.member.name}-${item.checkin.id}`} className="pulse-card">
                      <header className="pulse-card-header">
                        <h3>{item.member.name}</h3>
                        <span>{formatSubmissionTime(item.checkin.created_at, timezone)}</span>
                      </header>
                      <dl className="pulse-card-content">
                        <div className="pulse-answer-row">
                          <dt>What did you work on yesterday?</dt>
                          <dd>{item.checkin.yesterday_work}</dd>
                        </div>
                        <div className="pulse-answer-row">
                          <dt>What are you working on today?</dt>
                          <dd>{item.checkin.today_plan}</dd>
                        </div>
                        <div className="pulse-answer-row">
                          <dt>Any blockers or roadblocks?</dt>
                          <dd>{item.checkin.blockers?.trim() ? item.checkin.blockers : 'No blockers reported.'}</dd>
                        </div>
                      </dl>
                    </article>
                  )
                })}

                {group.missingItems.length > 0 ? (
                  <div className="pulse-missing-grid">
                    {group.missingItems.map((item) => (
                      <article key={`${item.date}-${item.member.name}-missing`} className="pulse-missing-card">
                        <h3>{item.member.name}</h3>
                        <p>Not yet checked in</p>
                      </article>
                    ))}
                  </div>
                ) : null}
              </section>
            ))
          : null}
      </section>
    </div>
  )
}
