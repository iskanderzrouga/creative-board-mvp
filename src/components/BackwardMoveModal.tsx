import { useId, useRef } from 'react'
import {
  formatHours,
  getRevisionReasonById,
  type Card,
  type GlobalSettings,
  type StageId,
} from '../board'
import { useModalAccessibility } from '../hooks/useModalAccessibility'

interface BackwardMoveFormState {
  reasonId: string
  otherReason: string
  estimatedHours: number | ''
}

interface BackwardMoveModalProps {
  card: Card
  destinationStage: StageId
  settings: GlobalSettings
  formState: BackwardMoveFormState
  onChange: (updates: Partial<BackwardMoveFormState>) => void
  onCancel: () => void
  onConfirm: () => void
}

function getSortedRevisionReasons(settings: GlobalSettings) {
  return settings.revisionReasons.slice().sort((left, right) => left.order - right.order)
}

export function BackwardMoveModal({
  card,
  destinationStage,
  settings,
  formState,
  onChange,
  onCancel,
  onConfirm,
}: BackwardMoveModalProps) {
  const modalRef = useRef<HTMLDivElement | null>(null)
  const titleId = useId()
  const reasons = getSortedRevisionReasons(settings)
  const selectedReason = getRevisionReasonById(settings, formState.reasonId)
  const otherSelected = selectedReason?.id === 'revision-other'
  const canConfirm =
    Boolean(selectedReason) &&
    Boolean(formState.estimatedHours) &&
    Number(formState.estimatedHours) > 0 &&
    (!otherSelected || formState.otherReason.trim())

  useModalAccessibility(modalRef, true)

  return (
    <>
      <div className="modal-overlay" aria-hidden="true" onClick={onCancel} />
      <div
        ref={modalRef}
        className="backward-move-modal"
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        tabIndex={-1}
      >
        <div className="quick-create-head">
          <strong id={titleId}>{`Moving ${card.id} back to ${destinationStage}`}</strong>
        </div>

        <div className="backward-move-body">
          <span>Why?</span>
          {reasons.map((reason) => (
            <label key={reason.id} className="radio-option">
              <input
                type="radio"
                checked={formState.reasonId === reason.id}
                onChange={() =>
                  onChange({
                    reasonId: reason.id,
                    estimatedHours: reason.estimatedHours,
                    otherReason: reason.id === 'revision-other' ? formState.otherReason : '',
                  })
                }
              />
              <span>{`${reason.name} · ${formatHours(reason.estimatedHours)}`}</span>
            </label>
          ))}
          {otherSelected ? (
            <input
              value={formState.otherReason}
              onChange={(event) => onChange({ otherReason: event.target.value })}
              placeholder="Other reason"
            />
          ) : null}
          <label className="backward-move-estimate">
            <span>Revision estimate</span>
            <input
              type="number"
              min={1}
              step={0.5}
              value={formState.estimatedHours}
              onChange={(event) =>
                onChange({
                  estimatedHours: event.target.value ? Number(event.target.value) : '',
                })
              }
            />
          </label>
        </div>

        <div className="quick-create-actions">
          <button type="button" className="ghost-button" onClick={onCancel}>
            Cancel
          </button>
          <button type="button" className="primary-button" disabled={!canConfirm} onClick={onConfirm}>
            Move Back
          </button>
        </div>
      </div>
    </>
  )
}
