import { useId, useMemo, useRef, useState, type Dispatch, type SetStateAction } from 'react'
import { LinkifiedText } from './LinkifiedText'
import { useModalAccessibility } from '../hooks/useModalAccessibility'
import {
  DEV_BLOCKER_OPTIONS,
  DEV_CHANGE_REQUEST_TYPES,
  STORAGE_KEY,
  getDevCardBlockerReason,
  type DevBlockerOption,
  type DevCard,
  type DevChangeRequestType,
  type TeamMember,
} from '../board'

function coerceStringArrayField(value: string[] | string | null | undefined) {
  if (Array.isArray(value)) {
    return value
  }
  if (typeof value === 'string') {
    return value ? [value] : []
  }
  return []
}

function getActiveContributorIdFromStorage() {
  if (typeof window === 'undefined') {
    return null
  }

  try {
    const raw = window.localStorage.getItem(STORAGE_KEY)
    if (!raw) {
      return null
    }
    const parsed = JSON.parse(raw) as {
      activeRole?: {
        mode?: string
        editorId?: unknown
      }
    }
    if (parsed.activeRole?.mode !== 'contributor' || typeof parsed.activeRole.editorId !== 'string') {
      return null
    }
    return parsed.activeRole.editorId
  } catch {
    return null
  }
}

interface DevCardDetailPanelProps {
  card: DevCard
  teamMembers: TeamMember[]
  isOpen: boolean
  onClose: () => void
  onSave: (cardId: string, updates: Partial<DevCard>) => void
  onDelete: (cardId: string) => void
}

export function DevCardDetailPanel({
  card,
  teamMembers,
  isOpen,
  onClose,
  onSave,
  onDelete,
}: DevCardDetailPanelProps) {
  const titleId = useId()
  const panelRef = useRef<HTMLElement | null>(null)
  const activeContributorId = useMemo(() => getActiveContributorIdFromStorage(), [])
  const canEditAssignedCard = Boolean(card.assigneeId && activeContributorId && card.assigneeId === activeContributorId)
  const [taskDescriptionDraft, setTaskDescriptionDraft] = useState(card.taskDescription)
  const [loomVideoUrlDraft, setLoomVideoUrlDraft] = useState<string[]>(
    coerceStringArrayField(card.loomVideoUrl).length > 0 ? coerceStringArrayField(card.loomVideoUrl) : [''],
  )
  const [newUrlToUseDraft, setNewUrlToUseDraft] = useState<string[]>(
    coerceStringArrayField(card.newUrlToUse).length > 0 ? coerceStringArrayField(card.newUrlToUse) : [''],
  )
  const [assigneeIdDraft, setAssigneeIdDraft] = useState<string>(card.assigneeId ?? '')
  const [dueDateDraft, setDueDateDraft] = useState<string>(card.dueDate ?? '')
  const [changeRequestTypeDraft, setChangeRequestTypeDraft] = useState<DevChangeRequestType>(card.changeRequestType)
  const [blockerOptionDraft, setBlockerOptionDraft] = useState<DevBlockerOption | ''>(card.blockerOption ?? '')
  const [customBlockerDraft, setCustomBlockerDraft] = useState(card.customBlocker)
  const [statusDraft, setStatusDraft] = useState<NonNullable<DevCard['status']>>(card.status ?? 'not-started')
  const [activeTextField, setActiveTextField] = useState<string | null>(null)

  useModalAccessibility(panelRef, isOpen)

  const blockerDetails = useMemo(() => getDevCardBlockerReason(card), [card])

  function commit() {
    onSave(card.id, {
      taskDescription: taskDescriptionDraft,
      loomVideoUrl: loomVideoUrlDraft.map((link) => link.trim()).filter(Boolean),
      newUrlToUse: newUrlToUseDraft.map((link) => link.trim()).filter(Boolean),
      assigneeId: assigneeIdDraft || null,
      dueDate: dueDateDraft || null,
      changeRequestType: changeRequestTypeDraft,
      blockerOption: blockerOptionDraft || null,
      customBlocker: customBlockerDraft,
    })
  }
  function handleCloseWithSave() {
    commit()
    onClose()
  }

  function renderEditableField({
    fieldKey,
    value,
    onChange,
    editable = true,
    multiline = false,
    rows = 4,
    placeholder,
  }: {
    fieldKey: string
    value: string
    onChange: (value: string) => void
    editable?: boolean
    multiline?: boolean
    rows?: number
    placeholder?: string
  }) {
    const isEditing = editable && activeTextField === fieldKey

    if (!isEditing) {
      return (
        <div
          role={editable ? 'button' : undefined}
          tabIndex={editable ? 0 : -1}
          className={multiline ? 'panel-textarea' : 'panel-input'}
          onClick={() => {
            if (editable) {
              setActiveTextField(fieldKey)
            }
          }}
          onKeyDown={(event) => {
            if (editable && (event.key === 'Enter' || event.key === ' ')) {
              event.preventDefault()
              setActiveTextField(fieldKey)
            }
          }}
        >
          {value.trim() ? <LinkifiedText text={value} /> : '—'}
        </div>
      )
    }

    if (multiline) {
      return (
        <textarea
          className="panel-textarea"
          value={value}
          onChange={(event) => onChange(event.target.value)}
          onBlur={() => {
            setActiveTextField(null)
            commit()
          }}
          rows={rows}
          autoFocus
          placeholder={placeholder}
        />
      )
    }

    return (
      <input
        className="panel-input"
        value={value}
        onChange={(event) => onChange(event.target.value)}
        onBlur={() => {
          setActiveTextField(null)
          commit()
        }}
        autoFocus
        placeholder={placeholder}
      />
    )
  }

  function updateUrlDraft(
    setter: Dispatch<SetStateAction<string[]>>,
    index: number,
    value: string,
  ) {
    setter((previous) => previous.map((item, itemIndex) => (itemIndex === index ? value : item)))
  }

  function addUrlDraftRow(setter: Dispatch<SetStateAction<string[]>>) {
    setter((previous) => [...previous, ''])
  }

  function removeUrlDraftRow(setter: Dispatch<SetStateAction<string[]>>, index: number) {
    setter((previous) => {
      const next = previous.filter((_, itemIndex) => itemIndex !== index)
      return next.length > 0 ? next : ['']
    })
    setTimeout(commit, 0)
  }

  function renderEditableUrlList({
    fieldKey,
    values,
    onChange,
    placeholder,
  }: {
    fieldKey: string
    values: string[]
    onChange: Dispatch<SetStateAction<string[]>>
    placeholder: string
  }) {
    if (!canEditAssignedCard) {
      const readonlyLinks = values.map((value) => value.trim()).filter(Boolean)
      if (readonlyLinks.length === 0) {
        return <div className="muted-copy">—</div>
      }
      return (
        <div className="multi-link-list">
          {readonlyLinks.map((link, index) => (
            <a key={`${fieldKey}-readonly-${index}`} href={link} target="_blank" rel="noopener noreferrer">
              {link}
            </a>
          ))}
        </div>
      )
    }

    return (
      <div className="multi-link-list">
        {values.map((value, index) => (
          <div key={`${fieldKey}-${index}`} className="multi-link-row">
            <input
              className="panel-input"
              value={value}
              onChange={(event) => updateUrlDraft(onChange, index, event.target.value)}
              onBlur={commit}
              placeholder={placeholder}
            />
            <button
              type="button"
              className="icon-button"
              aria-label={`Remove ${fieldKey} link ${index + 1}`}
              onClick={() => removeUrlDraftRow(onChange, index)}
            >
              x
            </button>
            {index === values.length - 1 ? (
              <button
                type="button"
                className="icon-button"
                aria-label={`Add ${fieldKey} link`}
                onClick={() => addUrlDraftRow(onChange)}
              >
                +
              </button>
            ) : null}
          </div>
        ))}
      </div>
    )
  }

  return (
    <>
      <div
        className={`panel-overlay ${isOpen ? 'is-visible' : ''}`}
        aria-hidden="true"
        onClick={handleCloseWithSave}
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
            <h2 id={titleId} className="panel-title">
              {card.title}
            </h2>
            <p className="muted-copy">Brand: {card.brand}</p>
          </div>
          <button type="button" className="icon-button" onClick={handleCloseWithSave} aria-label="Close card details">
            ×
          </button>
        </div>

        <div className="slide-panel-content">
          <section className="panel-section">
            <h3>Task Description</h3>
            {renderEditableField({
              fieldKey: 'taskDescription',
              value: taskDescriptionDraft,
              onChange: setTaskDescriptionDraft,
              editable: canEditAssignedCard,
              multiline: true,
              rows: 6,
            })}
          </section>

          <section className="panel-section">
            <h3>Loom Video URL</h3>
            {renderEditableUrlList({
              fieldKey: 'loomVideoUrl',
              values: loomVideoUrlDraft,
              onChange: setLoomVideoUrlDraft,
              placeholder: 'https://www.loom.com/share/...',
            })}
          </section>

          <section className="panel-section">
            <h3>New URL to Use</h3>
            {renderEditableUrlList({
              fieldKey: 'newUrlToUse',
              values: newUrlToUseDraft,
              onChange: setNewUrlToUseDraft,
              placeholder: 'https://example.com/new-page',
            })}
          </section>

          <section className="panel-section panel-grid-2">
            <label className="panel-field">
              <span>Assignee</span>
              <select
                className="panel-input"
                value={assigneeIdDraft}
                disabled={!canEditAssignedCard}
                onChange={(event) => {
                  setAssigneeIdDraft(event.target.value)
                  onSave(card.id, { assigneeId: event.target.value || null })
                }}
              >
                <option value="">Unassigned</option>
                {teamMembers.map((member) => (
                  <option key={member.id} value={member.id}>
                    {member.name}
                  </option>
                ))}
              </select>
            </label>

            <label className="panel-field">
              <span>Due Date</span>
              <input
                type="date"
                className="panel-input"
                value={dueDateDraft}
                disabled={!canEditAssignedCard}
                onChange={(event) => {
                  setDueDateDraft(event.target.value)
                  onSave(card.id, { dueDate: event.target.value || null })
                }}
              />
            </label>
          </section>

          <section className="panel-section">
            <label className="panel-field">
              <span>Type of Change/Request</span>
              <select
                className="panel-input"
                value={changeRequestTypeDraft}
                disabled={!canEditAssignedCard}
                onChange={(event) => {
                  const value = event.target.value as DevChangeRequestType
                  setChangeRequestTypeDraft(value)
                  onSave(card.id, { changeRequestType: value })
                }}
              >
                {DEV_CHANGE_REQUEST_TYPES.map((option) => (
                  <option key={option} value={option}>
                    {option}
                  </option>
                ))}
              </select>
            </label>
          </section>

          <section className="panel-section">
            <label className="panel-field">
              <span>Status</span>
              <select
                className="panel-input"
                value={statusDraft}
                disabled={!canEditAssignedCard}
                onChange={(event) => {
                  const value = event.target.value as NonNullable<DevCard['status']>
                  setStatusDraft(value)
                  onSave(card.id, { status: value })
                }}
              >
                <option value="not-started">Not Started</option>
                <option value="in-progress">In Progress</option>
                <option value="done">Done</option>
              </select>
            </label>
          </section>

          <section className="panel-section">
            <label className="panel-field">
              <span>Blocker</span>
              <select
                className="panel-input"
                value={blockerOptionDraft}
                disabled={!canEditAssignedCard}
                onChange={(event) => {
                  const nextOption = (event.target.value || '') as DevBlockerOption | ''
                  setBlockerOptionDraft(nextOption)
                  onSave(card.id, {
                    blockerOption: nextOption || null,
                    customBlocker: nextOption === 'Custom…' ? customBlockerDraft : '',
                  })
                }}
              >
                <option value="">No active blocker</option>
                {DEV_BLOCKER_OPTIONS.map((option) => (
                  <option key={option} value={option}>
                    {option}
                  </option>
                ))}
              </select>
            </label>
            {blockerOptionDraft === 'Custom…' ? (
              <label className="panel-field">
                <span>Custom blocker details</span>
                {renderEditableField({
                  fieldKey: 'customBlocker',
                  value: customBlockerDraft,
                  onChange: setCustomBlockerDraft,
                  editable: canEditAssignedCard,
                  placeholder: 'Describe what is blocking this task',
                })}
              </label>
            ) : null}
            {blockerDetails ? <p className="muted-copy">Active blocker: {blockerDetails}</p> : null}
          </section>
        </div>

        <div className="slide-panel-footer">
          <button
            type="button"
            className="ghost-button"
            onClick={() => onDelete(card.id)}
            disabled={!canEditAssignedCard}
          >
            Delete card
          </button>
          <button type="button" className="primary-button" onClick={handleCloseWithSave}>
            Done
          </button>
        </div>
      </aside>
    </>
  )
}
