import { useId, useRef } from 'react'
import { useModalAccessibility } from '../hooks/useModalAccessibility'
import {
  DEV_BLOCKER_PRESETS,
  DEV_CHANGE_REQUEST_TYPES,
  type DevBlockerPreset,
  type DevCard,
} from '../board'
import { XIcon } from './icons/AppIcons'

interface DevCardDetailPanelProps {
  card: DevCard | null
  isOpen: boolean
  teamMemberNames: string[]
  onClose: () => void
  onSave: (updates: Partial<DevCard>) => void
}

export function DevCardDetailPanel({
  card,
  isOpen,
  teamMemberNames,
  onClose,
  onSave,
}: DevCardDetailPanelProps) {
  const panelRef = useRef<HTMLElement | null>(null)
  const titleId = useId()

  useModalAccessibility(panelRef, isOpen)

  if (!card) {
    return null
  }

  const blockerPreset = card.blocker?.preset ?? ''
  const customBlockerDraft = card.blocker?.preset === 'custom' ? card.blocker.details : ''

  function handleBlockerPresetChange(value: string) {
    if (!card) {
      return
    }

    if (!value) {
      onSave({ blocker: null })
      return
    }

    const preset = value as DevBlockerPreset
    if (!DEV_BLOCKER_PRESETS.includes(preset)) {
      return
    }

    if (preset === 'waiting-for-images-videos') {
      onSave({
        blocker: {
          preset,
          details: 'Waiting for images/videos',
        },
      })
      return
    }

    onSave({
      blocker: {
        preset,
        details: card.blocker?.preset === 'custom' ? card.blocker.details : '',
      },
    })
  }

  return (
    <>
      <div className={`panel-overlay ${isOpen ? 'is-visible' : ''}`} aria-hidden="true" onClick={onClose} />
      <aside
        ref={panelRef}
        className={`slide-panel dev-detail-panel ${isOpen ? 'is-open' : ''}`}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        tabIndex={-1}
      >
        <div className="slide-panel-header">
          <div className="slide-panel-header-main">
            <div className="panel-card-id">{card.id}</div>
            <h2 id={titleId} className="panel-title">{card.title}</h2>
          </div>
          <button type="button" className="close-icon-button" aria-label="Close dev card detail panel" onClick={onClose}>
            <XIcon />
          </button>
        </div>

        <section className="panel-section">
          <div className="section-rule-title">Task Details</div>
          <div className="metadata-grid">
            <label className="dev-panel-field dev-panel-field-full">
              <span>Task Description</span>
              <textarea
                value={card.taskDescription}
                rows={6}
                onChange={(event) => onSave({ taskDescription: event.target.value })}
              />
            </label>

            <label className="dev-panel-field dev-panel-field-full">
              <span>Loom Video URL (optional)</span>
              <input
                type="url"
                value={card.loomVideoUrl}
                placeholder="https://www.loom.com/share/..."
                onChange={(event) => onSave({ loomVideoUrl: event.target.value })}
              />
            </label>

            <label className="dev-panel-field dev-panel-field-full">
              <span>New URL to Use</span>
              <input
                value={card.newUrlToUse}
                onChange={(event) => onSave({ newUrlToUse: event.target.value })}
                placeholder="https://..."
              />
            </label>

            <label className="dev-panel-field">
              <span>Assignee</span>
              <select value={card.assignee} onChange={(event) => onSave({ assignee: event.target.value })}>
                <option value="">Unassigned</option>
                {teamMemberNames.map((name) => (
                  <option key={name} value={name}>
                    {name}
                  </option>
                ))}
              </select>
            </label>

            <label className="dev-panel-field">
              <span>Due Date</span>
              <input
                type="date"
                value={card.dueDate}
                onChange={(event) => onSave({ dueDate: event.target.value })}
              />
            </label>

            <label className="dev-panel-field dev-panel-field-full">
              <span>Type of Change/Request</span>
              <select
                value={card.changeRequestType}
                onChange={(event) => onSave({ changeRequestType: event.target.value as DevCard['changeRequestType'] })}
              >
                {DEV_CHANGE_REQUEST_TYPES.map((option) => (
                  <option key={option} value={option}>
                    {option}
                  </option>
                ))}
              </select>
            </label>
          </div>
        </section>

        <section className="panel-section">
          <div className="section-rule-title">Blocker</div>
          <div className="metadata-grid">
            <label className="dev-panel-field dev-panel-field-full">
              <span>Blocker Status</span>
              <select value={blockerPreset} onChange={(event) => handleBlockerPresetChange(event.target.value)}>
                <option value="">No blocker</option>
                <option value="waiting-for-images-videos">Waiting for images/videos</option>
                <option value="custom">Custom…</option>
              </select>
            </label>

            {blockerPreset === 'custom' ? (
              <label className="dev-panel-field dev-panel-field-full">
                <span>Custom Blocker</span>
                <input
                  value={customBlockerDraft}
                  onChange={(event) => {
                    const nextValue = event.target.value
                    onSave({ blocker: { preset: 'custom', details: nextValue.trim() } })
                  }}
                  placeholder="Describe blocker"
                />
              </label>
            ) : null}

            {card.blocker ? (
              <div className="dev-blocker-readout dev-panel-field-full">
                <strong>Active blocker:</strong> {card.blocker.details || 'Custom blocker'}
              </div>
            ) : null}
          </div>
        </section>
      </aside>
    </>
  )
}
