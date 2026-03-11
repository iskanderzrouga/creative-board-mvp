import {
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from 'react'
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
  type DragOverEvent,
  type DragStartEvent,
  type DraggableAttributes,
  type DraggableSyntheticListeners,
} from '@dnd-kit/core'
import {
  SortableContext,
  useSortable,
  verticalListSortingStrategy,
} from '@dnd-kit/sortable'
import { CSS } from '@dnd-kit/utilities'

import './App.css'
import { RichTextEditor } from './components/RichTextEditor'
import {
  CARD_FIELDS,
  GROUPED_STAGES,
  REVISION_REASON_OPTIONS,
  SETTINGS_TAB_LABELS,
  STAGES,
  TASK_TYPE_CATEGORIES,
  WORKING_DAYS,
  addCardToPortfolio,
  applyCardUpdates,
  archiveEligibleCards,
  buildDashboardData,
  coerceAppState,
  createCardFromQuickInput,
  createEmptyPortfolio,
  createSeedState,
  formatDateLong,
  formatDateShort,
  formatDateTime,
  formatDurationShort,
  formatHours,
  getActivePortfolio,
  getAgeToneFromMs,
  getAttentionSummary,
  getBoardStats,
  getBrandByName,
  getBrandSurface,
  getBrandTextColor,
  getCardAgeMs,
  getCardFolderName,
  getDefaultBoardFilters,
  getDueStatus,
  getEditorOptions,
  getEditorSummary,
  getNextStageForEditor,
  getQuickCreateDefaults,
  getRevisionCount,
  getTaskTypeById,
  getTaskTypeGroups,
  getTeamMemberById,
  getTeamMemberByName,
  getVisibleCards,
  getVisibleColumns,
  getWorkloadData,
  loadAppState,
  moveCardInPortfolio,
  persistAppState,
  removeCardFromPortfolio,
  type ActiveRole,
  type AppPage,
  type AppState,
  type BoardFilters,
  type Card,
  type CardFieldKey,
  type FunnelStage,
  type GlobalSettings,
  type LaneModel,
  type Portfolio,
  type QuickCreateInput,
  type RevisionReasonOption,
  type RoleMode,
  type SettingTab,
  type StageId,
  type TaskType,
  type TaskTypeCategory,
  type TeamMember,
  type Timeframe,
  type ViewerContext,
  type WorkingDay,
} from './board'

type ToastTone = 'green' | 'amber' | 'red' | 'blue'

interface ToastState {
  message: string
  tone: ToastTone
}

interface CopyState {
  key: string
}

interface SelectedCardState {
  portfolioId: string
  cardId: string
}

interface PendingBackwardMove {
  portfolioId: string
  cardId: string
  destinationStage: StageId
  destinationOwner: string | null
  destinationIndex: number
  movedAt: string
}

interface PendingDeleteCard {
  portfolioId: string
  cardId: string
}

interface BackwardMoveFormState {
  reason: RevisionReasonOption | ''
  otherReason: string
}

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

interface SortableBoardCardProps {
  card: Card
  portfolio: Portfolio
  settings: GlobalSettings
  nowMs: number
  canDrag: boolean
  cursorMode: 'drag' | 'pointer'
  isInvalid: boolean
  onOpen: () => void
}

interface LaneDropZoneProps {
  lane: LaneModel
  isHovered: boolean
  isBlocked: boolean
  dragActive: boolean
  allowEmptyHint: boolean
  children: ReactNode
}

interface SidebarProps {
  expanded: boolean
  page: AppPage
  portfolio: Portfolio | null
  portfolios: Portfolio[]
  role: ActiveRole
  editorOptions: TeamMember[]
  editorMenuOpen: boolean
  attention: ReturnType<typeof getAttentionSummary>
  onTogglePinned: () => void
  onPortfolioChange: (portfolioId: string) => void
  onPageChange: (page: AppPage) => void
  onRoleChange: (role: ActiveRole) => void
  onToggleEditorMenu: () => void
}

interface PageHeaderProps {
  title: string
  searchValue?: string
  searchCountLabel?: string
  onSearchChange?: (value: string) => void
  onSearchClear?: () => void
  searchRef?: React.RefObject<HTMLInputElement | null>
  rightContent?: ReactNode
}

interface QuickCreateModalProps {
  portfolio: Portfolio
  settings: GlobalSettings
  value: QuickCreateInput
  onChange: (updates: Partial<QuickCreateInput>) => void
  onClose: () => void
  onCreate: (openDetail: boolean) => void
}

interface BackwardMoveModalProps {
  card: Card
  destinationStage: StageId
  formState: BackwardMoveFormState
  onChange: (updates: Partial<BackwardMoveFormState>) => void
  onCancel: () => void
  onConfirm: () => void
}

interface CardDetailPanelProps {
  keyId: string
  portfolio: Portfolio
  card: Card
  settings: GlobalSettings
  viewerMode: RoleMode
  viewerName: string | null
  copyState: CopyState | null
  isCreatingDriveFolder: boolean
  nowMs: number
  onClose: () => void
  onCopy: (key: string, value: string) => void
  onSave: (updates: Partial<Card>) => void
  onAddComment: (text: string) => void
  onCreateDriveFolder: () => void
  onRequestDelete: () => void
}

interface SettingsPageProps {
  state: AppState
  settingsTab: SettingTab
  settingsPortfolioId: string
  importInputRef: React.RefObject<HTMLInputElement | null>
  testingWebhookId: string | null
  onTabChange: (tab: SettingTab) => void
  onSettingsPortfolioChange: (portfolioId: string) => void
  onBackToBoard: () => void
  onStateChange: (updater: (state: AppState) => AppState) => void
  onExportData: () => void
  onImportClick: () => void
  onResetData: () => void
  onClearAllData: () => void
  onTestWebhook: (scope: string, url: string) => void
  showToast: (message: string, tone: ToastTone) => void
}

interface AnalyticsPageProps {
  state: AppState
  nowMs: number
  onOpenCard: (portfolioId: string, cardId: string) => void
  onOpenPortfolioBoard: (portfolioId: string) => void
  onOpenEditorBoard: (portfolioId: string, ownerName: string) => void
}

interface WorkloadPageProps {
  portfolio: Portfolio
  settings: GlobalSettings
  timeframe: Timeframe
  nowMs: number
  canAssign: boolean
  activeDragCardId: string | null
  onTimeframeChange: (timeframe: Timeframe) => void
  onOpenEditorBoard: (ownerName: string) => void
  onOpenCard: (portfolioId: string, cardId: string) => void
}

interface DeleteCardModalProps {
  card: Card
  onCancel: () => void
  onConfirm: () => void
}

function getRoleActorName(role: ActiveRole, portfolio: Portfolio | null) {
  if (role.mode === 'manager') {
    return 'Naomi'
  }
  if (role.mode === 'observer') {
    return 'Iskander'
  }

  return portfolio ? getTeamMemberById(portfolio, role.editorId)?.name ?? 'Editor' : 'Editor'
}

function getCurrentPage(state: AppState) {
  if (state.activePage === 'analytics' && state.activeRole.mode !== 'observer') {
    return 'board' as AppPage
  }
  if (state.activePage === 'settings' && state.activeRole.mode !== 'manager') {
    return 'board' as AppPage
  }
  if (
    state.activePage === 'workload' &&
    state.activeRole.mode !== 'manager' &&
    state.activeRole.mode !== 'observer'
  ) {
    return 'board' as AppPage
  }

  return state.activePage
}

function getPageLabel(page: AppPage) {
  switch (page) {
    case 'board':
      return 'Board'
    case 'analytics':
      return 'Analytics'
    case 'workload':
      return 'Workload'
    case 'settings':
      return 'Settings'
  }
}

function getPageIcon(page: AppPage) {
  switch (page) {
    case 'board':
      return '📋'
    case 'analytics':
      return '📊'
    case 'workload':
      return '👥'
    case 'settings':
      return '⚙️'
  }
}

function getTypePillLabel(taskType: TaskType) {
  return `${taskType.icon} ${taskType.name}`
}

function getUtilBarWidth(utilizationPct: number) {
  return `${Math.min(utilizationPct, 100)}%`
}

function getSearchCountLabel(filteredCount: number, totalCount: number) {
  return `Showing ${filteredCount} of ${totalCount} cards`
}

async function copyToClipboard(value: string) {
  if (typeof navigator !== 'undefined' && navigator.clipboard?.writeText) {
    await navigator.clipboard.writeText(value)
    return
  }

  const element = document.createElement('textarea')
  element.value = value
  document.body.appendChild(element)
  element.select()
  document.execCommand('copy')
  document.body.removeChild(element)
}

function BoardCardSurface({
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

  return (
    <button
      type="button"
      className={`board-card tone-${tone} cursor-${cursorMode} ${
        card.blocked ? 'is-flagged' : ''
      } ${isDragging ? 'is-dragging' : ''} ${isOverlay ? 'is-overlay' : ''} ${
        isInvalid ? 'is-invalid' : ''
      }`}
      onClick={onOpen}
      {...attributes}
      {...listeners}
    >
      <div className="board-card-top">
        <div className="board-card-indicators">
          {card.blocked ? <span className="board-card-flag">🚫</span> : null}
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
        <span className={`card-age tone-${tone}`}>
          {dueStatus === 'overdue' ? <span className="due-indicator is-overdue">⏰</span> : null}
          {dueStatus === 'soon' ? <span className="due-indicator is-soon">⏰</span> : null}
          {formatDurationShort(ageMs)}
        </span>
      </div>
    </button>
  )
}

function SortableBoardCard({
  card,
  portfolio,
  settings,
  nowMs,
  canDrag,
  cursorMode,
  isInvalid,
  onOpen,
}: SortableBoardCardProps) {
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({
    id: card.id,
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
      <BoardCardSurface
        card={card}
        portfolio={portfolio}
        settings={settings}
        nowMs={nowMs}
        onOpen={() => {
          if (!isDragging) {
            onOpen()
          }
        }}
        cursorMode={cursorMode}
        isDragging={isDragging}
        isInvalid={isInvalid && isDragging}
        attributes={attributes}
        listeners={listeners}
      />
    </div>
  )
}

function LaneDropZone({
  lane,
  isHovered,
  isBlocked,
  dragActive,
  allowEmptyHint,
  children,
}: LaneDropZoneProps) {
  const { setNodeRef } = useDroppable({
    id: lane.id,
  })

  const showDropHint = allowEmptyHint && dragActive && isHovered && lane.cards.length === 0

  return (
    <div
      ref={setNodeRef}
      className={`lane-body ${isHovered ? 'is-over' : ''} ${
        isBlocked ? 'is-capacity-blocked' : ''
      } ${lane.cards.length === 0 ? 'is-empty' : ''}`}
    >
      {children}
      {showDropHint ? (
        <div className={`lane-drop-hint ${isBlocked ? 'is-danger' : ''}`}>
          {isBlocked ? 'At capacity — finish or move a task first' : 'Drop here'}
        </div>
      ) : null}
      {isBlocked && lane.cards.length > 0 ? (
        <div className="lane-inline-toast">At capacity — finish or move a task first</div>
      ) : null}
    </div>
  )
}

function WorkloadQueueCard({
  card,
  settings,
  onOpen,
  canDrag,
}: {
  card: Card
  settings: GlobalSettings
  onOpen: () => void
  canDrag: boolean
}) {
  const { attributes, listeners, setNodeRef, transform, isDragging } = useDraggable({
    id: card.id,
    disabled: !canDrag,
  })
  const taskType = getTaskTypeById(settings, card.taskTypeId)

  return (
    <button
      ref={setNodeRef}
      type="button"
      className={`queue-card ${isDragging ? 'is-dragging' : ''}`}
      style={{
        transform: CSS.Translate.toString(transform),
      }}
      onClick={onOpen}
      {...attributes}
      {...listeners}
    >
      <span className="queue-card-id">{card.id}</span>
      <span className="queue-card-title">{card.title}</span>
      <span className="queue-card-type">{`${taskType.icon} ${taskType.name}`}</span>
      <span className="queue-card-effort">{formatHours(card.estimatedHours)}</span>
      <span className="queue-card-age">{formatDurationShort(getCardAgeMs(card))}</span>
    </button>
  )
}

function WorkloadDropRow({
  memberId,
  children,
  dragActive,
}: {
  memberId: string
  children: ReactNode
  dragActive: boolean
}) {
  const { isOver, setNodeRef } = useDroppable({
    id: `workload-member-${memberId}`,
  })

  return (
    <div
      ref={setNodeRef}
      className={`workload-row ${dragActive ? 'is-drag-surface' : ''} ${
        isOver ? 'is-over' : ''
      }`}
    >
      {children}
    </div>
  )
}

function DeleteCardModal({ card, onCancel, onConfirm }: DeleteCardModalProps) {
  return (
    <>
      <div className="modal-overlay" onClick={onCancel} />
      <div className="backward-move-modal delete-card-modal" role="dialog" aria-modal="true">
        <div className="quick-create-head">
          <strong>{`Delete ${card.id}?`}</strong>
          <button type="button" className="close-icon-button" onClick={onCancel}>
            ×
          </button>
        </div>
        <p className="muted-copy">
          This will permanently remove the card from the board.
        </p>
        <div className="quick-create-actions">
          <button type="button" className="ghost-button" onClick={onCancel}>
            Cancel
          </button>
          <button type="button" className="primary-button danger-solid" onClick={onConfirm}>
            Delete card
          </button>
        </div>
      </div>
    </>
  )
}

function Sidebar({
  expanded,
  page,
  portfolio,
  portfolios,
  role,
  editorOptions,
  editorMenuOpen,
  attention,
  onTogglePinned,
  onPortfolioChange,
  onPageChange,
  onRoleChange,
  onToggleEditorMenu,
}: SidebarProps) {
  const navItems: Array<{
    page: AppPage
    disabled: boolean
    tooltip?: string
  }> = [
    { page: 'board', disabled: false },
    {
      page: 'analytics',
      disabled: role.mode !== 'observer',
      tooltip: role.mode !== 'observer' ? 'Observer only' : undefined,
    },
    {
      page: 'workload',
      disabled: role.mode === 'editor',
      tooltip: role.mode === 'editor' ? 'Manager and Observer only' : undefined,
    },
    {
      page: 'settings',
      disabled: role.mode !== 'manager',
      tooltip: role.mode !== 'manager' ? 'Manager only' : undefined,
    },
  ]

  return (
    <aside className={`app-sidebar ${expanded ? 'is-expanded' : ''}`}>
      <div className="sidebar-top">
        <button type="button" className="sidebar-pin" onClick={onTogglePinned}>
          {expanded ? '←' : '→'}
        </button>
      </div>

      <nav className="sidebar-nav">
        {navItems.map((item) => (
          <button
            key={item.page}
            type="button"
            className={`sidebar-nav-item ${page === item.page ? 'is-active' : ''}`}
            onClick={() => {
              if (!item.disabled) {
                onPageChange(item.page)
              }
            }}
            disabled={item.disabled}
            title={item.tooltip}
          >
            <span className="sidebar-nav-icon">
              {item.page === 'board' && attention.hasAttention ? (
                <span className="sidebar-alert-dot" />
              ) : null}
              {getPageIcon(item.page)}
            </span>
            {expanded ? <span>{getPageLabel(item.page)}</span> : null}
          </button>
        ))}
      </nav>

      <div className="sidebar-section">
        <label className="sidebar-label">Portfolio</label>
        <select
          className="sidebar-select"
          value={portfolio?.id ?? portfolios[0]?.id ?? ''}
          onChange={(event) => onPortfolioChange(event.target.value)}
        >
          {portfolios.map((item) => (
            <option key={item.id} value={item.id}>
              {item.name}
            </option>
          ))}
        </select>
      </div>

      <div className="sidebar-section">
        <label className="sidebar-label">Role</label>
        <div className="sidebar-role-stack">
          <button
            type="button"
            className={`role-segment ${role.mode === 'manager' ? 'is-active' : ''}`}
            onClick={() => onRoleChange({ mode: 'manager', editorId: role.editorId })}
          >
            {expanded ? 'Manager' : 'M'}
          </button>
          <div className="sidebar-editor-picker">
            <button
              type="button"
              className={`role-segment ${role.mode === 'editor' ? 'is-active' : ''}`}
              onClick={onToggleEditorMenu}
            >
              {expanded
                ? role.mode === 'editor'
                  ? `Editor: ${
                      editorOptions.find((member) => member.id === role.editorId)?.name ?? 'Select'
                    }`
                  : 'Editor'
                : 'E'}
              {expanded ? <span className="segment-caret">▾</span> : null}
            </button>
            {editorMenuOpen ? (
              <div className="sidebar-editor-menu">
                {editorOptions.map((member) => (
                  <button
                    key={member.id}
                    type="button"
                    className="sidebar-editor-item"
                    onClick={() => onRoleChange({ mode: 'editor', editorId: member.id })}
                  >
                    {member.name}
                  </button>
                ))}
              </div>
            ) : null}
          </div>
          <button
            type="button"
            className={`role-segment ${role.mode === 'observer' ? 'is-active' : ''}`}
            onClick={() => onRoleChange({ mode: 'observer', editorId: role.editorId })}
          >
            {expanded ? 'Observer' : 'O'}
          </button>
        </div>
      </div>
    </aside>
  )
}

function PageHeader({
  title,
  searchValue,
  searchCountLabel,
  onSearchChange,
  onSearchClear,
  searchRef,
  rightContent,
}: PageHeaderProps) {
  return (
    <div className="page-header">
      <div>
        <h1>{title}</h1>
      </div>
      <div className="page-header-actions">
        {searchValue !== undefined && onSearchChange ? (
          <div className="search-shell">
            <input
              ref={searchRef}
              className="search-input"
              value={searchValue}
              onChange={(event) => onSearchChange(event.target.value)}
              placeholder="Search cards..."
            />
            {searchValue ? (
              <button type="button" className="search-clear" onClick={onSearchClear}>
                ×
              </button>
            ) : null}
            {searchValue && searchCountLabel ? (
              <span className="search-summary-pill">{searchCountLabel}</span>
            ) : null}
          </div>
        ) : null}
        {rightContent}
      </div>
    </div>
  )
}

function QuickCreateModal({
  portfolio,
  settings,
  value,
  onChange,
  onClose,
  onCreate,
}: QuickCreateModalProps) {
  return (
    <>
      <div className="modal-overlay" onClick={onClose} />
      <div className="quick-create-modal">
        <div className="quick-create-head">
          <strong>New Card</strong>
          <button type="button" className="close-icon-button" onClick={onClose}>
            ×
          </button>
        </div>

        <label className="quick-create-field full-width">
          <span>Title</span>
          <input
            autoFocus
            value={value.title}
            onChange={(event) => onChange({ title: event.target.value })}
            onKeyDown={(event) => {
              if (event.key === 'Enter' && value.title.trim()) {
                event.preventDefault()
                onCreate(event.shiftKey)
              }
            }}
          />
        </label>

        <div className="quick-create-row">
          <div className="quick-create-brand-toggle">
            {portfolio.brands.map((brand) => (
              <button
                key={brand.name}
                type="button"
                className={`filter-pill ${value.brand === brand.name ? 'is-active' : ''}`}
                style={
                  value.brand === brand.name
                    ? {
                        background: brand.color,
                        borderColor: brand.color,
                        color: '#fff',
                      }
                    : undefined
                }
                onClick={() => onChange({ brand: brand.name })}
              >
                {brand.name}
              </button>
            ))}
          </div>

          <label className="quick-create-field">
            <span>Type</span>
            <select
              value={value.taskTypeId}
              onChange={(event) => onChange({ taskTypeId: event.target.value })}
            >
              {getTaskTypeGroups(settings).map((group) => (
                <optgroup key={group.category} label={group.category}>
                  {group.items.map((taskType) => (
                    <option key={taskType.id} value={taskType.id}>
                      {`${taskType.icon} ${taskType.name}`}
                    </option>
                  ))}
                </optgroup>
              ))}
            </select>
          </label>
        </div>

        <div className="quick-create-actions">
          <button
            type="button"
            className="primary-button"
            disabled={!value.title.trim() || !value.brand}
            onClick={() => onCreate(false)}
          >
            Create
          </button>
          <button
            type="button"
            className="ghost-button"
            disabled={!value.title.trim() || !value.brand}
            onClick={() => onCreate(true)}
          >
            Create &amp; Open Detail →
          </button>
        </div>
      </div>
    </>
  )
}

function BackwardMoveModal({
  card,
  destinationStage,
  formState,
  onChange,
  onCancel,
  onConfirm,
}: BackwardMoveModalProps) {
  const otherSelected = formState.reason === 'Other'
  const canConfirm = Boolean(formState.reason) && (!otherSelected || formState.otherReason.trim())

  return (
    <>
      <div className="modal-overlay" onClick={onCancel} />
      <div className="backward-move-modal">
        <div className="quick-create-head">
          <strong>{`Moving ${card.id} back to ${destinationStage}`}</strong>
        </div>

        <div className="backward-move-body">
          <span>Why?</span>
          {REVISION_REASON_OPTIONS.map((reason) => (
            <label key={reason} className="radio-option">
              <input
                type="radio"
                checked={formState.reason === reason}
                onChange={() => onChange({ reason })}
              />
              <span>{reason}</span>
            </label>
          ))}
          {otherSelected ? (
            <input
              value={formState.otherReason}
              onChange={(event) => onChange({ otherReason: event.target.value })}
              placeholder="Other reason"
            />
          ) : null}
        </div>

        <div className="quick-create-actions">
          <button type="button" className="ghost-button" onClick={onCancel}>
            Cancel
          </button>
          <button type="button" className="primary-button" disabled={!canConfirm} onClick={onConfirm}>
            Move Back
          </button>
        </div>
      </div>
    </>
  )
}

function CardDetailPanel({
  keyId,
  portfolio,
  card,
  settings,
  viewerMode,
  viewerName,
  copyState,
  isCreatingDriveFolder,
  nowMs,
  onClose,
  onCopy,
  onSave,
  onAddComment,
  onCreateDriveFolder,
  onRequestDelete,
}: CardDetailPanelProps) {
  const [commentDraft, setCommentDraft] = useState('')
  const [linkLabel, setLinkLabel] = useState('')
  const [linkUrl, setLinkUrl] = useState('')
  const [blockedDraft, setBlockedDraft] = useState(card.blocked?.reason ?? '')
  const [showAllActivity, setShowAllActivity] = useState(false)
  const canEdit = viewerMode === 'manager'
  const canComment = viewerMode === 'manager' || viewerName === card.owner
  const canEditFrameio = viewerMode === 'manager' || viewerName === card.owner
  const dueStatus = getDueStatus(card, nowMs)
  const taskType = getTaskTypeById(settings, card.taskTypeId)

  function handleTaskTypeChange(taskTypeId: string) {
    const nextTaskType = getTaskTypeById(settings, taskTypeId)
    onSave({
      taskTypeId,
      estimatedHours: nextTaskType.estimatedHours,
    })
  }

  function handleBlockedSave() {
    if (!blockedDraft.trim()) {
      onSave({ blocked: null })
      return
    }

    onSave({
      blocked: {
        reason: blockedDraft.trim(),
        at: new Date().toISOString(),
      },
    })
  }

  return (
    <>
      <div className="panel-overlay" onClick={onClose} />
      <aside className="slide-panel" aria-label="Card detail panel">
        <div className="slide-panel-header">
          <div className="slide-panel-header-main">
            <div className="panel-card-id">{card.id}</div>
            {canEdit ? (
              <input
                className="panel-title-input"
                value={card.title}
                onChange={(event) => onSave({ title: event.target.value })}
              />
            ) : (
              <h2 className="panel-title">{card.title}</h2>
            )}
            <div className="panel-pill-row">
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
              <span className={`funnel-pill funnel-${card.funnelStage.toLowerCase().replace(/\s+/g, '-')}`}>
                {card.funnelStage}
              </span>
              {card.blocked ? <span className="blocked-badge">🚫 Blocked</span> : null}
              {card.archivedAt ? <span className="archived-badge">Archived</span> : null}
            </div>
          </div>

          <div className="panel-header-actions">
            {canEdit ? (
              <button type="button" className="ghost-button danger-outline" onClick={onRequestDelete}>
                Delete
              </button>
            ) : null}
            <button type="button" className="close-icon-button" onClick={onClose}>
              ×
            </button>
          </div>
        </div>

        <section className="panel-section">
          <div className="block-toggle-row">
            <div>
              <span className="section-rule-title">Blocked</span>
              {card.blocked ? (
                <p className="muted-copy">{`Reason: ${card.blocked.reason}`}</p>
              ) : (
                <p className="muted-copy">Not blocked</p>
              )}
            </div>
            {canEdit ? (
              <div className="blocked-controls">
                <input
                  value={blockedDraft}
                  onChange={(event) => setBlockedDraft(event.target.value)}
                  placeholder="Waiting for raw footage..."
                />
                <button type="button" className="ghost-button" onClick={handleBlockedSave}>
                  {blockedDraft.trim() ? 'Save Blocked' : 'Clear'}
                </button>
              </div>
            ) : null}
          </div>
        </section>

        <section className="panel-section">
          <div className="stage-dot-row">
            {STAGES.map((stage, index) => {
              const currentStageIndex = STAGES.indexOf(card.stage)
              const isPast = index < currentStageIndex
              const isCurrent = index === currentStageIndex
              return (
                <div key={stage} className="stage-dot-node">
                  <span
                    className={`stage-dot ${isPast ? 'is-past' : ''} ${
                      isCurrent ? `is-current tone-${getAgeToneFromMs(getCardAgeMs(card, nowMs), settings)}` : ''
                    }`}
                  />
                  {index < STAGES.length - 1 ? <span className="stage-dot-line" /> : null}
                </div>
              )
            })}
          </div>
          <div className="stage-history-row">
            {card.stageHistory.map((entry, index) => {
              const durationMs =
                (entry.exitedAt ? new Date(entry.exitedAt).getTime() : nowMs) -
                new Date(entry.enteredAt).getTime()
              const tone = getAgeToneFromMs(durationMs, settings)

              return (
                <span key={`${entry.stage}-${entry.enteredAt}`} className="stage-history-piece">
                  <span className={`stage-history-text tone-${tone}`}>{entry.stage}</span>
                  <span className={`stage-history-time tone-${tone}`}>
                    {formatDurationShort(durationMs)}
                  </span>
                  {entry.movedBack ? (
                    <span className="stage-history-moved-back">
                      {entry.revisionReason ? `(moved back: ${entry.revisionReason})` : '(moved back)'}
                    </span>
                  ) : null}
                  {index < card.stageHistory.length - 1 ? (
                    <span className="stage-history-arrow">→</span>
                  ) : null}
                </span>
              )
            })}
          </div>
        </section>

        <section className="panel-section">
          <div className="panel-section-title">Naming</div>
          <div className="copy-field">
            <div>
              <label>Sheet Name</label>
              <code>{card.generatedSheetName}</code>
            </div>
            <button
              type="button"
              className="copy-button"
              onClick={() => onCopy(`sheet-${keyId}`, card.generatedSheetName)}
            >
              {copyState?.key === `sheet-${keyId}` ? 'Copied!' : 'Copy'}
            </button>
          </div>
          <div className="copy-field">
            <div>
              <label>Ad Name</label>
              <code>{card.generatedAdName}</code>
            </div>
            <button
              type="button"
              className="copy-button"
              onClick={() => onCopy(`ad-${keyId}`, card.generatedAdName)}
            >
              {copyState?.key === `ad-${keyId}` ? 'Copied!' : 'Copy'}
            </button>
          </div>
        </section>

        <section className="panel-section">
          <div className="panel-section-title">Metadata</div>
          <div className="metadata-grid">
            <label>
              <span>Brand</span>
              {canEdit ? (
                <select value={card.brand} onChange={(event) => onSave({ brand: event.target.value })}>
                  {portfolio.brands.map((brand) => (
                    <option key={brand.name} value={brand.name}>
                      {brand.name}
                    </option>
                  ))}
                </select>
              ) : (
                <strong>{card.brand}</strong>
              )}
            </label>
            <label>
              <span>Product</span>
              {canEdit ? (
                <select
                  value={card.product}
                  onChange={(event) => onSave({ product: event.target.value })}
                >
                  {(getBrandByName(portfolio, card.brand)?.products ?? []).map((product) => (
                    <option key={product} value={product}>
                      {product}
                    </option>
                  ))}
                </select>
              ) : (
                <strong>{card.product || '—'}</strong>
              )}
            </label>
            <label>
              <span>Platform</span>
              {canEdit ? (
                <select
                  value={card.platform}
                  onChange={(event) => onSave({ platform: event.target.value as Card['platform'] })}
                >
                  {['Meta', 'AppLovin', 'TikTok', 'Other'].map((platform) => (
                    <option key={platform} value={platform}>
                      {platform}
                    </option>
                  ))}
                </select>
              ) : (
                <strong>{card.platform}</strong>
              )}
            </label>
            <label>
              <span>Task Type</span>
              {canEdit ? (
                <select value={card.taskTypeId} onChange={(event) => handleTaskTypeChange(event.target.value)}>
                  {getTaskTypeGroups(settings).map((group) => (
                    <optgroup key={group.category} label={group.category}>
                      {group.items.map((option) => (
                        <option key={option.id} value={option.id}>
                          {`${option.icon} ${option.name}`}
                        </option>
                      ))}
                    </optgroup>
                  ))}
                </select>
              ) : (
                <strong>{taskType.name}</strong>
              )}
            </label>
            <label>
              <span>Estimated Hours</span>
              {canEdit ? (
                <input
                  type="number"
                  min={1}
                  value={card.estimatedHours}
                  onChange={(event) =>
                    onSave({ estimatedHours: Number(event.target.value) || 1 })
                  }
                />
              ) : (
                <strong>{formatHours(card.estimatedHours)}</strong>
              )}
            </label>
            <label>
              <span>Funnel Stage</span>
              {canEdit ? (
                <select
                  value={card.funnelStage}
                  onChange={(event) => onSave({ funnelStage: event.target.value as FunnelStage })}
                >
                  {['Cold', 'Warm', 'Promo', 'Promo Evergreen'].map((stage) => (
                    <option key={stage} value={stage}>
                      {stage}
                    </option>
                  ))}
                </select>
              ) : (
                <strong>{card.funnelStage}</strong>
              )}
            </label>
            <label>
              <span>Hook</span>
              {canEdit ? (
                <input value={card.hook} onChange={(event) => onSave({ hook: event.target.value })} />
              ) : (
                <strong>{card.hook || '—'}</strong>
              )}
            </label>
            <label>
              <span>Angle</span>
              {canEdit ? (
                <input value={card.angle} onChange={(event) => onSave({ angle: event.target.value })} />
              ) : (
                <strong>{card.angle || '—'}</strong>
              )}
            </label>
            <label>
              <span>Audience</span>
              {canEdit ? (
                <input
                  value={card.audience}
                  onChange={(event) => onSave({ audience: event.target.value })}
                />
              ) : (
                <strong>{card.audience || '—'}</strong>
              )}
            </label>
            <label>
              <span>Assigned to</span>
              {canEdit ? (
                <select value={card.owner ?? ''} onChange={(event) => onSave({ owner: event.target.value || null })}>
                  <option value="">Unassigned</option>
                  {getEditorOptions(portfolio).map((member) => (
                    <option key={member.id} value={member.name}>
                      {member.name}
                    </option>
                  ))}
                </select>
              ) : (
                <strong>{card.owner ?? 'Unassigned'}</strong>
              )}
            </label>
            <label>
              <span>Due Date</span>
              {canEdit ? (
                <input
                  type="date"
                  value={card.dueDate ?? ''}
                  onChange={(event) => onSave({ dueDate: event.target.value || null })}
                />
              ) : (
                <strong className={dueStatus === 'overdue' ? 'is-danger-text' : dueStatus === 'soon' ? 'is-warning-text' : ''}>
                  {card.dueDate ? formatDateShort(card.dueDate) : '—'}
                </strong>
              )}
            </label>
            <label>
              <span>Date Created</span>
              <strong>{formatDateLong(card.dateCreated)}</strong>
            </label>
            <label>
              <span>Date Assigned</span>
              <strong>{formatDateLong(card.dateAssigned)}</strong>
            </label>
            <label>
              <span>Time in Stage</span>
              <strong>{formatDurationShort(getCardAgeMs(card, nowMs))}</strong>
            </label>
            <label>
              <span>Revisions</span>
              <strong>{getRevisionCount(card)}</strong>
            </label>
          </div>
          {card.archivedAt && canEdit ? (
            <button type="button" className="ghost-button" onClick={() => onSave({ archivedAt: null })}>
              Unarchive
            </button>
          ) : null}
        </section>

        <section className="panel-section">
          <div className="panel-section-title">Drive Folder</div>
          {card.driveFolderCreated && card.driveFolderUrl ? (
            <div className="drive-section">
              <a href={card.driveFolderUrl} target="_blank" rel="noreferrer">
                {card.driveFolderUrl}
              </a>
              <div className="drive-subitems">
                {['Final_Edited_Videos', 'Editor_Brief', 'Ad_Copy'].map((item) => (
                  <a key={item} href={card.driveFolderUrl} target="_blank" rel="noreferrer">
                    {item}
                  </a>
                ))}
              </div>
            </div>
          ) : canEdit ? (
            <div className="drive-actions">
              <button
                type="button"
                className="primary-button"
                onClick={onCreateDriveFolder}
                disabled={isCreatingDriveFolder}
              >
                {isCreatingDriveFolder ? 'Creating...' : 'Create Drive Folder'}
              </button>
              <div className="copy-field compact">
                <div>
                  <label>Folder Name</label>
                  <code>{getCardFolderName(card)}</code>
                </div>
                <button
                  type="button"
                  className="copy-button"
                  onClick={() => onCopy(`folder-${keyId}`, getCardFolderName(card))}
                >
                  {copyState?.key === `folder-${keyId}` ? 'Copied!' : 'Copy'}
                </button>
              </div>
            </div>
          ) : (
            <div className="copy-field compact">
              <div>
                <label>Folder Name</label>
                <code>{getCardFolderName(card)}</code>
              </div>
            </div>
          )}
        </section>

        <section className="panel-section">
          <div className="section-rule-title">Brief</div>
          <RichTextEditor value={card.brief} onChange={(next) => onSave({ brief: next })} readOnly={!canEdit} />
        </section>

        <section className="panel-section">
          <div className="section-rule-title">Links</div>
          <div className="frameio-row">
            <span className="frameio-label">Frame.io</span>
            {canEditFrameio ? (
              <input
                value={card.frameioLink}
                onChange={(event) => onSave({ frameioLink: event.target.value })}
                placeholder="Paste Frame.io review link"
              />
            ) : card.frameioLink ? (
              <a href={card.frameioLink} target="_blank" rel="noreferrer">
                {card.frameioLink}
              </a>
            ) : (
              <span className="muted-copy">No review link yet.</span>
            )}
          </div>

          <div className="link-list">
            {card.attachments.length === 0 ? (
              <div className="muted-copy">No links added yet.</div>
            ) : (
              card.attachments.map((attachment, index) => (
                <div key={`${attachment.label}-${index}`} className="link-row">
                  <a href={attachment.url} target="_blank" rel="noreferrer">
                    <span className="link-label">{attachment.label}</span>
                    <span className="link-url">{attachment.url}</span>
                  </a>
                  {canEdit ? (
                    <button
                      type="button"
                      className="clear-link"
                      onClick={() =>
                        onSave({
                          attachments: card.attachments.filter((_, itemIndex) => itemIndex !== index),
                        })
                      }
                    >
                      Remove
                    </button>
                  ) : null}
                </div>
              ))
            )}
          </div>

          {canEdit ? (
            <div className="add-link-form">
              <input
                value={linkLabel}
                onChange={(event) => setLinkLabel(event.target.value)}
                placeholder="Link label"
              />
              <input
                value={linkUrl}
                onChange={(event) => setLinkUrl(event.target.value)}
                placeholder="https://"
              />
              <button
                type="button"
                className="primary-button"
                onClick={() => {
                  if (!linkLabel.trim() || !linkUrl.trim()) {
                    return
                  }
                  onSave({
                    attachments: [
                      ...card.attachments,
                      {
                        label: linkLabel.trim(),
                        url: linkUrl.trim(),
                      },
                    ],
                  })
                  setLinkLabel('')
                  setLinkUrl('')
                }}
              >
                Add link
              </button>
            </div>
          ) : null}
        </section>

        <section className="panel-section">
          <div className="section-rule-title">Comments</div>
          <div className="comment-list">
            {card.comments.length === 0 ? (
              <div className="muted-copy">No comments yet.</div>
            ) : (
              card.comments.map((comment) => (
                <div key={`${comment.timestamp}-${comment.text}`} className="comment-card">
                  <div className="comment-meta">
                    <strong>{comment.author}</strong>
                    <span>{formatDateTime(comment.timestamp)}</span>
                  </div>
                  <p>{comment.text}</p>
                </div>
              ))
            )}
          </div>
          {canComment ? (
            <div className="comment-composer">
              <input
                value={commentDraft}
                onChange={(event) => setCommentDraft(event.target.value)}
                placeholder="Leave feedback or an update..."
                onKeyDown={(event) => {
                  if (event.key === 'Enter' && commentDraft.trim()) {
                    onAddComment(commentDraft.trim())
                    setCommentDraft('')
                  }
                }}
              />
              <button
                type="button"
                className="primary-button"
                onClick={() => {
                  if (!commentDraft.trim()) {
                    return
                  }
                  onAddComment(commentDraft.trim())
                  setCommentDraft('')
                }}
              >
                Post
              </button>
            </div>
          ) : null}
        </section>

        <section className="panel-section">
          <div className="section-rule-title">Activity</div>
          <div className="activity-list">
            {(showAllActivity ? card.activityLog : card.activityLog.slice(0, 5)).map((activity) => (
              <div key={activity.id} className="activity-item">
                <div className="activity-meta">
                  <strong>{activity.actor}</strong>
                  <span>{formatDateTime(activity.timestamp)}</span>
                </div>
                <p>{activity.message}</p>
              </div>
            ))}
          </div>
          {card.activityLog.length > 5 ? (
            <button type="button" className="clear-link" onClick={() => setShowAllActivity((open) => !open)}>
              {showAllActivity ? 'Show less' : `Show all (${card.activityLog.length})`}
            </button>
          ) : null}
        </section>
      </aside>
    </>
  )
}

function TaskLibraryEditor({
  settings,
  portfolios,
  onTaskTypeChange,
  onDeleteTaskType,
  showToast,
}: {
  settings: GlobalSettings
  portfolios: Portfolio[]
  onTaskTypeChange: (updater: (taskLibrary: TaskType[]) => TaskType[]) => void
  onDeleteTaskType: (taskTypeId: string) => void
  showToast: (message: string, tone: ToastTone) => void
}) {
  const [expandedTaskId, setExpandedTaskId] = useState<string | null>(null)
  const [draggingTaskId, setDraggingTaskId] = useState<string | null>(null)

  function handleDelete(taskType: TaskType) {
    if (taskType.locked) {
      showToast('Custom task type cannot be deleted', 'red')
      return
    }

    const usageCount = portfolios.reduce(
      (sum, portfolio) => sum + portfolio.cards.filter((card) => card.taskTypeId === taskType.id).length,
      0,
    )
    const confirmDelete = usageCount
      ? window.confirm(
          `${usageCount} cards use this type. Delete it and reassign those cards to Custom?`,
        )
      : window.confirm(`Delete ${taskType.name}?`)
    if (!confirmDelete) {
      return
    }

    onDeleteTaskType(taskType.id)
  }

  function reorderTaskTypes(sourceId: string, targetId: string) {
    if (sourceId === targetId) {
      return
    }

    onTaskTypeChange((current) => {
      const sorted = current.slice().sort((left, right) => left.order - right.order)
      const sourceIndex = sorted.findIndex((taskType) => taskType.id === sourceId)
      const targetIndex = sorted.findIndex((taskType) => taskType.id === targetId)

      if (sourceIndex === -1 || targetIndex === -1) {
        return current
      }

      const reordered = sorted.slice()
      const [moved] = reordered.splice(sourceIndex, 1)
      reordered.splice(targetIndex, 0, moved)

      return reordered.map((taskType, order) => ({
        ...taskType,
        order,
      }))
    })
  }

  const sortedTaskTypes = settings.taskLibrary.slice().sort((left, right) => left.order - right.order)

  return (
    <div className="settings-block">
      <div className="settings-table full-table">
        <div className="settings-row settings-head task-library-head">
          <span>Type</span>
          <span>Category</span>
          <span>Color</span>
          <span>Hours</span>
          <span>Order</span>
          <span />
        </div>
        {sortedTaskTypes.map((taskType) => (
          <div
            key={taskType.id}
            className={`task-type-entry ${draggingTaskId === taskType.id ? 'is-dragging' : ''}`}
            draggable
            onDragStart={() => setDraggingTaskId(taskType.id)}
            onDragEnd={() => setDraggingTaskId(null)}
            onDragOver={(event) => event.preventDefault()}
            onDrop={(event) => {
              event.preventDefault()
              if (draggingTaskId) {
                reorderTaskTypes(draggingTaskId, taskType.id)
              }
              setDraggingTaskId(null)
            }}
          >
            <div className="settings-row task-library-row">
              <input
                value={taskType.name}
                onChange={(event) =>
                  onTaskTypeChange((current) =>
                    current.map((item) =>
                      item.id === taskType.id ? { ...item, name: event.target.value } : item,
                    ),
                  )
                }
              />
              <select
                value={taskType.category}
                onChange={(event) =>
                  onTaskTypeChange((current) =>
                    current.map((item) =>
                      item.id === taskType.id
                        ? { ...item, category: event.target.value as TaskTypeCategory }
                        : item,
                    ),
                  )
                }
              >
                {TASK_TYPE_CATEGORIES.map((category) => (
                  <option key={category} value={category}>
                    {category}
                  </option>
                ))}
              </select>
              <div className="task-type-color-inputs">
                <input
                  type="color"
                  value={taskType.color}
                  onChange={(event) =>
                    onTaskTypeChange((current) =>
                      current.map((item) =>
                        item.id === taskType.id ? { ...item, color: event.target.value } : item,
                      ),
                    )
                  }
                />
                <input
                  type="text"
                  value={taskType.icon}
                  onChange={(event) =>
                    onTaskTypeChange((current) =>
                      current.map((item) =>
                        item.id === taskType.id ? { ...item, icon: event.target.value } : item,
                      ),
                    )
                  }
                />
              </div>
              <input
                type="number"
                min={1}
                value={taskType.estimatedHours}
                onChange={(event) =>
                  onTaskTypeChange((current) =>
                    current.map((item) =>
                      item.id === taskType.id
                        ? { ...item, estimatedHours: Number(event.target.value) || 1 }
                        : item,
                    ),
                  )
                }
              />
              <div className="task-type-drag-handle" title="Drag to reorder">
                ⋮⋮
              </div>
              <div className="task-type-actions">
                <button
                  type="button"
                  className="clear-link"
                  onClick={() => setExpandedTaskId((current) => (current === taskType.id ? null : taskType.id))}
                >
                  {expandedTaskId === taskType.id ? 'Collapse' : 'Edit'}
                </button>
                <button type="button" className="clear-link danger-link" onClick={() => handleDelete(taskType)}>
                  Delete
                </button>
              </div>
            </div>
            {expandedTaskId === taskType.id ? (
              <div className="task-type-expanded">
                <label>
                  <span>Text color</span>
                  <input
                    type="color"
                    value={taskType.textColor}
                    onChange={(event) =>
                      onTaskTypeChange((current) =>
                        current.map((item) =>
                          item.id === taskType.id ? { ...item, textColor: event.target.value } : item,
                        ),
                      )
                    }
                  />
                </label>
                <label>
                  <span>Required fields</span>
                  <input
                    value={taskType.requiredFields.join(', ')}
                    onChange={(event) =>
                      onTaskTypeChange((current) =>
                        current.map((item) =>
                          item.id === taskType.id
                            ? {
                                ...item,
                                requiredFields: event.target.value
                                  .split(',')
                                  .map((field) => field.trim())
                                  .filter((field): field is CardFieldKey =>
                                    CARD_FIELDS.includes(field as CardFieldKey),
                                  ),
                              }
                            : item,
                        ),
                      )
                    }
                    placeholder={CARD_FIELDS.join(', ')}
                  />
                </label>
                <label>
                  <span>Optional fields</span>
                  <input
                    value={taskType.optionalFields.join(', ')}
                    onChange={(event) =>
                      onTaskTypeChange((current) =>
                        current.map((item) =>
                          item.id === taskType.id
                            ? {
                                ...item,
                                optionalFields: event.target.value
                                  .split(',')
                                  .map((field) => field.trim())
                                  .filter((field): field is CardFieldKey =>
                                    CARD_FIELDS.includes(field as CardFieldKey),
                                  ),
                              }
                            : item,
                        ),
                      )
                    }
                    placeholder={CARD_FIELDS.join(', ')}
                  />
                </label>
              </div>
            ) : null}
          </div>
        ))}
      </div>
      <button
        type="button"
        className="ghost-button"
        onClick={() =>
          onTaskTypeChange((current) => [
            ...current,
            {
              id: `task-type-${Date.now()}`,
              name: 'New Task Type',
              category: 'Other',
              icon: '⚡',
              color: '#e5e7eb',
              textColor: '#4b5563',
              estimatedHours: 5,
              requiredFields: [],
              optionalFields: [],
              isDefault: false,
              order: current.length,
            },
          ])
        }
      >
        + Add task type
      </button>
    </div>
  )
}

function SettingsPage({
  state,
  settingsTab,
  settingsPortfolioId,
  importInputRef,
  testingWebhookId,
  onTabChange,
  onSettingsPortfolioChange,
  onBackToBoard,
  onStateChange,
  onExportData,
  onImportClick,
  onResetData,
  onClearAllData,
  onTestWebhook,
  showToast,
}: SettingsPageProps) {
  const settingsPortfolio =
    state.portfolios.find((portfolio) => portfolio.id === settingsPortfolioId) ??
    state.portfolios[0]
  const [collapsedPortfolioIds, setCollapsedPortfolioIds] = useState<string[]>([])

  function updatePortfolio(
    portfolioId: string,
    updater: (portfolio: Portfolio) => Portfolio,
  ) {
    onStateChange((current) => ({
      ...current,
      portfolios: current.portfolios.map((portfolio) =>
        portfolio.id === portfolioId ? updater(portfolio) : portfolio,
      ),
    }))
  }

  function getAllBrandPrefixes(excluding?: { portfolioId: string; brandIndex: number }) {
    const prefixes: string[] = []
    state.portfolios.forEach((portfolio) => {
      portfolio.brands.forEach((brand, brandIndex) => {
        if (
          excluding &&
          excluding.portfolioId === portfolio.id &&
          excluding.brandIndex === brandIndex
        ) {
          return
        }
        prefixes.push(brand.prefix)
      })
    })
    return prefixes
  }

  function getSuggestedPrefix() {
    const taken = new Set(getAllBrandPrefixes())
    const alphabet = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ'

    for (const first of alphabet) {
      for (const second of alphabet) {
        const prefix = `${first}${second}`
        if (!taken.has(prefix)) {
          return prefix
        }
      }
    }

    return `B${state.portfolios.length}`
  }

  function getMemberCards(portfolio: Portfolio, memberName: string) {
    return portfolio.cards.filter((card) => card.owner === memberName)
  }

  return (
    <div className="settings-page">
      <div className="settings-page-sidebar">
        <button type="button" className="ghost-button settings-back" onClick={onBackToBoard}>
          ← Back to Board
        </button>
        <div className="settings-tab-list">
          {(Object.keys(SETTINGS_TAB_LABELS) as SettingTab[]).map((tab) => (
            <button
              key={tab}
              type="button"
              className={`settings-tab ${settingsTab === tab ? 'is-active' : ''}`}
              onClick={() => onTabChange(tab)}
            >
              {SETTINGS_TAB_LABELS[tab]}
            </button>
          ))}
        </div>
      </div>

      <div className="settings-page-content">
        <PageHeader title="Settings" />

        {settingsTab === 'general' ? (
          <div className="settings-block">
            <div className="settings-form-grid">
              <label>
                <span>App name</span>
                <input
                  value={state.settings.general.appName}
                  onChange={(event) =>
                    onStateChange((current) => ({
                      ...current,
                      settings: {
                        ...current.settings,
                        general: {
                          ...current.settings.general,
                          appName: event.target.value,
                        },
                      },
                    }))
                  }
                />
              </label>
              <label>
                <span>Default portfolio on startup</span>
                <select
                  value={state.settings.general.defaultPortfolioId}
                  onChange={(event) =>
                    onStateChange((current) => ({
                      ...current,
                      settings: {
                        ...current.settings,
                        general: {
                          ...current.settings.general,
                          defaultPortfolioId: event.target.value,
                        },
                      },
                    }))
                  }
                >
                  {state.portfolios.map((portfolio) => (
                    <option key={portfolio.id} value={portfolio.id}>
                      {portfolio.name}
                    </option>
                  ))}
                </select>
              </label>
              <label>
                <span>Theme</span>
                <input value="Light" disabled />
              </label>
              <label>
                <span>Amber warning at days</span>
                <input
                  type="number"
                  min={1}
                  value={state.settings.general.timeInStageThresholds.amberStart}
                  onChange={(event) =>
                    onStateChange((current) => ({
                      ...current,
                      settings: {
                        ...current.settings,
                        general: {
                          ...current.settings.general,
                          timeInStageThresholds: {
                            ...current.settings.general.timeInStageThresholds,
                            amberStart: Number(event.target.value) || 1,
                          },
                        },
                      },
                    }))
                  }
                />
              </label>
              <label>
                <span>Red warning at days</span>
                <input
                  type="number"
                  min={1}
                  value={state.settings.general.timeInStageThresholds.redStart}
                  onChange={(event) =>
                    onStateChange((current) => ({
                      ...current,
                      settings: {
                        ...current.settings,
                        general: {
                          ...current.settings.general,
                          timeInStageThresholds: {
                            ...current.settings.general.timeInStageThresholds,
                            redStart: Number(event.target.value) || 1,
                          },
                        },
                      },
                    }))
                  }
                />
              </label>
              <label className="toggle-row">
                <span>Auto-archive Live cards</span>
                <input
                  type="checkbox"
                  checked={state.settings.general.autoArchiveEnabled}
                  onChange={(event) =>
                    onStateChange((current) => ({
                      ...current,
                      settings: {
                        ...current.settings,
                        general: {
                          ...current.settings.general,
                          autoArchiveEnabled: event.target.checked,
                        },
                      },
                    }))
                  }
                />
              </label>
              <label>
                <span>Archive after days</span>
                <input
                  type="number"
                  min={1}
                  value={state.settings.general.autoArchiveDays}
                  onChange={(event) =>
                    onStateChange((current) => ({
                      ...current,
                      settings: {
                        ...current.settings,
                        general: {
                          ...current.settings.general,
                          autoArchiveDays: Number(event.target.value) || 1,
                        },
                      },
                    }))
                  }
                />
              </label>
            </div>
          </div>
        ) : null}

        {settingsTab === 'portfolios' ? (
          <div className="settings-stack">
            {state.portfolios.map((portfolio) => (
              <div key={portfolio.id} className="portfolio-settings-card">
                <div className="portfolio-settings-head">
                  <button
                    type="button"
                    className="portfolio-collapse"
                    onClick={() =>
                      setCollapsedPortfolioIds((current) =>
                        current.includes(portfolio.id)
                          ? current.filter((item) => item !== portfolio.id)
                          : [...current, portfolio.id],
                      )
                    }
                  >
                    <span>{collapsedPortfolioIds.includes(portfolio.id) ? '▸' : '▾'}</span>
                    <input
                      className="portfolio-title-input"
                      value={portfolio.name}
                      onChange={(event) =>
                        updatePortfolio(portfolio.id, (currentPortfolio) => ({
                          ...currentPortfolio,
                          name: event.target.value,
                        }))
                      }
                      onClick={(event) => event.stopPropagation()}
                    />
                  </button>
                  <div className="task-type-actions">
                    <button
                      type="button"
                      className="clear-link danger-link"
                      onClick={() => {
                        if (state.portfolios.length === 1) {
                          showToast('At least one portfolio is required', 'red')
                          return
                        }
                        if (!window.confirm(`Delete ${portfolio.name}?`)) {
                          return
                        }
                        onStateChange((current) => ({
                          ...current,
                          portfolios: current.portfolios.filter((item) => item.id !== portfolio.id),
                          activePortfolioId:
                            current.activePortfolioId === portfolio.id
                              ? current.portfolios.find((item) => item.id !== portfolio.id)?.id ?? ''
                              : current.activePortfolioId,
                        }))
                      }}
                    >
                      Delete
                    </button>
                  </div>
                </div>
                {!collapsedPortfolioIds.includes(portfolio.id) ? (
                  <>
                    <div className="nested-settings-block">
                      <div className="nested-settings-title">Brands</div>
                      <div className="settings-table full-table">
                        <div className="settings-row settings-head brand-head">
                          <span>Name</span>
                          <span>Prefix</span>
                          <span>Products</span>
                          <span>Drive Folder ID</span>
                          <span />
                        </div>
                        {portfolio.brands.map((brand, brandIndex) => (
                          <div key={`${portfolio.id}-${brand.prefix}-${brandIndex}`} className="settings-row brand-row">
                            <input
                              value={brand.name}
                              onChange={(event) =>
                                updatePortfolio(portfolio.id, (currentPortfolio) => ({
                                  ...currentPortfolio,
                                  brands: currentPortfolio.brands.map((item, index) =>
                                    index === brandIndex ? { ...item, name: event.target.value } : item,
                                  ),
                                }))
                              }
                            />
                            <input
                              value={brand.prefix}
                              onChange={(event) => {
                                const nextPrefix = event.target.value.toUpperCase().slice(0, 2)
                                if (
                                  nextPrefix &&
                                  getAllBrandPrefixes({ portfolioId: portfolio.id, brandIndex }).includes(nextPrefix)
                                ) {
                                  showToast('Brand prefixes must be unique across all portfolios', 'red')
                                  return
                                }
                                updatePortfolio(portfolio.id, (currentPortfolio) => ({
                                  ...currentPortfolio,
                                  brands: currentPortfolio.brands.map((item, index) =>
                                    index === brandIndex ? { ...item, prefix: nextPrefix } : item,
                                  ),
                                }))
                              }}
                            />
                            <input
                              value={brand.products.join(', ')}
                              onChange={(event) =>
                                updatePortfolio(portfolio.id, (currentPortfolio) => ({
                                  ...currentPortfolio,
                                  brands: currentPortfolio.brands.map((item, index) =>
                                    index === brandIndex
                                      ? {
                                          ...item,
                                          products: event.target.value
                                            .split(',')
                                            .map((product) => product.trim())
                                            .filter(Boolean),
                                        }
                                      : item,
                                  ),
                                }))
                              }
                            />
                            <input
                              value={brand.driveParentFolderId}
                              onChange={(event) =>
                                updatePortfolio(portfolio.id, (currentPortfolio) => ({
                                  ...currentPortfolio,
                                  brands: currentPortfolio.brands.map((item, index) =>
                                    index === brandIndex
                                      ? { ...item, driveParentFolderId: event.target.value }
                                      : item,
                                  ),
                                }))
                              }
                            />
                            <button
                              type="button"
                              className="clear-link"
                              onClick={() =>
                                updatePortfolio(portfolio.id, (currentPortfolio) => ({
                                  ...currentPortfolio,
                                  brands: currentPortfolio.brands.filter((_, index) => index !== brandIndex),
                                }))
                              }
                            >
                              Delete
                            </button>
                          </div>
                        ))}
                      </div>
                      <button
                        type="button"
                        className="ghost-button"
                        onClick={() => {
                          const nextPrefix = getSuggestedPrefix()
                          updatePortfolio(portfolio.id, (currentPortfolio) => ({
                            ...currentPortfolio,
                            brands: [
                              ...currentPortfolio.brands,
                              {
                                name: 'New Brand',
                                prefix: nextPrefix,
                                products: ['New Product'],
                                driveParentFolderId: '',
                                color: '#94a3b8',
                                surfaceColor: '#e2e8f0',
                                textColor: '#334155',
                              },
                            ],
                            lastIdPerPrefix: {
                              ...currentPortfolio.lastIdPerPrefix,
                              [nextPrefix]: currentPortfolio.lastIdPerPrefix[nextPrefix] ?? 0,
                            },
                          }))
                        }}
                      >
                        + Add Brand
                      </button>
                    </div>

                    <div className="nested-settings-block">
                      <div className="nested-settings-title">Drive Webhook</div>
                      <div className="integration-inline">
                        <input
                          value={portfolio.webhookUrl}
                          onChange={(event) =>
                            updatePortfolio(portfolio.id, (currentPortfolio) => ({
                              ...currentPortfolio,
                              webhookUrl: event.target.value,
                            }))
                          }
                          placeholder="https://script.google.com/macros/..."
                        />
                        <button
                          type="button"
                          className="primary-button"
                          disabled={!portfolio.webhookUrl || testingWebhookId === portfolio.id}
                          onClick={() => onTestWebhook(portfolio.id, portfolio.webhookUrl)}
                        >
                          {testingWebhookId === portfolio.id ? 'Testing...' : 'Test Connection'}
                        </button>
                      </div>
                    </div>
                  </>
                ) : null}
              </div>
            ))}

            <button
              type="button"
              className="ghost-button"
              onClick={() =>
                onStateChange((current) => ({
                  ...current,
                  portfolios: [...current.portfolios, createEmptyPortfolio('New Portfolio', current.portfolios.length)],
                }))
              }
            >
              + Add Portfolio
            </button>
          </div>
        ) : null}

        {settingsTab === 'team' ? (
          <div className="settings-stack">
            <div className="portfolio-tab-strip">
              {state.portfolios.map((portfolio) => (
                <button
                  key={portfolio.id}
                  type="button"
                  className={`filter-pill ${settingsPortfolio.id === portfolio.id ? 'is-active is-all' : ''}`}
                  onClick={() => onSettingsPortfolioChange(portfolio.id)}
                >
                  {portfolio.name}
                </button>
              ))}
            </div>

            <div className="settings-table full-table">
              <div className="settings-row settings-head team-head">
                <span>Name</span>
                <span>Role</span>
                <span>Weekly Hours</span>
                <span>Hours/Day</span>
                <span>Working Days</span>
                <span>WIP Cap</span>
                <span>Status</span>
                <span />
              </div>
              {settingsPortfolio.team.map((member, memberIndex) => (
                <div key={`${settingsPortfolio.id}-${member.id}-${memberIndex}`} className="settings-row team-row">
                  <input
                    value={member.name}
                    onChange={(event) =>
                      updatePortfolio(settingsPortfolio.id, (currentPortfolio) => ({
                        ...currentPortfolio,
                        team: currentPortfolio.team.map((item, index) =>
                          index === memberIndex ? { ...item, name: event.target.value } : item,
                        ),
                      }))
                    }
                  />
                  <input
                    value={member.role}
                    onChange={(event) =>
                      updatePortfolio(settingsPortfolio.id, (currentPortfolio) => ({
                        ...currentPortfolio,
                        team: currentPortfolio.team.map((item, index) =>
                          index === memberIndex ? { ...item, role: event.target.value } : item,
                        ),
                      }))
                    }
                  />
                  <input
                    type="number"
                    min={0}
                    value={member.weeklyHours ?? ''}
                    onChange={(event) =>
                      updatePortfolio(settingsPortfolio.id, (currentPortfolio) => ({
                        ...currentPortfolio,
                        team: currentPortfolio.team.map((item, index) =>
                          index === memberIndex
                            ? {
                                ...item,
                                weeklyHours: event.target.value ? Number(event.target.value) : null,
                              }
                            : item,
                        ),
                      }))
                    }
                  />
                  <input
                    type="number"
                    min={0}
                    step={0.5}
                    value={member.hoursPerDay ?? ''}
                    onChange={(event) =>
                      updatePortfolio(settingsPortfolio.id, (currentPortfolio) => ({
                        ...currentPortfolio,
                        team: currentPortfolio.team.map((item, index) =>
                          index === memberIndex
                            ? {
                                ...item,
                                hoursPerDay: event.target.value ? Number(event.target.value) : null,
                              }
                            : item,
                        ),
                      }))
                    }
                  />
                  <input
                    value={member.workingDays.join(', ')}
                    onChange={(event) =>
                      updatePortfolio(settingsPortfolio.id, (currentPortfolio) => ({
                        ...currentPortfolio,
                        team: currentPortfolio.team.map((item, index) =>
                          index === memberIndex
                            ? {
                                ...item,
                                workingDays: event.target.value
                                  .split(',')
                                  .map((day) => day.trim())
                                  .filter((day): day is WorkingDay =>
                                    WORKING_DAYS.includes(day as WorkingDay),
                                  ),
                              }
                            : item,
                        ),
                      }))
                    }
                    placeholder="Mon, Tue, Wed, Thu, Fri"
                  />
                  <input
                    type="number"
                    min={0}
                    value={member.wipCap ?? ''}
                    onChange={(event) =>
                      updatePortfolio(settingsPortfolio.id, (currentPortfolio) => ({
                        ...currentPortfolio,
                        team: currentPortfolio.team.map((item, index) =>
                          index === memberIndex
                            ? {
                                ...item,
                                wipCap: event.target.value ? Number(event.target.value) : null,
                              }
                            : item,
                        ),
                      }))
                    }
                  />
                  <label className="toggle-row compact">
                    <input
                      type="checkbox"
                      checked={member.active}
                      onChange={(event) =>
                        updatePortfolio(settingsPortfolio.id, (currentPortfolio) => ({
                          ...currentPortfolio,
                          team: currentPortfolio.team.map((item, index) =>
                            index === memberIndex ? { ...item, active: event.target.checked } : item,
                          ),
                        }))
                      }
                    />
                  </label>
                  <button
                    type="button"
                    className="clear-link danger-link"
                    onClick={() => {
                      const assignedCards = getMemberCards(settingsPortfolio, member.name)
                      if (assignedCards.length > 0) {
                        const confirmed = window.confirm(
                          `${member.name} has ${assignedCards.length} assigned cards. Remove them and unassign those cards?`,
                        )
                        if (!confirmed) {
                          return
                        }
                      }
                      updatePortfolio(settingsPortfolio.id, (currentPortfolio) => ({
                        ...currentPortfolio,
                        team: currentPortfolio.team.filter((_, index) => index !== memberIndex),
                        cards: currentPortfolio.cards.map((card) =>
                          card.owner === member.name ? { ...card, owner: null } : card,
                        ),
                      }))
                    }}
                  >
                    Delete
                  </button>
                </div>
              ))}
            </div>

            <button
              type="button"
              className="ghost-button"
              onClick={() =>
                updatePortfolio(settingsPortfolio.id, (currentPortfolio) => ({
                  ...currentPortfolio,
                  team: [
                    ...currentPortfolio.team,
                    {
                      id: `member-${Date.now()}`,
                      name: 'New Member',
                      role: 'Editor',
                      weeklyHours: currentPortfolio.team.some((member) => member.weeklyHours)
                        ? currentPortfolio.team.find((member) => member.weeklyHours)?.weeklyHours ?? 40
                        : 40,
                      hoursPerDay: 6,
                      workingDays: ['Mon', 'Tue', 'Wed', 'Thu', 'Fri'],
                      wipCap: 3,
                      active: true,
                    },
                  ],
                }))
              }
            >
              + Add team member
            </button>
          </div>
        ) : null}

        {settingsTab === 'task-library' ? (
          <TaskLibraryEditor
            settings={state.settings}
            portfolios={state.portfolios}
            onTaskTypeChange={(updater) =>
              onStateChange((current) => ({
                ...current,
                settings: {
                  ...current.settings,
                  taskLibrary: updater(current.settings.taskLibrary)
                    .slice()
                    .sort((left, right) => left.order - right.order)
                    .map((taskType, order) => ({ ...taskType, order })),
                },
              }))
            }
            onDeleteTaskType={(taskTypeId) =>
              onStateChange((current) => ({
                ...current,
                portfolios: current.portfolios.map((portfolio) => ({
                  ...portfolio,
                  cards: portfolio.cards.map((card) =>
                    card.taskTypeId === taskTypeId ? { ...card, taskTypeId: 'custom' } : card,
                  ),
                })),
                settings: {
                  ...current.settings,
                  taskLibrary: current.settings.taskLibrary
                    .filter((taskType) => taskType.id !== taskTypeId)
                    .map((taskType, order) => ({ ...taskType, order })),
                },
              }))
            }
            showToast={showToast}
          />
        ) : null}

        {settingsTab === 'capacity' ? (
          <div className="settings-block">
            <div className="settings-form-grid">
              <label>
                <span>Default weekly hours</span>
                <input
                  type="number"
                  min={1}
                  value={state.settings.capacity.defaultWeeklyHours}
                  onChange={(event) =>
                    onStateChange((current) => ({
                      ...current,
                      settings: {
                        ...current.settings,
                        capacity: {
                          ...current.settings.capacity,
                          defaultWeeklyHours: Number(event.target.value) || 1,
                        },
                      },
                    }))
                  }
                />
              </label>
              <label>
                <span>Green max %</span>
                <input
                  type="number"
                  min={1}
                  value={state.settings.capacity.utilizationThresholds.greenMax}
                  onChange={(event) =>
                    onStateChange((current) => ({
                      ...current,
                      settings: {
                        ...current.settings,
                        capacity: {
                          ...current.settings.capacity,
                          utilizationThresholds: {
                            ...current.settings.capacity.utilizationThresholds,
                            greenMax: Number(event.target.value) || 1,
                          },
                        },
                      },
                    }))
                  }
                />
              </label>
              <label>
                <span>Yellow max %</span>
                <input
                  type="number"
                  min={1}
                  value={state.settings.capacity.utilizationThresholds.yellowMax}
                  onChange={(event) =>
                    onStateChange((current) => ({
                      ...current,
                      settings: {
                        ...current.settings,
                        capacity: {
                          ...current.settings.capacity,
                          utilizationThresholds: {
                            ...current.settings.capacity.utilizationThresholds,
                            yellowMax: Number(event.target.value) || 1,
                          },
                        },
                      },
                    }))
                  }
                />
              </label>
              <label>
                <span>Red min %</span>
                <input
                  type="number"
                  min={1}
                  value={state.settings.capacity.utilizationThresholds.redMin}
                  onChange={(event) =>
                    onStateChange((current) => ({
                      ...current,
                      settings: {
                        ...current.settings,
                        capacity: {
                          ...current.settings.capacity,
                          utilizationThresholds: {
                            ...current.settings.capacity.utilizationThresholds,
                            redMin: Number(event.target.value) || 1,
                          },
                        },
                      },
                    }))
                  }
                />
              </label>
            </div>
          </div>
        ) : null}

        {settingsTab === 'integrations' ? (
          <div className="settings-block">
            <div className="settings-form-grid">
              <label className="full-width">
                <span>Global Google Drive webhook</span>
                <div className="integration-inline">
                  <input
                    value={state.settings.integrations.globalDriveWebhookUrl}
                    onChange={(event) =>
                      onStateChange((current) => ({
                        ...current,
                        settings: {
                          ...current.settings,
                          integrations: {
                            ...current.settings.integrations,
                            globalDriveWebhookUrl: event.target.value,
                          },
                        },
                      }))
                    }
                  />
                  <button
                    type="button"
                    className="primary-button"
                    disabled={
                      !state.settings.integrations.globalDriveWebhookUrl ||
                      testingWebhookId === 'global-drive'
                    }
                    onClick={() =>
                      onTestWebhook('global-drive', state.settings.integrations.globalDriveWebhookUrl)
                    }
                  >
                    {testingWebhookId === 'global-drive' ? 'Testing...' : 'Test'}
                  </button>
                </div>
              </label>
              <div className="placeholder-card">
                <strong>Frame.io</strong>
                <span>Coming soon — Frame.io webhook integration for automatic review link detection</span>
              </div>
              <div className="placeholder-card">
                <strong>Slack</strong>
                <span>Coming soon — Slack notifications for card updates</span>
              </div>
            </div>
          </div>
        ) : null}

        {settingsTab === 'data' ? (
          <div className="settings-block">
            <div className="data-actions">
              <button type="button" className="primary-button" onClick={onExportData}>
                Export board data
              </button>
              <button type="button" className="ghost-button" onClick={onImportClick}>
                Import board data
              </button>
              <button type="button" className="ghost-button danger-outline" onClick={onResetData}>
                Reset to seed data
              </button>
              <button type="button" className="ghost-button danger-outline" onClick={onClearAllData}>
                Clear all data
              </button>
              <input ref={importInputRef} type="file" accept="application/json" hidden />
            </div>
          </div>
        ) : null}
      </div>
    </div>
  )
}

function AnalyticsPage({
  state,
  nowMs,
  onOpenCard,
  onOpenPortfolioBoard,
  onOpenEditorBoard,
}: AnalyticsPageProps) {
  const dashboard = buildDashboardData(state.portfolios, state.settings, nowMs)
  const [expandedStage, setExpandedStage] = useState<StageId | null>(null)
  const maxThroughput = Math.max(...dashboard.throughput.map((week) => week.total), 0)

  return (
    <div className="page-shell">
      <PageHeader title="Analytics" />

      <section>
        <h2 className="dashboard-section-title">Portfolio Overview</h2>
        <div className="overview-grid">
          {dashboard.overviewCards.map((portfolio) => (
            <button
              key={portfolio.portfolioId}
              type="button"
              className="overview-card"
              onClick={() => onOpenPortfolioBoard(portfolio.portfolioId)}
            >
              <strong>{portfolio.name.toUpperCase()}</strong>
              <span>{portfolio.activeCards} active cards</span>
              <div className="overview-progress">
                <div
                  className="overview-progress-fill"
                  style={{ width: `${Math.round(portfolio.onTrackRatio * 100)}%` }}
                />
              </div>
              <span>{Math.round(portfolio.onTrackRatio * 100)}% on track</span>
              <span>
                {portfolio.stuckCount} stuck · {portfolio.atCapacityCount} at capacity
              </span>
              <span>
                Brands:{' '}
                {portfolio.brandBreakdown.map((item) => `${item.brand} (${item.count})`).join(' ')}
              </span>
            </button>
          ))}
        </div>
      </section>

      <section>
        <h2 className="dashboard-section-title">Pipeline Funnel</h2>
        <div className="funnel-row">
          {dashboard.funnel.map((bucket) => (
            <button
              key={bucket.stage}
              type="button"
              className="funnel-stage"
              style={{ flex: Math.max(bucket.total, 1) }}
              onClick={() => setExpandedStage((current) => (current === bucket.stage ? null : bucket.stage))}
            >
              <div className="funnel-bar">
                {bucket.segments.map((segment) => (
                  <span
                    key={`${bucket.stage}-${segment.brand}`}
                    style={{
                      flex: segment.count,
                      background: segment.color,
                    }}
                  />
                ))}
              </div>
              <span>
                {bucket.stage} ({bucket.total})
              </span>
            </button>
          ))}
        </div>
        {expandedStage ? (
          <div className="dashboard-card-list">
            {dashboard.funnel
              .find((bucket) => bucket.stage === expandedStage)
              ?.cards.map((card) => (
                <button
                  key={`${card.portfolioId}-${card.cardId}`}
                  type="button"
                  className="dashboard-card-row"
                  onClick={() => onOpenCard(card.portfolioId, card.cardId)}
                >
                  <span>{card.cardId}</span>
                  <span>{card.isBlocked ? `🚫 ${card.title}` : card.title}</span>
                  <span>{card.portfolioName}</span>
                  <span>{card.owner ?? 'Unassigned'}</span>
                </button>
              ))}
          </div>
        ) : null}
      </section>

      <section>
        <h2 className="dashboard-section-title">Team Capacity Grid</h2>
        <div className="dashboard-table">
          <div className="dashboard-table-row dashboard-table-head analytics-team-grid">
            <span>Editor</span>
            <span>Portfolio</span>
            <span>Active</span>
            <span>Utilization</span>
            <span>Capacity</span>
            <span>Workload</span>
            <span>Avg Cycle Time</span>
            <span>Revisions</span>
          </div>
          {dashboard.teamGrid.map((row, index) => (
            <div
              key={`${row.portfolioId}-${row.editorId}`}
              className={`dashboard-table-row analytics-team-grid ${index % 2 === 1 ? 'is-alt' : ''}`}
            >
              <button type="button" className="table-link" onClick={() => onOpenEditorBoard(row.portfolioId, row.editorName)}>
                {row.editorName}
              </button>
              <span>{row.portfolioName}</span>
              <span>{row.active}</span>
              <span className={`util-inline is-${row.utilizationTone}`}>
                {row.utilizationPct}% {row.utilizationTone === 'green' ? '🟢' : row.utilizationTone === 'yellow' ? '🟡' : '🔴'}
              </span>
              <span>{`${formatHours(row.usedHours)}/${formatHours(row.totalHours)}`}</span>
              <span>{`~${row.workloadDays}d`}</span>
              <span>{row.avgCycleTime ? `${row.avgCycleTime}d` : '—'}</span>
              <span>{row.avgRevisionsPerCard ? `${row.avgRevisionsPerCard}/card` : '—'}</span>
            </div>
          ))}
        </div>
      </section>

      <section>
        <h2 className="dashboard-section-title">Stuck Cards Alert</h2>
        <div className="stuck-list">
          {dashboard.stuckCards.map((card) => (
            <button
              key={`${card.portfolioId}-${card.cardId}`}
              type="button"
              className="stuck-row"
              onClick={() => onOpenCard(card.portfolioId, card.cardId)}
            >
              <span className={`stuck-dot ${card.daysInStage >= state.settings.general.timeInStageThresholds.redStart ? 'is-red' : 'is-amber'}`} />
              <span>{card.cardId}</span>
              <span>
                {card.isBlocked && card.blockedReason
                  ? `Blocked: ${card.blockedReason}`
                  : card.title}
              </span>
              <span>{card.stage}</span>
              <span>{card.owner ?? 'Unassigned'}</span>
              <span>{card.daysInStage}d</span>
            </button>
          ))}
        </div>
      </section>

      <section>
        <h2 className="dashboard-section-title">Throughput</h2>
        {dashboard.throughput.every((week) => week.total === 0) ? (
          <div className="dashboard-placeholder">
            Throughput data will appear as cards move through the pipeline.
          </div>
        ) : (
          <div className="throughput-chart">
            {dashboard.throughput.map((week) => (
              <div key={week.label} className="throughput-column">
                <div className="throughput-bar">
                  {week.segments.map((segment) => (
                    <span
                      key={`${week.label}-${segment.brand}`}
                      style={{
                        height: `${(segment.count / Math.max(maxThroughput, 1)) * 100}%`,
                        background: segment.color,
                      }}
                    />
                  ))}
                </div>
                <span>{week.label}</span>
              </div>
            ))}
          </div>
        )}
      </section>

      <section>
        <h2 className="dashboard-section-title">Brand Health Summary</h2>
        <div className="dashboard-table">
          <div className="dashboard-table-row dashboard-table-head brand-health-grid">
            <span>Brand</span>
            <span>Active</span>
            <span>Stuck</span>
            <span>In Production</span>
            <span>Avg Cycle Time</span>
            <span>Last Shipped</span>
          </div>
          {dashboard.brandHealth.map((row, index) => (
            <div
              key={`${row.portfolioId}-${row.brand}`}
              className={`dashboard-table-row brand-health-grid ${index % 2 === 1 ? 'is-alt' : ''}`}
            >
              <span className="brand-health-name">
                <span className="brand-dot" style={{ background: row.color }} />
                {row.brand}
              </span>
              <span>{row.active}</span>
              <span>{row.stuck}</span>
              <span>{row.inProduction}</span>
              <span>{row.avgCycleTime ? `${row.avgCycleTime}d` : '—'}</span>
              <span>{row.lastShipped ? formatDateShort(row.lastShipped) : '—'}</span>
            </div>
          ))}
        </div>
      </section>

      <section>
        <h2 className="dashboard-section-title">Revision Patterns</h2>
        <div className="revision-grid">
          <div className="revision-card">
            <strong>Top reasons cards are sent back (last 30 days)</strong>
            <div className="revision-list">
              {dashboard.revisionReasons.map((reason, index) => (
                <span key={reason.reason}>
                  {index + 1}. {reason.reason} — {reason.count} cards ({reason.percent}%)
                </span>
              ))}
            </div>
          </div>
          <div className="revision-card">
            <strong>Editors with highest revision rates (last 30 days)</strong>
            <div className="revision-list">
              {dashboard.editorRevisionRates.map((item, index) => (
                <span key={item.editorName}>
                  {index + 1}. {item.editorName} — {item.avgRevisionsPerCard} revisions/card avg
                </span>
              ))}
            </div>
          </div>
        </div>
      </section>
    </div>
  )
}

function WorkloadPage({
  portfolio,
  settings,
  timeframe,
  nowMs,
  canAssign,
  activeDragCardId,
  onTimeframeChange,
  onOpenEditorBoard,
  onOpenCard,
}: WorkloadPageProps) {
  const workload = getWorkloadData(portfolio, settings, timeframe, nowMs)

  return (
    <div className="page-shell">
      <PageHeader
        title="Workload"
        rightContent={
          <select className="inline-select" value={timeframe} onChange={(event) => onTimeframeChange(event.target.value as Timeframe)}>
            <option value="this-week">This Week</option>
            <option value="next-week">Next Week</option>
            <option value="this-month">This Month</option>
          </select>
        }
      />

      <section className="workload-section">
        <div className="workload-section-head">
          <h2>Team Utilization</h2>
        </div>
        <div className="workload-grid">
          {workload.rows.map((row) => (
            <WorkloadDropRow
              key={row.member.id}
              memberId={row.member.id}
              dragActive={activeDragCardId !== null}
            >
              <button
                type="button"
                className="workload-row-name"
                onClick={() => onOpenEditorBoard(row.member.name)}
              >
                {row.member.name}
              </button>
              <div className="workload-row-bar">
                <div className="util-bar large">
                  <span
                    className={`util-bar-fill is-${row.utilizationTone}`}
                    style={{ width: getUtilBarWidth(row.utilizationPct) }}
                  />
                </div>
                <div className="workload-row-meta">
                  <span className={`util-inline is-${row.utilizationTone}`}>
                    {row.utilizationPct}% ·{' '}
                    {`${formatHours(row.capacityUsed)}/${formatHours(row.capacityTotal)}`}
                  </span>
                  {row.utilizationPct > 100 ? <span className="overload-label">OVER</span> : null}
                  {row.partTimeLabel ? <span className="muted-copy">{row.partTimeLabel}</span> : null}
                </div>
                <div className="workload-breakdown-line">
                  {row.breakdown.length > 0
                    ? row.breakdown
                        .map((item) => `${item.taskTypeName}(${formatHours(item.hours)})`)
                        .join(' + ')
                    : 'No active cards'}
                </div>
              </div>
            </WorkloadDropRow>
          ))}
        </div>
      </section>

      <section className="workload-section">
        <div className="workload-section-head">
          <h2>
            {`Unassigned Work · ${workload.queue.length} cards · ~${formatHours(
              workload.queueHours,
            )} total`}
          </h2>
        </div>
        <div className="workload-queue">
          {workload.queue.map((item) => {
            const card = portfolio.cards.find((currentCard) => currentCard.id === item.cardId)
            if (!card) {
              return null
            }
            return (
              <WorkloadQueueCard
                key={item.cardId}
                card={card}
                settings={settings}
                onOpen={() => onOpenCard(portfolio.id, item.cardId)}
                canDrag={canAssign}
              />
            )
          })}
        </div>
      </section>
    </div>
  )
}

function App() {
  const [state, setState] = useState<AppState>(() => loadAppState())
  const [boardFilters, setBoardFilters] = useState<BoardFilters>(() =>
    getDefaultBoardFilters(getActivePortfolio(loadAppState())),
  )
  const [selectedCard, setSelectedCard] = useState<SelectedCardState | null>(null)
  const [toast, setToast] = useState<ToastState | null>(null)
  const [copyState, setCopyState] = useState<CopyState | null>(null)
  const [nowMs, setNowMs] = useState(() => Date.now())
  const [quickCreateOpen, setQuickCreateOpen] = useState(false)
  const [quickCreateValue, setQuickCreateValue] = useState<QuickCreateInput>(() => {
    const initialState = loadAppState()
    return getQuickCreateDefaults(getActivePortfolio(initialState) ?? initialState.portfolios[0], initialState.settings)
  })
  const [sidebarPinned, setSidebarPinned] = useState(false)
  const [sidebarHovered, setSidebarHovered] = useState(false)
  const [editorMenuOpen, setEditorMenuOpen] = useState(false)
  const [settingsTab, setSettingsTab] = useState<SettingTab>('general')
  const [settingsPortfolioId, setSettingsPortfolioId] = useState(() => loadAppState().activePortfolioId)
  const [timeframe, setTimeframe] = useState<Timeframe>('this-week')
  const [dragCardId, setDragCardId] = useState<string | null>(null)
  const [dragOverLaneId, setDragOverLaneId] = useState<string | null>(null)
  const [blockedLaneId, setBlockedLaneId] = useState<string | null>(null)
  const [expandedStages, setExpandedStages] = useState<StageId[]>([])
  const [pendingBackwardMove, setPendingBackwardMove] = useState<PendingBackwardMove | null>(null)
  const [pendingDeleteCard, setPendingDeleteCard] = useState<PendingDeleteCard | null>(null)
  const [backwardMoveForm, setBackwardMoveForm] = useState<BackwardMoveFormState>({
    reason: '',
    otherReason: '',
  })
  const [creatingDriveCardId, setCreatingDriveCardId] = useState<string | null>(null)
  const [testingWebhookId, setTestingWebhookId] = useState<string | null>(null)

  const searchRef = useRef<HTMLInputElement | null>(null)
  const importInputRef = useRef<HTMLInputElement | null>(null)

  const activePortfolio = getActivePortfolio(state)
  const currentPage = getCurrentPage(state)
  const editorOptions = activePortfolio ? getEditorOptions(activePortfolio) : []
  const currentEditor = activePortfolio
    ? getTeamMemberById(activePortfolio, state.activeRole.editorId)
    : null
  const viewerContext = useMemo<ViewerContext>(
    () => ({
      mode: state.activeRole.mode,
      editorName: state.activeRole.mode === 'editor' ? currentEditor?.name ?? null : null,
    }),
    [currentEditor?.name, state.activeRole.mode],
  )
  const attention = getAttentionSummary(activePortfolio, state.settings, nowMs)
  const searchBaseCards =
    activePortfolio && currentPage === 'board'
      ? getVisibleCards(
          activePortfolio,
          viewerContext,
          { ...boardFilters, searchQuery: '' },
          state.settings,
          nowMs,
        ).filter((card) => !card.archivedAt)
      : []
  const visibleBoardCards =
    activePortfolio && currentPage === 'board'
      ? getVisibleCards(activePortfolio, viewerContext, boardFilters, state.settings, nowMs)
      : []
  const columns = useMemo(
    () =>
      activePortfolio && currentPage === 'board'
        ? getVisibleColumns(activePortfolio, viewerContext, boardFilters, state.settings, nowMs, {
            showEmptyGroupedSections: dragCardId !== null && state.activeRole.mode === 'manager',
            manuallyExpandedStages: expandedStages,
          })
        : [],
    [
      activePortfolio,
      boardFilters,
      currentPage,
      dragCardId,
      expandedStages,
      nowMs,
      state.activeRole.mode,
      state.settings,
      viewerContext,
    ],
  )
  const stats =
    activePortfolio && currentPage === 'board'
      ? getBoardStats(activePortfolio, viewerContext, boardFilters, state.settings, nowMs)
      : null
  const summaryOwner =
    state.activeRole.mode === 'editor'
      ? viewerContext.editorName
      : boardFilters.ownerNames.length === 1
        ? boardFilters.ownerNames[0]
        : null
  const summary =
    activePortfolio && currentPage === 'board' && summaryOwner
      ? getEditorSummary(
          activePortfolio,
          summaryOwner,
          boardFilters.brandNames.length > 0
            ? boardFilters.brandNames
            : activePortfolio.brands.map((brand) => brand.name),
          state.settings,
        )
      : null

  const activeSelectedPortfolio = selectedCard
    ? state.portfolios.find((portfolio) => portfolio.id === selectedCard.portfolioId) ?? null
    : null
  const selectedCardData = selectedCard
    ? activeSelectedPortfolio?.cards.find((card) => card.id === selectedCard.cardId) ?? null
    : null
  const pendingBackwardCard = pendingBackwardMove
    ? state.portfolios
        .find((portfolio) => portfolio.id === pendingBackwardMove.portfolioId)
        ?.cards.find((card) => card.id === pendingBackwardMove.cardId) ?? null
    : null
  const pendingDeleteCardData = pendingDeleteCard
    ? state.portfolios
        .find((portfolio) => portfolio.id === pendingDeleteCard.portfolioId)
        ?.cards.find((card) => card.id === pendingDeleteCard.cardId) ?? null
    : null
  const activeDragCard =
    activePortfolio && dragCardId
      ? activePortfolio.cards.find((card) => card.id === dragCardId) ?? null
      : null

  const sensors = useSensors(
    useSensor(PointerSensor, {
      activationConstraint: {
        distance: 6,
      },
    }),
  )

  const laneMap = useMemo(() => {
    const map: Record<string, LaneModel> = {}
    columns.forEach((column) => {
      column.lanes.forEach((lane) => {
        map[lane.id] = lane
      })
    })
    return map
  }, [columns])

  const itemToLaneMap = useMemo(() => {
    const map: Record<string, string> = {}
    columns.forEach((column) => {
      column.lanes.forEach((lane) => {
        lane.cards.forEach((card) => {
          map[card.id] = lane.id
        })
      })
    })
    return map
  }, [columns])

  useEffect(() => {
    persistAppState(state)
  }, [state])

  useEffect(() => {
    const timer = window.setTimeout(() => {
      if (toast) {
        setToast(null)
      }
    }, 3000)

    return () => window.clearTimeout(timer)
  }, [toast])

  useEffect(() => {
    if (!copyState) {
      return
    }

    const timer = window.setTimeout(() => setCopyState(null), 1200)
    return () => window.clearTimeout(timer)
  }, [copyState])

  useEffect(() => {
    const timer = window.setInterval(() => {
      const nextNow = Date.now()
      setNowMs(nextNow)
      setState((current) => archiveEligibleCards(current, nextNow))
    }, 60_000)

    return () => window.clearInterval(timer)
  }, [])

  useEffect(() => {
    function handleKeyDown(event: KeyboardEvent) {
      const hasModifier = event.metaKey || event.ctrlKey

      if (event.key === 'Escape') {
        setSelectedCard(null)
        setQuickCreateOpen(false)
        setPendingBackwardMove(null)
        setPendingDeleteCard(null)
        setEditorMenuOpen(false)
      }

      if (hasModifier && event.key.toLowerCase() === 'k' && currentPage === 'board') {
        event.preventDefault()
        searchRef.current?.focus()
      }

      if (
        hasModifier &&
        event.key.toLowerCase() === 'n' &&
        currentPage === 'board' &&
        state.activeRole.mode === 'manager' &&
        activePortfolio
      ) {
        event.preventDefault()
        setQuickCreateValue(getQuickCreateDefaults(activePortfolio, state.settings))
        setQuickCreateOpen(true)
      }
    }

    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [activePortfolio, currentPage, state.activeRole.mode, state.settings])

  useEffect(() => {
    const input = importInputRef.current
    if (!input) {
      return
    }

    function handleChange(event: Event) {
      const target = event.target as HTMLInputElement
      const file = target.files?.[0]
      if (!file) {
        return
      }

      void file.text().then((text) => {
        try {
          const parsed = coerceAppState(JSON.parse(text))
          const nextPortfolio =
            parsed.portfolios.find((portfolio) => portfolio.id === parsed.activePortfolioId) ??
            parsed.portfolios[0] ??
            null
          setState(parsed)
          setBoardFilters(getDefaultBoardFilters(nextPortfolio))
          setSettingsPortfolioId(parsed.activePortfolioId)
          setSelectedCard(null)
          setToast({
            message: 'Board data imported',
            tone: 'green',
          })
        } catch {
          setToast({
            message: 'Import failed. Please use a valid export file.',
            tone: 'red',
          })
        } finally {
          target.value = ''
        }
      })
    }

    input.addEventListener('change', handleChange)
    return () => input.removeEventListener('change', handleChange)
  }, [])

  function showToast(message: string, tone: ToastTone) {
    setToast({ message, tone })
  }

  function replaceState(nextState: AppState) {
    const nextPortfolio =
      nextState.portfolios.find((portfolio) => portfolio.id === nextState.activePortfolioId) ??
      nextState.portfolios[0] ??
      null
    setState(nextState)
    if (nextPortfolio) {
      setBoardFilters((current) => ({
        ...current,
        brandNames:
          current.brandNames.filter((brand) =>
            nextPortfolio.brands.some((item) => item.name === brand),
          ).length > 0
            ? current.brandNames.filter((brand) =>
                nextPortfolio.brands.some((item) => item.name === brand),
              )
            : nextPortfolio.brands.map((brand) => brand.name),
        ownerNames:
          current.ownerNames.filter((owner) =>
            nextPortfolio.team.some((member) => member.name === owner),
          ),
      }))
      setSettingsPortfolioId(nextPortfolio.id)
    }
  }

  function updateState(updater: (state: AppState) => AppState) {
    replaceState(updater(state))
  }

  function updatePortfolio(
    portfolioId: string,
    updater: (portfolio: Portfolio) => Portfolio,
  ) {
    updateState((current) => ({
      ...current,
      portfolios: current.portfolios.map((portfolio) =>
        portfolio.id === portfolioId ? updater(portfolio) : portfolio,
      ),
    }))
  }

  function switchToPortfolio(portfolioId: string) {
    const portfolio = state.portfolios.find((item) => item.id === portfolioId) ?? state.portfolios[0]
    setState((current) => ({
      ...current,
      activePortfolioId: portfolio.id,
    }))
    setBoardFilters(getDefaultBoardFilters(portfolio))
    setSettingsPortfolioId(portfolio.id)
    if (state.activeRole.mode === 'editor') {
      const nextEditor = getEditorOptions(portfolio)[0]
      setState((current) => ({
        ...current,
        activePortfolioId: portfolio.id,
        activeRole: {
          ...current.activeRole,
          editorId: nextEditor?.id ?? current.activeRole.editorId,
        },
      }))
    }
  }

  function setPage(page: AppPage) {
    if (page === 'analytics' && state.activeRole.mode !== 'observer') {
      return
    }
    if (page === 'settings' && state.activeRole.mode !== 'manager') {
      return
    }
    if (page === 'workload' && state.activeRole.mode === 'editor') {
      return
    }

    setState((current) => ({
      ...current,
      activePage: page,
    }))
    setSelectedCard(null)
  }

  function focusBoardAttention() {
    if (!attention.hasAttention || !activePortfolio) {
      return
    }

    if (attention.overdueCount > 0) {
      setBoardFilters((current) => ({ ...current, overdueOnly: true, stuckOnly: false, blockedOnly: false }))
      return
    }

    if (attention.stuckCount > 0) {
      setBoardFilters((current) => ({ ...current, overdueOnly: false, stuckOnly: true, blockedOnly: false }))
      return
    }

    if (attention.blockedCount > 0) {
      setBoardFilters((current) => ({ ...current, overdueOnly: false, stuckOnly: false, blockedOnly: true }))
    }
  }

  function handleSidebarPageChange(page: AppPage) {
    setPage(page)
    if (page === 'board') {
      focusBoardAttention()
    }
  }

  function setRole(nextRole: ActiveRole) {
    let resolvedEditorId = nextRole.editorId
    if (nextRole.mode === 'editor' && activePortfolio) {
      const nextEditor =
        getTeamMemberById(activePortfolio, nextRole.editorId) ?? getEditorOptions(activePortfolio)[0]
      resolvedEditorId = nextEditor?.id ?? null
    }
    setState((current) => ({
      ...current,
      activeRole: {
        ...nextRole,
        editorId: resolvedEditorId,
      },
      activePage:
        nextRole.mode === 'observer'
          ? current.activePage === 'settings'
            ? 'board'
            : current.activePage
          : nextRole.mode === 'manager'
            ? current.activePage === 'analytics'
              ? 'board'
              : current.activePage
            : current.activePage === 'analytics' || current.activePage === 'settings'
              ? 'board'
              : current.activePage,
    }))
    setEditorMenuOpen(false)
  }

  function handleCopy(key: string, value: string) {
    void copyToClipboard(value).then(() => setCopyState({ key }))
  }

  function handleQuickCreate(openDetail: boolean) {
    if (!activePortfolio || !quickCreateValue.title.trim() || !quickCreateValue.brand) {
      return
    }

    const actor = getRoleActorName(state.activeRole, activePortfolio)
    const card = createCardFromQuickInput(activePortfolio, state.settings, quickCreateValue, actor)
    updatePortfolio(activePortfolio.id, (portfolio) => addCardToPortfolio(portfolio, card))
    setQuickCreateOpen(false)
    setQuickCreateValue(getQuickCreateDefaults(activePortfolio, state.settings))
    showToast(`${card.id} created`, 'green')

    if (openDetail) {
      setSelectedCard({
        portfolioId: activePortfolio.id,
        cardId: card.id,
      })
    }
  }

  function openCard(portfolioId: string, cardId: string) {
    setSelectedCard({ portfolioId, cardId })
  }

  function saveOpenCard(updates: Partial<Card>) {
    if (!selectedCard || !activeSelectedPortfolio) {
      return
    }
    const actor = getRoleActorName(state.activeRole, activeSelectedPortfolio)
    updatePortfolio(activeSelectedPortfolio.id, (portfolio) =>
      applyCardUpdates(
        portfolio,
        state.settings,
        selectedCard.cardId,
        updates,
        actor,
        new Date().toISOString(),
      ),
    )
  }

  function requestDeleteOpenCard() {
    if (!selectedCard) {
      return
    }

    setPendingDeleteCard(selectedCard)
  }

  function handleDeleteCard() {
    if (!pendingDeleteCard) {
      return
    }

    const portfolio =
      state.portfolios.find((item) => item.id === pendingDeleteCard.portfolioId) ?? null
    if (!portfolio) {
      setPendingDeleteCard(null)
      return
    }

    const actor = getRoleActorName(state.activeRole, portfolio)
    const targetCard =
      portfolio.cards.find((card) => card.id === pendingDeleteCard.cardId) ?? null

    updatePortfolio(portfolio.id, (currentPortfolio) =>
      removeCardFromPortfolio(
        currentPortfolio,
        pendingDeleteCard.cardId,
        actor,
        new Date().toISOString(),
      ),
    )

    setPendingDeleteCard(null)
    setSelectedCard(null)

    if (targetCard) {
      showToast(`${targetCard.id} deleted`, 'amber')
    }
  }

  function addCommentToCard(text: string) {
    if (!selectedCard || !activeSelectedPortfolio) {
      return
    }
    const author = getRoleActorName(state.activeRole, activeSelectedPortfolio)
    updatePortfolio(activeSelectedPortfolio.id, (portfolio) => ({
      ...portfolio,
      cards: portfolio.cards.map((card) =>
        card.id === selectedCard.cardId
          ? {
              ...card,
              comments: [
                ...card.comments,
                {
                  author,
                  text,
                  timestamp: new Date().toISOString(),
                },
              ],
            }
          : card,
      ),
    }))
  }

  async function createDriveFolder() {
    if (!selectedCardData || !activeSelectedPortfolio) {
      return
    }

    const webhookUrl =
      activeSelectedPortfolio.webhookUrl || state.settings.integrations.globalDriveWebhookUrl
    if (!webhookUrl) {
      showToast('No Drive webhook configured', 'red')
      return
    }

    setCreatingDriveCardId(selectedCardData.id)
    try {
      await new Promise((resolve) => window.setTimeout(resolve, 500))
      showToast(
        `Drive folder creation is staged for the backend pass. Saved webhook target: ${webhookUrl}`,
        'blue',
      )
    } finally {
      setCreatingDriveCardId(null)
    }
  }

  function getDropTarget(overId: string | null) {
    if (!overId) {
      return null
    }
    const lane = laneMap[overId] ?? laneMap[itemToLaneMap[overId]]
    if (!lane) {
      return null
    }
    if (laneMap[overId]) {
      return {
        lane,
        destinationIndex: lane.allCardIds.length,
      }
    }
    const overIndex = lane.allCardIds.indexOf(overId)
    return {
      lane,
      destinationIndex: overIndex === -1 ? lane.allCardIds.length : overIndex,
    }
  }

  function validateBoardDrop(cardId: string, targetLane: LaneModel | null) {
    if (!activePortfolio || !targetLane || targetLane.stage === 'Archived') {
      return {
        valid: false,
        message: 'That drop zone is not available.',
        tone: 'blue' as ToastTone,
      }
    }

    const card = activePortfolio.cards.find((item) => item.id === cardId)
    if (!card) {
      return {
        valid: false,
        message: 'That card could not be moved.',
        tone: 'blue' as ToastTone,
      }
    }

    if (state.activeRole.mode === 'observer') {
      return {
        valid: false,
        message: 'Observer view is read-only.',
        tone: 'blue' as ToastTone,
      }
    }

    if (state.activeRole.mode === 'editor') {
      if (!viewerContext.editorName || card.owner !== viewerContext.editorName) {
          return {
            valid: false,
            message: 'Editors can only move their own cards forward.',
            tone: 'blue' as ToastTone,
          }
        }

      const nextStage = getNextStageForEditor(card.stage)
      if (!nextStage || targetLane.stage !== nextStage) {
          return {
            valid: false,
            message: 'Editors can only move cards forward one stage at a time.',
            tone: 'blue' as ToastTone,
          }
        }

      if (targetLane.owner && targetLane.owner !== viewerContext.editorName) {
          return {
            valid: false,
            message: 'Editors can only move cards within their own lane.',
            tone: 'blue' as ToastTone,
          }
        }

      return {
        valid: true,
        message: '',
        tone: 'green' as ToastTone,
      }
    }

    if ((GROUPED_STAGES as readonly StageId[]).includes(targetLane.stage as StageId) && !targetLane.owner) {
      return {
        valid: false,
        message: 'Choose an editor lane to assign this card.',
        tone: 'blue' as ToastTone,
      }
    }

    if (targetLane.stage === 'In Production' && targetLane.owner) {
      const member = getTeamMemberByName(activePortfolio, targetLane.owner)
      const projectedWip = activePortfolio.cards.filter(
        (currentCard) =>
          currentCard.id !== card.id &&
          currentCard.owner === targetLane.owner &&
          currentCard.stage === 'In Production' &&
          !currentCard.archivedAt,
      ).length
      if (member?.wipCap !== null && member?.wipCap !== undefined && projectedWip >= member.wipCap) {
        return {
          valid: false,
          message: `${targetLane.owner} is at capacity (${member.wipCap}/${member.wipCap})`,
          tone: 'red' as ToastTone,
        }
      }
    }

    return {
      valid: true,
      message: '',
      tone: 'green' as ToastTone,
    }
  }

  function clearBoardDragState() {
    setDragCardId(null)
    setDragOverLaneId(null)
    setBlockedLaneId(null)
  }

  function handleBoardDragStart(event: DragStartEvent) {
    setDragCardId(String(event.active.id))
  }

  function handleBoardDragOver(event: DragOverEvent) {
    const target = getDropTarget(event.over ? String(event.over.id) : null)
    const validation = validateBoardDrop(String(event.active.id), target?.lane ?? null)
    setDragOverLaneId(target?.lane.id ?? null)
    setBlockedLaneId(validation.valid ? null : target?.lane.id ?? null)
  }

  function applyMove(
    portfolioId: string,
    cardId: string,
    destinationStage: StageId,
    destinationOwner: string | null,
    destinationIndex: number,
    movedAt: string,
    revisionReason?: string,
  ) {
    const portfolio = state.portfolios.find((item) => item.id === portfolioId)
    if (!portfolio) {
      return
    }
    const actor = getRoleActorName(state.activeRole, portfolio)
    const card = portfolio.cards.find((item) => item.id === cardId)
    if (!card) {
      return
    }
    updatePortfolio(portfolioId, (currentPortfolio) =>
      moveCardInPortfolio(
        currentPortfolio,
        cardId,
        destinationStage,
        destinationOwner,
        destinationIndex,
        movedAt,
        actor,
        revisionReason,
      ),
    )

    if (revisionReason) {
      showToast(`${card.id} moved back to ${destinationStage}`, 'amber')
    } else if (card.stage === 'Backlog' && destinationOwner) {
      showToast(`${card.id} assigned to ${destinationOwner}`, 'blue')
    } else {
      showToast(`${card.id} → ${destinationStage}`, 'green')
    }
  }

  function handleBoardDragEnd(event: DragEndEvent) {
    const cardId = String(event.active.id)
    const target = getDropTarget(event.over ? String(event.over.id) : null)
    const validation = validateBoardDrop(cardId, target?.lane ?? null)

    if (!activePortfolio || !target || !validation.valid) {
      clearBoardDragState()
      if (!validation.valid && validation.message) {
        showToast(validation.message, validation.tone)
      }
      return
    }

    const card = activePortfolio.cards.find((item) => item.id === cardId)
    if (!card) {
      clearBoardDragState()
      return
    }

    const sourceLaneId = card.archivedAt ? `Archived::flat` : `${card.stage}::${(GROUPED_STAGES as readonly StageId[]).includes(card.stage) ? card.owner ?? 'flat' : 'flat'}`
    const sourceLane = laneMap[sourceLaneId]
    const sourceIndex = sourceLane?.allCardIds.indexOf(card.id) ?? -1
    let destinationIndex = target.destinationIndex
    if (sourceLaneId === target.lane.id && sourceIndex !== -1 && sourceIndex < destinationIndex) {
      destinationIndex -= 1
    }

    const nextOwner = target.lane.stage === 'Backlog' ? null : target.lane.owner ?? card.owner
    if (
      sourceLaneId === target.lane.id &&
      sourceIndex !== -1 &&
      sourceIndex === destinationIndex &&
      nextOwner === card.owner
    ) {
      clearBoardDragState()
      return
    }

    const movedAt = new Date().toISOString()
    const isBackwardMove = STAGES.indexOf(target.lane.stage as StageId) < STAGES.indexOf(card.stage)
    clearBoardDragState()

    if (isBackwardMove && state.activeRole.mode === 'manager') {
      setPendingBackwardMove({
        portfolioId: activePortfolio.id,
        cardId: card.id,
        destinationStage: target.lane.stage as StageId,
        destinationOwner: nextOwner,
        destinationIndex: 0,
        movedAt,
      })
      setBackwardMoveForm({
        reason: '',
        otherReason: '',
      })
      return
    }

    applyMove(
      activePortfolio.id,
      card.id,
      target.lane.stage as StageId,
      nextOwner,
      destinationIndex,
      movedAt,
    )
  }

  function handleWorkloadDragEnd(event: DragEndEvent) {
    if (!activePortfolio || state.activeRole.mode !== 'manager') {
      setDragCardId(null)
      return
    }
    const overId = event.over ? String(event.over.id) : null
    const memberId = overId?.replace('workload-member-', '')
    const member = getTeamMemberById(activePortfolio, memberId ?? null)
    const card = activePortfolio.cards.find((item) => item.id === String(event.active.id))
    if (!member || !card) {
      setDragCardId(null)
      return
    }
    if (card.stage !== 'Backlog') {
      setDragCardId(null)
      return
    }
    applyMove(activePortfolio.id, card.id, 'Briefed', member.name, 0, new Date().toISOString())
    setDragCardId(null)
  }

  function handleWorkloadDragStart(event: DragStartEvent) {
    setDragCardId(String(event.active.id))
  }

  function handleWorkloadDragCancel() {
    setDragCardId(null)
  }

  function handleConfirmBackwardMove() {
    if (!pendingBackwardMove) {
      return
    }
    const reason =
      backwardMoveForm.reason === 'Other'
        ? backwardMoveForm.otherReason.trim()
        : backwardMoveForm.reason
    if (!reason) {
      return
    }
    applyMove(
      pendingBackwardMove.portfolioId,
      pendingBackwardMove.cardId,
      pendingBackwardMove.destinationStage,
      pendingBackwardMove.destinationOwner,
      pendingBackwardMove.destinationIndex,
      pendingBackwardMove.movedAt,
      reason,
    )
    setPendingBackwardMove(null)
  }

  function exportData() {
    const blob = new Blob([JSON.stringify(state, null, 2)], { type: 'application/json' })
    const url = URL.createObjectURL(blob)
    const link = document.createElement('a')
    link.href = url
    link.download = 'creative-board-data.json'
    link.click()
    URL.revokeObjectURL(url)
  }

  function resetToSeed() {
    if (!window.confirm('This will erase all changes and restore the original demo data. Continue?')) {
      return
    }
    const nextState = createSeedState()
    replaceState(nextState)
    setSelectedCard(null)
    setToast({
      message: 'Board reset to seed data',
      tone: 'amber',
    })
  }

  function clearAllData() {
    if (!window.confirm('This will remove all data. Continue?')) {
      return
    }
    if (!window.confirm('This cannot be undone. Clear everything?')) {
      return
    }
    const emptyState = createSeedState()
    emptyState.portfolios.forEach((portfolio) => {
      portfolio.cards = []
      portfolio.lastIdPerPrefix = Object.fromEntries(
        portfolio.brands.map((brand) => [brand.prefix, 0]),
      )
    })
    replaceState(emptyState)
    showToast('All data cleared', 'amber')
  }

  async function testWebhook(scope: string, url: string) {
    if (!url) {
      return
    }
    setTestingWebhookId(scope)
    try {
      await new Promise((resolve) => window.setTimeout(resolve, 400))
      showToast(`Webhook test is deferred to the backend pass. URL saved: ${url}`, 'blue')
    } finally {
      setTestingWebhookId(null)
    }
  }

  const sidebarExpanded = sidebarPinned || sidebarHovered

  return (
    <div className="app-frame">
      <div
        className={`sidebar-hover-zone ${sidebarExpanded ? 'is-expanded' : ''}`}
        onMouseEnter={() => setSidebarHovered(true)}
        onMouseLeave={() => setSidebarHovered(false)}
      >
        <Sidebar
          expanded={sidebarExpanded}
          page={currentPage}
          portfolio={activePortfolio}
          portfolios={state.portfolios}
          role={state.activeRole}
          editorOptions={editorOptions}
          editorMenuOpen={editorMenuOpen}
          attention={attention}
          onTogglePinned={() => setSidebarPinned((current) => !current)}
          onPortfolioChange={switchToPortfolio}
          onPageChange={handleSidebarPageChange}
          onRoleChange={setRole}
          onToggleEditorMenu={() => setEditorMenuOpen((current) => !current)}
        />
      </div>

      <div className="main-shell">
        {currentPage === 'board' && activePortfolio ? (
          <div className="page-shell">
            <PageHeader
              title={state.settings.general.appName}
              searchValue={boardFilters.searchQuery}
              searchCountLabel={
                boardFilters.searchQuery
                  ? getSearchCountLabel(visibleBoardCards.length, searchBaseCards.length)
                  : undefined
              }
              onSearchChange={(value) =>
                setBoardFilters((current) => ({
                  ...current,
                  searchQuery: value,
                }))
              }
              onSearchClear={() =>
                setBoardFilters((current) => ({
                  ...current,
                  searchQuery: '',
                }))
              }
              searchRef={searchRef}
            />

            {stats ? (
              <section className="stats-bar" aria-label="Board statistics">
                <div className="stat-inline-item">
                  <span className="stat-inline-label">Total</span>
                  <strong>{stats.total}</strong>
                  <span className="stat-divider">·</span>
                </div>
                {STAGES.map((stage) => (
                  <div key={stage} className="stat-inline-item">
                    <span className="stat-inline-label">{stage}</span>
                    <strong>{stats.byStage[stage]}</strong>
                    <span className="stat-divider">·</span>
                  </div>
                ))}
                <div className="stat-inline-item">
                  <span className="stat-inline-label">Stuck 5+d</span>
                  <strong className={stats.stuck > 0 ? 'is-highlight' : ''}>{stats.stuck}</strong>
                  <span className="stat-divider">·</span>
                </div>
                <div className="stat-inline-item">
                  <span className="stat-inline-label">Overdue</span>
                  <strong className={stats.overdue > 0 ? 'is-highlight' : ''}>{stats.overdue}</strong>
                </div>
              </section>
            ) : null}

            {state.activeRole.mode !== 'editor' ? (
              <section className="manager-filter-bar">
                <div className="manager-filter-group">
                  <button
                    type="button"
                    className={`filter-pill ${
                      boardFilters.brandNames.length === activePortfolio.brands.length ? 'is-active is-all' : ''
                    }`}
                    onClick={() =>
                      setBoardFilters((current) => ({
                        ...current,
                        brandNames: activePortfolio.brands.map((brand) => brand.name),
                      }))
                    }
                  >
                    All
                  </button>
                  {activePortfolio.brands.map((brand) => (
                    <button
                      key={brand.name}
                      type="button"
                      className={`filter-pill ${
                        boardFilters.brandNames.length === 1 && boardFilters.brandNames[0] === brand.name ? 'is-active' : ''
                      }`}
                      style={
                        boardFilters.brandNames.length === 1 && boardFilters.brandNames[0] === brand.name
                          ? {
                              background: brand.color,
                              borderColor: brand.color,
                              color: '#fff',
                            }
                          : undefined
                      }
                      onClick={() =>
                        setBoardFilters((current) => ({
                          ...current,
                          brandNames: [brand.name],
                        }))
                      }
                    >
                      {brand.name}
                    </button>
                  ))}
                </div>

                <div className="manager-editor-pills">
                  {getEditorOptions(activePortfolio).map((member) => (
                    <button
                      key={member.id}
                      type="button"
                      className={`editor-pill ${boardFilters.ownerNames.includes(member.name) ? 'is-active' : ''}`}
                      onClick={() =>
                        setBoardFilters((current) => ({
                          ...current,
                          ownerNames: current.ownerNames.includes(member.name)
                            ? current.ownerNames.filter((item) => item !== member.name)
                            : [...current.ownerNames, member.name],
                        }))
                      }
                    >
                      {member.name}
                    </button>
                  ))}
                </div>

                <div className="manager-flag-pills">
                  <button
                    type="button"
                    className={`filter-pill ${boardFilters.overdueOnly ? 'is-active is-all' : ''}`}
                    onClick={() =>
                      setBoardFilters((current) => ({
                        ...current,
                        overdueOnly: !current.overdueOnly,
                      }))
                    }
                  >
                    Overdue
                  </button>
                  <button
                    type="button"
                    className={`filter-pill ${boardFilters.stuckOnly ? 'is-active is-all' : ''}`}
                    onClick={() =>
                      setBoardFilters((current) => ({
                        ...current,
                        stuckOnly: !current.stuckOnly,
                      }))
                    }
                  >
                    Stuck
                  </button>
                  <button
                    type="button"
                    className={`filter-pill ${boardFilters.blockedOnly ? 'is-active is-all' : ''}`}
                    onClick={() =>
                      setBoardFilters((current) => ({
                        ...current,
                        blockedOnly: !current.blockedOnly,
                      }))
                    }
                  >
                    Blocked
                  </button>
                  <button
                    type="button"
                    className={`filter-pill ${boardFilters.showArchived ? 'is-active is-all' : ''}`}
                    onClick={() =>
                      setBoardFilters((current) => ({
                        ...current,
                        showArchived: !current.showArchived,
                      }))
                    }
                  >
                    Show archived
                  </button>
                </div>
              </section>
            ) : null}

            {summary ? (
              <section className="editor-summary-bar">
                <div className="editor-summary-name">
                  {summary.owner} · {summary.utilizationPct}% utilized ·{' '}
                  {formatHours(summary.availableHours)}{' '}
                  available
                </div>
                <div className="editor-summary-stages">
                  <span>
                    {`Briefed: ${summary.briefedCount} (${formatHours(summary.briefedHours)})`}
                  </span>
                  <span>
                    {`In Production: ${summary.inProductionCount} (${formatHours(summary.inProductionHours)})`}
                  </span>
                  <span>
                    {`Review: ${summary.reviewCount} (${formatHours(summary.reviewHours)})`}
                  </span>
                  <span>
                    {`Ready: ${summary.readyCount} (${formatHours(summary.readyHours)})`}
                  </span>
                </div>
              </section>
            ) : null}

            <DndContext
              sensors={sensors}
              collisionDetection={closestCorners}
              onDragStart={handleBoardDragStart}
              onDragOver={handleBoardDragOver}
              onDragCancel={clearBoardDragState}
              onDragEnd={handleBoardDragEnd}
            >
              <main className="board-scroll">
                <div className="board-grid">
                  {columns.map((column) => (
                    <section key={column.id} className={`stage-column ${column.id === 'Archived' ? 'is-archived-column' : ''}`}>
                      <div className="stage-column-header">
                        <h2>
                          {column.label} <span>· {column.count}</span>
                        </h2>
                        {column.id === 'Backlog' && state.activeRole.mode === 'manager' ? (
                          <button
                            type="button"
                            className="column-ghost-button"
                            onClick={() => {
                              setQuickCreateValue(getQuickCreateDefaults(activePortfolio, state.settings))
                              setQuickCreateOpen(true)
                            }}
                          >
                            + Add card
                          </button>
                        ) : null}
                      </div>

                      <div className="stage-column-content">
                        {column.lanes.map((lane) => {
                          const hovered = dragOverLaneId === lane.id
                          const isBlocked = blockedLaneId === lane.id
                          const isWipFull =
                            lane.wipCap !== null && lane.wipCount !== null && lane.wipCount >= lane.wipCap

                          return (
                            <div key={lane.id} className={`lane-shell ${isWipFull ? 'is-hot' : ''}`}>
                              {column.grouped ? (
                                <div className="lane-header rich">
                                  <div className="lane-header-left">
                                    <span>{lane.label}</span>
                                    <div className="util-bar mini">
                                      <span
                                        className={`util-bar-fill is-${lane.utilizationTone}`}
                                        style={{ width: getUtilBarWidth(lane.utilizationPct) }}
                                      />
                                    </div>
                                    <span className={`util-inline is-${lane.utilizationTone}`}>
                                      {lane.utilizationPct}%
                                    </span>
                                    <span className={`active-inline ${isWipFull ? 'is-pulsing' : ''}`}>
                                      ({lane.activeCount} here)
                                    </span>
                                  </div>
                                  {lane.wipCap !== null ? (
                                    <span className={`wip-badge ${isWipFull ? 'is-full' : ''}`}>
                                      {lane.wipCount}/{lane.wipCap}
                                    </span>
                                  ) : null}
                                </div>
                              ) : null}

                              <LaneDropZone
                                lane={lane}
                                isHovered={hovered}
                                isBlocked={isBlocked}
                                dragActive={dragCardId !== null}
                                allowEmptyHint={state.activeRole.mode === 'manager'}
                              >
                                <SortableContext
                                  items={lane.cards.map((card) => card.id)}
                                  strategy={verticalListSortingStrategy}
                                >
                                  {lane.cards.map((card) => {
                                    const canDrag =
                                      state.activeRole.mode === 'manager' ||
                                      (state.activeRole.mode === 'editor' &&
                                        viewerContext.editorName === card.owner &&
                                        getNextStageForEditor(card.stage) !== null)
                                    return (
                                      <SortableBoardCard
                                        key={card.id}
                                        card={card}
                                        portfolio={activePortfolio}
                                        settings={state.settings}
                                        nowMs={nowMs}
                                        canDrag={canDrag}
                                        cursorMode={canDrag ? 'drag' : 'pointer'}
                                        isInvalid={isBlocked}
                                        onOpen={() => openCard(activePortfolio.id, card.id)}
                                      />
                                    )
                                  })}
                                </SortableContext>
                              </LaneDropZone>
                            </div>
                          )
                        })}

                        {column.grouped && column.hiddenEditorCount > 0 ? (
                          <button
                            type="button"
                            className="clear-link hidden-editors-toggle"
                            onClick={() =>
                              setExpandedStages((current) =>
                                current.includes(column.id as StageId)
                                  ? current.filter((item) => item !== column.id)
                                  : [...current, column.id as StageId],
                              )
                            }
                          >
                            {expandedStages.includes(column.id as StageId)
                              ? 'Hide empty editors'
                              : `+${column.hiddenEditorCount} editors`}
                          </button>
                        ) : null}
                      </div>
                    </section>
                  ))}
                </div>
              </main>

              <DragOverlay>
                {activeDragCard && activePortfolio ? (
                  <BoardCardSurface
                    card={activeDragCard}
                    portfolio={activePortfolio}
                    settings={state.settings}
                    nowMs={nowMs}
                    onOpen={() => undefined}
                    cursorMode="drag"
                    isOverlay
                  />
                ) : null}
              </DragOverlay>
            </DndContext>
          </div>
        ) : null}

        {currentPage === 'analytics' ? (
          <AnalyticsPage
            state={state}
            nowMs={nowMs}
            onOpenCard={(portfolioId, cardId) => openCard(portfolioId, cardId)}
            onOpenPortfolioBoard={(portfolioId) => {
              switchToPortfolio(portfolioId)
              setPage('board')
            }}
            onOpenEditorBoard={(portfolioId, ownerName) => {
              switchToPortfolio(portfolioId)
              setPage('board')
              setBoardFilters((current) => ({
                ...current,
                ownerNames: [ownerName],
              }))
            }}
          />
        ) : null}

        {currentPage === 'workload' && activePortfolio ? (
          <DndContext
            sensors={sensors}
            collisionDetection={closestCorners}
            onDragStart={handleWorkloadDragStart}
            onDragCancel={handleWorkloadDragCancel}
            onDragEnd={handleWorkloadDragEnd}
          >
            <WorkloadPage
              portfolio={activePortfolio}
              settings={state.settings}
              timeframe={timeframe}
              nowMs={nowMs}
              canAssign={state.activeRole.mode === 'manager'}
              activeDragCardId={dragCardId}
              onTimeframeChange={setTimeframe}
              onOpenEditorBoard={(ownerName) => {
                setPage('board')
                setBoardFilters((current) => ({
                  ...current,
                  ownerNames: [ownerName],
                }))
              }}
              onOpenCard={(portfolioId, cardId) => openCard(portfolioId, cardId)}
            />
          </DndContext>
        ) : null}

        {currentPage === 'settings' ? (
          <SettingsPage
            state={state}
            settingsTab={settingsTab}
            settingsPortfolioId={settingsPortfolioId}
            importInputRef={importInputRef}
            testingWebhookId={testingWebhookId}
            onTabChange={setSettingsTab}
            onSettingsPortfolioChange={setSettingsPortfolioId}
            onBackToBoard={() => setPage('board')}
            onStateChange={updateState}
            onExportData={exportData}
            onImportClick={() => importInputRef.current?.click()}
            onResetData={resetToSeed}
            onClearAllData={clearAllData}
            onTestWebhook={testWebhook}
            showToast={showToast}
          />
        ) : null}
      </div>

      {quickCreateOpen && activePortfolio ? (
        <QuickCreateModal
          portfolio={activePortfolio}
          settings={state.settings}
          value={quickCreateValue}
          onChange={(updates) => setQuickCreateValue((current) => ({ ...current, ...updates }))}
          onClose={() => setQuickCreateOpen(false)}
          onCreate={handleQuickCreate}
        />
      ) : null}

      {pendingBackwardMove && pendingBackwardCard ? (
        <BackwardMoveModal
          card={pendingBackwardCard}
          destinationStage={pendingBackwardMove.destinationStage}
          formState={backwardMoveForm}
          onChange={(updates) =>
            setBackwardMoveForm((current) => ({
              ...current,
              ...updates,
            }))
          }
          onCancel={() => setPendingBackwardMove(null)}
          onConfirm={handleConfirmBackwardMove}
        />
      ) : null}

      {pendingDeleteCardData ? (
        <DeleteCardModal
          card={pendingDeleteCardData}
          onCancel={() => setPendingDeleteCard(null)}
          onConfirm={handleDeleteCard}
        />
      ) : null}

      {selectedCardData && activeSelectedPortfolio ? (
        <CardDetailPanel
          key={selectedCardData.id}
          keyId={selectedCardData.id}
          portfolio={activeSelectedPortfolio}
          card={selectedCardData}
          settings={state.settings}
          viewerMode={state.activeRole.mode}
          viewerName={viewerContext.editorName}
          copyState={copyState}
          isCreatingDriveFolder={creatingDriveCardId === selectedCardData.id}
          nowMs={nowMs}
          onClose={() => setSelectedCard(null)}
          onCopy={handleCopy}
          onSave={saveOpenCard}
          onAddComment={addCommentToCard}
          onCreateDriveFolder={createDriveFolder}
          onRequestDelete={requestDeleteOpenCard}
        />
      ) : null}

      {toast ? <div className={`toast tone-${toast.tone}`}>{toast.message}</div> : null}
    </div>
  )
}

export default App
