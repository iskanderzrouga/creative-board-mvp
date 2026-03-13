import { XIcon } from './icons/AppIcons'

interface ToastStackItem {
  id: number
  message: string
  tone: 'green' | 'amber' | 'red' | 'blue'
}

interface ToastStackProps {
  toasts: ToastStackItem[]
  onDismiss: (id: number) => void
}

export function ToastStack({ toasts, onDismiss }: ToastStackProps) {
  if (toasts.length === 0) {
    return null
  }

  return (
    <div className="toast-stack" aria-live="polite" aria-atomic="false">
      {toasts.map((toast) => (
        <div key={toast.id} className={`toast tone-${toast.tone}`} role="status" aria-live="polite">
          <span>{toast.message}</span>
          <button
            type="button"
            className="toast-dismiss"
            aria-label="Dismiss notification"
            onClick={() => onDismiss(toast.id)}
          >
            <XIcon />
          </button>
        </div>
      ))}
    </div>
  )
}
