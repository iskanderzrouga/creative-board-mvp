import { useMemo, useState } from 'react'
import type { DailyCheckinFormValues } from '../board'

interface CheckinTaskSummaryItem {
  id: string
  title: string
  stage: string
}

interface DailyCheckinModalProps {
  dateLabel: string
  yesterdayPlan: string | null
  creativeBoardTasks: CheckinTaskSummaryItem[]
  devBoardTasks: CheckinTaskSummaryItem[]
  submitting: boolean
  errorMessage: string | null
  onSubmit: (values: DailyCheckinFormValues) => Promise<void>
}

export function DailyCheckinModal({
  dateLabel,
  yesterdayPlan,
  creativeBoardTasks,
  devBoardTasks,
  submitting,
  errorMessage,
  onSubmit,
}: DailyCheckinModalProps) {
  const [values, setValues] = useState<DailyCheckinFormValues>({
    yesterdayWork: '',
    todayPlan: '',
    blockers: '',
  })

  const resolvedDateLabel = useMemo(() => {
    const label = dateLabel.trim()
    if (label) {
      return label
    }

    return new Date().toLocaleDateString('en-US', {
      weekday: 'long',
      year: 'numeric',
      month: 'long',
      day: 'numeric',
      timeZone: Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC',
    })
  }, [dateLabel])

  const submitDisabled = useMemo(
    () =>
      submitting ||
      values.yesterdayWork.trim().length === 0 ||
      values.todayPlan.trim().length === 0,
    [submitting, values.todayPlan, values.yesterdayWork],
  )
  const hasAssignedTasks = creativeBoardTasks.length > 0 || devBoardTasks.length > 0

  return (
    <div
      className="daily-checkin-overlay"
      role="dialog"
      aria-modal="true"
      aria-labelledby="daily-checkin-title"
      style={{
        position: 'fixed',
        inset: 0,
        background: 'rgba(0,0,0,0.5)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        zIndex: 9999,
      }}
    >
      <section
        className="daily-checkin-modal"
        style={{
          background: '#ffffff',
          borderRadius: '16px',
          padding: '32px',
          maxWidth: '560px',
          width: '90%',
          boxShadow: '0 8px 32px rgba(0,0,0,0.12)',
        }}
      >
        <div style={{ color: '#1a1a1a', background: '#ffffff' }}>
          <header className="daily-checkin-header">
            <h1 id="daily-checkin-title" style={{ color: '#1a1a1a' }}>
              Daily Check-in
            </h1>
            <p style={{ color: '#1a1a1a' }}>{resolvedDateLabel}</p>
          </header>

          {yesterdayPlan ? (
            <section className="daily-checkin-yesterday" aria-live="polite">
              <h2 style={{ color: '#1a1a1a' }}>Yesterday you planned to work on:</h2>
              <p style={{ color: '#1a1a1a' }}>{yesterdayPlan}</p>
            </section>
          ) : null}

          <section
            aria-live="polite"
            style={{
              color: '#1a1a1a',
              marginBottom: '20px',
              border: '1px solid #d1d5db',
              borderRadius: '10px',
              padding: '12px',
              background: '#f9fafb',
              maxHeight: '190px',
              overflowY: 'auto',
            }}
          >
            <h2 style={{ color: '#1a1a1a', fontSize: '16px', margin: '0 0 8px 0' }}>Your current tasks:</h2>
            {hasAssignedTasks ? (
              <>
                {creativeBoardTasks.length > 0 ? (
                  <div style={{ marginBottom: devBoardTasks.length > 0 ? '10px' : 0 }}>
                    <h3 style={{ color: '#1a1a1a', fontSize: '14px', margin: '0 0 6px 0' }}>Creative Board</h3>
                    <ul style={{ margin: 0, paddingLeft: '18px' }}>
                      {creativeBoardTasks.map((task) => (
                        <li key={`creative-${task.id}`} style={{ color: '#1a1a1a', marginBottom: '6px' }}>
                          <div style={{ color: '#1a1a1a', fontSize: '13px', lineHeight: 1.35 }}>
                            <strong style={{ color: '#1a1a1a' }}>{task.id}</strong> — {task.title} · {task.stage}
                            <span
                              style={{
                                color: '#1a1a1a',
                                fontSize: '11px',
                                border: '1px solid #9ca3af',
                                borderRadius: '999px',
                                padding: '1px 6px',
                                marginLeft: '8px',
                                background: '#ffffff',
                              }}
                            >
                              Creative
                            </span>
                          </div>
                        </li>
                      ))}
                    </ul>
                  </div>
                ) : null}

                {devBoardTasks.length > 0 ? (
                  <div>
                    <h3 style={{ color: '#1a1a1a', fontSize: '14px', margin: '0 0 6px 0' }}>Dev Board</h3>
                    <ul style={{ margin: 0, paddingLeft: '18px' }}>
                      {devBoardTasks.map((task) => (
                        <li key={`dev-${task.id}`} style={{ color: '#1a1a1a', marginBottom: '6px' }}>
                          <div style={{ color: '#1a1a1a', fontSize: '13px', lineHeight: 1.35 }}>
                            <strong style={{ color: '#1a1a1a' }}>{task.id}</strong> — {task.title} · {task.stage}
                            <span
                              style={{
                                color: '#1a1a1a',
                                fontSize: '11px',
                                border: '1px solid #9ca3af',
                                borderRadius: '999px',
                                padding: '1px 6px',
                                marginLeft: '8px',
                                background: '#ffffff',
                              }}
                            >
                              Dev
                            </span>
                          </div>
                        </li>
                      ))}
                    </ul>
                  </div>
                ) : null}
              </>
            ) : (
              <p style={{ color: '#1a1a1a', margin: 0 }}>No cards currently assigned to you.</p>
            )}
          </section>

          <label className="daily-checkin-field" style={{ color: '#1a1a1a' }}>
            <span style={{ color: '#1a1a1a' }}>What did you work on yesterday?</span>
            <textarea
              style={{ color: '#1a1a1a', background: '#ffffff', border: '1px solid #999' }}
              value={values.yesterdayWork}
              onChange={(event) => setValues((current) => ({ ...current, yesterdayWork: event.target.value }))}
              rows={4}
              required
              disabled={submitting}
            />
          </label>

          <label className="daily-checkin-field" style={{ color: '#1a1a1a' }}>
            <span style={{ color: '#1a1a1a' }}>What are you working on today?</span>
            <textarea
              style={{ color: '#1a1a1a', background: '#ffffff', border: '1px solid #999' }}
              value={values.todayPlan}
              onChange={(event) => setValues((current) => ({ ...current, todayPlan: event.target.value }))}
              rows={4}
              required
              disabled={submitting}
            />
          </label>

          <label className="daily-checkin-field" style={{ color: '#1a1a1a' }}>
            <span style={{ color: '#1a1a1a' }}>Any blockers or roadblocks?</span>
            <textarea
              style={{ color: '#1a1a1a', background: '#ffffff', border: '1px solid #999' }}
              value={values.blockers}
              onChange={(event) => setValues((current) => ({ ...current, blockers: event.target.value }))}
              rows={3}
              disabled={submitting}
            />
          </label>

          {errorMessage ? (
            <p className="daily-checkin-error" style={{ color: '#1a1a1a' }}>
              {errorMessage}
            </p>
          ) : null}

          <div className="daily-checkin-actions">
            <button
              type="button"
              className="primary-button"
              style={{
                color: '#ffffff',
                background: '#4f46e5',
                border: 'none',
                padding: '12px 32px',
                borderRadius: '8px',
                fontSize: '16px',
                fontWeight: 600,
                cursor: 'pointer',
              }}
              disabled={submitDisabled}
              onClick={() => {
                void onSubmit(values)
              }}
            >
              {submitting ? 'Submitting…' : 'Submit'}
            </button>
          </div>
        </div>
      </section>
    </div>
  )
}
