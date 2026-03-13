import { useMemo, type ReactNode } from 'react'
import { useDraggable, useDroppable } from '@dnd-kit/core'
import { CSS } from '@dnd-kit/utilities'
import {
  formatDateShort,
  formatDurationShort,
  formatHours,
  getCardAgeMs,
  getDueStatus,
  getTaskTypeById,
  getWorkloadData,
  type Card,
  type GlobalSettings,
  type Portfolio,
  type Timeframe,
} from '../board'
import { PageHeader } from './PageHeader'

interface WorkloadPageProps {
  portfolio: Portfolio
  settings: GlobalSettings
  timeframe: Timeframe
  nowMs: number
  canAssign: boolean
  activeDragCardId: string | null
  headerUtilityContent?: ReactNode
  onTimeframeChange: (timeframe: Timeframe) => void
  onOpenEditorBoard: (ownerName: string) => void
  onOpenCard: (portfolioId: string, cardId: string) => void
}

function getUtilizationWidths(utilizationPct: number) {
  return {
    baseWidth: `${Math.min(utilizationPct, 100)}%`,
    overflowWidth: `${Math.min(Math.max(utilizationPct - 100, 0), 50)}%`,
  }
}

function WorkloadQueueCard({
  card,
  settings,
  onOpen,
  canDrag,
}: {
  card: Card
  settings: GlobalSettings
  onOpen: () => void
  canDrag: boolean
}) {
  const { attributes, listeners, setNodeRef, transform, isDragging } = useDraggable({
    id: card.id,
    disabled: !canDrag,
  })
  const taskType = getTaskTypeById(settings, card.taskTypeId)
  const dueStatus = getDueStatus(card)

  return (
    <button
      ref={setNodeRef}
      type="button"
      className={`queue-card ${isDragging ? 'is-dragging' : ''}`}
      style={{
        transform: CSS.Translate.toString(transform),
      }}
      onClick={onOpen}
      {...attributes}
      {...listeners}
    >
      <span className="queue-card-id">{card.id}</span>
      <span className="queue-card-title">{card.title}</span>
      <span className="queue-card-type">{`${taskType.icon} ${taskType.name}`}</span>
      <span className="queue-card-effort">{formatHours(card.estimatedHours)}</span>
      <div className="queue-card-meta">
        <span className="queue-card-age">{formatDurationShort(getCardAgeMs(card))}</span>
        {card.dueDate ? (
          <span
            className={`queue-card-due ${
              dueStatus === 'overdue' ? 'is-overdue' : dueStatus === 'soon' ? 'is-soon' : ''
            }`}
          >
            {dueStatus === 'overdue' ? (
              <span className="queue-card-badge">OVERDUE</span>
            ) : null}
            {`Due ${formatDateShort(card.dueDate)}`}
          </span>
        ) : null}
      </div>
    </button>
  )
}

function WorkloadDropRow({
  memberId,
  memberName,
  children,
  dragActive,
}: {
  memberId: string
  memberName: string
  children: ReactNode
  dragActive: boolean
}) {
  const { isOver, setNodeRef } = useDroppable({
    id: `workload-member-${memberId}`,
  })

  return (
    <div
      ref={setNodeRef}
      role="group"
      aria-label={`Assign to ${memberName}`}
      className={`workload-row ${dragActive ? 'is-drag-surface' : ''} ${isOver ? 'is-over' : ''}`}
    >
      {children}
    </div>
  )
}

export function WorkloadPage({
  portfolio,
  settings,
  timeframe,
  nowMs,
  canAssign,
  activeDragCardId,
  headerUtilityContent,
  onTimeframeChange,
  onOpenEditorBoard,
  onOpenCard,
}: WorkloadPageProps) {
  const workload = useMemo(
    () => getWorkloadData(portfolio, settings, timeframe, nowMs),
    [nowMs, portfolio, settings, timeframe],
  )

  return (
    <div className="page-shell">
      <PageHeader
        title="Workload"
        rightContent={
          <>
            {headerUtilityContent}
            <select
              className="inline-select"
              value={timeframe}
              onChange={(event) => onTimeframeChange(event.target.value as Timeframe)}
            >
              <option value="this-week">This Week</option>
              <option value="next-week">Next Week</option>
              <option value="this-month">This Month</option>
            </select>
          </>
        }
      />

      <section className="workload-section">
        <div className="workload-section-head">
          <h2>Team Utilization</h2>
        </div>
        {workload.rows.length === 0 ? (
          <div className="dashboard-placeholder">Add team members in Settings to see workload</div>
        ) : (
          <div className="workload-grid">
            {workload.rows.map((row) => (
              (() => {
                const { baseWidth, overflowWidth } = getUtilizationWidths(row.utilizationPct)

                return (
                  <WorkloadDropRow
                    key={row.member.id}
                    memberId={row.member.id}
                    memberName={row.member.name}
                    dragActive={activeDragCardId !== null}
                  >
                    <button
                      type="button"
                      className="workload-row-name"
                      onClick={() => onOpenEditorBoard(row.member.name)}
                    >
                      {row.member.name}
                    </button>
                    <div className="workload-row-bar">
                      <div className={`util-bar large ${row.utilizationPct > 100 ? 'is-overflowing' : ''}`}>
                        <span
                          className={`util-bar-fill is-${row.utilizationTone}`}
                          style={{ width: baseWidth }}
                        />
                        {row.utilizationPct > 100 ? (
                          <span className="util-bar-overflow" style={{ width: overflowWidth }} />
                        ) : null}
                      </div>
                      <div className="workload-row-meta">
                        <span className={`util-inline is-${row.utilizationTone}`}>
                          {row.utilizationPct}% ·{' '}
                          {`${formatHours(row.capacityUsed)}/${formatHours(row.capacityTotal)}`}
                        </span>
                        {row.utilizationPct > 100 ? <span className="overload-label">OVER</span> : null}
                        {row.partTimeLabel ? <span className="muted-copy">{row.partTimeLabel}</span> : null}
                      </div>
                      <div className="workload-breakdown-line">
                        {row.breakdown.length > 0
                          ? row.breakdown
                              .map((item) => `${item.taskTypeName}(${formatHours(item.hours)})`)
                              .join(' + ')
                          : 'No active cards'}
                      </div>
                    </div>
                  </WorkloadDropRow>
                )
              })()
            ))}
          </div>
        )}
      </section>

      <section className="workload-section">
        <div className="workload-section-head">
          <h2>{`Unassigned Work · ${workload.queue.length} cards · ~${formatHours(workload.queueHours)} total`}</h2>
        </div>
        {workload.queue.length === 0 ? (
          <div className="dashboard-placeholder">All cards are assigned</div>
        ) : (
          <div className="workload-queue">
            {workload.queue.map((item) => {
              const card = portfolio.cards.find((currentCard) => currentCard.id === item.cardId)
              if (!card) {
                return null
              }
              return (
                <WorkloadQueueCard
                  key={item.cardId}
                  card={card}
                  settings={settings}
                  onOpen={() => onOpenCard(portfolio.id, item.cardId)}
                  canDrag={canAssign}
                />
              )
            })}
          </div>
        )}
      </section>
    </div>
  )
}
