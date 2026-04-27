import { useMemo, useState, type ReactNode } from 'react'
import type { RoleMode, StrategyCycle, StrategyCycleConclusion, StrategyCycleKPI, StrategyCycleLever } from '../board'

interface StrategyCyclesPageProps {
  cycles: StrategyCycle[]
  roleMode: RoleMode
  currentUserEmail: string | null
  currentUserName: string | null
  headerUtilityContent?: ReactNode
  onCreateCycle: (input: { name: string; startDate: string; endDate: string }) => void
  onUpdateCycle: (cycleId: string, updater: (cycle: StrategyCycle) => StrategyCycle) => void
}

interface LeaderProfile {
  name: string
  email: string
  keys: string[]
}

interface CycleStats {
  totalKpis: number
  trackedKpis: number
  onPace: number
  atRisk: number
  missingActuals: number
  completeConclusions: number
  avgProgress: number
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
  return `${start.toLocaleDateString(undefined, { month: 'short', day: 'numeric' })} - ${end.toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' })}`
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
    return { tone: 'missing' as const, pct: 0 }
  }
  const pct = Math.max(0, Math.min(100, (actual / target) * 100))
  if (actual >= target) {
    return { tone: 'green' as const, pct }
  }
  if (actual > target * 0.5) {
    return { tone: 'yellow' as const, pct }
  }
  return { tone: 'red' as const, pct }
}

function getKpiStatus(kpi: StrategyCycleKPI) {
  if (kpi.target <= 0) {
    return { label: 'Set target', tone: 'missing' as const }
  }
  if (kpi.actual <= 0) {
    return { label: 'Missing actual', tone: 'missing' as const }
  }
  if (kpi.actual >= kpi.target) {
    return { label: 'On pace', tone: 'green' as const }
  }
  if (kpi.actual > kpi.target * 0.5) {
    return { label: 'Watch', tone: 'yellow' as const }
  }
  return { label: 'At risk', tone: 'red' as const }
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

function getCycleTiming(startDate: string, endDate: string) {
  const today = new Date()
  const start = new Date(startDate)
  const end = new Date(endDate)
  const totalDays = Math.max(1, Math.ceil((end.getTime() - start.getTime()) / 86400000) + 1)
  const elapsed = Math.floor((today.getTime() - start.getTime()) / 86400000) + 1
  const currentDay = Math.max(0, Math.min(elapsed, totalDays))
  return {
    totalDays,
    currentDay,
    pct: Math.max(0, Math.min(100, (currentDay / totalDays) * 100)),
  }
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

function getCycleStats(cycle: StrategyCycle): CycleStats {
  const kpis = cycle.levers.flatMap((lever) => lever.kpis)
  const progressValues = kpis.filter((kpi) => kpi.target > 0).map((kpi) => getProgressTone(kpi.actual, kpi.target).pct)

  return {
    totalKpis: kpis.length,
    trackedKpis: kpis.filter((kpi) => kpi.description.trim().length > 0 || kpi.target > 0).length,
    onPace: kpis.filter((kpi) => kpi.target > 0 && kpi.actual >= kpi.target).length,
    atRisk: kpis.filter((kpi) => kpi.target > 0 && kpi.actual > 0 && kpi.actual < kpi.target).length,
    missingActuals: kpis.filter((kpi) => kpi.target <= 0 || kpi.actual <= 0).length,
    completeConclusions: cycle.conclusions.filter((entry) => entry.text.trim().length > 0).length,
    avgProgress:
      progressValues.length > 0
        ? Math.round(progressValues.reduce((total, value) => total + value, 0) / progressValues.length)
        : 0,
  }
}

function getPastCycleSummary(cycle: StrategyCycle) {
  const stats = getCycleStats(cycle)
  return `${stats.onPace}/${stats.totalKpis} KPIs on pace - ${stats.completeConclusions}/3 conclusions completed`
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
  const cycleStats = visibleCycle ? getCycleStats(visibleCycle) : null
  const cycleTiming = visibleCycle ? getCycleTiming(visibleCycle.startDate, visibleCycle.endDate) : null

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
    <div className="page-shell strategy-page-shell">
      <header className="page-header strategy-page-header">
        <div>
          <p className="strategy-eyebrow">Operating cadence</p>
          <h1>Strategy</h1>
          <p className="strategy-page-subtitle">Keep the 30-day objective, levers, KPIs, and post-cycle readout in one place.</p>
        </div>
        <div className="strategy-header-actions">
          {headerUtilityContent}
          {canEditStrategy ? (
            <button type="button" className="primary-button strategy-new-cycle-button" onClick={() => setNewCycleOpen(true)}>
              <span aria-hidden="true">+</span>
              New Cycle
            </button>
          ) : null}
        </div>
      </header>

      {!visibleCycle ? (
        <section className="strategy-empty-state">
          <div className="strategy-empty-icon" aria-hidden="true">
            30
          </div>
          <div>
            <p className="strategy-eyebrow">No active cycle</p>
            <h2>No strategy cycle yet</h2>
            <p>Create a 30-day cycle to define the business objective, pick the levers, and track target-vs-actual progress.</p>
          </div>
          {canEditStrategy ? (
            <button type="button" className="primary-button" onClick={() => setNewCycleOpen(true)}>
              Create first cycle
            </button>
          ) : null}
        </section>
      ) : (
        <>
          {isReadOnly ? (
            <button type="button" className="ghost-button strategy-back-button" onClick={() => setSelectedPastCycleId(null)}>
              Back to active cycle
            </button>
          ) : null}

          <section className="strategy-cycle-hero">
            <div className="strategy-cycle-main">
              <div className="strategy-cycle-topline">
                <span className={`strategy-status-pill ${isReadOnly ? 'is-muted' : 'is-active'}`}>
                  {isReadOnly ? 'Past cycle' : 'Active cycle'}
                </span>
                <span>{formatRange(visibleCycle.startDate, visibleCycle.endDate)}</span>
                <span>{getDaysLabel(visibleCycle.startDate, visibleCycle.endDate)}</span>
              </div>

              <div className="strategy-cycle-title-row">
                <div>
                  <p className="strategy-kicker">Top-level business objective</p>
                  {objectiveEditing && !isReadOnly ? (
                    <input
                      type="text"
                      value={visibleCycle.objective}
                      onChange={(event) =>
                        onUpdateCycle(visibleCycle.id, (cycle) => ({ ...cycle, objective: event.target.value }))
                      }
                      onBlur={() => setObjectiveEditing(false)}
                      autoFocus
                      className="strategy-objective-input"
                    />
                  ) : (
                    <button
                      type="button"
                      className="strategy-objective-button"
                      onClick={() => {
                        if (!isReadOnly) {
                          setObjectiveEditing(true)
                        }
                      }}
                    >
                      {visibleCycle.objective || 'Click to set the one objective this cycle must serve'}
                    </button>
                  )}
                </div>
                <div className="strategy-cycle-chip">
                  <span>{visibleCycle.name}</span>
                  <strong>{cycleStats?.avgProgress ?? 0}%</strong>
                  <small>avg KPI progress</small>
                </div>
              </div>

              {cycleTiming ? (
                <div className="strategy-cycle-timeline" aria-label={`Cycle is ${Math.round(cycleTiming.pct)}% complete`}>
                  <div className="strategy-cycle-timeline-labels">
                    <span>Cycle progress</span>
                    <strong>{`${cycleTiming.currentDay}/${cycleTiming.totalDays} days`}</strong>
                  </div>
                  <div className="strategy-cycle-timeline-track">
                    <div style={{ width: `${cycleTiming.pct}%` }} />
                  </div>
                </div>
              ) : null}
            </div>

            {cycleStats ? (
              <div className="strategy-health-grid">
                <div className="strategy-health-card">
                  <span>Tracked</span>
                  <strong>{`${cycleStats.trackedKpis}/${cycleStats.totalKpis}`}</strong>
                  <small>KPIs</small>
                </div>
                <div className="strategy-health-card is-green">
                  <span>On pace</span>
                  <strong>{cycleStats.onPace}</strong>
                  <small>healthy</small>
                </div>
                <div className="strategy-health-card is-amber">
                  <span>Watch</span>
                  <strong>{cycleStats.atRisk}</strong>
                  <small>below target</small>
                </div>
                <div className="strategy-health-card is-red">
                  <span>Missing</span>
                  <strong>{cycleStats.missingActuals}</strong>
                  <small>needs data</small>
                </div>
                <div className="strategy-health-card">
                  <span>Readout</span>
                  <strong>{`${cycleStats.completeConclusions}/3`}</strong>
                  <small>leaders</small>
                </div>
              </div>
            ) : null}
          </section>

          <section className="strategy-section">
            <div className="strategy-section-head">
              <div>
                <p className="strategy-kicker">Execution levers</p>
                <h2>Strategic Levers</h2>
              </div>
              {!isReadOnly ? (
                <button
                  type="button"
                  className="ghost-button strategy-section-button"
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

            <div className="strategy-lever-grid">
              {visibleCycle.levers.map((lever, index) => {
                const leverStats = getCycleStats({ ...visibleCycle, levers: [lever] })

                return (
                  <article className="strategy-lever-card" key={lever.id}>
                    <div className="strategy-lever-head">
                      <div className="strategy-lever-number">{String(index + 1).padStart(2, '0')}</div>
                      <div className="strategy-lever-title-stack">
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
                          className="strategy-lever-name-input"
                          aria-label="Lever name"
                        />
                      </div>
                      <div className="strategy-lever-summary">
                        <strong>{leverStats.avgProgress}%</strong>
                        <span>{leverStats.onPace} on pace</span>
                      </div>
                      {!isReadOnly ? (
                        <button
                          type="button"
                          className="ghost-button strategy-delete-button"
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

                    <div className="strategy-kpi-table">
                      <div className="strategy-kpi-row strategy-kpi-row-head">
                        <span>KPI</span>
                        <span>Target</span>
                        <span>Actual</span>
                        <span>Status</span>
                      </div>

                      {lever.kpis.map((kpi) => {
                        const progress = getProgressTone(kpi.actual, kpi.target)
                        const status = getKpiStatus(kpi)

                        return (
                          <div className="strategy-kpi-row" key={kpi.id}>
                            <label className="strategy-kpi-description">
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
                                placeholder="What gets measured"
                              />
                              <span className="strategy-kpi-progress-track">
                                <span className={`strategy-kpi-progress-fill is-${progress.tone}`} style={{ width: `${progress.pct}%` }} />
                              </span>
                            </label>
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
                              aria-label="KPI target"
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
                              aria-label="KPI actual"
                            />
                            <span className={`strategy-kpi-status is-${status.tone}`}>
                              {status.label}
                              {kpi.target > 0 ? <small>{`${Math.round(progress.pct)}%`}</small> : null}
                            </span>
                          </div>
                        )
                      })}
                    </div>

                    {!isReadOnly ? (
                      <button
                        type="button"
                        className="ghost-button strategy-add-kpi-button"
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
                )
              })}
            </div>
          </section>

          <section className="strategy-section strategy-conclusions-section">
            <div className="strategy-section-head">
              <div>
                <p className="strategy-kicker">Post-cycle readout</p>
                <h2>Cycle Conclusions</h2>
              </div>
              <span className="strategy-section-meta">{`${cycleStats?.completeConclusions ?? 0}/3 complete`}</span>
            </div>

            <div className="strategy-conclusion-grid">
              {LEADERS.map((leader) => {
                const entry = getConclusion(visibleCycle, leader)
                const canEditOwn = !isReadOnly && isLeaderIdentityMatch(leader, currentUserEmail, currentUserName)
                const hasText = entry.text.trim().length > 0

                return (
                  <article className={`strategy-conclusion-card ${hasText ? 'is-complete' : ''}`} key={leader.email}>
                    <div className="strategy-conclusion-head">
                      <div>
                        <h3>{leader.name}</h3>
                        <p>{hasText ? 'Conclusion added' : 'Waiting for readout'}</p>
                      </div>
                      <span className={`strategy-kpi-status ${hasText ? 'is-green' : 'is-missing'}`}>
                        {hasText ? 'Done' : 'Open'}
                      </span>
                    </div>
                    <p className="strategy-conclusion-prompt">{promptText}</p>
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
                    />
                    {entry.updatedAt ? <span className="strategy-updated-at">Updated {new Date(entry.updatedAt).toLocaleDateString()}</span> : null}
                  </article>
                )
              })}
            </div>
          </section>

          {pastCycles.length > 0 ? (
            <section className="strategy-section strategy-history-section">
              <div className="strategy-section-head">
                <div>
                  <p className="strategy-kicker">History</p>
                  <h2>Past Cycles</h2>
                </div>
              </div>

              <div className="strategy-history-grid">
                {pastCycles.map((cycle) => (
                  <button
                    type="button"
                    key={cycle.id}
                    onClick={() => setSelectedPastCycleId(cycle.id)}
                    className={`strategy-history-card ${selectedPastCycleId === cycle.id ? 'is-selected' : ''}`}
                  >
                    <span>{formatRange(cycle.startDate, cycle.endDate)}</span>
                    <strong>{cycle.name}</strong>
                    <p>{cycle.objective || 'No objective captured'}</p>
                    <small>{getPastCycleSummary(cycle)}</small>
                  </button>
                ))}
              </div>
            </section>
          ) : null}
        </>
      )}

      {newCycleOpen ? (
        <div role="dialog" aria-modal="true" className="strategy-dialog-overlay">
          <section className="strategy-dialog">
            <div>
              <p className="strategy-kicker">New strategy cycle</p>
              <h3>Create New Cycle</h3>
            </div>
            <div className="strategy-dialog-fields">
              <label>
                <span>Cycle Name</span>
                <input type="text" value={newCycleName} onChange={(event) => setNewCycleName(event.target.value)} />
              </label>
              <label>
                <span>Start Date</span>
                <input type="date" value={newCycleStart} onChange={(event) => handleStartDateChange(event.target.value)} />
              </label>
              <label>
                <span>End Date</span>
                <input type="date" value={newCycleEnd} onChange={(event) => setNewCycleEnd(event.target.value)} />
              </label>
            </div>
            <div className="strategy-dialog-actions">
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
