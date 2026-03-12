import { useRef } from 'react'
import { useModalAccessibility } from '../hooks/useModalAccessibility'

interface KeyboardShortcutsModalProps {
  onClose: () => void
}

const SHORTCUTS = [
  {
    keys: 'Cmd+N / Ctrl+N',
    description: 'Create a new card from the board',
  },
  {
    keys: 'Cmd+K / Ctrl+K',
    description: 'Focus the board search field',
  },
  {
    keys: 'Escape',
    description: 'Close the topmost panel or modal',
  },
] as const

export function KeyboardShortcutsModal({ onClose }: KeyboardShortcutsModalProps) {
  const modalRef = useRef<HTMLDivElement | null>(null)
  useModalAccessibility(modalRef, true)

  return (
    <>
      <div className="modal-overlay" onClick={onClose} />
      <div
        ref={modalRef}
        className="quick-create-modal shortcut-modal"
        role="dialog"
        aria-modal="true"
        aria-labelledby="keyboard-shortcuts-title"
      >
        <div className="quick-create-head">
          <div>
            <strong id="keyboard-shortcuts-title">Keyboard shortcuts</strong>
            <p className="shortcut-modal-copy">
              A few quick commands keep the board moving without hunting through menus.
            </p>
          </div>
          <button
            type="button"
            className="close-icon-button"
            aria-label="Close"
            onClick={onClose}
          >
            ×
          </button>
        </div>

        <div className="shortcut-list" aria-label="Keyboard shortcuts list">
          {SHORTCUTS.map((shortcut) => (
            <div key={shortcut.keys} className="shortcut-row">
              <kbd>{shortcut.keys}</kbd>
              <span>{shortcut.description}</span>
            </div>
          ))}
        </div>
      </div>
    </>
  )
}
