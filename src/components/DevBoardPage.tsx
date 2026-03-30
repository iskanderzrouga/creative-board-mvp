import { useMemo, useState } from 'react'
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
import {
  DEV_BOARD_COLUMNS,
  type DevBoardColumnId,
  type DevBoardState,
  type DevCard,
} from '../board'
import { PageHeader } from './PageHeader'
import { DevCardDetailPanel } from './DevCardDetailPanel'
import { BlockedIcon } from './icons/AppIcons'

interface DevBoardPageProps {
  board: DevBoardState
  teamMemberNames: string[]
  canEdit: boolean
  showToast: (message: string, tone: 'green' | 'amber' | 'red' | 'blue') => void
  onMoveCard: (cardId: string, columnId: DevBoardColumnId) => { ok: true } | { ok: false; message: string }
  onUpdateCard: (cardId: string, updates: Partial<DevCard>) => void
}

function getColumnDropId(columnId: DevBoardColumnId) {
  return `dev-column:${columnId}`
}

function getColumnIdFromDropId(dropId: string): DevBoardColumnId | null {
  if (!dropId.startsWith('dev-column:')) {
    return null
  }

  const candidate = dropId.replace('dev-column:', '') as DevBoardColumnId
  return DEV_BOARD_COLUMNS.some((column) => column.id === candidate) ? candidate : null
}

function DevCardTile({
  card,
  canEdit,
  onOpen,
}: {
  card: DevCard
  canEdit: boolean
  onOpen: (cardId: string) => void
}) {
  const { attributes, listeners, setNodeRef, transform, isDragging } = useDraggable({
    id: card.id,
    disabled: !canEdit,
  })

  return (
    <button
      ref={setNodeRef}
      type="button"
      className={`backlog-card dev-card-tile ${isDragging ? 'is-dragging' : ''}`}
      style={{
        transform: CSS.Translate.toString(transform),
      }}
      onClick={() => onOpen(card.id)}
      {...listeners}
      {...attributes}
    >
      <div className="backlog-card-topline">
        <strong>{card.title}</strong>
        {card.blocker ? (
          <span className="dev-blocker-indicator" aria-label="Card has active blocker" title={card.blocker.details || 'Card is blocked'}>
            <BlockedIcon />
          </span>
        ) : null}
      </div>
      <div className="backlog-card-meta">
        <span>{card.assignee || 'Unassigned'}</span>
        <span>{card.changeRequestType}</span>
      </div>
    </button>
  )
}

function DevColumn({
  id,
  label,
  cards,
  canEdit,
  onOpenCard,
}: {
  id: DevBoardColumnId
  label: string
  cards: DevCard[]
  canEdit: boolean
  onOpenCard: (cardId: string) => void
}) {
  const { isOver, setNodeRef } = useDroppable({ id: getColumnDropId(id) })

  return (
    <section className="backlog-column dev-board-column">
      <header>
        <h3>{label}</h3>
        <span>{cards.length}</span>
      </header>
      <div ref={setNodeRef} className={`backlog-drop-zone ${isOver ? 'is-over' : ''}`}>
        <div className="backlog-drop-zone-list">
          {cards.length > 0 ? (
            cards.map((card) => (
              <DevCardTile key={card.id} card={card} canEdit={canEdit} onOpen={onOpenCard} />
            ))
          ) : (
            <div className="backlog-empty-slot">{canEdit ? 'Drop tasks here' : 'No tasks yet'}</div>
          )}
        </div>
      </div>
    </section>
  )
}

export function DevBoardPage({
  board,
  teamMemberNames,
  canEdit,
  showToast,
  onMoveCard,
  onUpdateCard,
}: DevBoardPageProps) {
  const sensors = useSensors(
    useSensor(PointerSensor, {
      activationConstraint: {
        distance: 6,
      },
    }),
  )
  const [activeCardId, setActiveCardId] = useState<string | null>(null)
  const [selectedCardId, setSelectedCardId] = useState<string | null>(null)

  const activeDragCard = useMemo(
    () => (activeCardId ? board.cards.find((card) => card.id === activeCardId) ?? null : null),
    [activeCardId, board.cards],
  )
  const selectedCard = selectedCardId ? board.cards.find((card) => card.id === selectedCardId) ?? null : null

  function handleDragStart(event: DragStartEvent) {
    setActiveCardId(String(event.active.id))
  }

  function handleDragEnd(event: DragEndEvent) {
    setActiveCardId(null)

    if (!canEdit || !event.over) {
      return
    }

    const cardId = String(event.active.id)
    const destinationColumn = getColumnIdFromDropId(String(event.over.id))
    if (!destinationColumn) {
      return
    }

    const result = onMoveCard(cardId, destinationColumn)
    if (!result.ok) {
      showToast(result.message, 'amber')
    }
  }

  return (
    <div className="page-shell">
      <PageHeader
        title="Development Board"
        rightContent={null}
      />

      <DndContext
        sensors={sensors}
        collisionDetection={closestCorners}
        onDragStart={handleDragStart}
        onDragEnd={handleDragEnd}
      >
        <main className="backlog-board-shell dev-board-shell">
          {DEV_BOARD_COLUMNS.map((column) => (
            <DevColumn
              key={column.id}
              id={column.id}
              label={column.label}
              cards={board.cards.filter((card) => card.column === column.id)}
              canEdit={canEdit}
              onOpenCard={setSelectedCardId}
            />
          ))}
        </main>

        <DragOverlay>
          {activeDragCard ? (
            <div className="backlog-card dev-card-overlay">
              <div className="backlog-card-topline">
                <strong>{activeDragCard.title}</strong>
              </div>
            </div>
          ) : null}
        </DragOverlay>
      </DndContext>

      <DevCardDetailPanel
        card={selectedCard}
        isOpen={Boolean(selectedCard)}
        teamMemberNames={teamMemberNames}
        onClose={() => setSelectedCardId(null)}
        onSave={(updates) => {
          if (!selectedCard) {
            return
          }
          onUpdateCard(selectedCard.id, updates)
        }}
      />
    </div>
  )
}
