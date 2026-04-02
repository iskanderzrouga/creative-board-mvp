import { useMemo, useState } from 'react'
import type { DailyCheckinFormValues } from '../board'

interface DailyCheckinModalProps {
  dateLabel: string
  yesterdayPlan: string | null
  submitting: boolean
  errorMessage: string | null
  onSubmit: (values: DailyCheckinFormValues) => Promise<void>
}

export function DailyCheckinModal({
  dateLabel,
  yesterdayPlan,
  submitting,
  errorMessage,
  onSubmit,
}: DailyCheckinModalProps) {
  const [values, setValues] = useState<DailyCheckinFormValues>({
    yesterdayWork: '',
    todayPlan: '',
    blockers: '',
  })

  const submitDisabled = useMemo(
    () =>
      submitting ||
      values.yesterdayWork.trim().length === 0 ||
      values.todayPlan.trim().length === 0,
    [submitting, values.todayPlan, values.yesterdayWork],
  )

  return (
    <div className="daily-checkin-overlay" role="dialog" aria-modal="true" aria-labelledby="daily-checkin-title">
      <section className="daily-checkin-modal">
        <header className="daily-checkin-header">
          <h1 id="daily-checkin-title">Daily Check-in</h1>
          <p>{dateLabel}</p>
        </header>

        {yesterdayPlan ? (
          <section className="daily-checkin-yesterday" aria-live="polite">
            <h2>Yesterday you planned to work on:</h2>
            <p>{yesterdayPlan}</p>
          </section>
        ) : null}

        <label className="daily-checkin-field">
          <span>What did you work on yesterday?</span>
          <textarea
            value={values.yesterdayWork}
            onChange={(event) => setValues((current) => ({ ...current, yesterdayWork: event.target.value }))}
            rows={4}
            required
            disabled={submitting}
          />
        </label>

        <label className="daily-checkin-field">
          <span>What are you working on today?</span>
          <textarea
            value={values.todayPlan}
            onChange={(event) => setValues((current) => ({ ...current, todayPlan: event.target.value }))}
            rows={4}
            required
            disabled={submitting}
          />
        </label>

        <label className="daily-checkin-field">
          <span>Any blockers or roadblocks?</span>
          <textarea
            value={values.blockers}
            onChange={(event) => setValues((current) => ({ ...current, blockers: event.target.value }))}
            rows={3}
            disabled={submitting}
          />
        </label>

        {errorMessage ? <p className="daily-checkin-error">{errorMessage}</p> : null}

        <div className="daily-checkin-actions">
          <button
            type="button"
            className="primary-button daily-checkin-submit-button"
            disabled={submitDisabled}
            onClick={() => {
              void onSubmit(values)
            }}
          >
            {submitting ? 'Submitting…' : 'Submit'}
          </button>
        </div>
      </section>
    </div>
  )
}
