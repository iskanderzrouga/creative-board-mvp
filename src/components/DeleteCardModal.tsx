import { useId, useRef } from 'react'
import type { Card } from '../board'
import { useModalAccessibility } from '../hooks/useModalAccessibility'
import { XIcon } from './icons/AppIcons'

interface DeleteCardModalProps {
  card: Card
  pending?: boolean
  onCancel: () => void
  onConfirm: () => void
}

export function DeleteCardModal({ card, pending = false, onCancel, onConfirm }: DeleteCardModalProps) {
  const modalRef = useRef<HTMLDivElement | null>(null)
  const titleId = useId()
  const descriptionId = useId()
  useModalAccessibility(modalRef, true)

  return (
    <>
      <div className="modal-overlay" aria-hidden="true" onClick={pending ? undefined : onCancel} />
      <div
        ref={modalRef}
        className="backward-move-modal delete-card-modal"
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        aria-describedby={descriptionId}
        tabIndex={-1}
      >
        <div className="quick-create-head">
          <h2 id={titleId}>{`Delete ${card.id}?`}</h2>
          <button
            type="button"
            className="close-icon-button"
            aria-label="Close delete card dialog"
            disabled={pending}
            onClick={onCancel}
          >
            <XIcon />
          </button>
        </div>
        <p id={descriptionId} className="muted-copy">
          {`This will permanently remove "${card.title}" (${card.id}) from the board.`}
        </p>
        <div className="quick-create-actions">
          <button type="button" className="ghost-button" disabled={pending} onClick={onCancel}>
            Cancel
          </button>
          <button type="button" className="primary-button danger-solid" disabled={pending} onClick={onConfirm}>
            {pending ? 'Deleting...' : 'Delete card'}
          </button>
        </div>
      </div>
    </>
  )
}
