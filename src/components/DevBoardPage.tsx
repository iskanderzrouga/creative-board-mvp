import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import {
  DndContext,
  DragOverlay,
  PointerSensor,
  closestCorners,
  useDraggable,
  useDroppable,
  useSensor,
  useSensors,
  type DragEndEvent,
  type DragStartEvent,
} from '@dnd-kit/core'
import { CSS } from '@dnd-kit/utilities'
import { PageHeader } from './PageHeader'
import { BlockedIcon } from './icons/AppIcons'
import {
  DEV_BOARD_COLUMNS,
  getDevBoardStats,
  getDevCardBlockerReason,
  hasActiveDevBlocker,
  type DevBoardColumnId,
  type DevBoardState,
  type DevCard,
  type TeamMember,
} from '../board'

interface DevBoardPageProps {
  devBoard: DevBoardState
  teamMembers: TeamMember[]
  canEdit: boolean
  showToast: (message: string, tone: 'green' | 'amber' | 'red' | 'blue') => void
  headerUtilityContent?: ReactNode
  onAddCard: () => void
  onMoveCard: (cardId: string, destinationColumn: DevBoardColumnId) => { ok: boolean; message?: string }
  onOpenCard: (cardId: string) => void
  onSaveCardTitle: (cardId: string, title: string) => void
}

function getDropColumnId(value: string | null): DevBoardColumnId | null {
  if (!value) {
    return null
  }
  if (value.startsWith('dev-column:')) {
    return value.replace('dev-column:', '') as DevBoardColumnId
  }
  return null
}

function DevCardItem({
  card,
  onOpen,
  canDrag,
  teamMembers,
  canEditTitle,
  onSaveTitle,
}: {
  card: DevCard
  onOpen: () => void
  canDrag: boolean
  teamMembers: TeamMember[]
  canEditTitle: boolean
  onSaveTitle: (title: string) => void
}) {
  const { attributes, listeners, setNodeRef, transform, isDragging } = useDraggable({
    id: card.id,
    disabled: !canDrag,
  })
  const status = card.status ?? 'not-started'
  const statusLabel = status === 'in-progress' ? 'In Progress' : status === 'done' ? 'Done' : 'Not Started'
  const statusStyles =
    status === 'in-progress'
      ? { backgroundColor: '#dbeafe', color: '#1d4ed8' }
      : status === 'done'
        ? { backgroundColor: '#dcfce7', color: '#15803d' }
        : { backgroundColor: '#e5e7eb', color: '#374151' }
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

  function commitTitleEdit() {
    const nextTitle = titleDraft.trim()
    setIsEditingTitle(false)
    if (!nextTitle || nextTitle === card.title) {
      setTitleDraft(card.title)
      return
    }
    onSaveTitle(nextTitle)
  }

  function cancelTitleEdit() {
    setIsEditingTitle(false)
    setTitleDraft(card.title)
  }

  async function handleCopyCardLink(event: React.MouseEvent | React.KeyboardEvent) {
    event.stopPropagation()
    event.preventDefault()

    const shareUrl = `https://creative-board-lake.vercel.app/dev?card=${card.id}`
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
      ref={setNodeRef}
      type="button"
      className={`board-card dev-card status-${status} cursor-${canDrag ? 'drag' : 'pointer'} ${
        isDragging ? 'is-dragging' : ''
      } ${
        hasActiveDevBlocker(card) ? 'is-flagged' : ''
      }`}
      style={{
        transform: CSS.Translate.toString(transform),
      }}
      onClick={() => {
        if (skipOpenAfterDoubleClickRef.current || isEditingTitle) {
          skipOpenAfterDoubleClickRef.current = false
          return
        }
        onOpen()
      }}
      {...attributes}
      {...listeners}
    >
      <div className="board-card-top">
        <div className="board-card-indicators">
          {hasActiveDevBlocker(card) ? (
            <span className="board-card-flag" aria-hidden="true" title={getDevCardBlockerReason(card) ?? undefined}>
              <BlockedIcon />
            </span>
          ) : null}
        </div>
        <span className="board-card-id">{card.id}</span>
        <span
          role="button"
          tabIndex={0}
          aria-label={`Copy link for ${card.id}`}
          title="Copy card link"
          onMouseDown={(event) => event.stopPropagation()}
          onClick={handleCopyCardLink}
          onKeyDown={(event) => {
            if (event.key === 'Enter' || event.key === ' ') {
              void handleCopyCardLink(event)
            }
          }}
          style={{ marginLeft: 'auto', fontSize: '0.85rem', opacity: 0.7 }}
        >
          🔗
        </span>
        {copyFeedbackVisible ? <span className="card-progress-chip">Link copied</span> : null}
      </div>
      <div>
        <span
          style={{
            display: 'inline-block',
            borderRadius: 999,
            fontSize: '0.72rem',
            fontWeight: 600,
            letterSpacing: '0.02em',
            lineHeight: 1.2,
            padding: '0.2rem 0.5rem',
            marginBottom: '0.45rem',
            ...statusStyles,
          }}
        >
          {statusLabel}
        </span>
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
        <span className="brand-pill">{card.brand}</span>
        <span className="task-type-pill">{card.changeRequestType}</span>
      </div>
      <div className="board-card-footer">
        <span className="card-owner">{card.assigneeId ? teamMemberNameById(card.assigneeId, teamMembers) : 'Unassigned'}</span>
        <span className="card-age">{card.dueDate ?? 'No due date'}</span>
      </div>
    </button>
  )
}

function teamMemberNameById(teamMemberId: string, teamMembers: TeamMember[]) {
  return teamMembers.find((member) => member.id === teamMemberId)?.name ?? 'Unassigned'
}

function DevDropColumn({
  column,
  cards,
  canEdit,
  teamMembers,
  onOpenCard,
  onSaveCardTitle,
}: {
  column: DevBoardColumnId
  cards: DevCard[]
  canEdit: boolean
  teamMembers: TeamMember[]
  onOpenCard: (cardId: string) => void
  onSaveCardTitle: (cardId: string, title: string) => void
}) {
  const dropId = `dev-column:${column}`
  const { setNodeRef, isOver } = useDroppable({
    id: dropId,
  })

  return (
    <article className="board-column">
      <header className="board-column-header">
        <div>
          <h2>{column}</h2>
          <span>{cards.length} cards</span>
        </div>
      </header>
      <div ref={setNodeRef} className={`board-lane ${isOver ? 'is-highlighted' : ''}`}>
        {cards.length === 0 ? <p className="board-lane-empty">No cards in this column yet.</p> : null}
        <div className="board-card-list">
          {cards.map((card) => (
            <DevCardItem
              key={card.id}
              card={card}
              onOpen={() => onOpenCard(card.id)}
              canDrag={canEdit}
              teamMembers={teamMembers}
              canEditTitle={canEdit}
              onSaveTitle={(title) => onSaveCardTitle(card.id, title)}
            />
          ))}
        </div>
      </div>
    </article>
  )
}

export function DevBoardPage({
  devBoard,
  teamMembers,
  canEdit,
  showToast,
  headerUtilityContent,
  onAddCard,
  onMoveCard,
  onOpenCard,
  onSaveCardTitle,
}: DevBoardPageProps) {
  const sensors = useSensors(
    useSensor(PointerSensor, {
      activationConstraint: { distance: 6 },
    }),
  )
  const [activeDragCardId, setActiveDragCardId] = useState<string | null>(null)

  const groupedCards = useMemo(() => {
    return DEV_BOARD_COLUMNS.reduce<Record<DevBoardColumnId, DevCard[]>>((accumulator, column) => {
      accumulator[column] = devBoard.cards.filter((card) => card.column === column)
      return accumulator
    }, {} as Record<DevBoardColumnId, DevCard[]>)
  }, [devBoard.cards])

  const stats = useMemo(() => getDevBoardStats(devBoard), [devBoard])
  const activeDragCard = activeDragCardId
    ? devBoard.cards.find((card) => card.id === activeDragCardId) ?? null
    : null

  function handleDragStart(event: DragStartEvent) {
    setActiveDragCardId(String(event.active.id))
  }

  function handleDragEnd(event: DragEndEvent) {
    setActiveDragCardId(null)
    if (!canEdit) {
      showToast('You do not have permission to move Dev board cards.', 'red')
      return
    }

    const cardId = String(event.active.id)
    const destination = getDropColumnId(event.over ? String(event.over.id) : null)
    if (!destination) {
      return
    }

    const result = onMoveCard(cardId, destination)
    if (!result.ok && result.message) {
      showToast(result.message, 'red')
    }
  }

  return (
    <div className="page-shell">
      <PageHeader
        title="Development Board"
        rightContent={
          <>
            {canEdit ? (
              <button type="button" className="primary-button" onClick={onAddCard}>
                + Add card
              </button>
            ) : null}
            {headerUtilityContent}
          </>
        }
      />

      <section className="dev-board-subtitle" aria-label="Development board context">
        <p>
          Track development tasks from briefing through QA to launch. Dev/CRO cards from the Backlog board land here
          automatically.
        </p>
      </section>

      <section className="stats-bar" aria-label="Development board statistics">
        <div className="stat-inline-item">
          <span className="stat-inline-label">Total</span>
          <strong>{stats.total}</strong>
          <span className="stat-divider">·</span>
        </div>
        {DEV_BOARD_COLUMNS.map((column) => (
          <div key={column} className="stat-inline-item">
            <span className="stat-inline-label">{column}</span>
            <strong>{stats.byColumn[column]}</strong>
            <span className="stat-divider">·</span>
          </div>
        ))}
      </section>

      <DndContext sensors={sensors} collisionDetection={closestCorners} onDragStart={handleDragStart} onDragEnd={handleDragEnd}>
        <div className="board-grid" role="list" aria-label="Development board columns">
          {DEV_BOARD_COLUMNS.map((column) => (
            <DevDropColumn
              key={column}
              column={column}
              cards={groupedCards[column]}
              canEdit={canEdit}
              teamMembers={teamMembers}
              onOpenCard={onOpenCard}
              onSaveCardTitle={onSaveCardTitle}
            />
          ))}
        </div>

        <DragOverlay>
          {activeDragCard ? (
            <div className="board-card is-overlay">
              <div className="board-card-top">
                <span className="board-card-id">{activeDragCard.id}</span>
              </div>
              <p className="board-card-title">{activeDragCard.title}</p>
            </div>
          ) : null}
        </DragOverlay>
      </DndContext>
    </div>
  )
}
