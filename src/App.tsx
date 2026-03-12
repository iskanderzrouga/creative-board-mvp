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
  useSensor,
  useSensors,
  type DragEndEvent,
  type DragOverEvent,
  type DragStartEvent,
} from '@dnd-kit/core'
import {
  SortableContext,
  verticalListSortingStrategy,
} from '@dnd-kit/sortable'

import './App.css'
import { AccessGate } from './components/AccessGate'
import { AnalyticsPage } from './components/AnalyticsPage'
import { AuthGate } from './components/AuthGate'
import { BackwardMoveModal } from './components/BackwardMoveModal'
import { BoardCardSurface } from './components/BoardCardSurface'
import { DeleteCardModal } from './components/DeleteCardModal'
import { LaneDropZone } from './components/LaneDropZone'
import { PageHeader } from './components/PageHeader'
import { QuickCreateModal } from './components/QuickCreateModal'
import { RichTextEditor } from './components/RichTextEditor'
import { Sidebar } from './components/Sidebar'
import { SortableBoardCard } from './components/SortableBoardCard'
import { SyncStatusPill } from './components/SyncStatusPill'
import { WorkloadPage } from './components/WorkloadPage'
import {
  loadOrCreateRemoteAppState,
  saveRemoteAppState,
} from './remoteAppState'
import {
  deleteWorkspaceAccessEntry,
  getAuthSession,
  getWorkspaceAccess,
  isSupabaseConfigured,
  listWorkspaceAccessEntries,
  onAuthStateChange,
  signInWithMagicLink,
  signOutOfSupabase,
  upsertWorkspaceAccessEntry,
  type AuthSessionState,
  type WorkspaceAccessEntry,
  type WorkspaceAccessState,
} from './supabase'
import {
  CARD_FIELDS,
  GROUPED_STAGES,
  SETTINGS_TAB_LABELS,
  STAGES,
  TASK_TYPE_CATEGORIES,
  WORKING_DAYS,
  addCardToPortfolio,
  applyCardUpdates,
  archiveEligibleCards,
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
  getCardCompletionForecast,
  getCardFolderName,
  getDefaultBoardFilters,
  getDaysSinceBriefed,
  getDueStatus,
  getEditorOptions,
  getEditorSummary,
  getNextStageForEditor,
  getRevisionReasonById,
  getQuickCreateDefaults,
  getRevisionCount,
  isLaunchOpsRole,
  getCardScheduledHours,
  getBrandRemovalBlocker,
  getTaskTypeById,
  getTaskTypeGroups,
  getTeamMemberRemovalBlocker,
  getTeamMemberById,
  getTeamMemberByName,
  getVisibleCards,
  getVisibleColumns,
  loadAppState,
  moveCardInPortfolio,
  persistAppState,
  removeBrandFromPortfolio,
  removePortfolioFromAppState,
  removeCardFromPortfolio,
  removeTeamMemberFromPortfolio,
  renameBrandInPortfolio,
  renameTeamMemberInPortfolio,
  syncPortfolioCardProducts,
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
  type RevisionReason,
  type RoleMode,
  type SettingTab,
  type StageId,
  type TaskType,
  type TaskTypeCategory,
  type Timeframe,
  type ViewerContext,
  type WorkingDay,
} from './board'

type ToastTone = 'green' | 'amber' | 'red' | 'blue'
const EMAIL_RATE_LIMIT_COOLDOWN_MS = 60_000

interface ToastState {
  message: string
  tone: ToastTone
}

type AuthStatus = 'disabled' | 'checking' | 'signed-out' | 'signed-in'
type AccessStatus = 'disabled' | 'checking' | 'granted' | 'denied' | 'error'
type SyncStatus = 'local' | 'loading' | 'syncing' | 'synced' | 'error'
type WorkspaceDirectoryStatus = 'idle' | 'loading' | 'ready' | 'error'

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
  reasonId: string
  otherReason: string
  estimatedHours: number | ''
}

interface CardDetailPanelProps {
  keyId: string
  portfolio: Portfolio
  card: Card
  settings: GlobalSettings
  viewerMode: RoleMode
  viewerName: string | null
  viewerMemberRole: string | null
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
  headerUtilityContent?: ReactNode
  workspaceAccessEntries: WorkspaceAccessEntry[]
  workspaceAccessStatus: WorkspaceDirectoryStatus
  workspaceAccessErrorMessage: string | null
  workspaceAccessPendingEmail: string | null
  onTabChange: (tab: SettingTab) => void
  onSettingsPortfolioChange: (portfolioId: string) => void
  onBackToBoard: () => void
  onStateChange: (updater: (state: AppState) => AppState) => void
  onExportData: () => void
  onImportClick: () => void
  onResetData: () => void
  onClearAllData: () => void
  onTestWebhook: (scope: string, url: string) => void
  onWorkspaceAccessSave: (entry: {
    email: string
    roleMode: RoleMode
    editorName: string | null
  }) => Promise<void>
  onWorkspaceAccessDelete: (email: string) => Promise<void>
  showToast: (message: string, tone: ToastTone) => void
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

function isLikelyEmail(value: string) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value.trim())
}

function getAllowedPageForRole(page: AppPage, roleMode: RoleMode) {
  if (page === 'analytics' && roleMode === 'editor') {
    return 'board' as AppPage
  }
  if (page === 'settings' && roleMode !== 'manager') {
    return 'board' as AppPage
  }
  if (
    page === 'workload' &&
    roleMode !== 'manager' &&
    roleMode !== 'observer'
  ) {
    return 'board' as AppPage
  }

  return page
}

function getRoleFromWorkspaceAccess(access: WorkspaceAccessState | null, currentRole: ActiveRole) {
  if (!access) {
    return currentRole
  }

  if (access.roleMode === 'editor') {
    return {
      mode: 'editor' as const,
      editorId: currentRole.editorId,
    }
  }

  return {
    mode: access.roleMode,
    editorId: currentRole.editorId,
  }
}

function getCurrentPage(state: AppState) {
  return getAllowedPageForRole(state.activePage, state.activeRole.mode)
}

function getTypePillLabel(taskType: TaskType) {
  return `${taskType.icon} ${taskType.name}`
}

function canEditorDragStage(stage: StageId) {
  return stage === 'Briefed' || stage === 'In Production' || stage === 'Review' || stage === 'Ready'
}

function getSortedRevisionReasons(settings: GlobalSettings) {
  return settings.revisionReasons.slice().sort((left, right) => left.order - right.order)
}

function getDefaultBackwardMoveForm(settings: GlobalSettings): BackwardMoveFormState {
  const defaultReason = getSortedRevisionReasons(settings)[0] ?? null

  return {
    reasonId: defaultReason?.id ?? '',
    otherReason: '',
    estimatedHours: defaultReason?.estimatedHours ?? '',
  }
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

const COMPLETION_DATE_FORMATTER = new Intl.DateTimeFormat('en-US', {
  weekday: 'short',
  month: 'short',
  day: 'numeric',
})

function formatCompletionDateLabel(dateString: string) {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(dateString)
  const safeDate = match
    ? new Date(Date.UTC(Number(match[1]), Number(match[2]) - 1, Number(match[3]), 12))
    : new Date(dateString)
  const parts = COMPLETION_DATE_FORMATTER.formatToParts(safeDate)
  const weekday = parts.find((part) => part.type === 'weekday')?.value ?? ''
  const month = parts.find((part) => part.type === 'month')?.value ?? ''
  const day = parts.find((part) => part.type === 'day')?.value ?? ''

  return [weekday, month, day].filter(Boolean).join(' ')
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

function formatEstimatedCompletionLabel(
  completionDate: string | null,
  estimatedDays: number | null,
) {
  if (estimatedDays === null) {
    return 'Unscheduled until assigned'
  }

  if (!completionDate) {
    return formatEstimatedDaysLabel(estimatedDays)
  }

  return `${formatEstimatedDaysLabel(estimatedDays)} · ${formatCompletionDateLabel(completionDate)}`
}

function formatDaysSinceBriefedLabel(daysSinceBriefed: number | null) {
  if (daysSinceBriefed === null) {
    return 'Not briefed yet'
  }

  return `${daysSinceBriefed} ${daysSinceBriefed === 1 ? 'day' : 'days'}`
}

function CardDetailPanel({
  keyId,
  portfolio,
  card,
  settings,
  viewerMode,
  viewerName,
  viewerMemberRole,
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
  const isLaunchOpsViewer = viewerMode === 'editor' && isLaunchOpsRole(viewerMemberRole)
  const canComment = viewerMode === 'manager' || isLaunchOpsViewer || viewerName === card.owner
  const canEditFrameio = viewerMode === 'manager' || viewerName === card.owner
  const canSetBlocked = viewerMode === 'manager' || isLaunchOpsViewer
  const canClearBlocked = viewerMode === 'manager'
  const canClearOwner = card.stage === 'Backlog'
  const dueStatus = getDueStatus(card, nowMs)
  const taskType = getTaskTypeById(settings, card.taskTypeId)
  const completionForecast = getCardCompletionForecast(portfolio, card, nowMs)
  const daysSinceBriefed = getDaysSinceBriefed(card, nowMs)

  function handleTaskTypeChange(taskTypeId: string) {
    const nextTaskType = getTaskTypeById(settings, taskTypeId)
    onSave({
      taskTypeId,
      estimatedHours: nextTaskType.estimatedHours,
    })
  }

  function handleBlockedSave() {
    if (!blockedDraft.trim()) {
      if (canClearBlocked) {
        onSave({ blocked: null })
      }
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
            {canSetBlocked ? (
              <div className="blocked-controls">
                {isLaunchOpsViewer && card.blocked ? (
                  <p className="muted-copy">Only managers can clear blocked status.</p>
                ) : (
                  <>
                    <input
                      value={blockedDraft}
                      onChange={(event) => setBlockedDraft(event.target.value)}
                      placeholder="Waiting for raw footage..."
                    />
                    <button type="button" className="ghost-button" onClick={handleBlockedSave}>
                      {blockedDraft.trim() ? 'Save Blocked' : 'Clear'}
                    </button>
                  </>
                )}
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
                      {entry.revisionReason
                        ? `(moved back: ${entry.revisionReason}${
                            entry.revisionEstimatedHours
                              ? ` · ${formatHours(entry.revisionEstimatedHours)}`
                              : ''
                          })`
                        : '(moved back)'}
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
              <span>Original Estimate</span>
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
              <span>Revision Estimate</span>
              {canEdit && card.revisionEstimatedHours !== null ? (
                <div className="inline-hours-field">
                  <input
                    type="number"
                    min={1}
                    step={0.5}
                    value={card.revisionEstimatedHours}
                    onChange={(event) =>
                      onSave({
                        revisionEstimatedHours: event.target.value
                          ? Number(event.target.value)
                          : null,
                      })
                    }
                  />
                  <button
                    type="button"
                    className="clear-link"
                    onClick={() => onSave({ revisionEstimatedHours: null })}
                  >
                    Clear
                  </button>
                </div>
              ) : (
                <strong>
                  {card.revisionEstimatedHours !== null
                    ? formatHours(card.revisionEstimatedHours)
                    : '—'}
                </strong>
              )}
            </label>
            <label>
              <span>Current Scheduling Estimate</span>
              <strong>{formatHours(getCardScheduledHours(card))}</strong>
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
                  {canClearOwner ? <option value="">Unassigned</option> : null}
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
              <span>Estimated Completion</span>
              <strong>{formatEstimatedCompletionLabel(completionForecast.completionDate, completionForecast.estimatedDays)}</strong>
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
              <span>Days Since Briefed</span>
              <strong>{formatDaysSinceBriefedLabel(daysSinceBriefed)}</strong>
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
      <div className="nested-settings-title">Task Types</div>
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

function RevisionReasonLibraryEditor({
  settings,
  onRevisionReasonChange,
  onDeleteRevisionReason,
  showToast,
}: {
  settings: GlobalSettings
  onRevisionReasonChange: (updater: (reasons: RevisionReason[]) => RevisionReason[]) => void
  onDeleteRevisionReason: (revisionReasonId: string) => void
  showToast: (message: string, tone: ToastTone) => void
}) {
  const [draggingReasonId, setDraggingReasonId] = useState<string | null>(null)

  function handleDelete(reason: RevisionReason) {
    if (reason.locked) {
      showToast('Other reason cannot be deleted', 'red')
      return
    }

    if (!window.confirm(`Delete ${reason.name}?`)) {
      return
    }

    onDeleteRevisionReason(reason.id)
  }

  function reorderReasons(sourceId: string, targetId: string) {
    if (sourceId === targetId) {
      return
    }

    onRevisionReasonChange((current) => {
      const sorted = current.slice().sort((left, right) => left.order - right.order)
      const sourceIndex = sorted.findIndex((reason) => reason.id === sourceId)
      const targetIndex = sorted.findIndex((reason) => reason.id === targetId)

      if (sourceIndex === -1 || targetIndex === -1) {
        return current
      }

      const reordered = sorted.slice()
      const [moved] = reordered.splice(sourceIndex, 1)
      reordered.splice(targetIndex, 0, moved)

      return reordered.map((reason, order) => ({
        ...reason,
        order,
      }))
    })
  }

  const sortedReasons = getSortedRevisionReasons(settings)

  return (
    <div className="settings-block">
      <div className="nested-settings-title">Revision Reasons</div>
      <div className="settings-table full-table">
        <div className="settings-row settings-head revision-reason-head">
          <span>Reason</span>
          <span>Default Hours</span>
          <span>Order</span>
          <span />
        </div>
        {sortedReasons.map((reason) => (
          <div
            key={reason.id}
            className={`task-type-entry ${draggingReasonId === reason.id ? 'is-dragging' : ''}`}
            draggable
            onDragStart={() => setDraggingReasonId(reason.id)}
            onDragEnd={() => setDraggingReasonId(null)}
            onDragOver={(event) => event.preventDefault()}
            onDrop={(event) => {
              event.preventDefault()
              if (draggingReasonId) {
                reorderReasons(draggingReasonId, reason.id)
              }
              setDraggingReasonId(null)
            }}
          >
            <div className="settings-row revision-reason-row">
              <input
                value={reason.name}
                disabled={reason.locked}
                onChange={(event) =>
                  onRevisionReasonChange((current) =>
                    current.map((item) =>
                      item.id === reason.id ? { ...item, name: event.target.value } : item,
                    ),
                  )
                }
              />
              <input
                type="number"
                min={1}
                step={0.5}
                value={reason.estimatedHours}
                onChange={(event) =>
                  onRevisionReasonChange((current) =>
                    current.map((item) =>
                      item.id === reason.id
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
                  className="clear-link danger-link"
                  onClick={() => handleDelete(reason)}
                >
                  Delete
                </button>
              </div>
            </div>
          </div>
        ))}
      </div>
      <button
        type="button"
        className="ghost-button"
        onClick={() =>
          onRevisionReasonChange((current) => [
            ...current,
            {
              id: `revision-reason-${Date.now()}`,
              name: 'New reason',
              estimatedHours: 4,
              order: current.length,
            },
          ])
        }
      >
        + Add revision reason
      </button>
    </div>
  )
}

function WorkspaceAccessManager({
  entries,
  editorOptions,
  status,
  errorMessage,
  pendingEmail,
  onSave,
  onDelete,
}: {
  entries: WorkspaceAccessEntry[]
  editorOptions: string[]
  status: WorkspaceDirectoryStatus
  errorMessage: string | null
  pendingEmail: string | null
  onSave: (entry: { email: string; roleMode: RoleMode; editorName: string | null }) => Promise<void>
  onDelete: (email: string) => Promise<void>
}) {
  const [drafts, setDrafts] = useState<Record<string, { email: string; roleMode: RoleMode; editorName: string }>>({})
  const [newEntry, setNewEntry] = useState({
    email: '',
    roleMode: 'observer' as RoleMode,
    editorName: '',
  })

  return (
    <div className="settings-stack">
      <div className="settings-block">
        <div className="settings-block-header">
          <div>
            <strong>Workspace Access</strong>
            <p className="muted-copy">
              Add approved work emails here. Once saved, teammates can use the app login page
              to create their account on first sign-in.
            </p>
          </div>
        </div>

        {status === 'loading' ? <p className="muted-copy">Loading workspace access…</p> : null}
        {status === 'error' && errorMessage ? <p className="auth-error">{errorMessage}</p> : null}

        <div className="settings-table full-table">
          <div className="settings-row settings-head workspace-access-head">
            <span>Email</span>
            <span>App Role</span>
            <span>Linked Editor</span>
            <span>Last Updated</span>
            <span />
          </div>

          {entries.map((entry) => {
            const draft = drafts[entry.email] ?? {
              email: entry.email,
              roleMode: entry.roleMode,
              editorName: entry.editorName ?? '',
            }

            return (
              <div key={entry.email} className="settings-row workspace-access-row">
                <input
                  type="email"
                  value={draft.email}
                  onChange={(event) =>
                    setDrafts((current) => ({
                      ...current,
                      [entry.email]: { ...draft, email: event.target.value },
                    }))
                  }
                />
                <select
                  value={draft.roleMode}
                  onChange={(event) =>
                    setDrafts((current) => ({
                      ...current,
                      [entry.email]: {
                        ...draft,
                        roleMode: event.target.value as RoleMode,
                        editorName:
                          event.target.value === 'editor'
                            ? draft.editorName
                            : '',
                      },
                    }))
                  }
                >
                  <option value="manager">Manager</option>
                  <option value="editor">Editor</option>
                  <option value="observer">Observer</option>
                </select>
                <select
                  value={draft.editorName}
                  disabled={draft.roleMode !== 'editor'}
                  onChange={(event) =>
                    setDrafts((current) => ({
                      ...current,
                      [entry.email]: {
                        ...draft,
                        editorName: event.target.value,
                      },
                    }))
                  }
                >
                  <option value="">
                    {draft.roleMode === 'editor' ? 'Select editor' : 'Not needed'}
                  </option>
                  {editorOptions.map((editorName) => (
                    <option key={editorName} value={editorName}>
                      {editorName}
                    </option>
                  ))}
                </select>
                <span className="muted-copy">
                  {entry.updatedAt ? formatDateTime(entry.updatedAt) : '—'}
                </span>
                <div className="task-type-actions">
                  <button
                    type="button"
                    className="ghost-button"
                    disabled={pendingEmail === entry.email}
                    onClick={() =>
                      void onSave({
                        email: draft.email,
                        roleMode: draft.roleMode,
                        editorName: draft.roleMode === 'editor' ? draft.editorName : null,
                      })
                    }
                  >
                    {pendingEmail === entry.email ? 'Saving...' : 'Save'}
                  </button>
                  <button
                    type="button"
                    className="clear-link danger-link"
                    disabled={pendingEmail === entry.email}
                    onClick={() => void onDelete(entry.email)}
                  >
                    Delete
                  </button>
                </div>
              </div>
            )
          })}

          <div className="settings-row workspace-access-row is-new">
            <input
              type="email"
              value={newEntry.email}
              placeholder="teammate@company.com"
              onChange={(event) =>
                setNewEntry((current) => ({
                  ...current,
                  email: event.target.value,
                }))
              }
            />
            <select
              value={newEntry.roleMode}
              onChange={(event) =>
                setNewEntry((current) => ({
                  ...current,
                  roleMode: event.target.value as RoleMode,
                  editorName: event.target.value === 'editor' ? current.editorName : '',
                }))
              }
            >
              <option value="manager">Manager</option>
              <option value="editor">Editor</option>
              <option value="observer">Observer</option>
            </select>
            <select
              value={newEntry.editorName}
              disabled={newEntry.roleMode !== 'editor'}
              onChange={(event) =>
                setNewEntry((current) => ({
                  ...current,
                  editorName: event.target.value,
                }))
              }
            >
              <option value="">
                {newEntry.roleMode === 'editor' ? 'Select editor' : 'Not needed'}
              </option>
              {editorOptions.map((editorName) => (
                <option key={editorName} value={editorName}>
                  {editorName}
                </option>
              ))}
            </select>
            <span className="muted-copy">New</span>
            <div className="task-type-actions">
              <button
                type="button"
                className="primary-button"
                disabled={!newEntry.email.trim() || pendingEmail === '__new__'}
                onClick={() =>
                  void onSave({
                    email: newEntry.email,
                    roleMode: newEntry.roleMode,
                    editorName: newEntry.roleMode === 'editor' ? newEntry.editorName : null,
                  }).then(() =>
                    setNewEntry({
                      email: '',
                      roleMode: 'observer',
                      editorName: '',
                    }),
                  )
                }
              >
                {pendingEmail === '__new__' ? 'Adding...' : 'Add'}
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}

function SettingsPage({
  state,
  settingsTab,
  settingsPortfolioId,
  importInputRef,
  testingWebhookId,
  headerUtilityContent,
  workspaceAccessEntries,
  workspaceAccessStatus,
  workspaceAccessErrorMessage,
  workspaceAccessPendingEmail,
  onTabChange,
  onSettingsPortfolioChange,
  onBackToBoard,
  onStateChange,
  onExportData,
  onImportClick,
  onResetData,
  onClearAllData,
  onTestWebhook,
  onWorkspaceAccessSave,
  onWorkspaceAccessDelete,
  showToast,
}: SettingsPageProps) {
  const settingsPortfolio =
    state.portfolios.find((portfolio) => portfolio.id === settingsPortfolioId) ??
    state.portfolios[0]
  const [collapsedPortfolioIds, setCollapsedPortfolioIds] = useState<string[]>([])
  const workspaceEditorOptions = Array.from(
    new Set(
      state.portfolios.flatMap((portfolio) =>
        portfolio.team
          .filter((member) => member.active && !member.role.toLowerCase().includes('manager'))
          .map((member) => member.name),
      ),
    ),
  ).sort((left, right) => left.localeCompare(right))

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
        <PageHeader title="Settings" rightContent={headerUtilityContent} />

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
                        onStateChange((current) =>
                          removePortfolioFromAppState(current, portfolio.id),
                        )
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
                                updatePortfolio(portfolio.id, (currentPortfolio) =>
                                  renameBrandInPortfolio(
                                    currentPortfolio,
                                    brandIndex,
                                    event.target.value,
                                  ),
                                )
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
                                updatePortfolio(portfolio.id, (currentPortfolio) =>
                                  syncPortfolioCardProducts({
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
                                  }),
                                )
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
                              onClick={() => {
                                const blocker = getBrandRemovalBlocker(portfolio, brandIndex)
                                if (blocker) {
                                  showToast(blocker, 'amber')
                                  return
                                }
                                if (!window.confirm(`Delete ${brand.name}?`)) {
                                  return
                                }
                                updatePortfolio(portfolio.id, (currentPortfolio) =>
                                  removeBrandFromPortfolio(currentPortfolio, brandIndex),
                                )
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
                <span>Timezone</span>
                <span>WIP Cap</span>
                <span>Status</span>
                <span />
              </div>
              {settingsPortfolio.team.map((member, memberIndex) => (
                <div key={`${settingsPortfolio.id}-${member.id}-${memberIndex}`} className="settings-row team-row">
                  <input
                    value={member.name}
                    onChange={(event) =>
                      updatePortfolio(settingsPortfolio.id, (currentPortfolio) =>
                        renameTeamMemberInPortfolio(
                          currentPortfolio,
                          memberIndex,
                          event.target.value,
                        ),
                      )
                    }
                  />
                  <input
                    value={member.role}
                    onChange={(event) => {
                      const nextRole = event.target.value
                      const removingLastManager =
                        member.role.toLowerCase().includes('manager') &&
                        !nextRole.toLowerCase().includes('manager') &&
                        settingsPortfolio.team.filter(
                          (item, index) => index !== memberIndex && item.role.toLowerCase().includes('manager'),
                        ).length === 0

                      if (removingLastManager) {
                        showToast('At least one manager is required.', 'amber')
                        return
                      }

                      updatePortfolio(settingsPortfolio.id, (currentPortfolio) => ({
                        ...currentPortfolio,
                        team: currentPortfolio.team.map((item, index) =>
                          index === memberIndex ? { ...item, role: nextRole } : item,
                        ),
                      }))
                    }}
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
                    value={member.timezone}
                    onChange={(event) =>
                      updatePortfolio(settingsPortfolio.id, (currentPortfolio) => ({
                        ...currentPortfolio,
                        team: currentPortfolio.team.map((item, index) =>
                          index === memberIndex
                            ? {
                                ...item,
                                timezone: event.target.value,
                              }
                            : item,
                        ),
                      }))
                    }
                    placeholder="Asia/Bangkok"
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
                      const blocker = getTeamMemberRemovalBlocker(settingsPortfolio, memberIndex)
                      if (blocker) {
                        showToast(blocker, 'amber')
                        return
                      }
                      if (!window.confirm(`Delete ${member.name}?`)) {
                        return
                      }
                      updatePortfolio(settingsPortfolio.id, (currentPortfolio) =>
                        removeTeamMemberFromPortfolio(currentPortfolio, memberIndex),
                      )
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
                      hoursPerDay: 8,
                      workingDays: ['Mon', 'Tue', 'Wed', 'Thu', 'Fri'],
                      timezone: Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC',
                      wipCap: 3,
                      active: true,
                    },
                  ],
                }))
              }
            >
              + Add team member
            </button>

            <WorkspaceAccessManager
              entries={workspaceAccessEntries}
              editorOptions={workspaceEditorOptions}
              status={workspaceAccessStatus}
              errorMessage={workspaceAccessErrorMessage}
              pendingEmail={workspaceAccessPendingEmail}
              onSave={onWorkspaceAccessSave}
              onDelete={onWorkspaceAccessDelete}
            />
          </div>
        ) : null}

        {settingsTab === 'task-library' ? (
          <div className="settings-stack">
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

            <RevisionReasonLibraryEditor
              settings={state.settings}
              onRevisionReasonChange={(updater) =>
                onStateChange((current) => ({
                  ...current,
                  settings: {
                    ...current.settings,
                    revisionReasons: updater(current.settings.revisionReasons)
                      .slice()
                      .sort((left, right) => left.order - right.order)
                      .map((reason, order) => ({ ...reason, order })),
                  },
                }))
              }
              onDeleteRevisionReason={(revisionReasonId) =>
                onStateChange((current) => ({
                  ...current,
                  settings: {
                    ...current.settings,
                    revisionReasons: current.settings.revisionReasons
                      .filter((reason) => reason.id !== revisionReasonId)
                      .map((reason, order) => ({ ...reason, order })),
                  },
                }))
              }
              showToast={showToast}
            />
          </div>
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

function App() {
  const authEnabled = isSupabaseConfigured()
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
  const [backwardMoveForm, setBackwardMoveForm] = useState<BackwardMoveFormState>(() =>
    getDefaultBackwardMoveForm(loadAppState().settings),
  )
  const [creatingDriveCardId, setCreatingDriveCardId] = useState<string | null>(null)
  const [testingWebhookId, setTestingWebhookId] = useState<string | null>(null)
  const [authStatus, setAuthStatus] = useState<AuthStatus>(authEnabled ? 'checking' : 'disabled')
  const [authSession, setAuthSession] = useState<AuthSessionState | null>(null)
  const [workspaceAccess, setWorkspaceAccess] = useState<WorkspaceAccessState | null>(null)
  const [accessStatus, setAccessStatus] = useState<AccessStatus>(authEnabled ? 'checking' : 'disabled')
  const [accessErrorMessage, setAccessErrorMessage] = useState<string | null>(null)
  const [workspaceAccessEntries, setWorkspaceAccessEntries] = useState<WorkspaceAccessEntry[]>([])
  const [workspaceAccessStatus, setWorkspaceAccessStatus] = useState<WorkspaceDirectoryStatus>('idle')
  const [workspaceAccessErrorMessage, setWorkspaceAccessErrorMessage] = useState<string | null>(null)
  const [workspaceAccessPendingEmail, setWorkspaceAccessPendingEmail] = useState<string | null>(null)
  const [loginEmail, setLoginEmail] = useState('')
  const [loginPending, setLoginPending] = useState(false)
  const [loginInfoMessage, setLoginInfoMessage] = useState<string | null>(null)
  const [loginErrorMessage, setLoginErrorMessage] = useState<string | null>(null)
  const [loginCooldownUntil, setLoginCooldownUntil] = useState<number | null>(null)
  const [syncStatus, setSyncStatus] = useState<SyncStatus>(authEnabled ? 'loading' : 'local')
  const [lastSyncedAt, setLastSyncedAt] = useState<string | null>(null)
  const [remoteSyncErrorShown, setRemoteSyncErrorShown] = useState(false)

  const searchRef = useRef<HTMLInputElement | null>(null)
  const importInputRef = useRef<HTMLInputElement | null>(null)
  const localFallbackStateRef = useRef(state)
  const remoteHydratedRef = useRef(!authEnabled)
  const remoteSaveTimerRef = useRef<number | null>(null)

  const activePortfolio = getActivePortfolio(state)
  const currentPage = getCurrentPage(state)
  const editorOptions = activePortfolio ? getEditorOptions(activePortfolio) : []
  const currentEditor = activePortfolio
    ? getTeamMemberById(activePortfolio, state.activeRole.editorId)
    : null
  const isLaunchOpsActive =
    state.activeRole.mode === 'editor' && isLaunchOpsRole(currentEditor?.role ?? null)
  const viewerContext = useMemo<ViewerContext>(
    () => ({
      mode: state.activeRole.mode,
      editorName: state.activeRole.mode === 'editor' ? currentEditor?.name ?? null : null,
      memberRole: state.activeRole.mode === 'editor' ? currentEditor?.role ?? null : null,
    }),
    [currentEditor?.name, currentEditor?.role, state.activeRole.mode],
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
    state.activeRole.mode === 'editor' && !isLaunchOpsActive
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
  const lockedRole =
    workspaceAccess?.roleMode === 'editor'
      ? {
          mode: 'editor' as const,
          editorId:
            activePortfolio?.team.find((member) => member.name === workspaceAccess.editorName)?.id ??
            null,
        }
      : workspaceAccess
        ? {
            mode: workspaceAccess.roleMode,
            editorId: state.activeRole.editorId,
          }
        : null
  const headerUtilityContent =
    authStatus === 'signed-in' && authSession ? (
      <div className="session-toolbar">
        <SyncStatusPill syncStatus={syncStatus} lastSyncedAt={lastSyncedAt} />
        <span className="session-email">{authSession.email}</span>
        <button type="button" className="ghost-button" onClick={handleSignOut}>
          Sign out
        </button>
      </div>
    ) : null

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
    localFallbackStateRef.current = state
  }, [state])

  useEffect(() => {
    if (!authEnabled) {
      setAccessStatus('disabled')
      return
    }

    let cancelled = false

    void getAuthSession()
      .then((session) => {
        if (cancelled) {
          return
        }

        setAuthSession(session)
        setAuthStatus(session ? 'signed-in' : 'signed-out')
        if (!session) {
          setWorkspaceAccess(null)
          setAccessErrorMessage(null)
          setAccessStatus('checking')
        }
      })
      .catch(() => {
        if (cancelled) {
          return
        }

        setAuthSession(null)
        setAuthStatus('signed-out')
        setWorkspaceAccess(null)
        setAccessErrorMessage(null)
        setAccessStatus('checking')
      })

    const unsubscribe = onAuthStateChange((session) => {
      if (cancelled) {
        return
      }

      setAuthSession(session)
      setAuthStatus(session ? 'signed-in' : 'signed-out')

      if (session) {
        setLoginPending(false)
        setLoginInfoMessage(null)
        setLoginErrorMessage(null)
      } else {
        setWorkspaceAccess(null)
        setAccessErrorMessage(null)
        setAccessStatus('checking')
        remoteHydratedRef.current = false
        setSyncStatus('loading')
        setLastSyncedAt(null)
      }
    })

    return () => {
      cancelled = true
      unsubscribe()
    }
  }, [authEnabled])

  useEffect(() => {
    if (!authEnabled) {
      return
    }

    if (authStatus !== 'signed-in' || !authSession) {
      if (authStatus === 'signed-out') {
        setWorkspaceAccess(null)
        setAccessErrorMessage(null)
        setAccessStatus('checking')
      }
      return
    }

    let cancelled = false
    setAccessStatus('checking')
    setAccessErrorMessage(null)

    void getWorkspaceAccess()
      .then((access) => {
        if (cancelled) {
          return
        }

        setWorkspaceAccess(access)

        if (!access) {
          setAccessStatus('denied')
          setAccessErrorMessage(
            `${authSession.email} is not on the approved workspace access list yet.`,
          )
          return
        }

        if (access.roleMode === 'editor' && !access.editorName) {
          setAccessStatus('error')
          setAccessErrorMessage('This account is missing its editor assignment. Add an editor name in workspace_access.')
          return
        }

        setAccessStatus('granted')
      })
      .catch(() => {
        if (cancelled) {
          return
        }

        setWorkspaceAccess(null)
        setAccessStatus('error')
        setAccessErrorMessage('Workspace access could not be verified. Check Supabase policies and your session.')
      })

    return () => {
      cancelled = true
    }
  }, [authEnabled, authSession, authStatus])

  useEffect(() => {
    if (!workspaceAccess) {
      return
    }

    setState((current) => {
      const nextRoleBase = getRoleFromWorkspaceAccess(workspaceAccess, current.activeRole)
      const currentPortfolio = getActivePortfolio(current)
      const resolvedEditorId =
        workspaceAccess.roleMode === 'editor'
          ? currentPortfolio?.team.find((member) => member.name === workspaceAccess.editorName)?.id ?? null
          : nextRoleBase.editorId
      const nextRole: ActiveRole = {
        mode: nextRoleBase.mode,
        editorId: resolvedEditorId,
      }
      const nextPage = getAllowedPageForRole(current.activePage, nextRole.mode)

      if (
        current.activeRole.mode === nextRole.mode &&
        current.activeRole.editorId === nextRole.editorId &&
        current.activePage === nextPage
      ) {
        return current
      }

      return {
        ...current,
        activeRole: nextRole,
        activePage: nextPage,
      }
    })
    setEditorMenuOpen(false)
  }, [state.activePortfolioId, state.portfolios, workspaceAccess])

  useEffect(() => {
    if (
      !authEnabled ||
      authStatus !== 'signed-in' ||
      accessStatus !== 'granted' ||
      workspaceAccess?.roleMode !== 'manager'
    ) {
      setWorkspaceAccessEntries([])
      setWorkspaceAccessStatus('idle')
      setWorkspaceAccessErrorMessage(null)
      return
    }

    let cancelled = false
    setWorkspaceAccessStatus('loading')
    setWorkspaceAccessErrorMessage(null)

    void listWorkspaceAccessEntries()
      .then((entries) => {
        if (cancelled) {
          return
        }
        setWorkspaceAccessEntries(entries)
        setWorkspaceAccessStatus('ready')
      })
      .catch(() => {
        if (cancelled) {
          return
        }
        setWorkspaceAccessEntries([])
        setWorkspaceAccessStatus('error')
        setWorkspaceAccessErrorMessage('Workspace access records could not be loaded.')
      })

    return () => {
      cancelled = true
    }
  }, [accessStatus, authEnabled, authStatus, workspaceAccess?.roleMode])

  useEffect(() => {
    if (!authEnabled || authStatus !== 'signed-in' || accessStatus !== 'granted') {
      if (!authEnabled) {
        setSyncStatus('local')
      }
      return
    }

    let cancelled = false
    setSyncStatus('loading')

    void loadOrCreateRemoteAppState(localFallbackStateRef.current)
      .then((result) => {
        if (cancelled) {
          return
        }

        localFallbackStateRef.current = result.state
        setState(() => result.state)
        syncStateControls(result.state)
        remoteHydratedRef.current = true
        setLastSyncedAt(result.lastSyncedAt)
        setSyncStatus(result.lastSyncedAt ? 'synced' : 'local')
        setRemoteSyncErrorShown(false)

        if (result.seeded) {
          setToast({
            message: 'Shared workspace is ready.',
            tone: 'green',
          })
        }
      })
      .catch(() => {
        if (cancelled) {
          return
        }

        remoteHydratedRef.current = true
        setSyncStatus('error')
        if (!remoteSyncErrorShown) {
          setRemoteSyncErrorShown(true)
          setToast({
            message:
              'Supabase sync is configured but unavailable right now. The board is using the local saved copy.',
            tone: 'amber',
          })
        }
      })

    return () => {
      cancelled = true
    }
  }, [accessStatus, authEnabled, authStatus, remoteSyncErrorShown])

  useEffect(() => {
    if (!authEnabled || authStatus !== 'signed-in' || accessStatus !== 'granted' || !remoteHydratedRef.current) {
      return
    }

    if (remoteSaveTimerRef.current !== null) {
      window.clearTimeout(remoteSaveTimerRef.current)
    }

    setSyncStatus('syncing')
    remoteSaveTimerRef.current = window.setTimeout(() => {
      void saveRemoteAppState(state)
        .then((updatedAt) => {
          setLastSyncedAt(updatedAt)
          setSyncStatus(updatedAt ? 'synced' : 'local')
          setRemoteSyncErrorShown(false)
        })
        .catch(() => {
          setSyncStatus('error')
          if (!remoteSyncErrorShown) {
            setRemoteSyncErrorShown(true)
            setToast({
              message:
                'Changes were saved locally, but the Supabase sync failed. Check your auth session and public key.',
              tone: 'amber',
            })
          }
        })
    }, 800)

    return () => {
      if (remoteSaveTimerRef.current !== null) {
        window.clearTimeout(remoteSaveTimerRef.current)
      }
    }
  }, [accessStatus, authEnabled, authStatus, remoteSyncErrorShown, state])

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
        if (pendingDeleteCard) {
          setPendingDeleteCard(null)
          return
        }
        if (pendingBackwardMove) {
          setPendingBackwardMove(null)
          return
        }
        if (quickCreateOpen) {
          setQuickCreateOpen(false)
          return
        }
        if (selectedCard) {
          setSelectedCard(null)
          return
        }
        if (editorMenuOpen) {
          setEditorMenuOpen(false)
        }
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
  }, [
    activePortfolio,
    currentPage,
    editorMenuOpen,
    pendingBackwardMove,
    pendingDeleteCard,
    quickCreateOpen,
    selectedCard,
    state.activeRole.mode,
    state.settings,
  ])

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

  async function handleSaveWorkspaceAccessEntry(entry: {
    email: string
    roleMode: RoleMode
    editorName: string | null
  }) {
    const normalizedEmail = entry.email.trim().toLowerCase()
    if (!normalizedEmail) {
      return
    }

    if (workspaceAccess?.email === normalizedEmail && entry.roleMode !== 'manager') {
      showToast('Keep your own workspace account as a manager, or another manager will need to change it.', 'amber')
      return
    }

    setWorkspaceAccessPendingEmail(workspaceAccessEntries.some((item) => item.email === normalizedEmail) ? normalizedEmail : '__new__')
    setWorkspaceAccessErrorMessage(null)

    try {
      const saved = await upsertWorkspaceAccessEntry(entry)
      setWorkspaceAccessEntries((current) =>
        [...current.filter((item) => item.email !== normalizedEmail), saved].sort((left, right) =>
          left.email.localeCompare(right.email),
        ),
      )
      setWorkspaceAccessStatus('ready')
      showToast(
        workspaceAccessEntries.some((item) => item.email === normalizedEmail)
          ? `Updated access for ${normalizedEmail}`
          : `Added ${normalizedEmail} to workspace access`,
        'green',
      )
    } catch (error) {
      setWorkspaceAccessStatus('error')
      setWorkspaceAccessErrorMessage(
        error instanceof Error ? error.message : 'Could not save workspace access.',
      )
      showToast('Could not save workspace access.', 'red')
    } finally {
      setWorkspaceAccessPendingEmail(null)
    }
  }

  async function handleDeleteWorkspaceAccessEntry(email: string) {
    const normalizedEmail = email.trim().toLowerCase()
    if (!normalizedEmail) {
      return
    }

    if (workspaceAccess?.email === normalizedEmail) {
      showToast('You cannot remove your own manager access from this screen.', 'amber')
      return
    }

    if (!window.confirm(`Remove workspace access for ${normalizedEmail}?`)) {
      return
    }

    setWorkspaceAccessPendingEmail(normalizedEmail)
    setWorkspaceAccessErrorMessage(null)

    try {
      await deleteWorkspaceAccessEntry(normalizedEmail)
      setWorkspaceAccessEntries((current) => current.filter((item) => item.email !== normalizedEmail))
      setWorkspaceAccessStatus('ready')
      showToast(`Removed workspace access for ${normalizedEmail}`, 'amber')
    } catch (error) {
      setWorkspaceAccessStatus('error')
      setWorkspaceAccessErrorMessage(
        error instanceof Error ? error.message : 'Could not remove workspace access.',
      )
      showToast('Could not remove workspace access.', 'red')
    } finally {
      setWorkspaceAccessPendingEmail(null)
    }
  }

  async function handleSendMagicLink() {
    const normalizedEmail = loginEmail.trim()

    if (!normalizedEmail) {
      setLoginErrorMessage('Enter your work email to continue.')
      return
    }

    if (!isLikelyEmail(normalizedEmail)) {
      setLoginErrorMessage('Enter a valid work email to continue.')
      return
    }

    const remainingCooldownMs =
      loginCooldownUntil && loginCooldownUntil > Date.now()
        ? loginCooldownUntil - Date.now()
        : 0
    if (remainingCooldownMs > 0) {
      setLoginErrorMessage(null)
      setLoginInfoMessage(
        `Email links are limited to about once per minute. Check your inbox or wait ${Math.ceil(
          remainingCooldownMs / 1000,
        )}s before trying again.`,
      )
      return
    }

    setLoginPending(true)
    setLoginErrorMessage(null)
    setLoginInfoMessage(null)

    try {
      const result = await signInWithMagicLink(normalizedEmail)
      const session = await getAuthSession()

      if (session) {
        setAuthSession(session)
        setAuthStatus('signed-in')
        setLoginPending(false)
        setLoginCooldownUntil(null)
        return
      }

      if (!result.deliveredInstantly) {
        setLoginCooldownUntil(Date.now() + EMAIL_RATE_LIMIT_COOLDOWN_MS)
      }

      setLoginInfoMessage(
        result.deliveredInstantly
          ? 'Signed in. Loading the shared workspace...'
          : 'Magic link sent to the approved account. Open it from your inbox to enter the shared workspace.',
      )
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Could not send the magic link.'
      const normalizedMessage = message.toLowerCase()
      if (normalizedMessage.includes('rate limit')) {
        setLoginCooldownUntil(Date.now() + EMAIL_RATE_LIMIT_COOLDOWN_MS)
      }
      setLoginErrorMessage(
        normalizedMessage.includes('rate limit')
          ? 'Email rate limit exceeded. Check your inbox and wait about a minute before trying again.'
          : normalizedMessage.includes('not approved')
          ? 'This email is not on the approved access list. Contact your workspace manager to get access.'
          : normalizedMessage.includes('user not found') ||
              normalizedMessage.includes('signup') ||
              normalizedMessage.includes('sign up')
          ? 'This email is not on the approved access list. Contact your workspace manager to get access.'
          : message,
      )
    } finally {
      setLoginPending(false)
    }
  }

  async function handleSignOut() {
    try {
      await signOutOfSupabase()
      setAuthSession(null)
      setAuthStatus('signed-out')
      setLoginInfoMessage(null)
      setLoginErrorMessage(null)
      setSelectedCard(null)
      showToast('Signed out', 'blue')
    } catch {
      showToast('Could not sign out right now.', 'red')
    }
  }

  function syncStateControls(nextState: AppState) {
    const nextPortfolio =
      nextState.portfolios.find((portfolio) => portfolio.id === nextState.activePortfolioId) ??
      nextState.portfolios[0] ??
      null

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

  function replaceState(nextState: AppState) {
    localFallbackStateRef.current = nextState
    setState(() => nextState)
    syncStateControls(nextState)
  }

  function updateState(updater: (state: AppState) => AppState) {
    replaceState(updater(localFallbackStateRef.current))
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
    if (page === 'analytics' && state.activeRole.mode === 'editor') {
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

  function getDragMidpoint(event: DragOverEvent | DragEndEvent) {
    const translatedRect = event.active.rect.current.translated
    const initialRect = event.active.rect.current.initial
    const activeRect = translatedRect ?? initialRect

    if (!activeRect) {
      return null
    }

    return activeRect.top + activeRect.height / 2
  }

  function getDropTarget(
    overId: string | null,
    dragMidpointY: number | null = null,
    overRect: { top: number; height: number } | null = null,
  ) {
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
    const insertAfterHoveredCard =
      overIndex !== -1 &&
      dragMidpointY !== null &&
      overRect !== null &&
      dragMidpointY > overRect.top + overRect.height / 2

    return {
      lane,
      destinationIndex:
        overIndex === -1
          ? lane.allCardIds.length
          : overIndex + (insertAfterHoveredCard ? 1 : 0),
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
      if (isLaunchOpsActive) {
        if (card.stage !== 'Ready') {
          return {
            valid: false,
            message: 'Launch Ops can only act on cards in Ready.',
            tone: 'blue' as ToastTone,
          }
        }

        if (targetLane.stage !== 'Live') {
          return {
            valid: false,
            message: 'Launch Ops can only move cards from Ready to Live.',
            tone: 'blue' as ToastTone,
          }
        }

        return {
          valid: true,
          message: '',
          tone: 'green' as ToastTone,
        }
      }

      if (!viewerContext.editorName || card.owner !== viewerContext.editorName) {
        return {
          valid: false,
          message: 'Editors can only move their own cards.',
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

      const targetStage = targetLane.stage as StageId
      const isBackwardMove = STAGES.indexOf(targetStage) < STAGES.indexOf(card.stage)
      if (!canEditorDragStage(card.stage)) {
        return {
          valid: false,
          message: 'Editors can only move cards between Briefed, In Production, Review, and Ready.',
          tone: 'blue' as ToastTone,
        }
      }

      if (targetStage === 'Live') {
        return {
          valid: false,
          message: 'Only managers can move cards to Live.',
          tone: 'blue' as ToastTone,
        }
      }

      if (targetStage === 'Backlog') {
        return {
          valid: false,
          message: 'Editors cannot move cards back to Backlog.',
          tone: 'blue' as ToastTone,
        }
      }

      const movingWithinSameSection =
        targetStage === card.stage &&
        (targetLane.owner ?? card.owner) === card.owner

      if (movingWithinSameSection) {
        return {
          valid: false,
          message: 'Only managers can reorder priority within a section.',
          tone: 'blue' as ToastTone,
        }
      }

      if (card.stage === 'Review' && targetStage === 'Briefed') {
        return {
          valid: false,
          message: 'Revisions from Review return to In Production.',
          tone: 'blue' as ToastTone,
        }
      }

      if (!isBackwardMove) {
        const nextStage = getNextStageForEditor(card.stage)
        if (!nextStage || targetStage !== nextStage) {
          return {
            valid: false,
            message: 'Editors can only move cards forward one stage at a time, up to Ready.',
            tone: 'blue' as ToastTone,
          }
        }
      }

      if (targetStage === 'In Production' && targetLane.owner) {
        const member = getTeamMemberByName(activePortfolio, targetLane.owner)
        const projectedWip = activePortfolio.cards.filter(
          (currentCard) =>
            currentCard.id !== card.id &&
            currentCard.owner === targetLane.owner &&
            currentCard.stage === 'In Production' &&
            !currentCard.archivedAt,
        ).length
        if (
          !isBackwardMove &&
          member?.wipCap !== null &&
          member?.wipCap !== undefined &&
          projectedWip >= member.wipCap
        ) {
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

    if ((GROUPED_STAGES as readonly StageId[]).includes(targetLane.stage as StageId) && !targetLane.owner) {
      return {
        valid: false,
        message: 'Choose an editor lane to assign this card.',
        tone: 'blue' as ToastTone,
      }
    }

    const targetStage = targetLane.stage as StageId
    const isBackwardMove = STAGES.indexOf(targetStage) < STAGES.indexOf(card.stage)

    if (card.stage === 'Review' && targetStage === 'Briefed') {
      return {
        valid: false,
        message: 'Revisions from Review return to In Production.',
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
      if (
        !isBackwardMove &&
        member?.wipCap !== null &&
        member?.wipCap !== undefined &&
        projectedWip >= member.wipCap
      ) {
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
    const target = getDropTarget(
      event.over ? String(event.over.id) : null,
      getDragMidpoint(event),
      event.over ? { top: event.over.rect.top, height: event.over.rect.height } : null,
    )
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
    revisionEstimatedHours?: number | null,
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
        revisionEstimatedHours,
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
    const target = getDropTarget(
      event.over ? String(event.over.id) : null,
      getDragMidpoint(event),
      event.over ? { top: event.over.rect.top, height: event.over.rect.height } : null,
    )
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

    if (isBackwardMove && state.activeRole.mode !== 'observer') {
      setPendingBackwardMove({
        portfolioId: activePortfolio.id,
        cardId: card.id,
        destinationStage: target.lane.stage as StageId,
        destinationOwner: nextOwner,
        destinationIndex,
        movedAt,
      })
      setBackwardMoveForm(getDefaultBackwardMoveForm(state.settings))
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
    const selectedReason = getRevisionReasonById(state.settings, backwardMoveForm.reasonId)
    const reason =
      selectedReason?.id === 'revision-other'
        ? backwardMoveForm.otherReason.trim()
        : selectedReason?.name ?? ''
    const revisionEstimatedHours = Number(backwardMoveForm.estimatedHours) || 0
    if (!reason || revisionEstimatedHours <= 0) {
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
      revisionEstimatedHours,
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

  if (authEnabled && authStatus !== 'signed-in') {
    return (
      <>
        <AuthGate
          authStatus={authStatus}
          email={loginEmail}
          pending={loginPending}
          errorMessage={loginErrorMessage}
          infoMessage={loginInfoMessage}
          onEmailChange={setLoginEmail}
          onSubmit={handleSendMagicLink}
        />
        {toast ? <div className={`toast tone-${toast.tone}`}>{toast.message}</div> : null}
      </>
    )
  }

  if (authEnabled && authStatus === 'signed-in' && accessStatus === 'checking' && authSession) {
    return (
      <>
        <div className="auth-shell">
          <div className="auth-card">
            <div className="auth-copy">
              <span className="auth-kicker">Editors Board</span>
              <h1>Verifying access</h1>
              <p>Checking your approved workspace permissions before loading the shared board.</p>
            </div>
            <div className="auth-status-card">
              <strong>{authSession.email}</strong>
              <span>Confirming your role and workspace access...</span>
            </div>
          </div>
        </div>
        {toast ? <div className={`toast tone-${toast.tone}`}>{toast.message}</div> : null}
      </>
    )
  }

  if (
    authEnabled &&
    authStatus === 'signed-in' &&
    accessStatus !== 'granted' &&
    authSession
  ) {
    return (
      <>
        <AccessGate
          email={authSession.email}
          message={
            accessErrorMessage ??
            'This account is not approved for the shared workspace yet.'
          }
          onSignOut={handleSignOut}
        />
        {toast ? <div className={`toast tone-${toast.tone}`}>{toast.message}</div> : null}
      </>
    )
  }

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
          lockedRole={lockedRole}
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
              rightContent={headerUtilityContent}
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
                  {summary.owner} ·{' '}
                  {formatHours(
                    summary.briefedHours +
                      summary.inProductionHours +
                      summary.reviewHours +
                      summary.readyHours,
                  )}{' '}
                  scheduled ·{' '}
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
                                    <span className="queue-inline">
                                      {column.id === 'In Production'
                                        ? `${lane.activeCount} active`
                                        : `${lane.activeCount} queued`}
                                      {lane.showTotalWorkload && lane.totalWorkDays !== null
                                        ? ` · ~${lane.totalWorkDays} days total`
                                        : ''}
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
                                        (isLaunchOpsActive
                                          ? card.stage === 'Ready'
                                          : viewerContext.editorName === card.owner &&
                                            canEditorDragStage(card.stage)))
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
            headerUtilityContent={headerUtilityContent}
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
              headerUtilityContent={headerUtilityContent}
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
            headerUtilityContent={headerUtilityContent}
            workspaceAccessEntries={workspaceAccessEntries}
            workspaceAccessStatus={workspaceAccessStatus}
            workspaceAccessErrorMessage={workspaceAccessErrorMessage}
            workspaceAccessPendingEmail={workspaceAccessPendingEmail}
            onTabChange={setSettingsTab}
            onSettingsPortfolioChange={setSettingsPortfolioId}
            onBackToBoard={() => setPage('board')}
            onStateChange={updateState}
            onExportData={exportData}
            onImportClick={() => importInputRef.current?.click()}
            onResetData={resetToSeed}
            onClearAllData={clearAllData}
            onTestWebhook={testWebhook}
            onWorkspaceAccessSave={handleSaveWorkspaceAccessEntry}
            onWorkspaceAccessDelete={handleDeleteWorkspaceAccessEntry}
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
          settings={state.settings}
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
          viewerMemberRole={viewerContext.memberRole}
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
