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
  deleteBacklogCard,
  getBacklogMissingProductionFields,
  moveBacklogCard,
  updateBacklogCard,
  type BacklogCard,
  type BacklogColumnId,
  type BacklogState,
  type BacklogTaskType,
  type OpsSubStage,
} from '../backlog'
import { useModalAccessibility } from '../hooks/useModalAccessibility'
import { BacklogCardDetailPanel } from './BacklogCardDetailPanel'
import { PageHeader } from './PageHeader'
import { XIcon } from './icons/AppIcons'

interface BacklogPageProps {
  backlog: BacklogState
  brandOptions: string[]
  brandStyles: Record<string, { background: string; color: string }>
  creativeProductionTaskTypeOptions: Array<{ id: string; name: string }>
  devProductionTaskTypeOptions: Array<{ id: string; name: string }>
  actorName: string
  canCreate: boolean
  showToast: (message: string, tone: 'green' | 'amber' | 'red' | 'blue') => void
  headerUtilityContent?: ReactNode
  onChange: (nextState: BacklogState) => void
  onMoveToProduction: (card: BacklogCard) => { ok: true; cardId: string; portfolioId: string } | { ok: false }
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

const ACTIVE_BRAND_FILTER_COLORS: Record<string, string> = {
  Pluxy: '#dc2626',
  ViVi: '#059669',
  TrueClean: '#0284c7',
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

function getActiveBrandFilterStyle(
  brandName: string,
  brandStyles: Record<string, { background: string; color: string }>,
) {
  const activeColor = ACTIVE_BRAND_FILTER_COLORS[brandName] ?? brandStyles[brandName]?.color ?? 'var(--text-strong)'
  return {
    background: activeColor,
    borderColor: activeColor,
    color: '#fff',
  }
}

function getActiveTaskTypeFilterStyle(taskType: BacklogTaskType) {
  switch (taskType) {
    case 'creative':
      return {
        background: '#2563eb',
        borderColor: '#2563eb',
        color: '#fff',
      }
    case 'dev-cro':
      return {
        background: '#7c3aed',
        borderColor: '#7c3aed',
        color: '#fff',
      }
    case 'operations':
      return {
        background: '#f97316',
        borderColor: '#f97316',
        color: '#fff',
      }
  }
}

function BacklogCardItem({
  card,
  brandStyles,
  onOpen,
}: {
  card: BacklogCard
  brandStyles: Record<string, { background: string; color: string }>
  onOpen: (cardId: string) => void
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
      onClick={() => onOpen(card.id)}
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
  onOpenCard,
}: {
  dropId: string
  label?: string
  cards: BacklogCard[]
  brandStyles: Record<string, { background: string; color: string }>
  onOpenCard: (cardId: string) => void
}) {
  const { isOver, setNodeRef } = useDroppable({
    id: dropId,
  })

  return (
    <div ref={setNodeRef} className={`backlog-drop-zone ${isOver ? 'is-over' : ''}`}>
      {label ? <div className="backlog-substage-label">{label}</div> : null}
      <div className="backlog-drop-zone-list">
        {cards.length > 0 ? (
          cards.map((card) => (
            <BacklogCardItem key={card.id} card={card} brandStyles={brandStyles} onOpen={onOpenCard} />
          ))
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
  creativeProductionTaskTypeOptions,
  devProductionTaskTypeOptions,
  actorName,
  canCreate,
  showToast,
  headerUtilityContent,
  onChange,
  onMoveToProduction,
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
  const [selectedBrand, setSelectedBrand] = useState<string | null>(null)
  const [selectedTaskType, setSelectedTaskType] = useState<BacklogTaskType | null>(null)
  const [selectedAddedBy, setSelectedAddedBy] = useState<string | null>(null)
  const [showDone, setShowDone] = useState(false)
  const [selectedCardId, setSelectedCardId] = useState<string | null>(null)

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

  const addedByOptions = useMemo(() => {
    const uniqueNames = new Set<string>()
    backlog.cards.forEach((card) => {
      if (card.addedBy.trim()) {
        uniqueNames.add(card.addedBy)
      }
    })
    return Array.from(uniqueNames)
  }, [backlog.cards])

  const visibleCardsByColumn = useMemo(() => {
    const matchesFilters = (card: BacklogCard) => {
      if (selectedBrand && card.brand !== selectedBrand) {
        return false
      }

      if (selectedTaskType && card.taskType !== selectedTaskType) {
        return false
      }

      if (selectedAddedBy && card.addedBy !== selectedAddedBy) {
        return false
      }

      if (
        !showDone &&
        card.column === 'ops-priority' &&
        (card.opsSubStage ?? OPS_PRIORITY_SUB_STAGES[0].id) === 'done'
      ) {
        return false
      }

      return true
    }

    return BACKLOG_COLUMN_DEFINITIONS.reduce<Record<BacklogColumnId, BacklogCard[]>>((accumulator, column) => {
      accumulator[column.id] = cardsByColumn[column.id].filter(matchesFilters)
      return accumulator
    }, {
      'new-idea': [],
      'under-review': [],
      prioritized: [],
      'moved-to-production': [],
      'ops-priority': [],
    })
  }, [cardsByColumn, selectedAddedBy, selectedBrand, selectedTaskType, showDone])

  const opsCards = visibleCardsByColumn['ops-priority']
  const activeDragCard = dragCardId ? backlog.cards.find((card) => card.id === dragCardId) ?? null : null
  const selectedCard = selectedCardId ? backlog.cards.find((card) => card.id === selectedCardId) ?? null : null

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

    if (
      currentCard.taskType === 'operations' &&
      (target.column === 'prioritized' || target.column === 'moved-to-production')
    ) {
      showToast('Operations cards go to Ops Priority, not the production pipeline.', 'red')
      return
    }

    if (
      (currentCard.taskType === 'creative' || currentCard.taskType === 'dev-cro') &&
      target.column === 'ops-priority'
    ) {
      showToast('Only Operations cards can be moved to Ops Priority.', 'red')
      return
    }

    if (
      (currentCard.taskType === 'creative' || currentCard.taskType === 'dev-cro') &&
      target.column === 'moved-to-production'
    ) {
      const missingFields = getBacklogMissingProductionFields(currentCard)
      if (missingFields.length > 0) {
        showToast(`Cannot move to Production. Missing required fields: ${missingFields.join(', ')}`, 'red')
        return
      }

      const productionResult = onMoveToProduction(currentCard)
      console.log('[Backlog→Production] BacklogPage transfer result', {
        backlogCardId: currentCard.id,
        productionResult,
      })
      if (!productionResult.ok) {
        onChange(moveBacklogCard(backlog, cardId, 'prioritized'))
        showToast('Could not create the Production card. The backlog card was returned to Prioritized.', 'red')
        return
      }

      console.log('[Backlog→Production] deleting backlog card after confirmed Production insert', {
        backlogCardId: currentCard.id,
        productionCardId: productionResult.cardId,
        portfolioId: productionResult.portfolioId,
      })
      onChange(deleteBacklogCard(backlog, cardId))
      setSelectedCardId(null)
      showToast(`Moved to Production as ${productionResult.cardId}.`, 'green')
      return
    }

    onChange(moveBacklogCard(backlog, cardId, target.column, target.opsSubStage))
  }

  function handleSaveCard(cardId: string, updates: Partial<BacklogCard>) {
    onChange(updateBacklogCard(backlog, cardId, updates))
  }

  function handleDeleteCard(cardId: string) {
    onChange(deleteBacklogCard(backlog, cardId))
    setSelectedCardId(null)
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
      <section className="stats-bar" aria-label="Backlog statistics">
        <div className="stat-inline-item">
          <span className="stat-inline-label">Total</span>
          <strong>{backlog.cards.length}</strong>
          <span className="stat-divider">·</span>
        </div>
        {BACKLOG_COLUMN_DEFINITIONS.map((column, index) => (
          <div key={column.id} className="stat-inline-item">
            <span className="stat-inline-label">{column.label}</span>
            <strong>{cardsByColumn[column.id].length}</strong>
            {index < BACKLOG_COLUMN_DEFINITIONS.length - 1 ? <span className="stat-divider">·</span> : null}
          </div>
        ))}
      </section>
      <section className="manager-filter-bar backlog-filter-bar" aria-label="Backlog filters">
        <div className="manager-filter-cluster">
          <span className="filter-group-label">Brand</span>
          <div className="manager-filter-group">
            <button
              type="button"
              className={`filter-pill ${selectedBrand === null ? 'is-active is-all' : ''}`}
              onClick={() => setSelectedBrand(null)}
            >
              All
            </button>
            {brandOptions.map((brandName) => (
              <button
                key={brandName}
                type="button"
                className={`filter-pill ${selectedBrand === brandName ? 'is-active' : ''}`}
                style={selectedBrand === brandName ? getActiveBrandFilterStyle(brandName, brandStyles) : undefined}
                onClick={() => setSelectedBrand((current) => (current === brandName ? null : brandName))}
              >
                {brandName}
              </button>
            ))}
          </div>
        </div>

        <span className="filter-group-divider" aria-hidden="true" />

        <div className="manager-filter-cluster">
          <span className="filter-group-label">Task Type</span>
          <div className="manager-filter-group">
            <button
              type="button"
              className={`filter-pill ${selectedTaskType === null ? 'is-active is-all' : ''}`}
              onClick={() => setSelectedTaskType(null)}
            >
              All
            </button>
            {BACKLOG_TASK_TYPES.map((taskType) => (
              <button
                key={taskType}
                type="button"
                className={`filter-pill ${selectedTaskType === taskType ? 'is-active' : ''}`}
                style={selectedTaskType === taskType ? getActiveTaskTypeFilterStyle(taskType) : undefined}
                onClick={() => setSelectedTaskType((current) => (current === taskType ? null : taskType))}
              >
                {getTaskTypeLabel(taskType)}
              </button>
            ))}
          </div>
        </div>

        <span className="filter-group-divider" aria-hidden="true" />

        <div className="manager-filter-cluster">
          <span className="filter-group-label">Added By</span>
          <div className="manager-editor-pills">
            {addedByOptions.map((personName) => (
              <button
                key={personName}
                type="button"
                className={`editor-pill ${selectedAddedBy === personName ? 'is-active' : ''}`}
                onClick={() => setSelectedAddedBy((current) => (current === personName ? null : personName))}
              >
                {personName}
              </button>
            ))}
          </div>
        </div>

        <label className="archive-toggle backlog-show-done-toggle">
          <input type="checkbox" checked={showDone} onChange={(event) => setShowDone(event.target.checked)} />
          <span>Show done</span>
        </label>
      </section>

      <DndContext sensors={sensors} collisionDetection={closestCorners} onDragStart={handleDragStart} onDragEnd={handleDragEnd}>
        <div className="backlog-board" role="list" aria-label="Backlog board columns">
          {BACKLOG_COLUMN_DEFINITIONS.map((column) => {
            const columnCards = visibleCardsByColumn[column.id]
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
                        onOpenCard={setSelectedCardId}
                      />
                    ))}
                  </div>
                ) : (
                  <BacklogDropZone
                    dropId={`column:${column.id}`}
                    cards={columnCards}
                    brandStyles={brandStyles}
                    onOpenCard={setSelectedCardId}
                  />
                )}
              </section>
            )
          })}
        </div>

        <DragOverlay>
          {activeDragCard ? (
            <BacklogCardItem card={activeDragCard} brandStyles={brandStyles} onOpen={() => undefined} />
          ) : null}
        </DragOverlay>
      </DndContext>

      <BacklogCardDetailPanel
        key={selectedCard?.id ?? 'closed'}
        card={selectedCard}
        isOpen={selectedCard !== null}
        brandOptions={brandOptions}
        brandStyles={brandStyles}
        creativeProductionTaskTypeOptions={creativeProductionTaskTypeOptions}
        devProductionTaskTypeOptions={devProductionTaskTypeOptions}
        onClose={() => setSelectedCardId(null)}
        onSave={(updates) => {
          if (!selectedCard) {
            return
          }
          handleSaveCard(selectedCard.id, updates)
        }}
        onDelete={() => {
          if (!selectedCard) {
            return
          }
          handleDeleteCard(selectedCard.id)
        }}
      />

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
