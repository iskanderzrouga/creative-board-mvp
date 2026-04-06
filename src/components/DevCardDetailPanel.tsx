import { useEffect, useId, useMemo, useRef, useState } from 'react'
import { useModalAccessibility } from '../hooks/useModalAccessibility'
import {
  DEV_BLOCKER_OPTIONS,
  DEV_CHANGE_REQUEST_TYPES,
  DEV_CARD_STATUSES,
  getDevCardBlockerReason,
  type DevBlockerOption,
  type DevCard,
  type DevCardStatus,
  type DevChangeRequestType,
  type TeamMember,
} from '../board'

interface DevCardDetailPanelProps {
  card: DevCard
  teamMembers: TeamMember[]
  isOpen: boolean
  onClose: () => void
  onSave: (cardId: string, updates: Partial<DevCard>) => void
  onDelete: (cardId: string) => void
}

function getStatusLabel(status: DevCardStatus) {
  if (status === 'working') {
    return 'Working on It'
  }
  if (status === 'ready-today') {
    return 'Ready by Today'
  }
  return 'To Do'
}

function getStatusClassName(status: DevCardStatus) {
  if (status === 'working') {
    return 'is-working'
  }
  if (status === 'ready-today') {
    return 'is-ready-today'
  }
  return 'is-todo'
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
  const notesDebounceRef = useRef<number | null>(null)
  const [taskDescriptionDraft, setTaskDescriptionDraft] = useState(card.taskDescription)
  const [loomVideoUrlDraft, setLoomVideoUrlDraft] = useState(card.loomVideoUrl)
  const [newUrlToUseDraft, setNewUrlToUseDraft] = useState(card.newUrlToUse)
  const [notesDraft, setNotesDraft] = useState(card.notes)
  const [assigneeIdDraft, setAssigneeIdDraft] = useState<string>(card.assigneeId ?? '')
  const [dueDateDraft, setDueDateDraft] = useState<string>(card.dueDate ?? '')
  const [changeRequestTypeDraft, setChangeRequestTypeDraft] = useState<DevChangeRequestType>(card.changeRequestType)
  const [statusDraft, setStatusDraft] = useState<DevCardStatus>(card.status)
  const [blockerOptionDraft, setBlockerOptionDraft] = useState<DevBlockerOption | ''>(card.blockerOption ?? '')
  const [customBlockerDraft, setCustomBlockerDraft] = useState(card.customBlocker)

  useModalAccessibility(panelRef, isOpen)

  const blockerDetails = useMemo(() => getDevCardBlockerReason(card), [card])

  function clearNotesDebounce() {
    if (notesDebounceRef.current !== null && typeof window !== 'undefined') {
      window.clearTimeout(notesDebounceRef.current)
      notesDebounceRef.current = null
    }
  }

  function commitNotes(value: string) {
    clearNotesDebounce()
    if (value !== card.notes) {
      onSave(card.id, { notes: value })
    }
  }

  function commit() {
    onSave(card.id, {
      taskDescription: taskDescriptionDraft,
      loomVideoUrl: loomVideoUrlDraft,
      newUrlToUse: newUrlToUseDraft,
      notes: notesDraft,
      assigneeId: assigneeIdDraft || null,
      dueDate: dueDateDraft || null,
      changeRequestType: changeRequestTypeDraft,
      status: statusDraft,
      blockerOption: blockerOptionDraft || null,
      customBlocker: customBlockerDraft,
    })
  }

  useEffect(() => {
    if (!isOpen || notesDraft === card.notes || typeof window === 'undefined') {
      return
    }
    clearNotesDebounce()
    notesDebounceRef.current = window.setTimeout(() => {
      onSave(card.id, { notes: notesDraft })
      notesDebounceRef.current = null
    }, 500)

    return () => {
      clearNotesDebounce()
    }
  }, [card.id, card.notes, isOpen, notesDraft, onSave])

  useEffect(() => {
    return () => {
      clearNotesDebounce()
    }
  }, [])

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
            <h2 id={titleId} className="panel-title">
              {card.title}
            </h2>
            <p className="muted-copy">Brand: {card.brand}</p>
          </div>
          <button type="button" className="icon-button" onClick={onClose} aria-label="Close card details">
            ×
          </button>
        </div>

        <div className="slide-panel-content">
          <section className="panel-section">
            <h3>Task Description</h3>
            <textarea
              className="panel-textarea"
              value={taskDescriptionDraft}
              onChange={(event) => setTaskDescriptionDraft(event.target.value)}
              onBlur={commit}
              rows={6}
              required
            />
          </section>

          <section className="panel-section">
            <h3>Loom Video URL</h3>
            <input
              className="panel-input"
              value={loomVideoUrlDraft}
              onChange={(event) => setLoomVideoUrlDraft(event.target.value)}
              onBlur={commit}
              placeholder="https://www.loom.com/share/..."
            />
          </section>

          <section className="panel-section">
            <h3>New URL to Use</h3>
            <input
              className="panel-input"
              value={newUrlToUseDraft}
              onChange={(event) => setNewUrlToUseDraft(event.target.value)}
              onBlur={commit}
              placeholder="https://example.com/new-page"
            />
          </section>

          <section className="panel-section">
            <h3>Notes / Updates</h3>
            <textarea
              className="panel-textarea"
              value={notesDraft}
              onChange={(event) => setNotesDraft(event.target.value)}
              onBlur={() => commitNotes(notesDraft)}
              rows={5}
              placeholder="Share progress, blockers, and manager updates"
            />
          </section>

          <section className="panel-section panel-grid-2">
            <label className="panel-field">
              <span>Assignee</span>
              <select
                className="panel-input"
                value={assigneeIdDraft}
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
                onChange={(event) => {
                  const value = event.target.value as DevCardStatus
                  setStatusDraft(value)
                  onSave(card.id, { status: value })
                }}
              >
                {DEV_CARD_STATUSES.map((status) => (
                  <option key={status} value={status}>
                    {getStatusLabel(status)}
                  </option>
                ))}
              </select>
            </label>
            <p className="muted-copy">
              Current status:{' '}
              <span className={`dev-status-badge ${getStatusClassName(statusDraft)}`}>{getStatusLabel(statusDraft)}</span>
            </p>
          </section>

          <section className="panel-section">
            <label className="panel-field">
              <span>Blocker</span>
              <select
                className="panel-input"
                value={blockerOptionDraft}
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
                <input
                  className="panel-input"
                  value={customBlockerDraft}
                  onChange={(event) => setCustomBlockerDraft(event.target.value)}
                  onBlur={commit}
                  placeholder="Describe what is blocking this task"
                />
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
          >
            Delete card
          </button>
          <button type="button" className="primary-button" onClick={onClose}>
            Done
          </button>
        </div>
      </aside>
    </>
  )
}
