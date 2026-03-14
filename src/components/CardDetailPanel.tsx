import { useId, useRef, useState } from 'react'
import { RichTextEditor } from './RichTextEditor'
import { useModalAccessibility } from '../hooks/useModalAccessibility'
import {
  STAGES,
  PLATFORMS,
  CARD_PRIORITIES,
  formatDateLong,
  formatDateShort,
  formatDateTime,
  formatDurationShort,
  formatRelativeTime,
  formatHours,
  formatEstimatedDaysLabel,
  getTypePillLabel,
  getAgeToneFromMs,
  getBrandByName,
  getBrandSurface,
  getBrandTextColor,
  getCardAgeMs,
  getCardCompletionForecast,
  getCardFolderName,
  getCardScheduledHours,
  getDaysSinceBriefed,
  getDueStatus,
  getEditorOptions,
  getRevisionCount,
  getTaskTypeById,
  getTaskTypeGroups,
  isLaunchOpsRole,
  type Card,
  type CardPriority,
  type GlobalSettings,
  type Portfolio,
  type RoleMode,
} from '../board'
import { BlockedIcon, XIcon } from './icons/AppIcons'

interface CopyState {
  key: string
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
  isOpen: boolean
  nowMs: number
  onClose: () => void
  onCopy: (key: string, value: string) => void
  onSave: (updates: Partial<Card>) => void
  onAddComment: (text: string, imageDataUrl?: string) => void
  onCreateDriveFolder: () => void
  onRequestDelete: () => void
}

const COMMENT_PREVIEW_COUNT = 10
const ACTIVITY_PREVIEW_COUNT = 5
const COMMENT_MAX_LENGTH = 2000
const CARD_DETAIL_SECTIONS = [
  { id: 'details', label: 'Details' },
  { id: 'naming', label: 'Naming' },
  { id: 'metadata', label: 'Metadata' },
  { id: 'drive', label: 'Drive' },
  { id: 'brief', label: 'Brief' },
  { id: 'links', label: 'Links' },
  { id: 'comments', label: 'Comments' },
  { id: 'activity', label: 'Activity' },
] as const

type CardDetailSectionId = (typeof CARD_DETAIL_SECTIONS)[number]['id']

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

function formatEstimatedCompletionLabel(completionDate: string | null, estimatedDays: number | null) {
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

function isHttpUrl(value: string) {
  try {
    const parsed = new URL(value)
    return parsed.protocol === 'http:' || parsed.protocol === 'https:'
  } catch {
    return false
  }
}

export function CardDetailPanel({
  keyId,
  portfolio,
  card,
  settings,
  viewerMode,
  viewerName,
  viewerMemberRole,
  copyState,
  isCreatingDriveFolder,
  isOpen,
  nowMs,
  onClose,
  onCopy,
  onSave,
  onAddComment,
  onCreateDriveFolder,
  onRequestDelete,
}: CardDetailPanelProps) {
  const titleId = useId()
  const panelRef = useRef<HTMLElement | null>(null)
  const sectionRefs = useRef<Record<CardDetailSectionId, HTMLElement | null>>({
    details: null,
    naming: null,
    metadata: null,
    drive: null,
    brief: null,
    links: null,
    comments: null,
    activity: null,
  })
  const [titleDraft, setTitleDraft] = useState(card.title)
  const [hookDraft, setHookDraft] = useState(card.hook)
  const [angleDraft, setAngleDraft] = useState(card.angle)
  const [audienceDraft, setAudienceDraft] = useState(card.audience)
  const [commentDraft, setCommentDraft] = useState('')
  const [linkLabel, setLinkLabel] = useState('')
  const [linkUrl, setLinkUrl] = useState('')
  const [linkErrorMessage, setLinkErrorMessage] = useState<string | null>(null)
  const [blockedDraft, setBlockedDraft] = useState(card.blocked?.reason ?? '')
  const [commentImageDataUrl, setCommentImageDataUrl] = useState<string | null>(null)
  const [showAllComments, setShowAllComments] = useState(false)
  const [showAllActivity, setShowAllActivity] = useState(false)
  const commentImageRef = useRef<HTMLInputElement | null>(null)
  const canManage = viewerMode === 'owner' || viewerMode === 'manager'
  const isOwnedEditor = viewerMode === 'contributor' && viewerName === card.owner
  const canEditOwnedContent = canManage || isOwnedEditor
  const isLaunchOpsViewer = viewerMode === 'contributor' && isLaunchOpsRole(viewerMemberRole)
  const canComment = canManage || isLaunchOpsViewer || viewerName === card.owner
  const canEditFrameio = canManage || isOwnedEditor
  const canEditLinks = canManage || isOwnedEditor
  const canSetBlocked = canManage || isLaunchOpsViewer || isOwnedEditor
  const canClearBlocked = canManage || isOwnedEditor
  const canClearOwner = card.stage === 'Backlog'
  const dueStatus = getDueStatus(card, nowMs)
  const taskType = getTaskTypeById(settings, card.taskTypeId)
  const completionForecast = getCardCompletionForecast(portfolio, card, nowMs)
  const daysSinceBriefed = getDaysSinceBriefed(card, nowMs)
  const visibleComments = showAllComments ? card.comments : card.comments.slice(-COMMENT_PREVIEW_COUNT)
  const hiddenCommentCount = Math.max(0, card.comments.length - COMMENT_PREVIEW_COUNT)
  const visibleActivity = showAllActivity
    ? card.activityLog
    : card.activityLog.slice(0, ACTIVITY_PREVIEW_COUNT)
  const commentCharactersRemaining = COMMENT_MAX_LENGTH - commentDraft.length

  useModalAccessibility(panelRef, isOpen)

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

  function commitTextDraft(key: 'title' | 'hook' | 'angle' | 'audience', value: string) {
    if (value === card[key]) {
      return
    }

    onSave({ [key]: value } as Pick<Card, typeof key>)
  }

  function handleLinkSave() {
    if (!linkLabel.trim() || !linkUrl.trim()) {
      return
    }

    if (!isHttpUrl(linkUrl.trim())) {
      setLinkErrorMessage('Enter a full http:// or https:// link before saving.')
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
    setLinkErrorMessage(null)
  }

  function scrollToSection(sectionId: CardDetailSectionId) {
    const target = sectionRefs.current[sectionId]
    if (!target) {
      return
    }

    const prefersReducedMotion =
      typeof window !== 'undefined' &&
      typeof window.matchMedia === 'function' &&
      window.matchMedia('(prefers-reduced-motion: reduce)').matches

    target.scrollIntoView({
      behavior: prefersReducedMotion ? 'auto' : 'smooth',
      block: 'start',
    })
  }

  return (
    <>
      <div
        className={`panel-overlay ${isOpen ? 'is-visible' : ''}`}
        aria-hidden="true"
        onClick={onClose}
      />
      <aside
        ref={panelRef}
        className={`slide-panel ${isOpen ? 'is-open' : ''}`}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        tabIndex={-1}
      >
        <div className="slide-panel-header">
          <div className="slide-panel-header-main">
            <div className="panel-card-id">{card.id}</div>
            {canEditOwnedContent ? (
              <input
                id={titleId}
                className="panel-title-input"
                value={titleDraft}
                aria-label="Card title"
                onChange={(event) => setTitleDraft(event.target.value)}
                onBlur={() => commitTextDraft('title', titleDraft)}
              />
            ) : (
              <h2 id={titleId} className="panel-title">
                {card.title}
              </h2>
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
              {card.blocked ? (
                <span className="blocked-badge">
                  <BlockedIcon />
                  Blocked
                </span>
              ) : null}
              {card.archivedAt ? <span className="archived-badge">Archived</span> : null}
            </div>
          </div>

          <div className="panel-header-actions">
            {canManage ? (
              <button
                type="button"
                className={`ghost-button archive-toggle-button ${card.archivedAt ? 'is-active' : ''}`}
                onClick={() =>
                  onSave({
                    archivedAt: card.archivedAt ? null : new Date().toISOString(),
                  })
                }
              >
                {card.archivedAt ? 'Unarchive' : 'Archive'}
              </button>
            ) : null}
            {canManage ? (
              <button type="button" className="ghost-button danger-outline" onClick={onRequestDelete}>
                Delete
              </button>
            ) : null}
            <button
              type="button"
              className="close-icon-button"
              aria-label="Close card detail panel"
              onClick={onClose}
            >
              <XIcon />
            </button>
          </div>
        </div>

        <nav className="panel-section-nav" aria-label="Card detail sections">
          <div className="panel-section-nav-list">
            {CARD_DETAIL_SECTIONS.map((section) => (
              <button
                key={section.id}
                type="button"
                className="panel-section-nav-button"
                onClick={() => scrollToSection(section.id)}
              >
                {section.label}
              </button>
            ))}
          </div>
        </nav>

        <section
          ref={(node) => {
            sectionRefs.current.details = node
          }}
          className="panel-section"
        >
          <div className="section-rule-title">Details</div>
          <div className="block-toggle-row">
            <div>
              {card.blocked ? (
                <p className="muted-copy">{`Reason: ${card.blocked.reason}`}</p>
              ) : (
                <p className="muted-copy">Not blocked</p>
              )}
            </div>
            {canSetBlocked ? (
              <div className="blocked-controls">
                {isLaunchOpsViewer && card.blocked ? (
                  <p className="muted-copy">Only owners and managers can clear blocked status.</p>
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
                  <span className={`stage-history-time tone-${tone}`}>{formatDurationShort(durationMs)}</span>
                  {entry.movedBack ? (
                    <span className="stage-history-moved-back">
                      {entry.revisionReason
                        ? `(moved back: ${entry.revisionReason}${
                            entry.revisionEstimatedHours
                              ? ` · ${formatHours(entry.revisionEstimatedHours)}`
                              : ''
                          })`
                        : '(moved back)'}
                      {entry.revisionFeedback ? (
                        <span className="stage-history-feedback">{entry.revisionFeedback}</span>
                      ) : null}
                    </span>
                  ) : null}
                  {index < card.stageHistory.length - 1 ? <span className="stage-history-arrow">→</span> : null}
                </span>
              )
            })}
          </div>
        </section>

        <section
          ref={(node) => {
            sectionRefs.current.naming = node
          }}
          className="panel-section"
        >
          <div className="section-rule-title">Naming</div>
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

        <section
          ref={(node) => {
            sectionRefs.current.metadata = node
          }}
          className="panel-section"
        >
          <div className="section-rule-title">Metadata</div>
          <div className="metadata-groups">
            <div className="metadata-group">
              <h4 className="metadata-group-title">Classification</h4>
              <div className="metadata-grid">
                <label>
                  <span>Brand</span>
                  {canManage ? (
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
                  {canManage ? (
                    <select value={card.product} onChange={(event) => onSave({ product: event.target.value })}>
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
                  {canManage ? (
                    <select
                      value={card.platform}
                      onChange={(event) => onSave({ platform: event.target.value as Card['platform'] })}
                    >
                      {PLATFORMS.map((platform) => (
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
                  {canManage ? (
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
                  <span>Funnel Stage</span>
                  {canManage ? (
                    <select
                      value={card.funnelStage}
                      onChange={(event) => onSave({ funnelStage: event.target.value as Card['funnelStage'] })}
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
              </div>
            </div>

            <div className="metadata-group">
              <h4 className="metadata-group-title">Schedule</h4>
              <div className="metadata-grid">
                <label>
                  <span>Due Date</span>
                  {canEditOwnedContent ? (
                    <input
                      type="date"
                      value={card.dueDate ?? ''}
                      onChange={(event) => onSave({ dueDate: event.target.value || null })}
                    />
                  ) : (
                    <strong
                      className={
                        dueStatus === 'overdue'
                          ? 'is-danger-text'
                          : dueStatus === 'soon'
                            ? 'is-warning-text'
                            : ''
                      }
                    >
                      {card.dueDate ? formatDateShort(card.dueDate) : '—'}
                    </strong>
                  )}
                </label>
                <label>
                  <span>Estimated Completion</span>
                  <strong>
                    {formatEstimatedCompletionLabel(
                      completionForecast.completionDate,
                      completionForecast.estimatedDays,
                    )}
                  </strong>
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
              </div>
            </div>

            <div className="metadata-group">
              <h4 className="metadata-group-title">Estimates</h4>
              <div className="metadata-grid">
                <label>
                  <span>Original Estimate</span>
                  {canEditOwnedContent ? (
                    <input
                      type="number"
                      min={1}
                      value={card.estimatedHours}
                      onChange={(event) => onSave({ estimatedHours: Number(event.target.value) || 1 })}
                    />
                  ) : (
                    <strong>{formatHours(card.estimatedHours)}</strong>
                  )}
                </label>
                <label>
                  <span>Revision Estimate</span>
                  {canManage && card.revisionEstimatedHours !== null ? (
                    <div className="inline-hours-field">
                      <input
                        type="number"
                        min={1}
                        step={0.5}
                        value={card.revisionEstimatedHours}
                        onChange={(event) =>
                          onSave({
                            revisionEstimatedHours: event.target.value ? Number(event.target.value) : null,
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
                    <strong>{card.revisionEstimatedHours !== null ? formatHours(card.revisionEstimatedHours) : '—'}</strong>
                  )}
                </label>
                <label>
                  <span>Current Scheduling Estimate</span>
                  <strong>{formatHours(getCardScheduledHours(card))}</strong>
                </label>
              </div>
            </div>

            <div className="metadata-group">
              <h4 className="metadata-group-title">Creative</h4>
              <div className="metadata-grid">
                <label>
                  <span>Hook</span>
                  {canEditOwnedContent ? (
                    <input
                      value={hookDraft}
                      onChange={(event) => setHookDraft(event.target.value)}
                      onBlur={() => commitTextDraft('hook', hookDraft)}
                    />
                  ) : (
                    <strong>{card.hook || '—'}</strong>
                  )}
                </label>
                <label>
                  <span>Angle</span>
                  {canEditOwnedContent ? (
                    <input
                      value={angleDraft}
                      onChange={(event) => setAngleDraft(event.target.value)}
                      onBlur={() => commitTextDraft('angle', angleDraft)}
                    />
                  ) : (
                    <strong>{card.angle || '—'}</strong>
                  )}
                </label>
                <label>
                  <span>Audience</span>
                  {canEditOwnedContent ? (
                    <input
                      value={audienceDraft}
                      onChange={(event) => setAudienceDraft(event.target.value)}
                      onBlur={() => commitTextDraft('audience', audienceDraft)}
                    />
                  ) : (
                    <strong>{card.audience || '—'}</strong>
                  )}
                </label>
              </div>
            </div>

            <div className="metadata-group">
              <h4 className="metadata-group-title">Ad Info</h4>
              <div className="metadata-grid">
                <label>
                  <span>Landing Page</span>
                  {canEditOwnedContent ? (
                    <>
                      {(() => {
                        const brand = getBrandByName(portfolio, card.brand)
                        return brand?.defaultLandingPage && !card.landingPage ? (
                          <button
                            type="button"
                            className="clear-link"
                            onClick={() => onSave({ landingPage: brand.defaultLandingPage })}
                          >
                            Use brand default
                          </button>
                        ) : null
                      })()}
                      <input
                        value={card.landingPage}
                        onChange={(event) => onSave({ landingPage: event.target.value })}
                        placeholder="https://..."
                      />
                    </>
                  ) : (
                    <strong>{card.landingPage ? (
                      <a href={card.landingPage} target="_blank" rel="noreferrer">{card.landingPage}</a>
                    ) : '—'}</strong>
                  )}
                </label>
                <label>
                  <span>Facebook Page</span>
                  <strong>{getBrandByName(portfolio, card.brand)?.facebookPage || '—'}</strong>
                </label>
              </div>
            </div>

            <div className="metadata-group">
              <h4 className="metadata-group-title">Priority &amp; Tracking</h4>
              <div className="metadata-grid">
                <label>
                  <span>Priority</span>
                  {canEditOwnedContent ? (
                    <select
                      value={card.priority}
                      onChange={(event) => onSave({ priority: event.target.value as CardPriority })}
                    >
                      {CARD_PRIORITIES.map((p) => (
                        <option key={p} value={p}>{p === 'none' ? 'None' : p.charAt(0).toUpperCase() + p.slice(1)}</option>
                      ))}
                    </select>
                  ) : (
                    <strong>{card.priority === 'none' ? '—' : card.priority}</strong>
                  )}
                </label>
                <label>
                  <span>Actual Hours Logged</span>
                  {canEditOwnedContent ? (
                    <input
                      type="number"
                      min={0}
                      step={0.5}
                      value={card.actualHoursLogged}
                      onChange={(event) => onSave({ actualHoursLogged: Math.max(0, Number(event.target.value) || 0) })}
                    />
                  ) : (
                    <strong>{card.actualHoursLogged > 0 ? formatHours(card.actualHoursLogged) : '—'}</strong>
                  )}
                </label>
              </div>
            </div>

            <div className="metadata-group">
              <h4 className="metadata-group-title">Assignment</h4>
              <div className="metadata-grid">
                <label>
                  <span>Assigned to</span>
                  {canManage ? (
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
                  <span>Revisions</span>
                  <strong>{getRevisionCount(card)}</strong>
                </label>
              </div>
            </div>
          </div>
        </section>

        <section
          ref={(node) => {
            sectionRefs.current.drive = node
          }}
          className="panel-section"
        >
          <div className="section-rule-title">Drive Folder</div>
          {card.driveFolderCreated && card.driveFolderUrl ? (
            <div className="drive-section">
              <a href={card.driveFolderUrl} target="_blank" rel="noreferrer">
                {card.driveFolderUrl}
              </a>
            </div>
          ) : canManage ? (
            <div className="drive-actions">
              <button
                type="button"
                className={`primary-button ${isCreatingDriveFolder ? 'is-loading' : ''}`}
                onClick={onCreateDriveFolder}
                disabled={isCreatingDriveFolder}
              >
                {isCreatingDriveFolder ? (
                  <>
                    <span className="button-spinner" aria-hidden="true" />
                    <span>Creating...</span>
                  </>
                ) : (
                  'Create Drive Folder'
                )}
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

        <section
          ref={(node) => {
            sectionRefs.current.brief = node
          }}
          className="panel-section"
        >
          <div className="section-rule-title">Brief</div>
          <RichTextEditor
            value={card.brief}
            onChange={(next) => onSave({ brief: next })}
            readOnly={!canEditOwnedContent}
          />
        </section>

        <section
          ref={(node) => {
            sectionRefs.current.links = node
          }}
          className="panel-section"
        >
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
                  {canEditLinks ? (
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

          {canEditLinks ? (
            <div className="add-link-form">
              <input
                value={linkLabel}
                onChange={(event) => {
                  setLinkLabel(event.target.value)
                  if (linkErrorMessage) {
                    setLinkErrorMessage(null)
                  }
                }}
                placeholder="Link label"
              />
              <input
                value={linkUrl}
                aria-invalid={Boolean(linkErrorMessage)}
                onChange={(event) => {
                  setLinkUrl(event.target.value)
                  if (linkErrorMessage) {
                    setLinkErrorMessage(null)
                  }
                }}
                placeholder="https://"
              />
              <button
                type="button"
                className="primary-button"
                onClick={handleLinkSave}
              >
                Add link
              </button>
              {linkErrorMessage ? (
                <p className="field-error" role="alert">
                  {linkErrorMessage}
                </p>
              ) : null}
            </div>
          ) : null}
        </section>

        <section
          ref={(node) => {
            sectionRefs.current.comments = node
          }}
          className="panel-section"
        >
          <div className="section-rule-title">Comments</div>
          <div className="comment-list">
            {card.comments.length === 0 ? (
              <div className="muted-copy">No comments yet.</div>
            ) : (
              visibleComments.map((comment) => (
                <div key={`${comment.timestamp}-${comment.text}`} className="comment-card">
                  <div className="comment-meta">
                    <strong>{comment.author}</strong>
                    <span title={formatDateTime(comment.timestamp)}>{formatRelativeTime(comment.timestamp, nowMs)}</span>
                  </div>
                  <p>{comment.text}</p>
                  {comment.imageDataUrl ? (
                    <img src={comment.imageDataUrl} alt="Comment attachment" className="comment-image" />
                  ) : null}
                </div>
              ))
            )}
          </div>
          {hiddenCommentCount > 0 ? (
            <button
              type="button"
              className="clear-link"
              onClick={() => setShowAllComments((open) => !open)}
            >
              {showAllComments ? `Show recent ${COMMENT_PREVIEW_COUNT}` : `Show older (${hiddenCommentCount})`}
            </button>
          ) : null}
          {canComment ? (
            <div className="comment-composer">
              <textarea
                value={commentDraft}
                maxLength={COMMENT_MAX_LENGTH}
                onChange={(event) => setCommentDraft(event.target.value)}
                placeholder="Leave feedback or an update..."
                rows={2}
                onKeyDown={(event) => {
                  if ((event.metaKey || event.ctrlKey) && event.key === 'Enter' && commentDraft.trim()) {
                    onAddComment(commentDraft.trim(), commentImageDataUrl ?? undefined)
                    setCommentDraft('')
                    setCommentImageDataUrl(null)
                  }
                }}
                onPaste={(event) => {
                  const items = event.clipboardData?.items
                  if (!items) return
                  for (const item of items) {
                    if (item.type.startsWith('image/')) {
                      const file = item.getAsFile()
                      if (!file) continue
                      const reader = new FileReader()
                      reader.onload = () => {
                        if (typeof reader.result === 'string') {
                          setCommentImageDataUrl(reader.result)
                        }
                      }
                      reader.readAsDataURL(file)
                      break
                    }
                  }
                }}
              />
              {commentImageDataUrl ? (
                <div className="comment-image-preview">
                  <img src={commentImageDataUrl} alt="Pasted attachment" />
                  <button
                    type="button"
                    className="clear-link"
                    onClick={() => setCommentImageDataUrl(null)}
                  >
                    Remove image
                  </button>
                </div>
              ) : null}
              <div className="comment-actions-row">
                <input
                  ref={commentImageRef}
                  type="file"
                  accept="image/*"
                  hidden
                  onChange={(event) => {
                    const file = event.target.files?.[0]
                    if (!file) return
                    const reader = new FileReader()
                    reader.onload = () => {
                      if (typeof reader.result === 'string') {
                        setCommentImageDataUrl(reader.result)
                      }
                    }
                    reader.readAsDataURL(file)
                    event.target.value = ''
                  }}
                />
                <button
                  type="button"
                  className="ghost-button"
                  onClick={() => commentImageRef.current?.click()}
                >
                  Attach image
                </button>
                <button
                  type="button"
                  className="primary-button"
                  onClick={() => {
                    if (!commentDraft.trim() && !commentImageDataUrl) return
                    onAddComment(commentDraft.trim(), commentImageDataUrl ?? undefined)
                    setCommentDraft('')
                    setCommentImageDataUrl(null)
                  }}
                >
                  Post
                </button>
              </div>
              <div className="comment-helper-row">
                <p className="comment-hint">Cmd+Enter to post · Paste images from clipboard</p>
                <p className="comment-counter">{`${commentCharactersRemaining} characters remaining`}</p>
              </div>
            </div>
          ) : null}
        </section>

        <section
          ref={(node) => {
            sectionRefs.current.activity = node
          }}
          className="panel-section"
        >
          <div className="section-rule-title">Activity</div>
          <div className="activity-list">
            {card.activityLog.length === 0 ? (
              <div className="muted-copy">No activity recorded.</div>
            ) : (
              visibleActivity.map((activity) => (
                <div key={activity.id} className="activity-item">
                  <div className="activity-meta">
                    <strong>{activity.actor}</strong>
                    <span title={formatDateTime(activity.timestamp)}>{formatRelativeTime(activity.timestamp, nowMs)}</span>
                  </div>
                  <p>{activity.message}</p>
                </div>
              ))
            )}
          </div>
          {card.activityLog.length > ACTIVITY_PREVIEW_COUNT ? (
            <button type="button" className="clear-link" onClick={() => setShowAllActivity((open) => !open)}>
              {showAllActivity ? 'Show less' : `Show all (${card.activityLog.length})`}
            </button>
          ) : null}
        </section>
      </aside>
    </>
  )
}
