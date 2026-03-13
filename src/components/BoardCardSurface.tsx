import { memo } from 'react'
import type { DraggableAttributes, DraggableSyntheticListeners } from '@dnd-kit/core'
import {
  getAgeToneFromMs,
  getBrandSurface,
  getBrandTextColor,
  getCardAgeMs,
  getCardCompletionForecast,
  getDueStatus,
  getTaskTypeById,
  type Card,
  type GlobalSettings,
  type Portfolio,
  type StageId,
  type TaskType,
} from '../board'
import { BlockedIcon, ClockIcon } from './icons/AppIcons'

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
}

function getTypePillLabel(taskType: TaskType) {
  return `${taskType.icon} ${taskType.name}`
}

function shouldShowBoardEstimate(stage: StageId) {
  return stage === 'Briefed' || stage === 'In Production'
}

function formatEstimatedDaysLabel(days: number | null) {
  if (days === null) {
    return 'Unscheduled'
  }

  if (days <= 0) {
    return 'Today'
  }

  return `~${days} ${days === 1 ? 'day' : 'days'}`
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
}: BoardCardSurfaceProps) {
  const taskType = getTaskTypeById(settings, card.taskTypeId)
  const ageMs = getCardAgeMs(card, nowMs)
  const tone = getAgeToneFromMs(ageMs, settings)
  const dueStatus = getDueStatus(card, nowMs)
  const completionForecast = getCardCompletionForecast(portfolio, card, nowMs)
  const showEstimate = shouldShowBoardEstimate(card.stage)

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
      </div>

      <div className="board-card-footer">
        <span className={card.stage === 'Backlog' ? 'card-owner is-unassigned' : 'card-owner'}>
          {card.stage === 'Backlog' ? 'Unassigned' : card.owner ?? 'Unassigned'}
        </span>
        {showEstimate ? (
          <span className={`card-age ${completionForecast.isScheduled ? `tone-${tone}` : 'is-unscheduled'}`}>
            {dueStatus === 'overdue' ? (
              <span className="due-indicator is-overdue" aria-hidden="true">
                <ClockIcon />
              </span>
            ) : null}
            {dueStatus === 'soon' ? (
              <span className="due-indicator is-soon" aria-hidden="true">
                <ClockIcon />
              </span>
            ) : null}
            {formatEstimatedDaysLabel(completionForecast.estimatedDays)}
          </span>
        ) : null}
      </div>
    </button>
  )
}

export const BoardCardSurface = memo(BoardCardSurfaceComponent)
