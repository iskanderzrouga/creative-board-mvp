import { useMemo, useState } from 'react'
import type { RoleMode, StrategyCycle, StrategyCycleConclusion, StrategyCycleKPI, StrategyCycleLever } from '../board'

interface StrategyCyclesPageProps {
  cycles: StrategyCycle[]
  roleMode: RoleMode
  currentUserEmail: string | null
  currentUserName: string | null
  headerUtilityContent?: React.ReactNode
  onCreateCycle: (input: { name: string; startDate: string; endDate: string }) => void
  onUpdateCycle: (cycleId: string, updater: (cycle: StrategyCycle) => StrategyCycle) => void
}

interface LeaderProfile {
  name: string
  email: string
  keys: string[]
}

const LEADERS: LeaderProfile[] = [
  { name: 'Iskander', email: 'iskander@creativeboard.local', keys: ['iskander'] },
  { name: 'Naomi', email: 'naomi@creativeboard.local', keys: ['naomi'] },
  { name: 'Nicolas', email: 'nicolas@creativeboard.local', keys: ['nicolas'] },
]

const promptText = "What went well? What didn't? How close are we to the goal? Key takeaways."

function formatRange(startDate: string, endDate: string) {
  const start = new Date(startDate)
  const end = new Date(endDate)
  return `${start.toLocaleDateString(undefined, { month: 'short', day: 'numeric' })} – ${end.toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' })}`
}

function buildDefaultKpi(index: number): StrategyCycleKPI {
  return {
    id: `kpi-${Date.now()}-${Math.random().toString(36).slice(2, 8)}-${index}`,
    description: '',
    target: 0,
    actual: 0,
  }
}

function buildDefaultLever(index: number): StrategyCycleLever {
  return {
    id: `lever-${Date.now()}-${Math.random().toString(36).slice(2, 8)}-${index}`,
    name: `Lever ${index + 1}`,
    objective: '',
    kpis: [buildDefaultKpi(1), buildDefaultKpi(2), buildDefaultKpi(3)],
  }
}

function getProgressTone(actual: number, target: number) {
  if (target <= 0) {
    return { tone: 'red', pct: 0 }
  }
  const pct = Math.max(0, Math.min(100, (actual / target) * 100))
  if (actual >= target) {
    return { tone: 'green', pct }
  }
  if (actual > target * 0.5) {
    return { tone: 'yellow', pct }
  }
  return { tone: 'red', pct }
}

function getDaysLabel(startDate: string, endDate: string) {
  const today = new Date()
  const start = new Date(startDate)
  const end = new Date(endDate)
  const totalDays = Math.max(1, Math.ceil((end.getTime() - start.getTime()) / 86400000) + 1)
  const elapsed = Math.floor((today.getTime() - start.getTime()) / 86400000) + 1
  const remaining = Math.ceil((end.getTime() - today.getTime()) / 86400000)

  if (elapsed > 0 && remaining >= 0) {
    return `Day ${Math.min(elapsed, totalDays)} of ${totalDays}`
  }

  if (remaining >= 0) {
    return `${remaining} days remaining`
  }

  return `Completed ${Math.abs(remaining)} days ago`
}

function isLeaderIdentityMatch(leader: LeaderProfile, email: string | null, name: string | null) {
  const normalizedEmail = email?.trim().toLowerCase() ?? ''
  const normalizedName = name?.trim().toLowerCase() ?? ''
  const localPart = normalizedEmail.split('@')[0] ?? ''
  return leader.keys.some((key) => normalizedName.includes(key) || localPart.includes(key))
}

function getConclusion(cycle: StrategyCycle, leader: LeaderProfile): StrategyCycleConclusion {
  return (
    cycle.conclusions.find((entry) => entry.authorEmail === leader.email) ?? {
      authorEmail: leader.email,
      authorName: leader.name,
      text: '',
      updatedAt: cycle.createdAt,
    }
  )
}

function getPastCycleSummary(cycle: StrategyCycle) {
  const kpis = cycle.levers.flatMap((lever) => lever.kpis)
  const met = kpis.filter((kpi) => kpi.target > 0 && kpi.actual >= kpi.target).length
  const withConclusions = cycle.conclusions.filter((entry) => entry.text.trim().length > 0).length
  return `${met}/${kpis.length} KPIs hit • ${withConclusions}/3 conclusions completed`
}

export function StrategyCyclesPage({
  cycles,
  roleMode,
  currentUserEmail,
  currentUserName,
  headerUtilityContent,
  onCreateCycle,
  onUpdateCycle,
}: StrategyCyclesPageProps) {
  const [selectedPastCycleId, setSelectedPastCycleId] = useState<string | null>(null)
  const [newCycleOpen, setNewCycleOpen] = useState(false)
  const [objectiveEditing, setObjectiveEditing] = useState(false)
  const [newCycleName, setNewCycleName] = useState('')
  const [newCycleStart, setNewCycleStart] = useState(() => new Date().toISOString().slice(0, 10))
  const [newCycleEnd, setNewCycleEnd] = useState(() => {
    const start = new Date()
    start.setDate(start.getDate() + 30)
    return start.toISOString().slice(0, 10)
  })

  const activeCycle = useMemo(() => cycles.find((cycle) => cycle.isActive) ?? null, [cycles])
  const pastCycles = useMemo(() => cycles.filter((cycle) => !cycle.isActive), [cycles])
  const selectedPastCycle = useMemo(
    () => pastCycles.find((cycle) => cycle.id === selectedPastCycleId) ?? null,
    [pastCycles, selectedPastCycleId],
  )
  const visibleCycle = selectedPastCycle ?? activeCycle
  const isReadOnly = Boolean(selectedPastCycle)

  const canEditStrategy = roleMode === 'owner' || roleMode === 'manager'

  function handleCreateCycle() {
    if (!newCycleName.trim() || !newCycleStart || !newCycleEnd) {
      return
    }
    onCreateCycle({
      name: newCycleName.trim(),
      startDate: newCycleStart,
      endDate: newCycleEnd,
    })
    setNewCycleOpen(false)
    setNewCycleName('')
  }

  function handleStartDateChange(value: string) {
    setNewCycleStart(value)
    if (!value) {
      return
    }
    const nextEnd = new Date(value)
    nextEnd.setDate(nextEnd.getDate() + 30)
    setNewCycleEnd(nextEnd.toISOString().slice(0, 10))
  }

  return (
    <div className="page-shell" style={{ color: '#111827' }}>
      <header className="page-header">
        <div>
          <h1 style={{ margin: 0, fontSize: '2rem', lineHeight: 1.2 }}>Strategy Cycles</h1>
          <p style={{ margin: '0.5rem 0 0', color: '#374151', fontSize: '1rem' }}>
            Define your 30-day focus. One objective, clear levers, measurable KPIs.
          </p>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
          {headerUtilityContent}
          {canEditStrategy ? (
            <button type="button" className="primary-button" onClick={() => setNewCycleOpen(true)}>
              + New Cycle
            </button>
          ) : null}
        </div>
      </header>

      {!visibleCycle ? (
        <section className="board-empty-state" style={{ marginTop: '1rem' }}>
          <strong>No strategy cycle yet</strong>
          <p>Create a 30-day cycle to define your objective, levers, and KPIs.</p>
        </section>
      ) : (
        <>
          {isReadOnly ? (
            <button type="button" className="ghost-button" onClick={() => setSelectedPastCycleId(null)}>
              Back to active cycle
            </button>
          ) : null}

          <section
            style={{
              marginTop: '1rem',
              background: '#ffffff',
              border: '1px solid #e5e7eb',
              borderRadius: '16px',
              boxShadow: '0 10px 28px rgba(15, 23, 42, 0.08)',
              padding: '1.5rem',
            }}
          >
            <div style={{ display: 'flex', justifyContent: 'space-between', gap: '1rem', flexWrap: 'wrap' }}>
              <div>
                <h2 style={{ margin: 0, fontSize: '1.4rem' }}>{visibleCycle.name}</h2>
                <p style={{ margin: '0.4rem 0 0', color: '#4b5563' }}>{formatRange(visibleCycle.startDate, visibleCycle.endDate)}</p>
                <p style={{ margin: '0.15rem 0 0', color: '#6b7280' }}>{getDaysLabel(visibleCycle.startDate, visibleCycle.endDate)}</p>
              </div>
            </div>

            <div style={{ marginTop: '1rem' }}>
              <p style={{ margin: 0, fontSize: '0.8rem', textTransform: 'uppercase', letterSpacing: '0.08em', color: '#6b7280' }}>
                Top-Level Business Objective
              </p>
              {objectiveEditing && !isReadOnly ? (
                <input
                  type="text"
                  value={visibleCycle.objective}
                  onChange={(event) =>
                    onUpdateCycle(visibleCycle.id, (cycle) => ({ ...cycle, objective: event.target.value }))
                  }
                  onBlur={() => setObjectiveEditing(false)}
                  autoFocus
                  style={{
                    marginTop: '0.45rem',
                    width: '100%',
                    border: '1px solid #d1d5db',
                    borderRadius: '10px',
                    padding: '0.7rem 0.85rem',
                    fontSize: '1.55rem',
                    fontWeight: 700,
                    color: '#111827',
                  }}
                />
              ) : (
                <button
                  type="button"
                  onClick={() => {
                    if (!isReadOnly) {
                      setObjectiveEditing(true)
                    }
                  }}
                  style={{
                    cursor: isReadOnly ? 'default' : 'text',
                    border: 'none',
                    padding: 0,
                    marginTop: '0.45rem',
                    background: 'transparent',
                    textAlign: 'left',
                    color: '#0f172a',
                    fontSize: '1.85rem',
                    fontWeight: 800,
                    lineHeight: 1.25,
                    width: '100%',
                  }}
                >
                  {visibleCycle.objective || 'Click to set objective'}
                </button>
              )}
            </div>
          </section>

          <section style={{ marginTop: '1rem' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <h3 style={{ margin: 0, color: '#111827' }}>Strategic Levers</h3>
              {!isReadOnly ? (
                <button
                  type="button"
                  className="ghost-button"
                  onClick={() =>
                    onUpdateCycle(visibleCycle.id, (cycle) => ({
                      ...cycle,
                      levers: [...cycle.levers, buildDefaultLever(cycle.levers.length)],
                    }))
                  }
                >
                  + Add Lever
                </button>
              ) : null}
            </div>

            <div style={{ display: 'grid', gap: '1rem', marginTop: '0.75rem' }}>
              {visibleCycle.levers.map((lever) => (
                <article
                  key={lever.id}
                  style={{
                    border: '1px solid #e5e7eb',
                    borderRadius: '14px',
                    background: '#ffffff',
                    boxShadow: '0 8px 18px rgba(15, 23, 42, 0.06)',
                    padding: '1rem',
                  }}
                >
                  <div style={{ display: 'flex', justifyContent: 'space-between', gap: '0.75rem' }}>
                    <div style={{ flex: 1 }}>
                      <input
                        type="text"
                        value={lever.name}
                        onChange={(event) =>
                          onUpdateCycle(visibleCycle.id, (cycle) => ({
                            ...cycle,
                            levers: cycle.levers.map((item) =>
                              item.id === lever.id ? { ...item, name: event.target.value } : item,
                            ),
                          }))
                        }
                        readOnly={isReadOnly}
                        style={{
                          border: isReadOnly ? 'none' : '1px solid #d1d5db',
                          padding: isReadOnly ? 0 : '0.55rem 0.7rem',
                          borderRadius: '9px',
                          width: '100%',
                          fontWeight: 700,
                          color: '#111827',
                          background: 'transparent',
                        }}
                      />
                      <textarea
                        value={lever.objective}
                        onChange={(event) =>
                          onUpdateCycle(visibleCycle.id, (cycle) => ({
                            ...cycle,
                            levers: cycle.levers.map((item) =>
                              item.id === lever.id ? { ...item, objective: event.target.value } : item,
                            ),
                          }))
                        }
                        readOnly={isReadOnly}
                        rows={2}
                        placeholder="Lever objective"
                        style={{
                          marginTop: '0.55rem',
                          border: isReadOnly ? 'none' : '1px solid #d1d5db',
                          padding: isReadOnly ? 0 : '0.6rem 0.7rem',
                          borderRadius: '9px',
                          width: '100%',
                          color: '#374151',
                          background: 'transparent',
                          resize: 'vertical',
                        }}
                      />
                    </div>
                    {!isReadOnly ? (
                      <button
                        type="button"
                        className="ghost-button"
                        onClick={() => {
                          if (window.confirm(`Delete ${lever.name || 'this lever'}?`)) {
                            onUpdateCycle(visibleCycle.id, (cycle) => ({
                              ...cycle,
                              levers: cycle.levers.filter((item) => item.id !== lever.id),
                            }))
                          }
                        }}
                      >
                        Delete
                      </button>
                    ) : null}
                  </div>

                  <div style={{ marginTop: '0.7rem', display: 'grid', gap: '0.65rem' }}>
                    {lever.kpis.map((kpi) => {
                      const progress = getProgressTone(kpi.actual, kpi.target)
                      const toneColor =
                        progress.tone === 'green' ? '#16a34a' : progress.tone === 'yellow' ? '#ca8a04' : '#dc2626'

                      return (
                        <div key={kpi.id} style={{ border: '1px solid #f1f5f9', borderRadius: '10px', padding: '0.7rem' }}>
                          <div style={{ display: 'grid', gap: '0.55rem', gridTemplateColumns: 'minmax(0, 1fr) 110px 110px' }}>
                            <input
                              type="text"
                              value={kpi.description}
                              onChange={(event) =>
                                onUpdateCycle(visibleCycle.id, (cycle) => ({
                                  ...cycle,
                                  levers: cycle.levers.map((item) =>
                                    item.id === lever.id
                                      ? {
                                          ...item,
                                          kpis: item.kpis.map((entry) =>
                                            entry.id === kpi.id ? { ...entry, description: event.target.value } : entry,
                                          ),
                                        }
                                      : item,
                                  ),
                                }))
                              }
                              readOnly={isReadOnly}
                              placeholder="KPI description"
                              style={{ border: '1px solid #d1d5db', borderRadius: '8px', padding: '0.45rem 0.6rem', color: '#111827' }}
                            />
                            <input
                              type="number"
                              value={kpi.target}
                              readOnly={isReadOnly}
                              onChange={(event) =>
                                onUpdateCycle(visibleCycle.id, (cycle) => ({
                                  ...cycle,
                                  levers: cycle.levers.map((item) =>
                                    item.id === lever.id
                                      ? {
                                          ...item,
                                          kpis: item.kpis.map((entry) =>
                                            entry.id === kpi.id ? { ...entry, target: Number(event.target.value) } : entry,
                                          ),
                                        }
                                      : item,
                                  ),
                                }))
                              }
                              style={{ border: '1px solid #d1d5db', borderRadius: '8px', padding: '0.45rem 0.6rem', color: '#111827' }}
                            />
                            <input
                              type="number"
                              value={kpi.actual}
                              readOnly={isReadOnly}
                              onChange={(event) =>
                                onUpdateCycle(visibleCycle.id, (cycle) => ({
                                  ...cycle,
                                  levers: cycle.levers.map((item) =>
                                    item.id === lever.id
                                      ? {
                                          ...item,
                                          kpis: item.kpis.map((entry) =>
                                            entry.id === kpi.id ? { ...entry, actual: Number(event.target.value) } : entry,
                                          ),
                                        }
                                      : item,
                                  ),
                                }))
                              }
                              style={{ border: '1px solid #d1d5db', borderRadius: '8px', padding: '0.45rem 0.6rem', color: '#111827' }}
                            />
                          </div>
                          <div style={{ marginTop: '0.55rem' }}>
                            <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.82rem', color: '#374151' }}>
                              <span>Progress</span>
                              <span style={{ color: toneColor, fontWeight: 700 }}>{Math.round(progress.pct)}%</span>
                            </div>
                            <div style={{ background: '#e5e7eb', borderRadius: '999px', height: '8px', marginTop: '0.35rem' }}>
                              <div
                                style={{
                                  width: `${progress.pct}%`,
                                  height: '8px',
                                  borderRadius: '999px',
                                  background: toneColor,
                                  transition: 'width 180ms ease',
                                }}
                              />
                            </div>
                          </div>
                        </div>
                      )
                    })}
                  </div>

                  {!isReadOnly ? (
                    <button
                      type="button"
                      className="ghost-button"
                      style={{ marginTop: '0.7rem' }}
                      onClick={() =>
                        onUpdateCycle(visibleCycle.id, (cycle) => ({
                          ...cycle,
                          levers: cycle.levers.map((item) =>
                            item.id === lever.id ? { ...item, kpis: [...item.kpis, buildDefaultKpi(item.kpis.length)] } : item,
                          ),
                        }))
                      }
                    >
                      + Add KPI
                    </button>
                  ) : null}
                </article>
              ))}
            </div>
          </section>

          <section style={{ marginTop: '1rem' }}>
            <h3 style={{ margin: '0 0 0.7rem', color: '#111827' }}>Cycle Conclusions</h3>
            <div style={{ display: 'grid', gap: '0.8rem' }}>
              {LEADERS.map((leader) => {
                const entry = getConclusion(visibleCycle, leader)
                const canEditOwn = !isReadOnly && isLeaderIdentityMatch(leader, currentUserEmail, currentUserName)

                return (
                  <article
                    key={leader.email}
                    style={{
                      border: '1px solid #e5e7eb',
                      borderRadius: '12px',
                      background: '#fff',
                      padding: '0.9rem',
                    }}
                  >
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', gap: '0.7rem' }}>
                      <h4 style={{ margin: 0, color: '#111827' }}>{leader.name}'s Conclusion</h4>
                      {entry.updatedAt ? (
                        <span style={{ color: '#6b7280', fontSize: '0.8rem' }}>
                          Updated {new Date(entry.updatedAt).toLocaleDateString()}
                        </span>
                      ) : null}
                    </div>
                    <p style={{ margin: '0.45rem 0', color: '#6b7280', fontSize: '0.88rem' }}>{promptText}</p>
                    <textarea
                      value={entry.text}
                      readOnly={!canEditOwn}
                      rows={6}
                      placeholder={promptText}
                      onChange={(event) =>
                        onUpdateCycle(visibleCycle.id, (cycle) => {
                          const hasEntry = cycle.conclusions.some((item) => item.authorEmail === leader.email)
                          const nextEntry: StrategyCycleConclusion = {
                            authorEmail: leader.email,
                            authorName: leader.name,
                            text: event.target.value,
                            updatedAt: new Date().toISOString(),
                          }
                          return {
                            ...cycle,
                            conclusions: hasEntry
                              ? cycle.conclusions.map((item) => (item.authorEmail === leader.email ? nextEntry : item))
                              : [...cycle.conclusions, nextEntry],
                          }
                        })
                      }
                      style={{
                        width: '100%',
                        border: '1px solid #d1d5db',
                        borderRadius: '8px',
                        padding: '0.65rem 0.7rem',
                        color: '#111827',
                        background: canEditOwn ? '#fff' : '#f9fafb',
                      }}
                    />
                  </article>
                )
              })}
            </div>
          </section>

          {!isReadOnly && pastCycles.length > 0 ? (
            <section style={{ marginTop: '1.25rem' }}>
              <h3 style={{ margin: '0 0 0.7rem', color: '#111827' }}>Past Cycles</h3>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(250px, 1fr))', gap: '0.75rem' }}>
                {pastCycles.map((cycle) => (
                  <button
                    type="button"
                    key={cycle.id}
                    onClick={() => setSelectedPastCycleId(cycle.id)}
                    style={{
                      textAlign: 'left',
                      border: '1px solid #e5e7eb',
                      borderRadius: '12px',
                      padding: '0.9rem',
                      background: '#ffffff',
                      color: '#111827',
                      boxShadow: '0 6px 14px rgba(15, 23, 42, 0.05)',
                    }}
                  >
                    <strong style={{ display: 'block', fontSize: '1rem' }}>{cycle.name}</strong>
                    <span style={{ display: 'block', color: '#6b7280', marginTop: '0.25rem', fontSize: '0.85rem' }}>
                      {formatRange(cycle.startDate, cycle.endDate)}
                    </span>
                    <p style={{ margin: '0.55rem 0 0', color: '#374151', fontSize: '0.9rem' }}>{cycle.objective}</p>
                    <p style={{ margin: '0.45rem 0 0', color: '#6b7280', fontSize: '0.82rem' }}>{getPastCycleSummary(cycle)}</p>
                  </button>
                ))}
              </div>
            </section>
          ) : null}

          {isReadOnly ? (
            <section style={{ marginTop: '1.25rem' }}>
              <h3 style={{ margin: '0 0 0.7rem', color: '#111827' }}>Past Cycles</h3>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(250px, 1fr))', gap: '0.75rem' }}>
                {pastCycles.map((cycle) => (
                  <button
                    type="button"
                    key={cycle.id}
                    onClick={() => setSelectedPastCycleId(cycle.id)}
                    style={{
                      textAlign: 'left',
                      border: selectedPastCycleId === cycle.id ? '1px solid #6366f1' : '1px solid #e5e7eb',
                      borderRadius: '12px',
                      padding: '0.9rem',
                      background: '#ffffff',
                      color: '#111827',
                    }}
                  >
                    <strong style={{ display: 'block', fontSize: '1rem' }}>{cycle.name}</strong>
                    <span style={{ display: 'block', color: '#6b7280', marginTop: '0.25rem', fontSize: '0.85rem' }}>
                      {formatRange(cycle.startDate, cycle.endDate)}
                    </span>
                    <p style={{ margin: '0.55rem 0 0', color: '#374151', fontSize: '0.9rem' }}>{cycle.objective}</p>
                    <p style={{ margin: '0.45rem 0 0', color: '#6b7280', fontSize: '0.82rem' }}>{getPastCycleSummary(cycle)}</p>
                  </button>
                ))}
              </div>
            </section>
          ) : null}
        </>
      )}

      {newCycleOpen ? (
        <div
          role="dialog"
          aria-modal="true"
          style={{
            position: 'fixed',
            inset: 0,
            background: 'rgba(15,23,42,0.4)',
            display: 'grid',
            placeItems: 'center',
            zIndex: 80,
            padding: '1rem',
          }}
        >
          <section
            style={{
              width: '100%',
              maxWidth: '440px',
              background: '#fff',
              borderRadius: '14px',
              border: '1px solid #e5e7eb',
              padding: '1rem',
              color: '#111827',
            }}
          >
            <h3 style={{ margin: 0 }}>Create New Cycle</h3>
            <div style={{ marginTop: '0.8rem', display: 'grid', gap: '0.65rem' }}>
              <label style={{ display: 'grid', gap: '0.35rem' }}>
                <span>Cycle Name</span>
                <input
                  type="text"
                  value={newCycleName}
                  onChange={(event) => setNewCycleName(event.target.value)}
                  style={{ border: '1px solid #d1d5db', borderRadius: '8px', padding: '0.55rem 0.65rem', color: '#111827' }}
                />
              </label>
              <label style={{ display: 'grid', gap: '0.35rem' }}>
                <span>Start Date</span>
                <input
                  type="date"
                  value={newCycleStart}
                  onChange={(event) => handleStartDateChange(event.target.value)}
                  style={{ border: '1px solid #d1d5db', borderRadius: '8px', padding: '0.55rem 0.65rem', color: '#111827' }}
                />
              </label>
              <label style={{ display: 'grid', gap: '0.35rem' }}>
                <span>End Date</span>
                <input
                  type="date"
                  value={newCycleEnd}
                  onChange={(event) => setNewCycleEnd(event.target.value)}
                  style={{ border: '1px solid #d1d5db', borderRadius: '8px', padding: '0.55rem 0.65rem', color: '#111827' }}
                />
              </label>
            </div>
            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '0.6rem', marginTop: '1rem' }}>
              <button type="button" className="ghost-button" onClick={() => setNewCycleOpen(false)}>
                Cancel
              </button>
              <button type="button" className="primary-button" onClick={handleCreateCycle}>
                Create cycle
              </button>
            </div>
          </section>
        </div>
      ) : null}
    </div>
  )
}
