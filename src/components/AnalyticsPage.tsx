import { useMemo, useState, type ReactNode } from 'react'
import {
  buildEditorPerformanceData,
  buildDashboardData,
  formatDateShort,
  formatHours,
  type AppState,
  type RoleMode,
  type StageId,
} from '../board'
import { PageHeader } from './PageHeader'
import { BlockedIcon } from './icons/AppIcons'

interface AnalyticsPageProps {
  state: AppState
  nowMs: number
  activeRoleMode: RoleMode
  headerUtilityContent?: ReactNode
  onOpenCard: (portfolioId: string, cardId: string) => void
  onOpenPortfolioBoard: (portfolioId: string) => void
  onOpenEditorBoard: (portfolioId: string, ownerName: string) => void
}

function getOverviewProgressTone(onTrackRatio: number) {
  if (onTrackRatio >= 0.75) {
    return 'green'
  }

  if (onTrackRatio >= 0.5) {
    return 'yellow'
  }

  return 'red'
}

function getBrandLegendItems(state: AppState) {
  const brandMap = new Map<string, string>()

  state.portfolios.forEach((portfolio) => {
    portfolio.brands.forEach((brand) => {
      if (!brandMap.has(brand.name)) {
        brandMap.set(brand.name, brand.color)
      }
    })
  })

  return Array.from(brandMap.entries()).map(([name, color]) => ({
    name,
    color,
  }))
}

function BrandLegend({ items }: { items: Array<{ name: string; color: string }> }) {
  if (items.length === 0) {
    return null
  }

  return (
    <div className="brand-legend" aria-label="Brand color legend">
      {items.map((item) => (
        <span key={item.name} className="brand-legend-item">
          <span className="brand-dot" style={{ background: item.color }} aria-hidden="true" />
          <span>{item.name}</span>
        </span>
      ))}
    </div>
  )
}

export function AnalyticsPage({
  state,
  nowMs,
  activeRoleMode,
  headerUtilityContent,
  onOpenCard,
  onOpenPortfolioBoard,
  onOpenEditorBoard,
}: AnalyticsPageProps) {
  const dashboard = useMemo(
    () => buildDashboardData(state.portfolios, state.settings, nowMs),
    [nowMs, state.portfolios, state.settings],
  )
  const [expandedStage, setExpandedStage] = useState<StageId | null>(null)
  const maxThroughput = Math.max(...dashboard.throughput.map((week) => week.total), 0)
  const brandLegendItems = useMemo(() => getBrandLegendItems(state), [state])
  const [rangeStart, setRangeStart] = useState(() => {
    const start = new Date(nowMs - 30 * 24 * 60 * 60 * 1000)
    return start.toISOString().slice(0, 10)
  })
  const [rangeEnd, setRangeEnd] = useState(() => new Date(nowMs).toISOString().slice(0, 10))
  const canViewEditorPerformance = activeRoleMode === 'owner' || activeRoleMode === 'manager'
  const editorPerformance = useMemo(() => {
    const startMs = new Date(`${rangeStart}T00:00:00Z`).getTime()
    const endMs = new Date(`${rangeEnd}T23:59:59.999Z`).getTime()
    if (!Number.isFinite(startMs) || !Number.isFinite(endMs) || endMs < startMs) {
      return null
    }
    return buildEditorPerformanceData(state.portfolios, startMs, endMs, nowMs)
  }, [nowMs, rangeEnd, rangeStart, state.portfolios])

  return (
    <div className="page-shell analytics-page">
      <PageHeader title="Analytics" rightContent={headerUtilityContent} />

      <section>
        <h2 className="dashboard-section-title">Portfolio Overview</h2>
        {dashboard.overviewCards.length === 0 ? (
          <div className="dashboard-placeholder">No portfolios configured.</div>
        ) : (
          <div className="overview-grid">
            {dashboard.overviewCards.map((portfolio) => (
              <button
                key={portfolio.portfolioId}
                type="button"
                className="overview-card"
                onClick={() => onOpenPortfolioBoard(portfolio.portfolioId)}
              >
                <strong>{portfolio.name}</strong>
                <span>{portfolio.activeCards} active cards</span>
                <div className="overview-progress">
                  <div
                    className={`overview-progress-fill is-${getOverviewProgressTone(portfolio.onTrackRatio)}`}
                    style={{ width: `${Math.round(portfolio.onTrackRatio * 100)}%` }}
                  />
                </div>
                <span>{Math.round(portfolio.onTrackRatio * 100)}% on track</span>
                <span>
                  {portfolio.stuckCount} stuck · {portfolio.atCapacityCount} at capacity
                </span>
                <span>
                  Brands:{' '}
                  {portfolio.brandBreakdown.map((item) => `${item.brand} (${item.count})`).join(' ')}
                </span>
              </button>
            ))}
          </div>
        )}
      </section>

      <section>
        <h2 className="dashboard-section-title">Pipeline Funnel</h2>
        <BrandLegend items={brandLegendItems} />
        <div className="funnel-row">
          {dashboard.funnel.map((bucket) => (
            <button
              key={bucket.stage}
              type="button"
              className="funnel-stage"
              style={{ flex: Math.max(bucket.total, 1) }}
              onClick={() =>
                setExpandedStage((current) => (current === bucket.stage ? null : bucket.stage))
              }
            >
              <div className="funnel-bar">
                {bucket.segments.map((segment) => (
                  <span
                    key={`${bucket.stage}-${segment.brand}`}
                    title={`${segment.brand}: ${segment.count} cards`}
                    style={{
                      flex: segment.count,
                      background: segment.color,
                    }}
                  />
                ))}
              </div>
              <span>
                {bucket.stage} ({bucket.total})
              </span>
            </button>
          ))}
        </div>
        {expandedStage ? (
          <div className="dashboard-card-list">
            {dashboard.funnel
              .find((bucket) => bucket.stage === expandedStage)
              ?.cards.map((card) => (
                <button
                  key={`${card.portfolioId}-${card.cardId}`}
                  type="button"
                  className="dashboard-card-row"
                  onClick={() => onOpenCard(card.portfolioId, card.cardId)}
                >
                  <span>{card.cardId}</span>
                  <span className="dashboard-card-title">
                    {card.isBlocked ? (
                      <span className="inline-icon-with-text">
                        <BlockedIcon />
                        {card.title}
                      </span>
                    ) : (
                      card.title
                    )}
                  </span>
                  <span>{card.portfolioName}</span>
                  <span>{card.owner ?? 'Unassigned'}</span>
                </button>
              ))}
          </div>
        ) : null}
      </section>

      <section>
        <h2 className="dashboard-section-title">Team Capacity Grid</h2>
        {dashboard.teamGrid.length === 0 ? (
          <div className="dashboard-placeholder">No teammate profiles found.</div>
        ) : (
          <div className="dashboard-table">
            <div className="dashboard-table-row dashboard-table-head analytics-team-grid">
              <span>Teammate</span>
              <span>Portfolio</span>
              <span>Active</span>
              <span>Utilization</span>
              <span>Capacity</span>
              <span>Workload</span>
              <span>Avg Cycle Time (all time)</span>
              <span>Revisions</span>
            </div>
            {dashboard.teamGrid.map((row, index) => (
              <div
                key={`${row.portfolioId}-${row.editorId}`}
                className={`dashboard-table-row analytics-team-grid ${index % 2 === 1 ? 'is-alt' : ''}`}
              >
                <button
                  type="button"
                  className="table-link"
                  data-label="Teammate"
                  onClick={() => onOpenEditorBoard(row.portfolioId, row.editorName)}
                >
                  {row.editorName}
                </button>
                <span data-label="Portfolio">{row.portfolioName}</span>
                <span data-label="Active">{row.active}</span>
                <span data-label="Utilization" className={`util-inline is-${row.utilizationTone}`}>
                  {row.utilizationPct}%
                  <span className={`status-dot is-${row.utilizationTone}`} aria-hidden="true" />
                </span>
                <span data-label="Capacity">{`${formatHours(row.usedHours)}/${formatHours(row.totalHours)}`}</span>
                <span data-label="Workload">{`~${row.workloadDays}d`}</span>
                <span data-label="Avg Cycle Time (all time)">
                  {row.avgCycleTime ? `${row.avgCycleTime}d` : '—'}
                </span>
                <span data-label="Revisions">
                  {row.avgRevisionsPerCard ? `${row.avgRevisionsPerCard}/card` : '—'}
                </span>
              </div>
            ))}
          </div>
        )}
      </section>

      <section>
        <h2 className="dashboard-section-title">Stuck Cards Alert</h2>
        {dashboard.stuckCards.length === 0 ? (
          <div className="dashboard-placeholder">No stuck cards right now</div>
        ) : (
          <div className="stuck-list">
            {dashboard.stuckCards.map((card) => (
              <button
                key={`${card.portfolioId}-${card.cardId}`}
                type="button"
                className="stuck-row"
                onClick={() => onOpenCard(card.portfolioId, card.cardId)}
              >
                <span
                  className={`stuck-dot ${
                    card.daysInStage >= state.settings.general.timeInStageThresholds.redStart
                      ? 'is-red'
                      : 'is-amber'
                  }`}
                />
                <span>{card.cardId}</span>
                <span>{card.isBlocked && card.blockedReason ? `Blocked: ${card.blockedReason}` : card.title}</span>
                <span>{card.stage}</span>
                <span>{card.owner ?? 'Unassigned'}</span>
                <span>{card.daysInStage}d</span>
              </button>
            ))}
          </div>
        )}
      </section>

      <section>
        <h2 className="dashboard-section-title">Throughput</h2>
        <BrandLegend items={brandLegendItems} />
        {dashboard.throughput.every((week) => week.total === 0) ? (
          <div className="dashboard-placeholder">
            Throughput data will appear as cards move through the pipeline.
          </div>
        ) : (
          <div className="throughput-chart-shell">
            <div className="throughput-chart-meta">
              <span className="throughput-axis-label">{`${maxThroughput} max cards`}</span>
              <span className="muted-copy">Last 8 weeks</span>
            </div>
            <div className="throughput-chart">
              {dashboard.throughput.map((week) => (
                <div key={week.label} className="throughput-column">
                  <span className="throughput-total">{week.total}</span>
                  <div className="throughput-bar">
                    {week.segments.map((segment) => (
                      <span
                        key={`${week.label}-${segment.brand}`}
                        title={`${segment.brand}: ${segment.count} cards`}
                        style={{
                          height: `${(segment.count / Math.max(maxThroughput, 1)) * 100}%`,
                          background: segment.color,
                        }}
                      />
                    ))}
                  </div>
                  <span>{week.label}</span>
                </div>
              ))}
            </div>
          </div>
        )}
      </section>

      <section>
        <h2 className="dashboard-section-title">Brand Health Summary</h2>
        {dashboard.brandHealth.length === 0 ? (
          <div className="dashboard-placeholder">No brand data available.</div>
        ) : (
          <div className="dashboard-table">
            <div className="dashboard-table-row dashboard-table-head brand-health-grid">
              <span>Brand</span>
              <span>Active</span>
              <span>Stuck</span>
              <span>In Production</span>
              <span>Avg Cycle Time (30 days)</span>
              <span>Last Shipped</span>
            </div>
            {dashboard.brandHealth.map((row, index) => (
              <div
                key={`${row.portfolioId}-${row.brand}`}
                className={`dashboard-table-row brand-health-grid ${index % 2 === 1 ? 'is-alt' : ''}`}
              >
                <span data-label="Brand" className="brand-health-name">
                  <span className="brand-dot" style={{ background: row.color }} />
                  {row.brand}
                </span>
                <span data-label="Active">{row.active}</span>
                <span data-label="Stuck">{row.stuck}</span>
                <span data-label="In Production">{row.inProduction}</span>
                <span data-label="Avg Cycle Time (30 days)">
                  {row.avgCycleTime ? `${row.avgCycleTime}d` : '—'}
                </span>
                <span data-label="Last Shipped">
                  {row.lastShipped ? formatDateShort(row.lastShipped) : '—'}
                </span>
              </div>
            ))}
          </div>
        )}
      </section>

      <section>
        <h2 className="dashboard-section-title">Revision Patterns</h2>
        {dashboard.revisionReasons.length === 0 && dashboard.editorRevisionRates.length === 0 ? (
          <div className="dashboard-placeholder">No revision data yet</div>
        ) : (
          <div className="revision-grid">
            <div className="revision-card">
              <strong>Top reasons cards are sent back (last 30 days)</strong>
              <div className="revision-list">
                {dashboard.revisionReasons.length > 0 ? (
                  dashboard.revisionReasons.map((reason, index) => (
                    <span key={reason.reason}>
                      {index + 1}. {reason.reason} — {reason.count} cards ({reason.percent}%)
                    </span>
                  ))
                ) : (
                  <span className="muted-copy">No revision data yet</span>
                )}
              </div>
            </div>
            <div className="revision-card">
              <strong>Teammates with highest revision rates (last 30 days)</strong>
              <div className="revision-list">
                {dashboard.editorRevisionRates.length > 0 ? (
                  dashboard.editorRevisionRates.map((item, index) => (
                    <span key={item.editorName}>
                      {index + 1}. {item.editorName} — {item.avgRevisionsPerCard} revisions/card avg
                    </span>
                  ))
                ) : (
                  <span className="muted-copy">No revision data yet</span>
                )}
              </div>
            </div>
          </div>
        )}
      </section>

      {canViewEditorPerformance ? (
        <section>
          <h2 className="dashboard-section-title">Editor Performance</h2>
          <div className="editor-performance-range">
            <label>
              <span>From</span>
              <input type="date" value={rangeStart} onChange={(event) => setRangeStart(event.target.value)} />
            </label>
            <label>
              <span>To</span>
              <input type="date" value={rangeEnd} onChange={(event) => setRangeEnd(event.target.value)} />
            </label>
          </div>
          {!editorPerformance ? (
            <div className="dashboard-placeholder">Select a valid date range.</div>
          ) : (
            <div className="editor-performance-grid">
              <div className="revision-card">
                <strong>Cycle Time per Editor</strong>
                <div className="revision-list">
                  {editorPerformance.cycleTimeByEditor.length === 0 ? (
                    <span className="muted-copy">No timer-based cycle data in range.</span>
                  ) : (
                    editorPerformance.cycleTimeByEditor.map((row) => (
                      <span key={row.editorName}>
                        {row.editorName} — {row.avgCycleTimeHours !== null ? `${row.avgCycleTimeHours}h avg` : '—'} ({row.completedCards} cards)
                      </span>
                    ))
                  )}
                </div>
              </div>
              <div className="revision-card">
                <strong>Throughput per Editor</strong>
                <div className="revision-list">
                  {editorPerformance.throughputByEditor.length === 0 ? (
                    <span className="muted-copy">No cards moved to Review+ in range.</span>
                  ) : (
                    editorPerformance.throughputByEditor.map((row) => (
                      <span key={row.editorName}>
                        {row.editorName} — {row.cardsCompleted} cards
                      </span>
                    ))
                  )}
                </div>
              </div>
              <div className="revision-card">
                <strong>Stage Bottleneck View</strong>
                <div className="revision-list">
                  {editorPerformance.stageBottlenecks.map((row) => (
                    <span key={row.stage}>
                      {row.stage} — {row.avgDurationHours !== null ? `${row.avgDurationHours}h avg` : '—'} ({row.sampleSize} samples)
                    </span>
                  ))}
                </div>
              </div>
              <div className="revision-card">
                <strong>Editor Comparison</strong>
                <div className="revision-list">
                  {editorPerformance.editorComparison.length === 0 ? (
                    <span className="muted-copy">No editor performance data in range.</span>
                  ) : (
                    editorPerformance.editorComparison.map((row) => (
                      <span key={row.editorName}>
                        {row.editorName} — Cycle: {row.avgCycleTimeHours !== null ? `${row.avgCycleTimeHours}h` : '—'} · Throughput: {row.throughput} · Active: {row.activeCards}
                      </span>
                    ))
                  )}
                </div>
              </div>
            </div>
          )}
        </section>
      ) : null}
    </div>
  )
}
