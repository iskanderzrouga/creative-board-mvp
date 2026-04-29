import { useId, useRef } from 'react'
import {
  formatHours,
  type Card,
  type StageId,
} from '../board'
import {
  getBackwardMoveReasonOptions,
  isBackwardMoveOtherReasonId,
} from '../appHelpers'
import { useModalAccessibility } from '../hooks/useModalAccessibility'
import { XIcon } from './icons/AppIcons'

interface BackwardMoveFormState {
  reasonId: string
  otherReason: string
  estimatedHours: number | ''
  feedback: string
}

interface BackwardMoveModalProps {
  card: Card
  sourceStage: StageId
  destinationStage: StageId
  formState: BackwardMoveFormState
  simpleReasonMode?: boolean
  onChange: (updates: Partial<BackwardMoveFormState>) => void
  onCancel: () => void
  onConfirm: () => void
}

export function BackwardMoveModal({
  card,
  sourceStage,
  destinationStage,
  formState,
  simpleReasonMode = false,
  onChange,
  onCancel,
  onConfirm,
}: BackwardMoveModalProps) {
  const modalRef = useRef<HTMLDivElement | null>(null)
  const titleId = useId()
  const reasons = getBackwardMoveReasonOptions(sourceStage)
  const selectedReason = reasons.find((reason) => reason.id === formState.reasonId) ?? null
  const otherSelected = isBackwardMoveOtherReasonId(selectedReason?.id)
  const hasValidEstimate =
    formState.estimatedHours === '' || Number(formState.estimatedHours) >= 0
  const canConfirm = simpleReasonMode
    ? Boolean(formState.feedback.trim()) && hasValidEstimate
    : Boolean(selectedReason) &&
      formState.estimatedHours !== '' &&
      Number(formState.estimatedHours) >= 0 &&
      (!otherSelected || formState.otherReason.trim())

  useModalAccessibility(modalRef, true)

  return (
    <>
      <div className="modal-overlay" aria-hidden="true" onClick={onCancel} />
      <div
        ref={modalRef}
        className={`backward-move-modal ${simpleReasonMode ? 'backward-move-modal-simple' : ''}`}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        tabIndex={-1}
      >
        <div className="quick-create-head">
          <h2 id={titleId}>{`Moving ${card.id} back to ${destinationStage}`}</h2>
          <button
            type="button"
            className="close-icon-button"
            aria-label="Close move-back dialog"
            onClick={onCancel}
          >
            <XIcon />
          </button>
        </div>

        <div className="backward-move-body">
          {simpleReasonMode ? (
            <>
              <label className="backward-move-feedback">
                <span>Reason</span>
                <textarea
                  rows={4}
                  maxLength={1000}
                  placeholder="Write why this is moving back..."
                  value={formState.feedback}
                  onChange={(event) => onChange({ feedback: event.target.value })}
                />
              </label>
              <label className="backward-move-estimate">
                <span>How long would this change take? (optional)</span>
                <input
                  type="number"
                  min={0}
                  step={0.5}
                  value={formState.estimatedHours}
                  onChange={(event) =>
                    onChange({
                      estimatedHours: event.target.value ? Number(event.target.value) : '',
                    })
                  }
                />
              </label>
            </>
          ) : (
            <>
              <fieldset className="backward-move-fieldset">
                <legend>Why?</legend>
                {reasons.map((reason) => (
                  <label key={reason.id} className="radio-option">
                    <input
                      type="radio"
                      name="revision-reason"
                      checked={formState.reasonId === reason.id}
                      onChange={() =>
                        onChange({
                          reasonId: reason.id,
                          estimatedHours: reason.estimatedHours,
                          otherReason: isBackwardMoveOtherReasonId(reason.id) ? formState.otherReason : '',
                        })
                      }
                    />
                    <span>{`${reason.name} · ${formatHours(reason.estimatedHours)}`}</span>
                  </label>
                ))}
              </fieldset>
              {otherSelected ? (
                <input
                  value={formState.otherReason}
                  onChange={(event) => onChange({ otherReason: event.target.value })}
                  placeholder="Other reason"
                />
              ) : null}
              <label className="backward-move-feedback">
                <span>Detailed Feedback</span>
                <textarea
                  rows={3}
                  maxLength={1000}
                  placeholder="Describe what needs to change..."
                  value={formState.feedback}
                  onChange={(event) => onChange({ feedback: event.target.value })}
                />
              </label>
              <label className="backward-move-estimate">
                <span>Estimated revision time (hours)</span>
                <input
                  type="number"
                  min={0}
                  step={0.5}
                  value={formState.estimatedHours}
                  onChange={(event) =>
                    onChange({
                      estimatedHours: event.target.value ? Number(event.target.value) : '',
                    })
                  }
                />
              </label>
            </>
          )}
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
