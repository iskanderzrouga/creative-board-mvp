import { useEffect, useId, useRef, useState } from 'react'
import type { CSSProperties } from 'react'
import type { BacklogCard, BacklogTaskType } from '../backlog'
import { RichTextEditor } from './RichTextEditor'
import { ConfirmDialog } from './ConfirmDialog'
import { XIcon } from './icons/AppIcons'
import { useModalAccessibility } from '../hooks/useModalAccessibility'

interface BacklogCardDetailPanelProps {
  card: BacklogCard | null
  isOpen: boolean
  brandOptions: string[]
  brandStyles: Record<string, { background: string; color: string }>
  creativeProductionTaskTypeOptions: Array<{ id: string; name: string }>
  devProductionTaskTypeOptions: Array<{ id: string; name: string }>
  onClose: () => void
  onSave: (updates: Partial<BacklogCard>) => void
  onDelete: () => void
}

const CREATIVE_REQUIRED_FIELDS = [
  'productionTaskType',
  'brief',
  'targetAudience',
  'visualDirection',
  'platform',
  'funnelStage',
  'angleTheme',
  'cta',
  'referenceLinks',
] as const

const DEV_REQUIRED_FIELDS = ['productionTaskType', 'taskDescription', 'linkForTest', 'linkForChanges'] as const

const PLATFORM_OPTIONS = ['Meta', 'TikTok', 'AppLovin', 'YouTube', 'Google', 'Other'] as const
const FUNNEL_STAGE_OPTIONS = ['Cold', 'Warm', 'Hot'] as const
const panelOverflowStyle = {
  overflowY: 'auto' as const,
  overflowX: 'hidden' as const,
  maxWidth: '100%',
  boxSizing: 'border-box' as const,
}
const panelTextOverflowStyle = {
  wordWrap: 'break-word' as const,
  overflowWrap: 'break-word' as const,
  whiteSpace: 'pre-wrap' as const,
  maxWidth: '100%',
  overflowX: 'hidden' as const,
}

type TextDrafts = {
  name: string
  description: string
  hypothesis: string
  brief: string
  targetAudience: string
  keyMessage: string
  visualDirection: string
  angleTheme: string
  cta: string
  referenceLinks: string
  adCopy: string
  notes: string
  taskDescription: string
  linkForTest: string
  linkForChanges: string
}

const EMPTY_TEXT_DRAFTS: TextDrafts = {
  name: '',
  description: '',
  hypothesis: '',
  brief: '',
  targetAudience: '',
  keyMessage: '',
  visualDirection: '',
  angleTheme: '',
  cta: '',
  referenceLinks: '',
  adCopy: '',
  notes: '',
  taskDescription: '',
  linkForTest: '',
  linkForChanges: '',
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

function getTaskTypeBadgeStyle(taskType: BacklogTaskType): CSSProperties {
  switch (taskType) {
    case 'creative':
      return { background: '#2563eb', color: '#fff' }
    case 'dev-cro':
      return { background: '#7c3aed', color: '#fff' }
    case 'operations':
      return { background: '#f97316', color: '#fff' }
  }
}

function getInitialDrafts(card: BacklogCard): TextDrafts {
  return {
    name: card.name,
    description: card.description,
    hypothesis: card.hypothesis,
    brief: card.brief ?? '',
    targetAudience: card.targetAudience ?? '',
    keyMessage: card.keyMessage ?? '',
    visualDirection: card.visualDirection ?? '',
    angleTheme: card.angleTheme ?? '',
    cta: card.cta ?? '',
    referenceLinks: card.referenceLinks ?? '',
    adCopy: card.adCopy ?? '',
    notes: card.notes ?? '',
    taskDescription: card.taskDescription ?? '',
    linkForTest: card.linkForTest ?? '',
    linkForChanges: card.linkForChanges ?? '',
  }
}

function hasExpandedSection(card: BacklogCard) {
  const isExpandedColumn = card.column === 'prioritized' || card.column === 'moved-to-production'
  return isExpandedColumn && (card.taskType === 'creative' || card.taskType === 'dev-cro')
}

function isValueComplete(value: string | undefined) {
  return Boolean(value?.trim())
}

function getPendingDraftUpdates(card: BacklogCard | null, nextDrafts: TextDrafts) {
  if (!card) {
    return null
  }

  const updates = (Object.entries(nextDrafts) as Array<[keyof TextDrafts, string]>).reduce<Partial<BacklogCard>>(
    (accumulator, [key, value]) => {
      const currentValue = (card[key] ?? '') as string
      if (value !== currentValue) {
        accumulator[key] = value
      }
      return accumulator
    },
    {},
  )

  return Object.keys(updates).length > 0 ? updates : null
}

export function BacklogCardDetailPanel({
  card,
  isOpen,
  brandOptions,
  brandStyles,
  creativeProductionTaskTypeOptions,
  devProductionTaskTypeOptions,
  onClose,
  onSave,
  onDelete,
}: BacklogCardDetailPanelProps) {
  const panelRef = useRef<HTMLDivElement | null>(null)
  const debounceRef = useRef<number | null>(null)
  const draftsRef = useRef<TextDrafts | null>(null)
  const cardRef = useRef<BacklogCard | null>(null)
  const onSaveRef = useRef(onSave)
  const titleId = useId()
  const [drafts, setDrafts] = useState<TextDrafts>(() => (card ? getInitialDrafts(card) : EMPTY_TEXT_DRAFTS))
  const [confirmDeleteOpen, setConfirmDeleteOpen] = useState(false)

  useModalAccessibility(panelRef, isOpen)

  function clearDebounce() {
    if (debounceRef.current !== null && typeof window !== 'undefined') {
      window.clearTimeout(debounceRef.current)
      debounceRef.current = null
    }
  }

  function flushDrafts(nextDrafts: TextDrafts) {
    const pendingUpdates = getPendingDraftUpdates(card, nextDrafts)
    clearDebounce()
    if (pendingUpdates) {
      console.log('[input] committing "backlog-drafts" to app state')
      onSave(pendingUpdates)
    }
  }

  useEffect(() => {
    draftsRef.current = drafts
  }, [drafts])

  useEffect(() => {
    cardRef.current = card
  }, [card])

  useEffect(() => {
    onSaveRef.current = onSave
  }, [onSave])

  useEffect(() => {
    return () => {
      const latestDrafts = draftsRef.current
      if (!latestDrafts) {
        return
      }

      const pendingUpdates = getPendingDraftUpdates(cardRef.current, latestDrafts)
      clearDebounce()
      if (pendingUpdates) {
        onSaveRef.current(pendingUpdates)
      }
    }
  }, [])

  useEffect(() => {
    if (!isOpen || !drafts) {
      clearDebounce()
      return
    }

    const pendingUpdates = getPendingDraftUpdates(card, drafts)
    if (!pendingUpdates || typeof window === 'undefined') {
      return
    }

    clearDebounce()
    debounceRef.current = window.setTimeout(() => {
      onSave(pendingUpdates)
      debounceRef.current = null
    }, 300)

    return () => {
      clearDebounce()
    }
  }, [drafts, isOpen, card, onSave])

  if (!card || !drafts) {
    return null
  }

  const brandStyle = brandStyles[card.brand]
  const showExpandedFields = hasExpandedSection(card)
  const productionTaskTypeOptions =
    card.taskType === 'creative' ? creativeProductionTaskTypeOptions : devProductionTaskTypeOptions
  const creativeCompletionCount = CREATIVE_REQUIRED_FIELDS.filter((field) =>
    isValueComplete(
      field === 'platform' || field === 'funnelStage' || field === 'productionTaskType'
        ? (card[field] as string | undefined)
        : (drafts[field] as string | undefined),
    ),
  ).length
  const devCompletionCount = DEV_REQUIRED_FIELDS.filter((field) =>
    isValueComplete(
      field === 'productionTaskType'
        ? (card[field] as string | undefined)
        : (drafts[field] as string | undefined),
    ),
  ).length

  function handleClose() {
    flushDrafts(drafts)
    onClose()
  }

  function updateDraftField(field: keyof TextDrafts, value: string) {
    console.log(`[input] draft update for field "${field}" — not yet saved`)
    setDrafts((current) => (current ? { ...current, [field]: value } : current))
  }

  function handleImmediateSave(updates: Partial<BacklogCard>) {
    const fieldName = Object.keys(updates).join(',') || 'unknown'
    console.log(`[input] committing "${fieldName}" to app state`)
    clearDebounce()
    onSave(updates)
  }

  return (
    <>
      <div className={`panel-overlay ${isOpen ? 'is-visible' : ''}`} aria-hidden="true" onClick={handleClose} />
      <aside
        ref={panelRef}
        className={`slide-panel backlog-detail-panel ${isOpen ? 'is-open' : ''}`}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        tabIndex={-1}
        style={panelOverflowStyle}
      >
        <div className="slide-panel-header">
          <div className="slide-panel-header-main">
            <div className="panel-card-id">{card.id}</div>
            <input
              id={titleId}
              className="panel-title-input"
              value={drafts.name}
              aria-label="Backlog card name"
              onChange={(event) => updateDraftField('name', event.target.value)}
              onBlur={() => flushDrafts(drafts)}
            />
            <div className="panel-pill-row">
              <span className="brand-pill" style={brandStyle}>
                {card.brand}
              </span>
              <span className="backlog-task-badge" style={getTaskTypeBadgeStyle(card.taskType)}>
                {getTaskTypeLabel(card.taskType)}
              </span>
            </div>
          </div>

          <div className="panel-header-actions">
            <button type="button" className="ghost-button danger-outline" onClick={() => setConfirmDeleteOpen(true)}>
              Delete
            </button>
            <button type="button" className="close-icon-button" aria-label="Close backlog card detail panel" onClick={handleClose}>
              <XIcon />
            </button>
          </div>
        </div>

        <section className="panel-section">
          <div className="section-rule-title">Details</div>
          <div className="metadata-groups">
            <div className="metadata-group">
              <h4 className="metadata-group-title">Base Fields</h4>
              <div className="metadata-grid">
                <label className="backlog-panel-field backlog-panel-field-full">
                  <span>Description</span>
                  <textarea
                      style={panelTextOverflowStyle}
                    value={drafts.description}
                    onChange={(event) => updateDraftField('description', event.target.value)}
                    onBlur={() => flushDrafts(drafts)}
                    rows={7}
                  />
                </label>
                <label className="backlog-panel-field backlog-panel-field-full">
                  <span>
                    Why should we prioritize this?
                  </span>
                  <textarea
                      style={panelTextOverflowStyle}
                    value={drafts.hypothesis}
                    onChange={(event) => updateDraftField('hypothesis', event.target.value)}
                    onBlur={() => flushDrafts(drafts)}
                    rows={7}
                  />
                </label>
                <label className="backlog-panel-field">
                  <span>Task Type</span>
                  <select
                    value={card.taskType}
                    onChange={(event) => handleImmediateSave({ taskType: event.target.value as BacklogTaskType })}
                  >
                    <option value="creative">Creative</option>
                    <option value="dev-cro">Dev/CRO</option>
                    <option value="operations">Operations</option>
                  </select>
                </label>
                <label className="backlog-panel-field">
                  <span>Brand</span>
                  <select value={card.brand} onChange={(event) => handleImmediateSave({ brand: event.target.value })}>
                    {brandOptions.map((brandName) => (
                      <option key={brandName} value={brandName}>
                        {brandName}
                      </option>
                    ))}
                  </select>
                </label>
                <label className="backlog-panel-field">
                  <span>Added by</span>
                  <strong>{card.addedBy}</strong>
                </label>
                <label className="backlog-panel-field">
                  <span>Date added</span>
                  <strong>{getFormattedDate(card.dateAdded)}</strong>
                </label>
              </div>
            </div>

            {showExpandedFields && card.taskType === 'creative' ? (
              <div className="metadata-group">
                <div className="backlog-panel-section-head">
                  <h4 className="metadata-group-title">Creative Brief</h4>
                  <p className="backlog-panel-progress">{`${creativeCompletionCount}/${CREATIVE_REQUIRED_FIELDS.length} required fields completed`}</p>
                </div>
                <div className="metadata-grid">
                  <label className="backlog-panel-field">
                    <span>
                      Production Task Type
                      <em className="backlog-panel-required">*</em>
                    </span>
                    <select
                      value={card.productionTaskType ?? ''}
                      onChange={(event) => handleImmediateSave({ productionTaskType: event.target.value || undefined })}
                    >
                      <option value="">Select task type</option>
                      {productionTaskTypeOptions.map((taskType) => (
                        <option key={taskType.id} value={taskType.id}>
                          {taskType.name}
                        </option>
                      ))}
                    </select>
                  </label>
                  <label className="backlog-panel-field backlog-panel-field-full">
                    <span>
                      Brief
                      <em className="backlog-panel-required">*</em>
                    </span>
                    <div className="backlog-rich-field" style={panelTextOverflowStyle} onBlur={() => flushDrafts(drafts)}>
                      <RichTextEditor value={drafts.brief} onChange={(nextValue) => updateDraftField('brief', nextValue)} />
                    </div>
                  </label>
                  <label className="backlog-panel-field">
                    <span>
                      Target Audience
                      <em className="backlog-panel-required">*</em>
                    </span>
                    <input
                      value={drafts.targetAudience}
                      onChange={(event) => updateDraftField('targetAudience', event.target.value)}
                      onBlur={() => flushDrafts(drafts)}
                    />
                  </label>
                  <label className="backlog-panel-field">
                    <span>Key Message</span>
                    <input
                      value={drafts.keyMessage}
                      onChange={(event) => updateDraftField('keyMessage', event.target.value)}
                      onBlur={() => flushDrafts(drafts)}
                    />
                  </label>
                  <label className="backlog-panel-field backlog-panel-field-full">
                    <span>
                      Visual Direction
                      <em className="backlog-panel-required">*</em>
                    </span>
                    <textarea
                      style={panelTextOverflowStyle}
                      value={drafts.visualDirection}
                      onChange={(event) => updateDraftField('visualDirection', event.target.value)}
                      onBlur={() => flushDrafts(drafts)}
                      rows={4}
                    />
                  </label>
                  <label className="backlog-panel-field">
                    <span>
                      Platform
                      <em className="backlog-panel-required">*</em>
                    </span>
                    <select value={card.platform ?? ''} onChange={(event) => handleImmediateSave({ platform: event.target.value })}>
                      <option value="">Select platform</option>
                      {PLATFORM_OPTIONS.map((platform) => (
                        <option key={platform} value={platform}>
                          {platform}
                        </option>
                      ))}
                    </select>
                  </label>
                  <label className="backlog-panel-field">
                    <span>
                      Funnel Stage
                      <em className="backlog-panel-required">*</em>
                    </span>
                    <select value={card.funnelStage ?? ''} onChange={(event) => handleImmediateSave({ funnelStage: event.target.value })}>
                      <option value="">Select funnel stage</option>
                      {FUNNEL_STAGE_OPTIONS.map((stage) => (
                        <option key={stage} value={stage}>
                          {stage}
                        </option>
                      ))}
                    </select>
                  </label>
                  <label className="backlog-panel-field">
                    <span>
                      Angle / Theme
                      <em className="backlog-panel-required">*</em>
                    </span>
                    <input
                      value={drafts.angleTheme}
                      onChange={(event) => updateDraftField('angleTheme', event.target.value)}
                      onBlur={() => flushDrafts(drafts)}
                    />
                  </label>
                  <label className="backlog-panel-field">
                    <span>
                      CTA
                      <em className="backlog-panel-required">*</em>
                    </span>
                    <input
                      value={drafts.cta}
                      onChange={(event) => updateDraftField('cta', event.target.value)}
                      onBlur={() => flushDrafts(drafts)}
                    />
                  </label>
                  <label className="backlog-panel-field backlog-panel-field-full">
                    <span>
                      Reference Links
                      <em className="backlog-panel-required">*</em>
                    </span>
                    <textarea
                      style={panelTextOverflowStyle}
                      value={drafts.referenceLinks}
                      onChange={(event) => updateDraftField('referenceLinks', event.target.value)}
                      onBlur={() => flushDrafts(drafts)}
                      rows={4}
                    />
                  </label>
                  <label className="backlog-panel-field backlog-panel-field-full">
                    <span>Ad Copy</span>
                    <textarea
                      style={panelTextOverflowStyle}
                      value={drafts.adCopy}
                      onChange={(event) => updateDraftField('adCopy', event.target.value)}
                      onBlur={() => flushDrafts(drafts)}
                      rows={4}
                    />
                  </label>
                  <label className="backlog-panel-field backlog-panel-field-full">
                    <span>Notes</span>
                    <textarea
                      style={panelTextOverflowStyle}
                      value={drafts.notes}
                      onChange={(event) => updateDraftField('notes', event.target.value)}
                      onBlur={() => flushDrafts(drafts)}
                      rows={4}
                    />
                  </label>
                </div>
              </div>
            ) : null}

            {showExpandedFields && card.taskType === 'dev-cro' ? (
              <div className="metadata-group">
                <div className="backlog-panel-section-head">
                  <h4 className="metadata-group-title">Dev Task Details</h4>
                  <p className="backlog-panel-progress">{`${devCompletionCount}/${DEV_REQUIRED_FIELDS.length} required fields completed`}</p>
                </div>
                <div className="metadata-grid">
                  <label className="backlog-panel-field">
                    <span>
                      Production Task Type
                      <em className="backlog-panel-required">*</em>
                    </span>
                    <select
                      value={card.productionTaskType ?? ''}
                      onChange={(event) => handleImmediateSave({ productionTaskType: event.target.value || undefined })}
                    >
                      <option value="">Select task type</option>
                      {productionTaskTypeOptions.map((taskType) => (
                        <option key={taskType.id} value={taskType.id}>
                          {taskType.name}
                        </option>
                      ))}
                    </select>
                  </label>
                  <label className="backlog-panel-field backlog-panel-field-full">
                    <span>
                      Task Description
                      <em className="backlog-panel-required">*</em>
                    </span>
                    <textarea
                      style={panelTextOverflowStyle}
                      value={drafts.taskDescription}
                      onChange={(event) => updateDraftField('taskDescription', event.target.value)}
                      onBlur={() => flushDrafts(drafts)}
                      rows={5}
                    />
                  </label>
                  <label className="backlog-panel-field">
                    <span>
                      Link for Test
                      <em className="backlog-panel-required">*</em>
                    </span>
                    <input
                      type="url"
                      value={drafts.linkForTest}
                      onChange={(event) => updateDraftField('linkForTest', event.target.value)}
                      onBlur={() => flushDrafts(drafts)}
                      placeholder="https://..."
                    />
                  </label>
                  <label className="backlog-panel-field">
                    <span>
                      Link for Changes
                      <em className="backlog-panel-required">*</em>
                    </span>
                    <input
                      type="url"
                      value={drafts.linkForChanges}
                      onChange={(event) => updateDraftField('linkForChanges', event.target.value)}
                      onBlur={() => flushDrafts(drafts)}
                      placeholder="https://..."
                    />
                  </label>
                </div>
              </div>
            ) : null}
          </div>
        </section>
      </aside>

      {confirmDeleteOpen ? (
        <ConfirmDialog
          title={`Delete ${card.id}?`}
          message={`This will permanently remove "${card.name}" from the backlog.`}
          confirmLabel="Delete card"
          confirmTone="danger"
          onCancel={() => setConfirmDeleteOpen(false)}
          onConfirm={() => {
            setConfirmDeleteOpen(false)
            onDelete()
          }}
        />
      ) : null}
    </>
  )
}
