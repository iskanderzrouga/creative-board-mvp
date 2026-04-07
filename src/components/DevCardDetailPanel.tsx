import { useId, useMemo, useRef, useState } from 'react'
import { useModalAccessibility } from '../hooks/useModalAccessibility'
import {
  DEV_BLOCKER_OPTIONS,
  DEV_CHANGE_REQUEST_TYPES,
  getDevCardBlockerReason,
  type DevBlockerOption,
  type DevCard,
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
  const [taskDescriptionDraft, setTaskDescriptionDraft] = useState(card.taskDescription)
  const [loomVideoUrlDraft, setLoomVideoUrlDraft] = useState(card.loomVideoUrl)
  const [newUrlToUseDraft, setNewUrlToUseDraft] = useState(card.newUrlToUse)
  const [assigneeIdDraft, setAssigneeIdDraft] = useState<string>(card.assigneeId ?? '')
  const [dueDateDraft, setDueDateDraft] = useState<string>(card.dueDate ?? '')
  const [changeRequestTypeDraft, setChangeRequestTypeDraft] = useState<DevChangeRequestType>(card.changeRequestType)
  const [blockerOptionDraft, setBlockerOptionDraft] = useState<DevBlockerOption | ''>(card.blockerOption ?? '')
  const [customBlockerDraft, setCustomBlockerDraft] = useState(card.customBlocker)
  const [statusDraft, setStatusDraft] = useState<NonNullable<DevCard['status']>>(card.status ?? 'not-started')

  useModalAccessibility(panelRef, isOpen)

  const blockerDetails = useMemo(() => getDevCardBlockerReason(card), [card])

  function commit() {
    onSave(card.id, {
      taskDescription: taskDescriptionDraft,
      loomVideoUrl: loomVideoUrlDraft,
      newUrlToUse: newUrlToUseDraft,
      assigneeId: assigneeIdDraft || null,
      dueDate: dueDateDraft || null,
      changeRequestType: changeRequestTypeDraft,
      blockerOption: blockerOptionDraft || null,
      customBlocker: customBlockerDraft,
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
