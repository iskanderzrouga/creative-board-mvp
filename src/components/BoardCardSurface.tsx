import { memo, useMemo, useState } from 'react'
import type { DraggableAttributes, DraggableSyntheticListeners } from '@dnd-kit/core'
import {
  formatDateShort,
  getAgeToneFromMs,
  getBrandSurface,
  getBrandTextColor,
  getBatchById,
  getCardAgeMs,
  getTaskTypeById,
  getP1DeadlineStatus,
  getTypePillLabel,
  isCreativeTaskTypeId,
  getRevisionCount,
  type Card,
  type CardPriority,
  type GlobalSettings,
  type Portfolio,
} from '../board'
import { BlockedIcon } from './icons/AppIcons'

interface BoardCardSurfaceProps {
  card: Card
  portfolio: Portfolio
  settings: GlobalSettings
  nowMs: number
  onOpen: () => void
  cursorMode: 'drag' | 'pointer'
  isDragging?: boolean
  isOverlay?: boolean
  isInvalid?: boolean
  attributes?: DraggableAttributes
  listeners?: DraggableSyntheticListeners
  onCyclePriority?: () => void
  onAssignBatch?: (batchId: string | null) => void
  canManageBatch: boolean
}

function getPriorityBadgeTone(priority: CardPriority) {
  if (priority === 1) return 'priority-1'
  if (priority === 2) return 'priority-2'
  return 'priority-3'
}

function getPriorityLabel(priority: CardPriority) {
  return priority === 1 || priority === 2 || priority === 3 ? String(priority) : '1'
}

function BoardCardSurfaceComponent({
  card,
  portfolio,
  settings,
  nowMs,
  onOpen,
  cursorMode,
  isDragging = false,
  isOverlay = false,
  isInvalid = false,
  attributes,
  listeners,
  onCyclePriority,
  onAssignBatch,
  canManageBatch,
}: BoardCardSurfaceProps) {
  const taskType = getTaskTypeById(settings, card.taskTypeId)
  const ageMs = getCardAgeMs(card, nowMs)
  const tone = getAgeToneFromMs(ageMs, settings)
  const revisionCount = getRevisionCount(card)
  const showFunnelStage = isCreativeTaskTypeId(taskType.id)
  const showPriorityControl =
    card.stage === 'In Production' && Boolean(card.owner) && !isOverlay && Boolean(onCyclePriority)
  const priorityTone = getPriorityBadgeTone(card.priority)
  const priorityLabel = getPriorityLabel(card.priority)
  const p1DeadlineStatus = getP1DeadlineStatus(card, nowMs)
  const [batchMenuOpen, setBatchMenuOpen] = useState(false)
  const batch = getBatchById(portfolio, card.batchId)
  const brandBatches = useMemo(
    () =>
      portfolio.batches
        .filter((item) => item.brand === card.brand)
        .sort((left, right) => left.name.localeCompare(right.name)),
    [card.brand, portfolio.batches],
  )

  return (
    <button
      type="button"
      className={`board-card tone-${tone} cursor-${cursorMode} ${
        card.blocked ? 'is-flagged' : ''
      } ${isDragging ? 'is-dragging' : ''} ${isOverlay ? 'is-overlay' : ''} ${
        isInvalid ? 'is-invalid' : ''
      }`}
      aria-label={`Open card ${card.id}: ${card.title}`}
      onClick={onOpen}
      {...attributes}
      {...listeners}
    >
      <div className="board-card-top">
        <div className="board-card-indicators">
          {card.blocked ? (
            <span className="board-card-flag" aria-hidden="true">
              <BlockedIcon />
            </span>
          ) : null}
        </div>
        <span className="board-card-id">{card.id}</span>
        {showPriorityControl ? (
          <span
            className={`production-priority-badge ${priorityTone}`}
            role="button"
            tabIndex={0}
            onMouseDown={(event) => event.stopPropagation()}
            onClick={(event) => {
              event.stopPropagation()
              event.preventDefault()
              onCyclePriority?.()
            }}
            onKeyDown={(event) => {
              if (event.key === 'Enter' || event.key === ' ') {
                event.preventDefault()
                event.stopPropagation()
                onCyclePriority?.()
              }
            }}
            aria-label={`Set ${card.id} priority (current ${priorityLabel})`}
          >
            P{priorityLabel}
          </span>
        ) : null}
        {revisionCount > 0 && <span className="revision-badge">R{revisionCount}</span>}
        {batch ? (
          <div className="batch-pill-shell">
            <span
              className={`batch-pill ${canManageBatch ? 'is-editable' : ''}`}
              role={canManageBatch ? 'button' : undefined}
              tabIndex={canManageBatch ? 0 : -1}
              onMouseDown={(event) => event.stopPropagation()}
              onClick={(event) => {
                if (!canManageBatch) {
                  return
                }
                event.stopPropagation()
                event.preventDefault()
                setBatchMenuOpen((current) => !current)
              }}
            >
              {batch.name}
            </span>
            {canManageBatch && batchMenuOpen ? (
              <div
                className="batch-menu"
                onMouseDown={(event) => event.stopPropagation()}
                onClick={(event) => event.stopPropagation()}
              >
                {brandBatches.map((option) => (
                  <button
                    key={option.id}
                    type="button"
                    className={`batch-menu-item ${card.batchId === option.id ? 'is-active' : ''}`}
                    onClick={() => {
                      onAssignBatch?.(option.id)
                      setBatchMenuOpen(false)
                    }}
                  >
                    {option.name}
                  </button>
                ))}
                <button
                  type="button"
                  className="batch-menu-item is-danger"
                  onClick={() => {
                    onAssignBatch?.(null)
                    setBatchMenuOpen(false)
                  }}
                >
                  Remove batch
                </button>
              </div>
            ) : null}
          </div>
        ) : null}
      </div>

      <p className="board-card-title">{card.title}</p>

      <div className="board-card-tags">
        <span
          className="brand-pill"
          style={{
            background: getBrandSurface(portfolio, card.brand),
            color: getBrandTextColor(portfolio, card.brand),
          }}
        >
          {card.brand}
        </span>
        <span
          className="task-type-pill"
          style={{
            background: taskType.color,
            color: taskType.textColor,
          }}
        >
          {getTypePillLabel(taskType)}
        </span>
        {showFunnelStage ? (
          <span className={`funnel-pill funnel-${card.funnelStage.toLowerCase().replace(/\s+/g, '-')}`}>
            {card.funnelStage}
          </span>
        ) : null}
      </div>

      <div className="board-card-footer">
        <span className={card.stage === 'Backlog' ? 'card-owner is-unassigned' : 'card-owner'}>
          {card.stage === 'Backlog' ? 'Unassigned' : card.owner ?? 'Unassigned'}
        </span>
        {p1DeadlineStatus ? (
          <span className={`p1-deadline-chip tone-${p1DeadlineStatus.tone}`}>{p1DeadlineStatus.label}</span>
        ) : (
          <span className={`card-age tone-${tone}`}>{formatDateShort(card.dateCreated)}</span>
        )}
      </div>
    </button>
  )
}

export const BoardCardSurface = memo(BoardCardSurfaceComponent)
