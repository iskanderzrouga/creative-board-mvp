import { useMemo, useState, type ReactNode } from 'react'
import {
  buildDashboardData,
  formatDateShort,
  formatHours,
  type AppState,
  type StageId,
} from '../board'
import { PageHeader } from './PageHeader'
import { BlockedIcon } from './icons/AppIcons'

interface AnalyticsPageProps {
  state: AppState
  nowMs: number
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
          <div className="dashboard-placeholder">No team members found.</div>
        ) : (
          <div className="dashboard-table">
            <div className="dashboard-table-row dashboard-table-head analytics-team-grid">
              <span>Editor</span>
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
                  data-label="Editor"
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
              <strong>Editors with highest revision rates (last 30 days)</strong>
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
    </div>
  )
}
