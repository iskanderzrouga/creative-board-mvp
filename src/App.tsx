import { useEffect, useReducer, useState, type ReactNode } from 'react'
import {
  closestCorners,
  DndContext,
  DragOverlay,
  PointerSensor,
  useDroppable,
  useSensor,
  useSensors,
  type DraggableAttributes,
  type DraggableSyntheticListeners,
  type DragEndEvent,
  type DragOverEvent,
  type DragStartEvent,
} from '@dnd-kit/core'
import {
  SortableContext,
  useSortable,
  verticalListSortingStrategy,
} from '@dnd-kit/sortable'
import { CSS } from '@dnd-kit/utilities'

import './App.css'
import {
  BRAND_IDS,
  EDITOR_ROLE_IDS,
  STAGES,
  STAGE_LABELS,
  USER_MAP,
  WORKER_IDS,
  boardReducer,
  canEnterInProduction,
  createDraftTask,
  formatDurationShort,
  getAgeToneFromMs,
  getBoardStats,
  getCanonicalContainerId,
  getEditorNextStage,
  getEditorSnapshot,
  getTaskTimeInStageMs,
  getViewerMode,
  getVisibleColumns,
  loadBoardState,
  persistBoardState,
  type Attachment,
  type BrandFilter,
  type BrandId,
  type Task,
  type TaskFilters,
  type UserId,
  type VisibleContainer,
} from './board'
import { TaskDrawer } from './components/TaskDrawer'

type ToastTone = 'neutral' | 'warning' | 'danger'

interface ToastState {
  message: string
  tone: ToastTone
}

interface CardSurfaceProps {
  task: Task
  assignedLabel: string
  nowMs: number
  onOpen: () => void
  cursorMode: 'drag' | 'pointer'
  isDragging?: boolean
  isOverlay?: boolean
  isPlaceholder?: boolean
  isInvalidPlaceholder?: boolean
  attributes?: DraggableAttributes
  listeners?: DraggableSyntheticListeners
}

interface SortableTaskCardProps {
  task: Task
  assignedLabel: string
  nowMs: number
  canDrag: boolean
  cursorMode: 'drag' | 'pointer'
  showPlaceholder: boolean
  isInvalidPlaceholder: boolean
  onOpen: () => void
}

interface DropLaneProps {
  container: VisibleContainer
  viewerMode: ReturnType<typeof getViewerMode>
  dragActive: boolean
  isHovered: boolean
  isBlocked: boolean
  showGroupHeader: boolean
  children: ReactNode
}

function getBrandDropdownValue(selectedBrands: BrandId[]): BrandFilter {
  return selectedBrands.length === 1 ? selectedBrands[0] : 'All'
}

function getTypeClassName(task: Task) {
  return `type-${task.type.toLowerCase().replace(/\s+/g, '-')}`
}

function getWipState(container: VisibleContainer) {
  if (container.wipCount === null || container.wipLimit === null) {
    return 'normal'
  }

  if (container.wipCount > container.wipLimit) {
    return 'over'
  }

  if (container.wipCount >= container.wipLimit) {
    return 'full'
  }

  return 'normal'
}

function CardSurface({
  task,
  assignedLabel,
  nowMs,
  onOpen,
  cursorMode,
  isDragging = false,
  isOverlay = false,
  isPlaceholder = false,
  isInvalidPlaceholder = false,
  attributes,
  listeners,
}: CardSurfaceProps) {
  const timeInStageMs = getTaskTimeInStageMs(task, nowMs)
  const tone = getAgeToneFromMs(timeInStageMs)
  const isBacklogCard = task.stage === 'backlog'
  const footerLabel = isBacklogCard ? 'Unassigned' : assignedLabel

  return (
    <button
      type="button"
      className={`task-card tone-${tone} cursor-${cursorMode} ${
        isDragging ? 'is-dragging' : ''
      } ${isOverlay ? 'is-overlay' : ''} ${isPlaceholder ? 'is-placeholder' : ''} ${
        isInvalidPlaceholder ? 'is-invalid-placeholder' : ''
      }`}
      onClick={onOpen}
      {...attributes}
      {...listeners}
    >
      <div className="task-card-top">
        <span className="task-card-test-id">{task.testId}</span>
      </div>
      <p className="task-card-title">{task.title}</p>
      <div className="task-card-tags">
        <span className={`brand-pill brand-${task.brand.toLowerCase()}`}>
          {task.brand}
        </span>
        <span className={`type-pill ${getTypeClassName(task)}`}>{task.type}</span>
      </div>
      <div className="task-card-footer">
        <span className={isBacklogCard ? 'assignee-label is-unassigned' : 'assignee-label'}>
          {footerLabel}
        </span>
        <span className={`task-age tone-${tone}`}>{formatDurationShort(timeInStageMs)}</span>
      </div>
    </button>
  )
}

function SortableTaskCard({
  task,
  assignedLabel,
  nowMs,
  canDrag,
  cursorMode,
  showPlaceholder,
  isInvalidPlaceholder,
  onOpen,
}: SortableTaskCardProps) {
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({
    id: task.id,
    disabled: !canDrag,
  })

  return (
    <div
      ref={setNodeRef}
      style={{
        transform: CSS.Transform.toString(transform),
        transition,
      }}
      className="sortable-card"
    >
      <CardSurface
        task={task}
        assignedLabel={assignedLabel}
        nowMs={nowMs}
        onOpen={() => {
          if (!isDragging) {
            onOpen()
          }
        }}
        cursorMode={cursorMode}
        isDragging={isDragging}
        isPlaceholder={showPlaceholder && isDragging}
        isInvalidPlaceholder={isInvalidPlaceholder && isDragging}
        attributes={attributes}
        listeners={listeners}
      />
    </div>
  )
}

function DropLane({
  container,
  viewerMode,
  dragActive,
  isHovered,
  isBlocked,
  showGroupHeader,
  children,
}: DropLaneProps) {
  const { setNodeRef } = useDroppable({
    id: container.id,
  })

  const showEmptyDropHint =
    viewerMode === 'manager' &&
    showGroupHeader &&
    dragActive &&
    isHovered &&
    container.taskIds.length === 0

  return (
    <div
      ref={setNodeRef}
      className={`lane-body ${isHovered ? 'is-over' : ''} ${
        isBlocked ? 'is-blocked' : ''
      } ${container.taskIds.length === 0 ? 'is-empty' : ''}`}
    >
      {children}
      {showEmptyDropHint ? (
        <div className={`lane-drop-hint ${isBlocked ? 'is-danger' : ''}`}>
          {isBlocked ? 'At capacity — finish or move a task first' : 'Drop here'}
        </div>
      ) : null}
      {isBlocked && container.taskIds.length > 0 ? (
        <div className="lane-inline-toast">At capacity — finish or move a task first</div>
      ) : null}
    </div>
  )
}

function App() {
  const [boardState, dispatch] = useReducer(boardReducer, undefined, loadBoardState)
  const [viewerId, setViewerId] = useState<UserId>('naomi')
  const [selectedBrands, setSelectedBrands] = useState<BrandId[]>([...BRAND_IDS])
  const [managerEditorFilter, setManagerEditorFilter] = useState<UserId[]>([])
  const [selectedTaskId, setSelectedTaskId] = useState<string | null>(null)
  const [draftTask, setDraftTask] = useState<Task | null>(null)
  const [settingsOpen, setSettingsOpen] = useState(false)
  const [editorMenuOpen, setEditorMenuOpen] = useState(false)
  const [activeTaskId, setActiveTaskId] = useState<string | null>(null)
  const [activeOverContainerId, setActiveOverContainerId] = useState<string | null>(null)
  const [blockedContainerId, setBlockedContainerId] = useState<string | null>(null)
  const [toast, setToast] = useState<ToastState | null>(null)
  const [nowMs, setNowMs] = useState(() => Date.now())

  const sensors = useSensors(
    useSensor(PointerSensor, {
      activationConstraint: {
        distance: 6,
      },
    }),
  )

  useEffect(() => {
    persistBoardState(boardState)
  }, [boardState])

  useEffect(() => {
    const timer = window.setInterval(() => {
      setNowMs(Date.now())
    }, 60_000)

    return () => window.clearInterval(timer)
  }, [])

  useEffect(() => {
    if (!toast) {
      return
    }

    const timer = window.setTimeout(() => {
      setToast(null)
    }, 3000)

    return () => window.clearTimeout(timer)
  }, [toast])

  const viewerMode = getViewerMode(viewerId)
  const activeFilters: TaskFilters = {
    brands: selectedBrands,
    editors: viewerMode === 'manager' ? managerEditorFilter : [],
  }
  const columns = getVisibleColumns(boardState, viewerId, activeFilters)
  const stats = getBoardStats(boardState, activeFilters, nowMs)
  const openTask = draftTask ?? (selectedTaskId ? boardState.tasks[selectedTaskId] : null)
  const isDrawerOpen = Boolean(openTask)
  const focusedEditorId =
    viewerMode === 'manager' && managerEditorFilter.length === 1
      ? managerEditorFilter[0]
      : null
  const focusedEditorSnapshot = focusedEditorId
    ? getEditorSnapshot(boardState, focusedEditorId, {
        brands: selectedBrands,
      })
    : null

  const visibleContainersById: Record<string, VisibleContainer> = {}
  const itemToContainerId: Record<string, string> = {}

  for (const column of columns) {
    for (const container of column.containers) {
      visibleContainersById[container.id] = container

      for (const taskId of container.taskIds) {
        itemToContainerId[taskId] = container.id
      }
    }
  }

  const activeTask = activeTaskId ? boardState.tasks[activeTaskId] : null

  const statsItems = [
    { label: 'Total', value: stats.total },
    { label: 'Backlog', value: stats.byStage.backlog },
    { label: 'Briefed', value: stats.byStage.briefed },
    { label: 'In Production', value: stats.byStage.in_production },
    { label: 'Review', value: stats.byStage.review },
    { label: 'Ready', value: stats.byStage.ready },
    { label: 'Live', value: stats.byStage.live },
    { label: 'Stuck 5+d', value: stats.stuck, highlight: stats.stuck > 0 },
  ]

  function showToast(message: string, tone: ToastTone = 'neutral') {
    setToast({
      message,
      tone,
    })
  }

  function openExistingTask(taskId: string) {
    setDraftTask(null)
    setSelectedTaskId(taskId)
  }

  function closeDrawer() {
    setDraftTask(null)
    setSelectedTaskId(null)
  }

  function handleNewCard() {
    const nextDraft = createDraftTask(boardState)

    setSelectedTaskId(null)
    setDraftTask({
      ...nextDraft,
      brand: selectedBrands.length === 1 ? selectedBrands[0] : nextDraft.brand,
    })
  }

  function updateOpenTaskField(
    field: 'testId' | 'title' | 'brand' | 'type' | 'briefHtml',
    value: string,
  ) {
    if (draftTask) {
      setDraftTask({
        ...draftTask,
        [field]: value,
      })
      return
    }

    if (!selectedTaskId) {
      return
    }

    dispatch({
      type: 'update-task',
      taskId: selectedTaskId,
      updates: {
        [field]: value,
      },
    })
  }

  function updateOpenTaskAssignee(assigneeId: UserId | null) {
    if (draftTask) {
      setDraftTask({
        ...draftTask,
        assigneeId,
      })
      return
    }

    if (!selectedTaskId) {
      return
    }

    dispatch({
      type: 'update-assignee',
      taskId: selectedTaskId,
      assigneeId,
    })
  }

  function updateOpenTaskAttachments(attachments: Attachment[]) {
    if (draftTask) {
      setDraftTask({
        ...draftTask,
        attachments,
      })
      return
    }

    if (!selectedTaskId) {
      return
    }

    dispatch({
      type: 'replace-attachments',
      taskId: selectedTaskId,
      attachments,
    })
  }

  function addCommentToTask(body: string, parentId: string | null) {
    if (!selectedTaskId) {
      return
    }

    dispatch({
      type: 'add-comment',
      taskId: selectedTaskId,
      comment: {
        id:
          typeof crypto !== 'undefined' && 'randomUUID' in crypto
            ? crypto.randomUUID()
            : `comment-${Date.now()}`,
        authorId: viewerId,
        createdAt: new Date().toISOString(),
        body,
        parentId,
      },
    })
  }

  function saveNewTask() {
    if (!draftTask || !draftTask.title.trim() || !draftTask.testId.trim()) {
      return
    }

    dispatch({
      type: 'create-task',
      task: draftTask,
    })
    setSelectedTaskId(draftTask.id)
    setDraftTask(null)
  }

  function setBrandsFromDropdown(nextValue: BrandFilter) {
    setSelectedBrands(nextValue === 'All' ? [...BRAND_IDS] : [nextValue])
  }

  function toggleManagerBrand(brand: 'All' | BrandId) {
    if (brand === 'All') {
      setSelectedBrands([...BRAND_IDS])
      return
    }

    setSelectedBrands((current) => {
      const next = current.includes(brand)
        ? current.filter((item) => item !== brand)
        : [...current, brand]

      if (next.length === 0 || next.length === BRAND_IDS.length) {
        return [...BRAND_IDS]
      }

      return next
    })
  }

  function toggleManagerEditor(userId: UserId) {
    setManagerEditorFilter((current) =>
      current.includes(userId)
        ? current.filter((item) => item !== userId)
        : [...current, userId],
    )
  }

  function clearManagerFilters() {
    setSelectedBrands([...BRAND_IDS])
    setManagerEditorFilter([])
  }

  function getDropTarget(overId: string | null) {
    if (!overId) {
      return null
    }

    const containerId = visibleContainersById[overId] ? overId : itemToContainerId[overId]
    if (!containerId) {
      return null
    }

    const container = visibleContainersById[containerId]
    const canonicalIds = boardState.columns[container.canonicalContainerId] ?? []

    if (visibleContainersById[overId]) {
      if (container.taskIds.length === 0) {
        return {
          container,
          destinationIndex: canonicalIds.length,
        }
      }

      const lastVisibleTaskId = container.taskIds[container.taskIds.length - 1]
      const lastVisibleIndex = canonicalIds.indexOf(lastVisibleTaskId)

      return {
        container,
        destinationIndex:
          lastVisibleIndex === -1 ? canonicalIds.length : lastVisibleIndex + 1,
      }
    }

    const overIndex = canonicalIds.indexOf(overId)

    return {
      container,
      destinationIndex: overIndex === -1 ? canonicalIds.length : overIndex,
    }
  }

  function validateDrop(taskId: string, target: VisibleContainer | null) {
    if (!target) {
      return {
        valid: false,
        tone: 'neutral' as ToastTone,
        message: 'That drop zone is not available.',
      }
    }

    const task = boardState.tasks[taskId]
    if (!task) {
      return {
        valid: false,
        tone: 'neutral' as ToastTone,
        message: 'That card could not be moved.',
      }
    }

    if (viewerMode === 'observer') {
      return {
        valid: false,
        tone: 'neutral' as ToastTone,
        message: 'Observer view is read-only.',
      }
    }

    if (viewerMode === 'editor') {
      const nextStage = getEditorNextStage(task, viewerId)

      if (task.assigneeId !== viewerId || !nextStage) {
        return {
          valid: false,
          tone: 'neutral' as ToastTone,
          message: 'Editors can only move their own cards forward one stage.',
        }
      }

      if (target.stage !== nextStage) {
        return {
          valid: false,
          tone: 'neutral' as ToastTone,
          message: 'Editors can only drag a card one stage to the right.',
        }
      }

      if (
        target.stage === 'in_production' &&
        !canEnterInProduction(boardState, viewerId, task.id)
      ) {
        const limit = boardState.settings.wipLimits[viewerId]
        return {
          valid: false,
          tone: 'danger' as ToastTone,
          message: `${USER_MAP[viewerId].name} is at capacity (${limit}/${limit}). Complete or move a task first.`,
        }
      }

      if (
        target.stage !== 'ready' &&
        target.stage !== 'live' &&
        target.assigneeId !== viewerId
      ) {
        return {
          valid: false,
          tone: 'neutral' as ToastTone,
          message: 'Editors can only move cards within their own pipeline.',
        }
      }
    }

    if (viewerMode === 'manager' && target.stage === 'in_production' && target.assigneeId) {
      if (!canEnterInProduction(boardState, target.assigneeId, task.id)) {
        const limit = boardState.settings.wipLimits[target.assigneeId]
        return {
          valid: false,
          tone: 'danger' as ToastTone,
          message: `${USER_MAP[target.assigneeId].name} is at capacity (${limit}/${limit}). Complete or move a task first.`,
        }
      }
    }

    return {
      valid: true,
      tone: 'neutral' as ToastTone,
      message: '',
    }
  }

  function handleDragStart(event: DragStartEvent) {
    setActiveTaskId(String(event.active.id))
  }

  function handleDragOver(event: DragOverEvent) {
    const taskId = String(event.active.id)
    const target = getDropTarget(event.over ? String(event.over.id) : null)
    const validation = validateDrop(taskId, target?.container ?? null)

    setActiveOverContainerId(target?.container.id ?? null)
    setBlockedContainerId(validation.valid ? null : target?.container.id ?? null)
  }

  function handleDragCancel() {
    setActiveTaskId(null)
    setActiveOverContainerId(null)
    setBlockedContainerId(null)
  }

  function handleDragEnd(event: DragEndEvent) {
    setActiveTaskId(null)

    const taskId = String(event.active.id)
    const target = getDropTarget(event.over ? String(event.over.id) : null)
    const validation = validateDrop(taskId, target?.container ?? null)

    setActiveOverContainerId(null)
    setBlockedContainerId(null)

    if (!target || !validation.valid) {
      if (!validation.valid && validation.message) {
        showToast(validation.message, validation.tone)
      }
      return
    }

    const task = boardState.tasks[taskId]
    if (!task) {
      return
    }

    const destinationStage = target.container.stage
    const destinationAssigneeId =
      destinationStage === 'backlog'
        ? null
        : target.container.assigneeId ?? task.assigneeId
    const isBackwardMove =
      viewerMode === 'manager' &&
      STAGES.indexOf(destinationStage) < STAGES.indexOf(task.stage)
    const destinationIndex = isBackwardMove ? 0 : target.destinationIndex

    const currentContainerId = getCanonicalContainerId(task.stage, task.assigneeId)
    const currentContainer = boardState.columns[currentContainerId] ?? []
    const currentIndex = currentContainer.indexOf(task.id)
    const destinationContainerId = getCanonicalContainerId(
      destinationStage,
      destinationAssigneeId,
    )

    if (
      currentContainerId === destinationContainerId &&
      currentIndex === destinationIndex
    ) {
      return
    }

    dispatch({
      type: 'move-task',
      taskId,
      destinationStage,
      destinationAssigneeId,
      destinationIndex,
      movedAt: new Date().toISOString(),
    })

    if (isBackwardMove) {
      showToast(`${task.testId} moved back to ${STAGE_LABELS[destinationStage]}`, 'warning')
    }
  }

  return (
    <div className="app-shell">
      <header className="board-header">
        <div className="board-title">Creative Board</div>

        <div className="header-controls">
          <select
            aria-label="Brand filter"
            className="compact-select"
            value={getBrandDropdownValue(selectedBrands)}
            onChange={(event) => setBrandsFromDropdown(event.target.value as BrandFilter)}
          >
            <option value="All">All</option>
            <option value="Pluxy">Pluxy</option>
            <option value="Vivi">Vivi</option>
          </select>

          <div className="role-segmented">
            <button
              type="button"
              className={`role-segment ${viewerMode === 'manager' ? 'is-active' : ''}`}
              onClick={() => {
                setViewerId('naomi')
                setEditorMenuOpen(false)
              }}
            >
              Manager
            </button>
            <div className="editor-segment-wrapper">
              <button
                type="button"
                className={`role-segment ${viewerMode === 'editor' ? 'is-active' : ''}`}
                onClick={() => setEditorMenuOpen((open) => !open)}
              >
                {viewerMode === 'editor'
                  ? `Editor: ${USER_MAP[viewerId].name}`
                  : 'Editor'}
                <span className="segment-caret">▾</span>
              </button>
              {editorMenuOpen ? (
                <div className="editor-menu">
                  {EDITOR_ROLE_IDS.map((userId) => (
                    <button
                      key={userId}
                      type="button"
                      className="editor-menu-item"
                      onClick={() => {
                        setViewerId(userId)
                        setEditorMenuOpen(false)
                      }}
                    >
                      {USER_MAP[userId].name}
                    </button>
                  ))}
                </div>
              ) : null}
            </div>
            <button
              type="button"
              className={`role-segment ${viewerMode === 'observer' ? 'is-active' : ''}`}
              onClick={() => {
                setViewerId('iskander')
                setEditorMenuOpen(false)
              }}
            >
              Observer
            </button>
          </div>
        </div>
      </header>

      <section className="stats-bar" aria-label="Board statistics">
        {statsItems.map((item, index) => (
          <div key={item.label} className="stat-inline-item">
            <span className="stat-inline-label">{item.label}</span>
            <strong className={item.highlight ? 'is-highlight' : ''}>{item.value}</strong>
            {index < statsItems.length - 1 ? <span className="stat-divider">·</span> : null}
          </div>
        ))}
      </section>

      {viewerMode === 'manager' ? (
        <section className="manager-filter-bar">
          <div className="manager-filter-group">
            <button
              type="button"
              className={`filter-pill ${
                selectedBrands.length === BRAND_IDS.length ? 'is-active is-all' : ''
              }`}
              onClick={() => toggleManagerBrand('All')}
            >
              All
            </button>
            {BRAND_IDS.map((brand) => (
              <button
                key={brand}
                type="button"
                className={`filter-pill brand-filter ${
                  selectedBrands.includes(brand) && selectedBrands.length !== BRAND_IDS.length
                    ? `is-active brand-${brand.toLowerCase()}`
                    : ''
                }`}
                onClick={() => toggleManagerBrand(brand)}
              >
                {brand}
              </button>
            ))}
          </div>

          <div className="manager-editor-pills">
            {EDITOR_ROLE_IDS.map((userId) => (
              <button
                key={userId}
                type="button"
                className={`editor-pill ${
                  managerEditorFilter.includes(userId) ? 'is-active' : ''
                }`}
                onClick={() => toggleManagerEditor(userId)}
              >
                {USER_MAP[userId].name}
              </button>
            ))}
          </div>

          <div className="manager-filter-actions">
            {selectedBrands.length !== BRAND_IDS.length || managerEditorFilter.length > 0 ? (
              <button
                type="button"
                className="clear-link"
                onClick={clearManagerFilters}
              >
                Clear
              </button>
            ) : null}
            <div className="settings-anchor">
              <button
                type="button"
                className="clear-link muted-link"
                onClick={() => setSettingsOpen((open) => !open)}
              >
                WIP
              </button>
              {settingsOpen ? (
                <div className="settings-popover">
                  <div className="settings-popover-header">
                    <strong>WIP limits</strong>
                    <button
                      type="button"
                      className="close-icon-button"
                      onClick={() => setSettingsOpen(false)}
                    >
                      ×
                    </button>
                  </div>
                  <div className="settings-grid">
                    {WORKER_IDS.map((userId) => (
                      <label key={userId}>
                        <span>{USER_MAP[userId].name}</span>
                        <input
                          type="number"
                          min={1}
                          value={boardState.settings.wipLimits[userId]}
                          onChange={(event) =>
                            dispatch({
                              type: 'update-wip-limit',
                              userId,
                              limit: Number(event.target.value) || 1,
                            })
                          }
                        />
                      </label>
                    ))}
                  </div>
                  <button
                    type="button"
                    className="clear-link muted-link"
                    onClick={() => dispatch({ type: 'reset-board' })}
                  >
                    Reset demo board
                  </button>
                </div>
              ) : null}
            </div>
          </div>
        </section>
      ) : null}

      {focusedEditorSnapshot ? (
        <section className="editor-summary-bar">
          <div className="editor-summary-name">{USER_MAP[focusedEditorSnapshot.userId].name}</div>
          <div className="editor-summary-stages">
            <span>Briefed: {focusedEditorSnapshot.stageCounts.briefed} cards</span>
            <span>
              In Production: {focusedEditorSnapshot.inProductionCount}/
              {focusedEditorSnapshot.wipLimit}
              {focusedEditorSnapshot.inProductionCount >= focusedEditorSnapshot.wipLimit ? (
                <em> (full)</em>
              ) : null}
            </span>
            <span>Review: {focusedEditorSnapshot.stageCounts.review}</span>
            <span>Ready: {focusedEditorSnapshot.stageCounts.ready}</span>
          </div>
          <div className="editor-summary-workload">
            Est. workload: ~{focusedEditorSnapshot.estimatedWorkloadDays} days based on
            current queue
          </div>
        </section>
      ) : null}

      <DndContext
        sensors={sensors}
        collisionDetection={closestCorners}
        onDragStart={handleDragStart}
        onDragOver={handleDragOver}
        onDragCancel={handleDragCancel}
        onDragEnd={handleDragEnd}
      >
        <main className="board-scroll">
          <div className="board-grid">
            {columns.map((column) => (
              <section key={column.stage} className="stage-column">
                <div className="stage-column-header">
                  <h2>
                    {column.label} <span>· {column.totalCount}</span>
                  </h2>
                  {viewerMode === 'manager' && column.stage === 'backlog' ? (
                    <button
                      type="button"
                      className="column-action-button"
                      onClick={handleNewCard}
                    >
                      + New Card
                    </button>
                  ) : null}
                </div>

                <div className="stage-column-content">
                  {column.containers.map((container) => {
                    const wipState = getWipState(container)
                    const showGroupHeader = column.grouped

                    return (
                      <div
                        key={container.id}
                        className={`lane-shell ${
                          showGroupHeader && column.stage === 'in_production' && wipState !== 'normal'
                            ? 'is-hot'
                            : ''
                        }`}
                      >
                        {showGroupHeader ? (
                          <div className="lane-header">
                            <span>{container.label}</span>
                            {container.wipCount !== null && container.wipLimit !== null ? (
                              <span className={`wip-badge is-${wipState}`}>
                                {container.wipCount}/{container.wipLimit}
                              </span>
                            ) : null}
                          </div>
                        ) : null}

                        <SortableContext
                          items={container.taskIds}
                          strategy={verticalListSortingStrategy}
                        >
                          <DropLane
                            container={container}
                            viewerMode={viewerMode}
                            dragActive={Boolean(activeTaskId)}
                            isHovered={activeOverContainerId === container.id}
                            isBlocked={blockedContainerId === container.id}
                            showGroupHeader={showGroupHeader}
                          >
                            {container.taskIds.map((taskId) => {
                              const task = boardState.tasks[taskId]
                              const assignedLabel =
                                task.stage === 'backlog'
                                  ? 'Unassigned'
                                  : task.assigneeId
                                    ? USER_MAP[task.assigneeId].name
                                    : 'Unassigned'
                              const canDrag =
                                viewerMode === 'manager'
                                  ? true
                                  : viewerMode === 'editor'
                                    ? task.assigneeId === viewerId &&
                                      Boolean(getEditorNextStage(task, viewerId))
                                    : false
                              const cursorMode =
                                viewerMode === 'observer'
                                  ? 'pointer'
                                  : canDrag
                                    ? 'drag'
                                    : 'pointer'

                              return (
                                <SortableTaskCard
                                  key={taskId}
                                  task={task}
                                  assignedLabel={assignedLabel}
                                  nowMs={nowMs}
                                  canDrag={canDrag}
                                  cursorMode={cursorMode}
                                  showPlaceholder={activeTaskId === taskId}
                                  isInvalidPlaceholder={Boolean(blockedContainerId)}
                                  onOpen={() => openExistingTask(taskId)}
                                />
                              )
                            })}
                          </DropLane>
                        </SortableContext>
                      </div>
                    )
                  })}
                </div>
              </section>
            ))}
          </div>
        </main>

        <DragOverlay>
          {activeTask ? (
            <CardSurface
              task={activeTask}
              assignedLabel={
                activeTask.stage === 'backlog'
                  ? 'Unassigned'
                  : activeTask.assigneeId
                    ? USER_MAP[activeTask.assigneeId].name
                    : 'Unassigned'
              }
              nowMs={nowMs}
              onOpen={() => undefined}
              cursorMode="drag"
              isOverlay
            />
          ) : null}
        </DragOverlay>
      </DndContext>

      {isDrawerOpen ? (
        <TaskDrawer
          task={openTask}
          isNew={Boolean(draftTask)}
          viewerId={viewerId}
          nowMs={nowMs}
          onClose={closeDrawer}
          onSaveNewTask={saveNewTask}
          onFieldChange={updateOpenTaskField}
          onAssigneeChange={updateOpenTaskAssignee}
          onAttachmentsChange={updateOpenTaskAttachments}
          onAddComment={addCommentToTask}
        />
      ) : null}

      {toast ? <div className={`toast tone-${toast.tone}`}>{toast.message}</div> : null}
    </div>
  )
}

export default App
