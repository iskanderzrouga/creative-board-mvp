import { useId, useMemo, useRef, useState } from 'react'
import { RichTextEditor } from './RichTextEditor'
import { useModalAccessibility } from '../hooks/useModalAccessibility'
import {
  DESIGN_TYPES,
  PLATFORMS,
  STAGES,
  formatDateLong,
  formatDateTime,
  formatHours,
  formatRelativeTime,
  formatDurationShort,
  getBrandByName,
  getBrandSurface,
  getBrandTextColor,
  getCardFolderName,
  getCardTitleLabel,
  getDaysSinceBriefed,
  getEditorOptions,
  getIterationSourceCards,
  getRelatedLpDesignCards,
  getRevisionCount,
  getStageLabel,
  getTaskTypeById,
  getTaskTypeGroups,
  getTypePillLabel,
  isCreativeTaskTypeId,
  isIterationTaskTypeId,
  isLaunchOpsRole,
  isLpDesignTaskTypeId,
  isLpDevTaskTypeId,
  isPackagingBrandingTaskTypeId,
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
  onSetProductionPriority: (priority: Exclude<CardPriority, null>) => void
  onAddComment: (text: string, imageDataUrl?: string) => void
  onCreateDriveFolder: () => void
  onRequestDelete: () => void
  showEditorStartButton: boolean
  canStartEditorTimer: boolean
  isEditorTimerInProgress: boolean
  canViewPerformanceData: boolean
  onStartEditorTimer: () => void
}

const COMMENT_PREVIEW_COUNT = 10
const ACTIVITY_PREVIEW_COUNT = 5
const COMMENT_MAX_LENGTH = 2000

function isHttpUrl(value: string) {
  try {
    const parsed = new URL(value)
    return parsed.protocol === 'http:' || parsed.protocol === 'https:'
  } catch {
    return false
  }
}

function formatDaysSinceBriefedLabel(daysSinceBriefed: number | null) {
  if (daysSinceBriefed === null) {
    return 'Not briefed yet'
  }

  return `${daysSinceBriefed} ${daysSinceBriefed === 1 ? 'day' : 'days'}`
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
  onSetProductionPriority,
  onAddComment,
  onCreateDriveFolder,
  onRequestDelete,
  showEditorStartButton,
  canStartEditorTimer,
  isEditorTimerInProgress,
  canViewPerformanceData,
  onStartEditorTimer,
}: CardDetailPanelProps) {
  const titleId = useId()
  const panelRef = useRef<HTMLElement | null>(null)
  const sectionRefs = useRef<Record<string, HTMLElement | null>>({})
  const [titleDraft, setTitleDraft] = useState(card.title)
  const [angleDraft, setAngleDraft] = useState(card.angle)
  const [audienceDraft, setAudienceDraft] = useState(card.audience)
  const [landingPageDraft, setLandingPageDraft] = useState(card.landingPage)
  const [figmaUrlDraft, setFigmaUrlDraft] = useState(card.figmaUrl)
  const [keyMessageDraft, setKeyMessageDraft] = useState(card.keyMessage)
  const [visualDirectionDraft, setVisualDirectionDraft] = useState(card.visualDirection)
  const [ctaDraft, setCtaDraft] = useState(card.cta)
  const [referenceLinksDraft, setReferenceLinksDraft] = useState(card.referenceLinks)
  const [adCopyDraft, setAdCopyDraft] = useState(card.adCopy)
  const [notesDraft, setNotesDraft] = useState(card.notes)
  const [commentDraft, setCommentDraft] = useState('')
  const [linkLabel, setLinkLabel] = useState('')
  const [linkUrl, setLinkUrl] = useState('')
  const [linkErrorMessage, setLinkErrorMessage] = useState<string | null>(null)
  const [blockedDraft, setBlockedDraft] = useState(card.blocked?.reason ?? '')
  const [commentImageDataUrl, setCommentImageDataUrl] = useState<string | null>(null)
  const [showAllComments, setShowAllComments] = useState(false)
  const [showAllActivity, setShowAllActivity] = useState(false)
  const [trackingOpen, setTrackingOpen] = useState(false)
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
  const canSetPriority = card.stage === 'In Production' && Boolean(card.owner) && (canManage || isOwnedEditor)

  const taskType = getTaskTypeById(settings, card.taskTypeId)
  const creativeTask = isCreativeTaskTypeId(taskType.id)
  const iterationTask = isIterationTaskTypeId(taskType.id)
  const packagingTask = isPackagingBrandingTaskTypeId(taskType.id)
  const lpDesignTask = isLpDesignTaskTypeId(taskType.id)
  const lpDevTask = isLpDevTaskTypeId(taskType.id)
  const titleLabel = getCardTitleLabel(taskType.id)
  const daysSinceBriefed = getDaysSinceBriefed(card, nowMs)
  const revisionCount = getRevisionCount(card)
  const visibleComments = showAllComments ? card.comments : card.comments.slice(-COMMENT_PREVIEW_COUNT)
  const hiddenCommentCount = Math.max(0, card.comments.length - COMMENT_PREVIEW_COUNT)
  const visibleActivity = showAllActivity
    ? card.activityLog
    : card.activityLog.slice(0, ACTIVITY_PREVIEW_COUNT)
  const commentCharactersRemaining = COMMENT_MAX_LENGTH - commentDraft.length
  const currentBrand = getBrandByName(portfolio, card.brand)
  const iterationSourceCards = useMemo(
    () => getIterationSourceCards(portfolio, settings, card.brand, card.product, card.id),
    [card.brand, card.id, card.product, portfolio, settings],
  )
  const relatedLpDesignCards = useMemo(
    () => getRelatedLpDesignCards(portfolio, settings, card.brand, card.product, card.id),
    [card.brand, card.id, card.product, portfolio, settings],
  )
  const dynamicSections = [
    { id: 'details', label: 'Details' },
    ...(creativeTask ? [{ id: 'naming', label: 'Naming' }] : []),
    { id: 'drive', label: 'Drive' },
    { id: 'brief', label: 'Brief' },
    ...(creativeTask ? [{ id: 'creative-direction', label: 'Creative Direction' }] : []),
    { id: 'links', label: 'Links' },
    { id: 'comments', label: 'Comments' },
    { id: 'activity', label: 'Activity' },
    { id: 'tracking', label: 'Tracking' },
  ]

  useModalAccessibility(panelRef, isOpen)

  function scrollToSection(sectionId: string) {
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

  function handleTaskTypeChange(taskTypeId: string) {
    const nextTaskType = getTaskTypeById(settings, taskTypeId)
    onSave({
      taskTypeId,
      estimatedHours: nextTaskType.estimatedHours,
      designType: isPackagingBrandingTaskTypeId(nextTaskType.id)
        ? card.designType ?? 'Packaging'
        : null,
      figmaUrl: isLpDesignTaskTypeId(nextTaskType.id) ? card.figmaUrl : '',
      sourceCardId: isIterationTaskTypeId(nextTaskType.id) ? card.sourceCardId : null,
      relatedLpDesignCardId: isLpDevTaskTypeId(nextTaskType.id) ? card.relatedLpDesignCardId : null,
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

  function commitTextDraft(
    key:
      | 'title'
      | 'angle'
      | 'audience'
      | 'landingPage'
      | 'figmaUrl'
      | 'keyMessage'
      | 'visualDirection'
      | 'cta'
      | 'referenceLinks'
      | 'adCopy'
      | 'notes',
    value: string,
  ) {
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

  const canEditTitle =
    iterationTask ? false : creativeTask ? canManage : canEditOwnedContent

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
            {canEditTitle ? (
              <input
                id={titleId}
                className="panel-title-input"
                value={titleDraft}
                aria-label={titleLabel}
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
              {creativeTask ? (
                <span className={`funnel-pill funnel-${card.funnelStage.toLowerCase().replace(/\s+/g, '-')}`}>
                  {card.funnelStage}
                </span>
              ) : null}
              {card.blocked ? (
                <span className="blocked-badge">
                  <BlockedIcon />
                  Blocked
                </span>
              ) : null}
              {card.archivedAt ? <span className="archived-badge">Archived</span> : null}
            </div>
            {canSetPriority ? (
              <div className="panel-priority-selector">
                <span>Priority</span>
                <div className="panel-priority-buttons">
                  {[1, 2, 3].map((priority) => (
                    <button
                      key={priority}
                      type="button"
                      className={`panel-priority-button priority-${priority} ${
                        card.priority === priority ? 'is-active' : ''
                      }`}
                      onClick={() => onSetProductionPriority(priority as 1 | 2 | 3)}
                    >
                      {`P${priority}`}
                    </button>
                  ))}
                </div>
              </div>
            ) : null}
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
            {dynamicSections.map((section) => (
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
          <div className="metadata-groups">
            <div className="metadata-group">
              <h4 className="metadata-group-title">Universal</h4>
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
                  <span>Status</span>
                  <strong>{getStageLabel(card.stage)}</strong>
                </label>
                <label>
                  <span>Assigned To</span>
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
                  <span>Estimated Hours</span>
                  {canEditOwnedContent ? (
                    <input
                      type="number"
                      min={1}
                      step={0.5}
                      value={card.estimatedHours}
                      onChange={(event) => onSave({ estimatedHours: Math.max(1, Number(event.target.value) || 1) })}
                    />
                  ) : (
                    <strong>{formatHours(card.estimatedHours)}</strong>
                  )}
                </label>
              </div>
            </div>

            <div className="metadata-group">
              <h4 className="metadata-group-title">Workflow</h4>
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
                      <span className={`stage-dot ${isPast ? 'is-past' : ''} ${isCurrent ? 'is-current tone-fresh' : ''}`} />
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

                  return (
                    <span key={`${entry.stage}-${entry.enteredAt}`} className="stage-history-piece">
                      <span className="stage-history-text tone-fresh">{getStageLabel(entry.stage)}</span>
                      <span className="stage-history-time tone-fresh">{formatDurationShort(durationMs)}</span>
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
              {card.stage === 'In Production' && (showEditorStartButton || isEditorTimerInProgress) ? (
                <div className="editor-progress-inline">
                  {showEditorStartButton ? (
                    <button
                      type="button"
                      className="ghost-button"
                      onClick={canStartEditorTimer ? onStartEditorTimer : undefined}
                      disabled={!canStartEditorTimer}
                    >
                      Start
                    </button>
                  ) : null}
                  {isEditorTimerInProgress ? (
                    <span className="card-progress-chip">In Progress</span>
                  ) : null}
                </div>
              ) : null}
            </div>

            {creativeTask ? (
              <div className="metadata-group">
                <h4 className="metadata-group-title">Creative Direction</h4>
                <div className="metadata-grid">
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
                    <span>Funnel Stage</span>
                    {canManage ? (
                      <select
                        value={card.funnelStage}
                        onChange={(event) => onSave({ funnelStage: event.target.value as Card['funnelStage'] })}
                      >
                        <option value="Cold">Cold</option>
                        <option value="Warm">Warm</option>
                        <option value="Promo">Promo</option>
                        <option value="Promo Evergreen">Promo Evergreen</option>
                      </select>
                    ) : (
                      <strong>{card.funnelStage}</strong>
                    )}
                  </label>
                  <label>
                    <span>Angle / Theme</span>
                    {canManage ? (
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
                    {canManage ? (
                      <input
                        value={audienceDraft}
                        onChange={(event) => setAudienceDraft(event.target.value)}
                        onBlur={() => commitTextDraft('audience', audienceDraft)}
                      />
                    ) : (
                      <strong>{card.audience || '—'}</strong>
                    )}
                  </label>
                  <label>
                    <span>Landing Page URL</span>
                    {canManage ? (
                      <input
                        value={landingPageDraft}
                        onChange={(event) => setLandingPageDraft(event.target.value)}
                        onBlur={() => commitTextDraft('landingPage', landingPageDraft)}
                        placeholder="https://..."
                      />
                    ) : (
                      <strong>
                        {card.landingPage ? (
                          <a href={card.landingPage} target="_blank" rel="noreferrer">
                            {card.landingPage}
                          </a>
                        ) : (
                          '—'
                        )}
                      </strong>
                    )}
                  </label>
                  <label>
                    <span>Facebook Page</span>
                    <strong>{currentBrand?.facebookPage || '—'}</strong>
                  </label>
                </div>
              </div>
            ) : null}

            {iterationTask ? (
              <div className="metadata-group">
                <h4 className="metadata-group-title">Iteration Source</h4>
                <div className="metadata-grid">
                  <label>
                    <span>Source Card</span>
                    {canManage ? (
                      <select
                        value={card.sourceCardId ?? ''}
                        onChange={(event) => {
                          const sourceCard =
                            iterationSourceCards.find((item) => item.id === event.target.value) ?? null
                          onSave({
                            sourceCardId: sourceCard?.id ?? null,
                            title: sourceCard?.title ?? card.title,
                          })
                        }}
                      >
                        <option value="">Select source card</option>
                        {iterationSourceCards.map((sourceCard) => (
                          <option key={sourceCard.id} value={sourceCard.id}>
                            {`${sourceCard.id} · ${sourceCard.title}`}
                          </option>
                        ))}
                      </select>
                    ) : (
                      <strong>
                        {iterationSourceCards.find((item) => item.id === card.sourceCardId)?.title ??
                          card.sourceCardId ??
                          '—'}
                      </strong>
                    )}
                  </label>
                </div>
              </div>
            ) : null}

            {packagingTask ? (
              <div className="metadata-group">
                <h4 className="metadata-group-title">Packaging / Branding</h4>
                <div className="metadata-grid">
                  <label>
                    <span>Design Type</span>
                    {canEditOwnedContent ? (
                      <select
                        value={card.designType ?? 'Packaging'}
                        onChange={(event) => onSave({ designType: event.target.value as Card['designType'] })}
                      >
                        {DESIGN_TYPES.map((designType) => (
                          <option key={designType} value={designType}>
                            {designType}
                          </option>
                        ))}
                      </select>
                    ) : (
                      <strong>{card.designType ?? '—'}</strong>
                    )}
                  </label>
                </div>
              </div>
            ) : null}

            {lpDesignTask ? (
              <div className="metadata-group">
                <h4 className="metadata-group-title">LP Design</h4>
                <div className="metadata-grid">
                  <label>
                    <span>Figma URL</span>
                    {canEditOwnedContent ? (
                      <input
                        value={figmaUrlDraft}
                        onChange={(event) => setFigmaUrlDraft(event.target.value)}
                        onBlur={() => commitTextDraft('figmaUrl', figmaUrlDraft)}
                        placeholder="https://figma.com/..."
                      />
                    ) : (
                      <strong>
                        {card.figmaUrl ? (
                          <a href={card.figmaUrl} target="_blank" rel="noreferrer">
                            {card.figmaUrl}
                          </a>
                        ) : (
                          '—'
                        )}
                      </strong>
                    )}
                  </label>
                </div>
              </div>
            ) : null}

            {lpDevTask ? (
              <div className="metadata-group">
                <h4 className="metadata-group-title">LP Development</h4>
                <div className="metadata-grid">
                  <label>
                    <span>Related LP Design</span>
                    {canEditOwnedContent ? (
                      <select
                        value={card.relatedLpDesignCardId ?? ''}
                        onChange={(event) =>
                          onSave({ relatedLpDesignCardId: event.target.value || null })
                        }
                      >
                        <option value="">No linked design card</option>
                        {relatedLpDesignCards.map((relatedCard) => (
                          <option key={relatedCard.id} value={relatedCard.id}>
                            {`${relatedCard.id} · ${relatedCard.title}`}
                          </option>
                        ))}
                      </select>
                    ) : (
                      <strong>
                        {relatedLpDesignCards.find((item) => item.id === card.relatedLpDesignCardId)?.title ??
                          card.relatedLpDesignCardId ??
                          '—'}
                      </strong>
                    )}
                  </label>
                </div>
              </div>
            ) : null}
          </div>
        </section>

        {creativeTask ? (
          <section
            ref={(node) => {
              sectionRefs.current.naming = node
            }}
            className="panel-section"
          >
            <div className="section-rule-title">Naming</div>
            <div className="copy-field">
              <div>
                <label>Ad Name</label>
                <code>{card.generatedAdName || '—'}</code>
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
        ) : null}

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

        {creativeTask ? (
          <section
            ref={(node) => {
              sectionRefs.current['creative-direction'] = node
            }}
            className="panel-section"
          >
            <div className="section-rule-title">Creative Direction</div>
            <div className="metadata-grid creative-direction-grid">
              <label>
                <span>Key Message</span>
                {canEditOwnedContent ? (
                  <input
                    value={keyMessageDraft}
                    onChange={(event) => setKeyMessageDraft(event.target.value)}
                    onBlur={() => commitTextDraft('keyMessage', keyMessageDraft)}
                  />
                ) : (
                  <strong>{card.keyMessage || '—'}</strong>
                )}
              </label>
              <label>
                <span>CTA</span>
                {canEditOwnedContent ? (
                  <input
                    value={ctaDraft}
                    onChange={(event) => setCtaDraft(event.target.value)}
                    onBlur={() => commitTextDraft('cta', ctaDraft)}
                  />
                ) : (
                  <strong>{card.cta || '—'}</strong>
                )}
              </label>
              <label className="full-width">
                <span>Visual Direction</span>
                {canEditOwnedContent ? (
                  <textarea
                    value={visualDirectionDraft}
                    onChange={(event) => setVisualDirectionDraft(event.target.value)}
                    onBlur={() => commitTextDraft('visualDirection', visualDirectionDraft)}
                    rows={4}
                  />
                ) : (
                  <strong>{card.visualDirection || '—'}</strong>
                )}
              </label>
              <label className="full-width">
                <span>Reference Links</span>
                {canEditOwnedContent ? (
                  <textarea
                    value={referenceLinksDraft}
                    onChange={(event) => setReferenceLinksDraft(event.target.value)}
                    onBlur={() => commitTextDraft('referenceLinks', referenceLinksDraft)}
                    rows={4}
                  />
                ) : (
                  <strong>{card.referenceLinks || '—'}</strong>
                )}
              </label>
              <label className="full-width">
                <span>Ad Copy</span>
                {canEditOwnedContent ? (
                  <textarea
                    value={adCopyDraft}
                    onChange={(event) => setAdCopyDraft(event.target.value)}
                    onBlur={() => commitTextDraft('adCopy', adCopyDraft)}
                    rows={4}
                  />
                ) : (
                  <strong>{card.adCopy || '—'}</strong>
                )}
              </label>
              <label className="full-width">
                <span>Notes</span>
                {canEditOwnedContent ? (
                  <textarea
                    value={notesDraft}
                    onChange={(event) => setNotesDraft(event.target.value)}
                    onBlur={() => commitTextDraft('notes', notesDraft)}
                    rows={4}
                  />
                ) : (
                  <strong>{card.notes || '—'}</strong>
                )}
              </label>
            </div>
          </section>
        ) : null}

        <section
          ref={(node) => {
            sectionRefs.current.links = node
          }}
          className="panel-section"
        >
          <div className="section-rule-title">Links</div>
          {creativeTask ? (
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
          ) : null}

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

        <section
          ref={(node) => {
            sectionRefs.current.tracking = node
          }}
          className="panel-section"
        >
          <button
            type="button"
            className="ghost-button"
            onClick={() => setTrackingOpen((open) => !open)}
          >
            {trackingOpen ? 'Hide Tracking' : 'Show Tracking'}
          </button>
          {trackingOpen ? (
            <div className="metadata-groups">
              <div className="metadata-group">
                <h4 className="metadata-group-title">Tracking</h4>
                <div className="metadata-grid">
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
                    <span>Revision Count</span>
                    <strong>{revisionCount}</strong>
                  </label>
                  <label>
                    <span>Actual Hours Logged</span>
                    {canEditOwnedContent ? (
                      <input
                        type="number"
                        min={0}
                        step={0.5}
                        value={card.actualHoursLogged}
                        onChange={(event) =>
                          onSave({
                            actualHoursLogged: Math.max(0, Number(event.target.value) || 0),
                          })
                        }
                      />
                    ) : (
                      <strong>{card.actualHoursLogged > 0 ? formatHours(card.actualHoursLogged) : '—'}</strong>
                    )}
                  </label>
                  {canViewPerformanceData ? (
                    <>
                      <label>
                        <span>Production Started</span>
                        <strong>
                          {card.editorTimer?.startedAt ? formatDateTime(card.editorTimer.startedAt) : '—'}
                        </strong>
                      </label>
                      <label>
                        <span>Production Stopped</span>
                        <strong>
                          {card.editorTimer?.stoppedAt ? formatDateTime(card.editorTimer.stoppedAt) : '—'}
                        </strong>
                      </label>
                      <label>
                        <span>Production Elapsed</span>
                        <strong>
                          {card.editorTimer?.elapsedMs !== null && card.editorTimer?.elapsedMs !== undefined
                            ? formatDurationShort(card.editorTimer.elapsedMs)
                            : '—'}
                        </strong>
                      </label>
                    </>
                  ) : null}
                </div>
              </div>
              {canViewPerformanceData ? (
                <div className="metadata-group">
                  <h4 className="metadata-group-title">Column Movements</h4>
                  {card.columnMovementHistory.length === 0 ? (
                    <p className="muted-copy">No column movements recorded yet.</p>
                  ) : (
                    <div className="tracking-list">
                      {card.columnMovementHistory.map((entry) => (
                        <span key={`${entry.from}-${entry.to}-${entry.timestamp}`}>
                          {entry.from} → {entry.to} · {formatDateTime(entry.timestamp)}
                        </span>
                      ))}
                    </div>
                  )}
                </div>
              ) : null}
            </div>
          ) : null}
        </section>
      </aside>
    </>
  )
}
