import { useMemo, useState, type ReactNode } from 'react'
import {
  buildDashboardData,
  formatDateShort,
  formatHours,
  type AppState,
  type StageId,
} from '../board'
import { PageHeader } from './PageHeader'

interface AnalyticsPageProps {
  state: AppState
  nowMs: number
  headerUtilityContent?: ReactNode
  onOpenCard: (portfolioId: string, cardId: string) => void
  onOpenPortfolioBoard: (portfolioId: string) => void
  onOpenEditorBoard: (portfolioId: string, ownerName: string) => void
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

  return (
    <div className="page-shell">
      <PageHeader title="Analytics" rightContent={headerUtilityContent} />

      <section>
        <h2 className="dashboard-section-title">Portfolio Overview</h2>
        <div className="overview-grid">
          {dashboard.overviewCards.map((portfolio) => (
            <button
              key={portfolio.portfolioId}
              type="button"
              className="overview-card"
              onClick={() => onOpenPortfolioBoard(portfolio.portfolioId)}
            >
              <strong>{portfolio.name.toUpperCase()}</strong>
              <span>{portfolio.activeCards} active cards</span>
              <div className="overview-progress">
                <div
                  className="overview-progress-fill"
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
      </section>

      <section>
        <h2 className="dashboard-section-title">Pipeline Funnel</h2>
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
                  <span>{card.isBlocked ? `🚫 ${card.title}` : card.title}</span>
                  <span>{card.portfolioName}</span>
                  <span>{card.owner ?? 'Unassigned'}</span>
                </button>
              ))}
          </div>
        ) : null}
      </section>

      <section>
        <h2 className="dashboard-section-title">Team Capacity Grid</h2>
        <div className="dashboard-table">
          <div className="dashboard-table-row dashboard-table-head analytics-team-grid">
            <span>Editor</span>
            <span>Portfolio</span>
            <span>Active</span>
            <span>Utilization</span>
            <span>Capacity</span>
            <span>Workload</span>
            <span>Avg Cycle Time</span>
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
                onClick={() => onOpenEditorBoard(row.portfolioId, row.editorName)}
              >
                {row.editorName}
              </button>
              <span>{row.portfolioName}</span>
              <span>{row.active}</span>
              <span className={`util-inline is-${row.utilizationTone}`}>
                {row.utilizationPct}%{' '}
                {row.utilizationTone === 'green' ? '🟢' : row.utilizationTone === 'yellow' ? '🟡' : '🔴'}
              </span>
              <span>{`${formatHours(row.usedHours)}/${formatHours(row.totalHours)}`}</span>
              <span>{`~${row.workloadDays}d`}</span>
              <span>{row.avgCycleTime ? `${row.avgCycleTime}d` : '—'}</span>
              <span>{row.avgRevisionsPerCard ? `${row.avgRevisionsPerCard}/card` : '—'}</span>
            </div>
          ))}
        </div>
      </section>

      <section>
        <h2 className="dashboard-section-title">Stuck Cards Alert</h2>
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
      </section>

      <section>
        <h2 className="dashboard-section-title">Throughput</h2>
        {dashboard.throughput.every((week) => week.total === 0) ? (
          <div className="dashboard-placeholder">
            Throughput data will appear as cards move through the pipeline.
          </div>
        ) : (
          <div className="throughput-chart">
            {dashboard.throughput.map((week) => (
              <div key={week.label} className="throughput-column">
                <div className="throughput-bar">
                  {week.segments.map((segment) => (
                    <span
                      key={`${week.label}-${segment.brand}`}
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
        )}
      </section>

      <section>
        <h2 className="dashboard-section-title">Brand Health Summary</h2>
        <div className="dashboard-table">
          <div className="dashboard-table-row dashboard-table-head brand-health-grid">
            <span>Brand</span>
            <span>Active</span>
            <span>Stuck</span>
            <span>In Production</span>
            <span>Avg Cycle Time</span>
            <span>Last Shipped</span>
          </div>
          {dashboard.brandHealth.map((row, index) => (
            <div
              key={`${row.portfolioId}-${row.brand}`}
              className={`dashboard-table-row brand-health-grid ${index % 2 === 1 ? 'is-alt' : ''}`}
            >
              <span className="brand-health-name">
                <span className="brand-dot" style={{ background: row.color }} />
                {row.brand}
              </span>
              <span>{row.active}</span>
              <span>{row.stuck}</span>
              <span>{row.inProduction}</span>
              <span>{row.avgCycleTime ? `${row.avgCycleTime}d` : '—'}</span>
              <span>{row.lastShipped ? formatDateShort(row.lastShipped) : '—'}</span>
            </div>
          ))}
        </div>
      </section>

      <section>
        <h2 className="dashboard-section-title">Revision Patterns</h2>
        <div className="revision-grid">
          <div className="revision-card">
            <strong>Top reasons cards are sent back (last 30 days)</strong>
            <div className="revision-list">
              {dashboard.revisionReasons.map((reason, index) => (
                <span key={reason.reason}>
                  {index + 1}. {reason.reason} — {reason.count} cards ({reason.percent}%)
                </span>
              ))}
            </div>
          </div>
          <div className="revision-card">
            <strong>Editors with highest revision rates (last 30 days)</strong>
            <div className="revision-list">
              {dashboard.editorRevisionRates.map((item, index) => (
                <span key={item.editorName}>
                  {index + 1}. {item.editorName} — {item.avgRevisionsPerCard} revisions/card avg
                </span>
              ))}
            </div>
          </div>
        </div>
      </section>
    </div>
  )
}
