import { memo, useEffect, useRef, useState } from 'react'
import type { DraggableAttributes, DraggableSyntheticListeners } from '@dnd-kit/core'
import {
  formatDateShort,
  getAgeToneFromMs,
  getBrandSurface,
  getBrandTextColor,
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
import { BlockedIcon, LinkIcon } from './icons/AppIcons'

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
  showEditorStartButton?: boolean
  showEditorInProgress?: boolean
  canStartEditorTimer?: boolean
  onStartEditorTimer?: () => void
  canEditTitle?: boolean
  onSaveTitle?: (title: string) => void
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
  showEditorStartButton = false,
  showEditorInProgress = false,
  canStartEditorTimer = false,
  onStartEditorTimer,
  canEditTitle = false,
  onSaveTitle,
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
  const [copyFeedbackVisible, setCopyFeedbackVisible] = useState(false)
  const [isEditingTitle, setIsEditingTitle] = useState(false)
  const [titleDraft, setTitleDraft] = useState(card.title)
  const titleInputRef = useRef<HTMLInputElement | null>(null)
  const skipOpenAfterDoubleClickRef = useRef(false)

  useEffect(() => {
    if (!isEditingTitle || !titleInputRef.current) {
      return
    }
    titleInputRef.current.focus()
    titleInputRef.current.select()
  }, [isEditingTitle])

  function handleOpenCard() {
    if (skipOpenAfterDoubleClickRef.current || isEditingTitle) {
      skipOpenAfterDoubleClickRef.current = false
      return
    }
    onOpen()
  }

  function commitTitleEdit() {
    const nextTitle = titleDraft.trim()
    setIsEditingTitle(false)
    if (!nextTitle || nextTitle === card.title) {
      setTitleDraft(card.title)
      return
    }
    onSaveTitle?.(nextTitle)
  }

  function cancelTitleEdit() {
    setIsEditingTitle(false)
    setTitleDraft(card.title)
  }

  async function handleCopyCardLink(event: React.MouseEvent | React.KeyboardEvent) {
    event.stopPropagation()
    event.preventDefault()

    const shareUrl = `https://creative-board-lake.vercel.app/board?card=${card.id}`
    try {
      await navigator.clipboard.writeText(shareUrl)
      setCopyFeedbackVisible(true)
      window.setTimeout(() => setCopyFeedbackVisible(false), 1400)
    } catch {
      setCopyFeedbackVisible(false)
    }
  }

  return (
    <button
      type="button"
      className={`board-card tone-${tone} cursor-${cursorMode} ${
        card.blocked ? 'is-flagged' : ''
      } ${isDragging ? 'is-dragging' : ''} ${isOverlay ? 'is-overlay' : ''} ${
        isInvalid ? 'is-invalid' : ''
      }`}
      aria-label={`Open card ${card.id}: ${card.title}`}
      onClick={handleOpenCard}
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
        <span
          role="button"
          tabIndex={0}
          className="board-card-copy-action"
          aria-label={`Copy link for ${card.id}`}
          title="Copy card link"
          onMouseDown={(event) => event.stopPropagation()}
          onClick={handleCopyCardLink}
          onKeyDown={(event) => {
            if (event.key === 'Enter' || event.key === ' ') {
              void handleCopyCardLink(event)
            }
          }}
        >
          <LinkIcon />
        </span>
        {copyFeedbackVisible ? <span className="card-progress-chip">Link copied</span> : null}
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
        {showEditorStartButton ? (
          <span
            className={`card-progress-chip as-button ${canStartEditorTimer ? '' : 'is-disabled'}`}
            role={canStartEditorTimer ? 'button' : undefined}
            tabIndex={canStartEditorTimer ? 0 : undefined}
            aria-disabled={!canStartEditorTimer}
            onMouseDown={(event) => event.stopPropagation()}
            onClick={(event) => {
              event.stopPropagation()
              event.preventDefault()
              if (canStartEditorTimer) {
                onStartEditorTimer?.()
              }
            }}
            onKeyDown={(event) => {
              if (!canStartEditorTimer) {
                return
              }
              if (event.key === 'Enter' || event.key === ' ') {
                event.preventDefault()
                event.stopPropagation()
                onStartEditorTimer?.()
              }
            }}
            aria-label={`Start in-production tracking for ${card.id}`}
          >
            Start
          </span>
        ) : null}
        {showEditorInProgress ? <span className="card-progress-chip">In Progress</span> : null}
        {revisionCount > 0 && <span className="revision-badge">R{revisionCount}</span>}
      </div>

      {isEditingTitle ? (
        <input
          ref={titleInputRef}
          className="board-card-title-input"
          value={titleDraft}
          aria-label={`Edit title for ${card.id}`}
          onMouseDown={(event) => event.stopPropagation()}
          onClick={(event) => event.stopPropagation()}
          onDoubleClick={(event) => event.stopPropagation()}
          onChange={(event) => setTitleDraft(event.target.value)}
          onBlur={commitTitleEdit}
          onKeyDown={(event) => {
            event.stopPropagation()
            if (event.key === 'Enter') {
              event.preventDefault()
              commitTitleEdit()
            } else if (event.key === 'Escape') {
              event.preventDefault()
              cancelTitleEdit()
            }
          }}
        />
      ) : (
        <p
          className={`board-card-title ${canEditTitle ? 'is-editable' : ''}`}
          onDoubleClick={(event) => {
            if (!canEditTitle) {
              return
            }
            event.preventDefault()
            event.stopPropagation()
            skipOpenAfterDoubleClickRef.current = true
            setTitleDraft(card.title)
            setIsEditingTitle(true)
          }}
        >
          {card.title}
        </p>
      )}

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
