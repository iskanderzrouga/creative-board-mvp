import type { Card } from '../board'

interface DeleteCardModalProps {
  card: Card
  onCancel: () => void
  onConfirm: () => void
}

export function DeleteCardModal({ card, onCancel, onConfirm }: DeleteCardModalProps) {
  return (
    <>
      <div className="modal-overlay" onClick={onCancel} />
      <div className="backward-move-modal delete-card-modal" role="dialog" aria-modal="true">
        <div className="quick-create-head">
          <strong>{`Delete ${card.id}?`}</strong>
          <button type="button" className="close-icon-button" onClick={onCancel}>
            ×
          </button>
        </div>
        <p className="muted-copy">This will permanently remove the card from the board.</p>
        <div className="quick-create-actions">
          <button type="button" className="ghost-button" onClick={onCancel}>
            Cancel
          </button>
          <button type="button" className="primary-button danger-solid" onClick={onConfirm}>
            Delete card
          </button>
        </div>
      </div>
    </>
  )
}
