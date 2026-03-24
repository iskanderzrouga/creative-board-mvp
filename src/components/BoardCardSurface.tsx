import { memo } from 'react'
import type { DraggableAttributes, DraggableSyntheticListeners } from '@dnd-kit/core'
import {
  formatDateShort,
  getAgeToneFromMs,
  getBrandSurface,
  getBrandTextColor,
  getCardAgeMs,
  getTaskTypeById,
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
        <span className={`card-age tone-${tone}`}>{formatDateShort(card.dateCreated)}</span>
      </div>
    </button>
  )
}

export const BoardCardSurface = memo(BoardCardSurfaceComponent)
