import { useId, useRef, type ReactNode } from 'react'
import { useModalAccessibility } from '../hooks/useModalAccessibility'

interface ConfirmDialogProps {
  title: string
  message: ReactNode
  confirmLabel: string
  cancelLabel?: string
  confirmTone?: 'default' | 'danger'
  pending?: boolean
  onConfirm: () => void
  onCancel: () => void
}

export function ConfirmDialog({
  title,
  message,
  confirmLabel,
  cancelLabel = 'Cancel',
  confirmTone = 'danger',
  pending = false,
  onConfirm,
  onCancel,
}: ConfirmDialogProps) {
  const modalRef = useRef<HTMLDivElement | null>(null)
  const titleId = useId()
  const descriptionId = useId()

  useModalAccessibility(modalRef, true)

  return (
    <>
      <div className="modal-overlay" aria-hidden="true" onClick={onCancel} />
      <div
        ref={modalRef}
        className="backward-move-modal delete-card-modal confirm-dialog"
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        aria-describedby={descriptionId}
        tabIndex={-1}
      >
        <div className="quick-create-head">
          <strong id={titleId}>{title}</strong>
          <button
            type="button"
            className="close-icon-button"
            aria-label="Close confirmation dialog"
            onClick={onCancel}
          >
            ×
          </button>
        </div>

        <div id={descriptionId} className="confirm-dialog-copy">
          {message}
        </div>

        <div className="quick-create-actions">
          <button type="button" className="ghost-button" onClick={onCancel}>
            {cancelLabel}
          </button>
          <button
            type="button"
            className={`primary-button ${confirmTone === 'danger' ? 'danger-solid' : ''}`}
            disabled={pending}
            onClick={onConfirm}
          >
            {pending ? 'Working...' : confirmLabel}
          </button>
        </div>
      </div>
    </>
  )
}
