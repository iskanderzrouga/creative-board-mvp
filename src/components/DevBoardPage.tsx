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
import { useId, useMemo, useRef, useState, type Dispatch, type ReactNode, type SetStateAction } from 'react'
import { useModalAccessibility } from '../hooks/useModalAccessibility'
import { PageHeader } from './PageHeader'
import {
  DEV_BOARD_COLUMNS,
  addDevBoardQuickTask,
  addDevBoardComment,
  moveDevBoardCard,
  updateDevBoardCard,
  type DevBoardCard,
  type DevBoardColumnId,
  type DevBoardState,
} from '../devBoard'
import { XIcon } from './icons/AppIcons'

interface DevBoardPageProps {
  board: DevBoardState
  showToast: (message: string, tone: 'green' | 'amber' | 'red' | 'blue') => void
  headerUtilityContent: ReactNode
  actorName: string
  brandOptions: string[]
  nowMs: number
  onChange: Dispatch<SetStateAction<DevBoardState>>
}

interface DevCardItemProps {
  card: DevBoardCard
  nowMs: number
  onOpen: (cardId: string) => void
}

interface DevQuickCreateForm {
  title: string
  brand: string
  taskDescription: string
  assignedDeveloper: DevBoardCard['assignedDeveloper']
}

function getDefaultQuickCreateForm(brandOptions: string[]): DevQuickCreateForm {
  return {
    title: '',
    brand: brandOptions[0] ?? '',
    taskDescription: '',
    assignedDeveloper: null,
  }
}

function getDropTargetFromId(value: string): DevBoardColumnId | null {
  if (!value.startsWith('dev-column:')) {
    return null
  }

  return value.replace('dev-column:', '') as DevBoardColumnId
}

function formatDeadline(deadline: string | null, nowMs: number) {
  if (!deadline) {
    return null
  }

  const remainingMs = new Date(deadline).getTime() - nowMs
  if (!Number.isFinite(remainingMs)) {
    return null
  }

  if (remainingMs <= 0) {
    return 'Overdue'
  }

  const hours = Math.floor(remainingMs / (1000 * 60 * 60))
  const minutes = Math.floor((remainingMs % (1000 * 60 * 60)) / (1000 * 60))
  return `${hours}h ${minutes}m left`
}

function DevCardItem({ card, nowMs, onOpen }: DevCardItemProps) {
  const { attributes, listeners, setNodeRef, transform, isDragging } = useDraggable({
    id: card.id,
  })

  const style = {
    transform: transform ? CSS.Translate.toString(transform) : undefined,
  }

  return (
    <button
      ref={setNodeRef}
      type="button"
      style={style}
      className={`board-card cursor-pointer ${isDragging ? 'is-dragging' : ''}`}
      onClick={() => onOpen(card.id)}
      {...listeners}
      {...attributes}
    >
      <div className="board-card-top">
        <span className="board-card-id">{card.id}</span>
        {card.priority ? <span className={`priority-badge priority-${card.priority}`}>P{card.priority}</span> : null}
      </div>
      <h4 className="board-card-title">{card.title}</h4>
      <div className="board-card-tags">
        <span className="card-pill">{card.brand}</span>
        {card.assignedDeveloper ? <span className="card-pill">{card.assignedDeveloper}</span> : null}
      </div>
      {card.priority === 1 && card.p1Deadline ? (
        <div className="board-card-footer">
          <small>{formatDeadline(card.p1Deadline, nowMs)}</small>
        </div>
      ) : null}
    </button>
  )
}

function DevColumn({
  columnId,
  label,
  cards,
  nowMs,
  onOpenCard,
}: {
  columnId: DevBoardColumnId
  label: string
  cards: DevBoardCard[]
  nowMs: number
  onOpenCard: (cardId: string) => void
}) {
  const { setNodeRef, isOver } = useDroppable({
    id: `dev-column:${columnId}`,
  })

  return (
    <section className="stage-column" role="listitem">
      <div className="stage-column-header">
        <h2>
          {label} <span>· {cards.length}</span>
        </h2>
      </div>
      <div ref={setNodeRef} className={`stage-column-content ${isOver ? 'is-hovered' : ''}`}>
        {cards.map((card) => (
          <DevCardItem key={card.id} card={card} nowMs={nowMs} onOpen={onOpenCard} />
        ))}
      </div>
    </section>
  )
}

function DevQuickCreateModal({
  pending,
  value,
  brandOptions,
  onChange,
  onClose,
  onCreate,
}: {
  pending: boolean
  value: DevQuickCreateForm
  brandOptions: string[]
  onChange: (updates: Partial<DevQuickCreateForm>) => void
  onClose: () => void
  onCreate: () => void
}) {
  const modalRef = useRef<HTMLDivElement | null>(null)
  const titleId = useId()
  useModalAccessibility(modalRef, true)
  const canCreate = Boolean(value.title.trim() && value.brand)

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
            <h2 id={titleId}>Add task</h2>
            <p className="muted-copy">Create a new Development task in To Brief.</p>
          </div>
          <button type="button" className="close-icon-button" aria-label="Close add task dialog" onClick={onClose}>
            <XIcon />
          </button>
        </div>

        <label className="quick-create-field full-width">
          <span>Task name</span>
          <input
            autoFocus
            value={value.title}
            onChange={(event) => onChange({ title: event.target.value })}
            placeholder="Task name"
            onKeyDown={(event) => {
              if (event.key === 'Enter' && canCreate) {
                event.preventDefault()
                onCreate()
              }
            }}
          />
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

        <label className="quick-create-field full-width">
          <span>Task description</span>
          <textarea
            rows={4}
            value={value.taskDescription}
            onChange={(event) => onChange({ taskDescription: event.target.value })}
            placeholder="Describe the development task"
          />
        </label>

        <label className="quick-create-field full-width">
          <span>Assigned developer</span>
          <select
            value={value.assignedDeveloper ?? ''}
            onChange={(event) =>
              onChange({
                assignedDeveloper: (event.target.value || null) as DevBoardCard['assignedDeveloper'],
              })
            }
          >
            <option value="">Unassigned</option>
            <option value="Daniel J">Daniel J</option>
            <option value="Kevin Ma">Kevin Ma</option>
          </select>
        </label>

        <div className="quick-create-actions">
          <button type="button" className="ghost-button" onClick={onClose}>
            Cancel
          </button>
          <button type="button" className="primary-button" disabled={!canCreate || pending} onClick={onCreate}>
            Add task
          </button>
        </div>
      </div>
    </>
  )
}

export function DevBoardPage({ board, showToast, headerUtilityContent, actorName, brandOptions, nowMs, onChange }: DevBoardPageProps) {
  const [selectedCardId, setSelectedCardId] = useState<string | null>(null)
  const [dragCardId, setDragCardId] = useState<string | null>(null)
  const [developerFilter, setDeveloperFilter] = useState<'all' | 'Daniel J' | 'Kevin Ma'>('all')
  const [brandFilter, setBrandFilter] = useState<string[]>([])
  const [showCompleted, setShowCompleted] = useState(true)
  const [commentDraft, setCommentDraft] = useState('')
  const [quickCreateOpen, setQuickCreateOpen] = useState(false)
  const [quickCreatePending, setQuickCreatePending] = useState(false)
  const [quickCreateForm, setQuickCreateForm] = useState<DevQuickCreateForm>(() => getDefaultQuickCreateForm(brandOptions))
  const allBrandsSelected = brandFilter.length === 0
  const brandColorByName: Record<string, string> = {
    Pluxy: '#f87171',
    ViVi: '#34d399',
    TrueClean: '#60a5fa',
  }

  const sensors = useSensors(
    useSensor(PointerSensor, {
      activationConstraint: { distance: 5 },
    }),
  )

  const selectedCard = selectedCardId ? board.cards.find((card) => card.id === selectedCardId) ?? null : null
  const filteredCards = useMemo(() => {
    return board.cards.filter((card) => {
      const developerMatch = developerFilter === 'all' || card.assignedDeveloper === developerFilter
      const brandMatch = brandFilter.length === 0 || brandFilter.includes(card.brand)
      const completedMatch = showCompleted || card.column !== 'live'
      return developerMatch && brandMatch && completedMatch
    })
  }, [board.cards, brandFilter, developerFilter, showCompleted])

  const cardsByColumn = useMemo(
    () =>
      DEV_BOARD_COLUMNS.reduce<Record<DevBoardColumnId, DevBoardCard[]>>((acc, column) => {
        const cards = filteredCards
          .filter((card) => card.column === column.id)
          .slice()
          .sort((left, right) => {
            if (column.id === 'up-next') {
              const leftPriority = left.priority ?? Number.MAX_SAFE_INTEGER
              const rightPriority = right.priority ?? Number.MAX_SAFE_INTEGER
              if (leftPriority !== rightPriority) {
                return leftPriority - rightPriority
              }
            }
            return left.positionInColumn - right.positionInColumn
          })
        acc[column.id] = cards
        return acc
      }, {} as Record<DevBoardColumnId, DevBoardCard[]>),
    [filteredCards],
  )

  const activeDragCard = dragCardId ? board.cards.find((card) => card.id === dragCardId) ?? null : null

  function toggleBrandFilter(brandName: string) {
    setBrandFilter((current) =>
      current.includes(brandName) ? current.filter((item) => item !== brandName) : [...current, brandName],
    )
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

    const card = board.cards.find((item) => item.id === cardId)
    if (!card) {
      return
    }
    const overCard = board.cards.find((item) => item.id === overId) ?? null
    const destinationColumn = getDropTargetFromId(overId) ?? overCard?.column ?? null
    if (!destinationColumn) {
      return
    }
    const destinationIndex = overCard
      ? cardsByColumn[destinationColumn].findIndex((item) => item.id === overCard.id)
      : cardsByColumn[destinationColumn].length

    if (card.column === destinationColumn) {
      return
    }

    const before = board
    const next = moveDevBoardCard(before, cardId, destinationColumn, destinationIndex)
    if (next === before) {
      showToast('At capacity — developer already has 3 cards in Up Next.', 'red')
      return
    }

    onChange(next)
  }

  function handleSaveCard(cardId: string, updates: Partial<DevBoardCard>) {
    onChange((current) => updateDevBoardCard(current, cardId, updates, actorName))
  }

  function handleAddComment() {
    if (!selectedCard) {
      return
    }

    onChange((current) => addDevBoardComment(current, selectedCard.id, commentDraft, actorName))
    setCommentDraft('')
  }

  return (
    <div className="page-shell backlog-page-shell">
      <PageHeader
        title="Development"
        rightContent={
          <>
            <button
              type="button"
              className="primary-button"
              onClick={() => {
                setQuickCreateForm(getDefaultQuickCreateForm(brandOptions))
                setQuickCreateOpen(true)
              }}
            >
              + Add task
            </button>
            {headerUtilityContent}
          </>
        }
      />
      <p className="backlog-page-subtitle">Track and manage development and CRO tasks through the pipeline.</p>

      <section className="stats-bar" aria-label="Development statistics">
        <div className="stat-inline-item">
          <span className="stat-inline-label">Total</span>
          <strong>{filteredCards.length}</strong>
          <span className="stat-divider">·</span>
        </div>
        {DEV_BOARD_COLUMNS.map((column, index) => (
          <div key={column.id} className="stat-inline-item">
            <span className="stat-inline-label">{column.label}</span>
            <strong>{cardsByColumn[column.id].length}</strong>
            {index < DEV_BOARD_COLUMNS.length - 1 ? <span className="stat-divider">·</span> : null}
          </div>
        ))}
      </section>

      <section className="manager-filter-bar" aria-label="Development filters">
        <div className="manager-filter-cluster">
          <span className="filter-group-label">Brand</span>
          <div className="manager-filter-group">
            <button
              type="button"
              className={`filter-pill ${allBrandsSelected ? 'is-active is-all' : ''}`}
              onClick={() => setBrandFilter([])}
            >
              All
            </button>
            {brandOptions.map((brandName) => {
              const active = allBrandsSelected || brandFilter.includes(brandName)
              return (
                <button
                  key={brandName}
                  type="button"
                  className={`filter-pill ${active ? 'is-active' : ''}`}
                  style={
                    active
                      ? {
                          background: brandColorByName[brandName] ?? '#64748b',
                          borderColor: brandColorByName[brandName] ?? '#64748b',
                          color: '#fff',
                        }
                      : undefined
                  }
                  onClick={() => toggleBrandFilter(brandName)}
                >
                  {brandName}
                </button>
              )
            })}
          </div>
        </div>

        <span className="filter-group-divider" aria-hidden="true" />
        <div className="manager-filter-cluster">
          <span className="filter-group-label">Teammate</span>
          <div className="manager-editor-pills">
            {(['Daniel J', 'Kevin Ma'] as const).map((developer) => (
              <button
                key={developer}
                type="button"
                className={`editor-pill ${developerFilter === developer ? 'is-active' : ''}`}
                onClick={() =>
                  setDeveloperFilter((current) => (current === developer ? 'all' : developer))
                }
              >
                {developer}
              </button>
            ))}
          </div>
        </div>

        <label className="archive-toggle">
          <input type="checkbox" checked={showCompleted} onChange={(event) => setShowCompleted(event.target.checked)} />
          <span>Show completed</span>
        </label>
      </section>

      <DndContext sensors={sensors} collisionDetection={closestCorners} onDragStart={handleDragStart} onDragEnd={handleDragEnd}>
        <div className="board-grid" role="list" aria-label="Development board columns">
          {DEV_BOARD_COLUMNS.map((column) => (
            <DevColumn
              key={column.id}
              columnId={column.id}
              label={column.label}
              cards={cardsByColumn[column.id]}
              nowMs={nowMs}
              onOpenCard={setSelectedCardId}
            />
          ))}
        </div>

        <DragOverlay>
          {activeDragCard ? (
            <div className="board-card is-overlay">
              <div className="board-card-top">
                <span className="board-card-id">{activeDragCard.id}</span>
              </div>
              <h4 className="board-card-title">{activeDragCard.title}</h4>
            </div>
          ) : null}
        </DragOverlay>
      </DndContext>

      <div className={`panel-overlay ${selectedCard ? 'is-visible' : ''}`} onClick={() => setSelectedCardId(null)} />
      <aside className={`slide-panel backlog-detail-panel ${selectedCard ? 'is-open' : ''}`} aria-hidden={!selectedCard}>
        {selectedCard ? (
          <>
            <header className="slide-panel-header">
              <div className="slide-panel-header-main">
                <h2>Dev card details</h2>
                <button type="button" className="ghost-button" onClick={() => setSelectedCardId(null)}>
                  Close
                </button>
              </div>
            </header>

            <section className="panel-section metadata-grid">
              <label className="backlog-panel-field-full">
                <span>Card title</span>
                <input value={selectedCard.title} onChange={(event) => handleSaveCard(selectedCard.id, { title: event.target.value })} />
              </label>

              <label>
                <span>Brand</span>
                <input value={selectedCard.brand} readOnly />
              </label>

              <label>
                <span>Assigned developer</span>
                <select
                  value={selectedCard.assignedDeveloper ?? ''}
                  onChange={(event) =>
                    handleSaveCard(selectedCard.id, {
                      assignedDeveloper: (event.target.value || null) as DevBoardCard['assignedDeveloper'],
                    })
                  }
                >
                  <option value="">Unassigned</option>
                  <option value="Daniel J">Daniel J</option>
                  <option value="Kevin Ma">Kevin Ma</option>
                </select>
              </label>

              <label>
                <span>Priority</span>
                <select
                  value={selectedCard.priority ?? ''}
                  onChange={(event) =>
                    handleSaveCard(selectedCard.id, {
                      priority: (event.target.value ? Number(event.target.value) : null) as DevBoardCard['priority'],
                    })
                  }
                >
                  <option value="">None</option>
                  <option value="1">P1</option>
                  <option value="2">P2</option>
                  <option value="3">P3</option>
                </select>
              </label>

              <label className="backlog-panel-field-full">
                <span>Task Description</span>
                <textarea
                  rows={4}
                  value={selectedCard.taskDescription}
                  onChange={(event) => handleSaveCard(selectedCard.id, { taskDescription: event.target.value })}
                />
              </label>

              <label className="backlog-panel-field-full">
                <span>Link for Test</span>
                <input
                  value={selectedCard.linkForTest}
                  onChange={(event) => handleSaveCard(selectedCard.id, { linkForTest: event.target.value })}
                />
              </label>

              <label className="backlog-panel-field-full">
                <span>Link for Changes</span>
                <input
                  value={selectedCard.linkForChanges}
                  onChange={(event) => handleSaveCard(selectedCard.id, { linkForChanges: event.target.value })}
                />
              </label>

              <label className="backlog-panel-field-full">
                <span>Status notes / comments</span>
                <textarea rows={4} value={selectedCard.statusNotes} onChange={(event) => handleSaveCard(selectedCard.id, { statusNotes: event.target.value })} />
              </label>
            </section>

            <section className="panel-section">
              <h3 className="panel-section-title">Comments</h3>
              <div className="backlog-panel-comment-input">
                <textarea rows={3} value={commentDraft} onChange={(event) => setCommentDraft(event.target.value)} placeholder="Add a status note or comment" />
                <button type="button" className="primary-button" onClick={handleAddComment}>
                  Add comment
                </button>
              </div>
              <div className="comment-list">
                {selectedCard.comments.map((comment) => (
                  <article key={comment.id} className="comment-entry">
                    <div className="comment-meta">
                      <strong>{comment.author}</strong>
                      <span>{new Date(comment.createdAt).toLocaleString()}</span>
                    </div>
                    <p>{comment.text}</p>
                  </article>
                ))}
              </div>
            </section>

            <section className="panel-section">
              <h3 className="panel-section-title">Activity log</h3>
              <ul className="activity-log-list">
                {selectedCard.activity.map((entry) => (
                  <li key={entry.id}>
                    <strong>{new Date(entry.createdAt).toLocaleString()}:</strong> {entry.message}
                  </li>
                ))}
              </ul>
            </section>
          </>
        ) : null}
      </aside>

      {quickCreateOpen ? (
        <DevQuickCreateModal
          pending={quickCreatePending}
          value={quickCreateForm}
          brandOptions={brandOptions}
          onChange={(updates) => setQuickCreateForm((current) => ({ ...current, ...updates }))}
          onClose={() => setQuickCreateOpen(false)}
          onCreate={() => {
            if (!quickCreateForm.title.trim() || !quickCreateForm.brand) {
              return
            }
            setQuickCreatePending(true)
            onChange((current) =>
              addDevBoardQuickTask(
                current,
                {
                  title: quickCreateForm.title,
                  brand: quickCreateForm.brand,
                  taskDescription: quickCreateForm.taskDescription,
                  assignedDeveloper: quickCreateForm.assignedDeveloper,
                },
                actorName,
              ),
            )
            setQuickCreatePending(false)
            setQuickCreateOpen(false)
            showToast('Dev task created in To Brief.', 'green')
          }}
        />
      ) : null}
    </div>
  )
}
