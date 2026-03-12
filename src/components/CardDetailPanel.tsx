import { useId, useRef, useState } from 'react'
import { RichTextEditor } from './RichTextEditor'
import { useModalAccessibility } from '../hooks/useModalAccessibility'
import {
  STAGES,
  formatDateLong,
  formatDateShort,
  formatDateTime,
  formatDurationShort,
  formatHours,
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
  type GlobalSettings,
  type Portfolio,
  type RoleMode,
  type TaskType,
} from '../board'

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
  nowMs: number
  onClose: () => void
  onCopy: (key: string, value: string) => void
  onSave: (updates: Partial<Card>) => void
  onAddComment: (text: string) => void
  onCreateDriveFolder: () => void
  onRequestDelete: () => void
}

const COMMENT_PREVIEW_COUNT = 10
const ACTIVITY_PREVIEW_COUNT = 5
const CARD_DETAIL_SECTIONS = [
  { id: 'details', label: 'Details' },
  { id: 'naming', label: 'Naming' },
  { id: 'metadata', label: 'Metadata' },
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

function formatEstimatedDaysLabel(days: number | null) {
  if (days === null) {
    return 'Unscheduled'
  }

  if (days <= 0) {
    return 'Today'
  }

  return `~${days} ${days === 1 ? 'day' : 'days'}`
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

function getTypePillLabel(taskType: TaskType) {
  return `${taskType.icon} ${taskType.name}`
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
    brief: null,
    links: null,
    comments: null,
    activity: null,
  })
  const [commentDraft, setCommentDraft] = useState('')
  const [linkLabel, setLinkLabel] = useState('')
  const [linkUrl, setLinkUrl] = useState('')
  const [blockedDraft, setBlockedDraft] = useState(card.blocked?.reason ?? '')
  const [showAllComments, setShowAllComments] = useState(false)
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
  const visibleComments = showAllComments ? card.comments : card.comments.slice(-COMMENT_PREVIEW_COUNT)
  const hiddenCommentCount = Math.max(0, card.comments.length - COMMENT_PREVIEW_COUNT)
  const visibleActivity = showAllActivity
    ? card.activityLog
    : card.activityLog.slice(0, ACTIVITY_PREVIEW_COUNT)

  useModalAccessibility(panelRef, true)

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
      <div className="panel-overlay" aria-hidden="true" onClick={onClose} />
      <aside
        ref={panelRef}
        className="slide-panel"
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        tabIndex={-1}
      >
        <div className="slide-panel-header">
          <div className="slide-panel-header-main">
            <div className="panel-card-id">{card.id}</div>
            {canEdit ? (
              <input
                id={titleId}
                className="panel-title-input"
                value={card.title}
                aria-label="Card title"
                onChange={(event) => onSave({ title: event.target.value })}
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
            <button
              type="button"
              className="close-icon-button"
              aria-label="Close card detail panel"
              onClick={onClose}
            >
              ×
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

        <section
          ref={(node) => {
            sectionRefs.current.metadata = node
          }}
          className="panel-section"
        >
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
                  onChange={(event) => onSave({ estimatedHours: Number(event.target.value) || 1 })}
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
            <label>
              <span>Funnel Stage</span>
              {canEdit ? (
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
                <input value={card.audience} onChange={(event) => onSave({ audience: event.target.value })} />
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

        <section
          ref={(node) => {
            sectionRefs.current.brief = node
          }}
          className="panel-section"
        >
          <div className="section-rule-title">Brief</div>
          <RichTextEditor value={card.brief} onChange={(next) => onSave({ brief: next })} readOnly={!canEdit} />
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
                    <span>{formatDateTime(comment.timestamp)}</span>
                  </div>
                  <p>{comment.text}</p>
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

        <section
          ref={(node) => {
            sectionRefs.current.activity = node
          }}
          className="panel-section"
        >
          <div className="section-rule-title">Activity</div>
          <div className="activity-list">
            {visibleActivity.map((activity) => (
              <div key={activity.id} className="activity-item">
                <div className="activity-meta">
                  <strong>{activity.actor}</strong>
                  <span>{formatDateTime(activity.timestamp)}</span>
                </div>
                <p>{activity.message}</p>
              </div>
            ))}
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
