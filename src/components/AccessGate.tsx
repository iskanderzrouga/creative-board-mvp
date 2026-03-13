interface AccessGateProps {
  email: string
  message: string
  title?: string
  description?: string
  onRetry?: () => void
  onUseDifferentEmail?: () => void
  signOutPending?: boolean
  onSignOut: () => void
}

export function AccessGate({
  email,
  message,
  title = 'Access needed',
  description = 'Your sign-in worked, but this account still needs workspace access from the owner before the shared board can open.',
  onRetry,
  onUseDifferentEmail,
  signOutPending = false,
  onSignOut,
}: AccessGateProps) {
  return (
    <div className="auth-shell">
      <div className="auth-card">
        <div className="auth-copy">
          <span className="auth-kicker">Editors Board</span>
          <h1>{title}</h1>
          <p>{description}</p>
        </div>

        <div className="auth-status-card">
          <strong>{email}</strong>
          <span>{message}</span>
        </div>

        <div className="auth-actions">
          {onRetry ? (
            <button type="button" className="primary-button" onClick={onRetry}>
              Retry
            </button>
          ) : null}
          {onUseDifferentEmail ? (
            <button
              type="button"
              className="ghost-button"
              disabled={signOutPending}
              onClick={onUseDifferentEmail}
            >
              Try a different email
            </button>
          ) : null}
          <button
            type="button"
            className="ghost-button"
            disabled={signOutPending}
            onClick={onSignOut}
          >
            {signOutPending ? 'Signing out...' : 'Sign out'}
          </button>
        </div>
      </div>
    </div>
  )
}
