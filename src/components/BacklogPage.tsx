import { useId, useMemo, useRef, useState, type ReactNode } from 'react'
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
  BACKLOG_COLUMN_DEFINITIONS,
  BACKLOG_TASK_TYPES,
  OPS_PRIORITY_SUB_STAGES,
  addBacklogCard,
  moveBacklogCard,
  type BacklogCard,
  type BacklogColumnId,
  type BacklogState,
  type BacklogTaskType,
  type OpsSubStage,
} from '../backlog'
import { useModalAccessibility } from '../hooks/useModalAccessibility'
import { PageHeader } from './PageHeader'
import { XIcon } from './icons/AppIcons'

interface BacklogPageProps {
  backlog: BacklogState
  brandOptions: string[]
  brandStyles: Record<string, { background: string; color: string }>
  actorName: string
  canCreate: boolean
  headerUtilityContent?: ReactNode
  onChange: (nextState: BacklogState) => void
}

interface BacklogQuickCreateForm {
  name: string
  taskType: BacklogTaskType
  brand: string
}

interface BacklogDropTarget {
  column: BacklogColumnId
  opsSubStage?: OpsSubStage
}

function getDefaultQuickCreateForm(brandOptions: string[]): BacklogQuickCreateForm {
  return {
    name: '',
    taskType: 'creative',
    brand: brandOptions[0] ?? '',
  }
}

function getTaskTypeLabel(taskType: BacklogTaskType) {
  switch (taskType) {
    case 'creative':
      return 'Creative'
    case 'dev-cro':
      return 'Dev/CRO'
    case 'operations':
      return 'Operations'
  }
}

function getFormattedDate(dateAdded: string) {
  const parsed = new Date(dateAdded)
  if (Number.isNaN(parsed.getTime())) {
    return 'Unknown date'
  }

  return parsed.toLocaleDateString(undefined, {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  })
}

function getDropTargetFromId(value: string): BacklogDropTarget | null {
  if (value.startsWith('column:')) {
    return {
      column: value.replace('column:', '') as BacklogColumnId,
    }
  }

  if (value.startsWith('ops:')) {
    return {
      column: 'ops-priority',
      opsSubStage: value.replace('ops:', '') as OpsSubStage,
    }
  }

  return null
}

function BacklogCardItem({
  card,
  brandStyles,
}: {
  card: BacklogCard
  brandStyles: Record<string, { background: string; color: string }>
}) {
  const { attributes, listeners, setNodeRef, transform, isDragging } = useDraggable({
    id: card.id,
  })
  const brandStyle = brandStyles[card.brand]

  return (
    <button
      ref={setNodeRef}
      type="button"
      className={`backlog-card ${isDragging ? 'is-dragging' : ''}`}
      style={{
        transform: CSS.Translate.toString(transform),
      }}
      {...listeners}
      {...attributes}
    >
      <div className="backlog-card-topline">
        <strong>{card.name}</strong>
        <div className="backlog-card-badges">
          <span className={`backlog-task-badge is-${card.taskType}`}>{getTaskTypeLabel(card.taskType)}</span>
          <span className="brand-pill backlog-brand-pill" style={brandStyle}>
            {card.brand}
          </span>
        </div>
      </div>
      <div className="backlog-card-meta">
        <span>{card.addedBy}</span>
        <span>{getFormattedDate(card.dateAdded)}</span>
      </div>
    </button>
  )
}

function BacklogDropZone({
  dropId,
  label,
  cards,
  brandStyles,
}: {
  dropId: string
  label?: string
  cards: BacklogCard[]
  brandStyles: Record<string, { background: string; color: string }>
}) {
  const { isOver, setNodeRef } = useDroppable({
    id: dropId,
  })

  return (
    <div ref={setNodeRef} className={`backlog-drop-zone ${isOver ? 'is-over' : ''}`}>
      {label ? <div className="backlog-substage-label">{label}</div> : null}
      <div className="backlog-drop-zone-list">
        {cards.length > 0 ? (
          cards.map((card) => <BacklogCardItem key={card.id} card={card} brandStyles={brandStyles} />)
        ) : (
          <div className="backlog-empty-slot">Drop ideas here</div>
        )}
      </div>
    </div>
  )
}

function BacklogQuickCreateModal({
  brandOptions,
  pending,
  value,
  onChange,
  onClose,
  onCreate,
}: {
  brandOptions: string[]
  pending: boolean
  value: BacklogQuickCreateForm
  onChange: (updates: Partial<BacklogQuickCreateForm>) => void
  onClose: () => void
  onCreate: () => void
}) {
  const modalRef = useRef<HTMLDivElement | null>(null)
  const titleId = useId()
  useModalAccessibility(modalRef, true)

  const canCreate = Boolean(value.name.trim() && value.taskType && value.brand)

  return (
    <>
      <div className="modal-overlay" aria-hidden="true" onClick={onClose} />
      <div
        ref={modalRef}
        className="quick-create-modal backlog-create-modal"
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        tabIndex={-1}
      >
        <div className="quick-create-head">
          <div>
            <h2 id={titleId}>Add idea</h2>
            <p className="muted-copy">Create a new backlog item in New Idea.</p>
          </div>
          <button type="button" className="close-icon-button" aria-label="Close add idea dialog" onClick={onClose}>
            <XIcon />
          </button>
        </div>

        <label className="quick-create-field full-width">
          <span>Name</span>
          <input
            autoFocus
            value={value.name}
            onChange={(event) => onChange({ name: event.target.value })}
            placeholder="Idea name"
            onKeyDown={(event) => {
              if (event.key === 'Enter' && canCreate) {
                event.preventDefault()
                onCreate()
              }
            }}
          />
        </label>

        <label className="quick-create-field full-width">
          <span>Task Type</span>
          <select
            value={value.taskType}
            onChange={(event) => onChange({ taskType: event.target.value as BacklogTaskType })}
          >
            {BACKLOG_TASK_TYPES.map((taskType) => (
              <option key={taskType} value={taskType}>
                {getTaskTypeLabel(taskType)}
              </option>
            ))}
          </select>
        </label>

        <label className="quick-create-field full-width">
          <span>Brand</span>
          <select value={value.brand} onChange={(event) => onChange({ brand: event.target.value })}>
            {brandOptions.map((brand) => (
              <option key={brand} value={brand}>
                {brand}
              </option>
            ))}
          </select>
        </label>

        <div className="quick-create-actions">
          <button type="button" className="ghost-button" onClick={onClose}>
            Cancel
          </button>
          <button type="button" className="primary-button" disabled={!canCreate || pending} onClick={onCreate}>
            Add idea
          </button>
        </div>
      </div>
    </>
  )
}

export function BacklogPage({
  backlog,
  brandOptions,
  brandStyles,
  actorName,
  canCreate,
  headerUtilityContent,
  onChange,
}: BacklogPageProps) {
  const sensors = useSensors(
    useSensor(PointerSensor, {
      activationConstraint: {
        distance: 6,
      },
    }),
  )
  const [dragCardId, setDragCardId] = useState<string | null>(null)
  const [quickCreateOpen, setQuickCreateOpen] = useState(false)
  const [form, setForm] = useState<BacklogQuickCreateForm>(() => getDefaultQuickCreateForm(brandOptions))

  const cardsByColumn = useMemo(() => {
    return BACKLOG_COLUMN_DEFINITIONS.reduce<Record<BacklogColumnId, BacklogCard[]>>((accumulator, column) => {
      accumulator[column.id] = backlog.cards.filter((card) => card.column === column.id)
      return accumulator
    }, {
      'new-idea': [],
      'under-review': [],
      prioritized: [],
      'moved-to-production': [],
      'ops-priority': [],
    })
  }, [backlog.cards])

  const opsCards = cardsByColumn['ops-priority']
  const activeDragCard = dragCardId ? backlog.cards.find((card) => card.id === dragCardId) ?? null : null

  function handleAddIdea() {
    const nextName = form.name.trim()
    if (!nextName || !form.brand) {
      return
    }

    const nextState = addBacklogCard(backlog, {
      name: nextName,
      taskType: form.taskType,
      brand: form.brand,
      addedBy: actorName,
    })

    onChange(nextState)
    setQuickCreateOpen(false)
    setForm(getDefaultQuickCreateForm(brandOptions))
  }

  function handleDragStart(event: DragStartEvent) {
    setDragCardId(String(event.active.id))
  }

  function handleDragEnd(event: DragEndEvent) {
    setDragCardId(null)
    const cardId = String(event.active.id)
    const overId = event.over ? String(event.over.id) : null
    if (!overId) {
      return
    }

    const target = getDropTargetFromId(overId)
    if (!target) {
      return
    }

    const currentCard = backlog.cards.find((card) => card.id === cardId)
    if (!currentCard) {
      return
    }

    if (currentCard.column === target.column && currentCard.opsSubStage === target.opsSubStage) {
      return
    }

    onChange(moveBacklogCard(backlog, cardId, target.column, target.opsSubStage))
  }

  return (
    <div className="page-shell backlog-page-shell">
      <PageHeader
        title="Backlog"
        rightContent={
          <>
            {canCreate ? (
              <button
                type="button"
                className="primary-button"
                onClick={() => {
                  setForm(getDefaultQuickCreateForm(brandOptions))
                  setQuickCreateOpen(true)
                }}
              >
                + Add idea
              </button>
            ) : null}
            {headerUtilityContent}
          </>
        }
      />
      <p className="backlog-page-subtitle">
        Capture ideas, evaluate strategies, and prioritize work before it moves to Production.
      </p>

      <DndContext sensors={sensors} collisionDetection={closestCorners} onDragStart={handleDragStart} onDragEnd={handleDragEnd}>
        <div className="backlog-board" role="list" aria-label="Backlog board columns">
          {BACKLOG_COLUMN_DEFINITIONS.map((column) => {
            const columnCards = cardsByColumn[column.id]
            const isOpsColumn = column.id === 'ops-priority'

            return (
              <section key={column.id} className="backlog-column" aria-label={column.label}>
                <div className="backlog-column-header">
                  <h2>{column.label}</h2>
                  <span>{columnCards.length}</span>
                </div>

                {isOpsColumn ? (
                  <div className="backlog-ops-groups">
                    {OPS_PRIORITY_SUB_STAGES.map((stage) => (
                      <BacklogDropZone
                        key={stage.id}
                        dropId={`ops:${stage.id}`}
                        label={stage.label}
                        cards={opsCards.filter((card) => (card.opsSubStage ?? 'todo') === stage.id)}
                        brandStyles={brandStyles}
                      />
                    ))}
                  </div>
                ) : (
                  <BacklogDropZone dropId={`column:${column.id}`} cards={columnCards} brandStyles={brandStyles} />
                )}
              </section>
            )
          })}
        </div>

        <DragOverlay>
          {activeDragCard ? <BacklogCardItem card={activeDragCard} brandStyles={brandStyles} /> : null}
        </DragOverlay>
      </DndContext>

      {quickCreateOpen ? (
        <BacklogQuickCreateModal
          brandOptions={brandOptions}
          pending={false}
          value={form}
          onChange={(updates) => setForm((current) => ({ ...current, ...updates }))}
          onClose={() => setQuickCreateOpen(false)}
          onCreate={handleAddIdea}
        />
      ) : null}
    </div>
  )
}
