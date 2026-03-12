import { useId, useRef } from 'react'
import {
  getTaskTypeGroups,
  type GlobalSettings,
  type Portfolio,
  type QuickCreateInput,
} from '../board'
import { useModalAccessibility } from '../hooks/useModalAccessibility'

interface QuickCreateModalProps {
  portfolio: Portfolio
  settings: GlobalSettings
  value: QuickCreateInput
  onChange: (updates: Partial<QuickCreateInput>) => void
  onClose: () => void
  onCreate: (openDetail: boolean) => void
}

export function QuickCreateModal({
  portfolio,
  settings,
  value,
  onChange,
  onClose,
  onCreate,
}: QuickCreateModalProps) {
  const modalRef = useRef<HTMLDivElement | null>(null)
  const titleId = useId()
  useModalAccessibility(modalRef, true)

  return (
    <>
      <div className="modal-overlay" aria-hidden="true" onClick={onClose} />
      <div
        ref={modalRef}
        className="quick-create-modal"
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        tabIndex={-1}
      >
        <div className="quick-create-head">
          <strong id={titleId}>New Card</strong>
          <button
            type="button"
            className="close-icon-button"
            aria-label="Close new card dialog"
            onClick={onClose}
          >
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
