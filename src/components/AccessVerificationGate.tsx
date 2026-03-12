interface AccessVerificationGateProps {
  email: string
  timedOut: boolean
  onRetry: () => void
  onSignOut: () => void
}

export function AccessVerificationGate({
  email,
  timedOut,
  onRetry,
  onSignOut,
}: AccessVerificationGateProps) {
  return (
    <div className="auth-shell">
      <div className="auth-card">
        <div className="auth-copy">
          <span className="auth-kicker">Editors Board</span>
          <h1>Checking access</h1>
          <p>
            We are confirming this account against the workspace access list before opening the
            shared board.
          </p>
        </div>

        <div className="auth-status-card" aria-live="polite">
          <strong>{email}</strong>
          <span>
            {timedOut
              ? 'This is taking longer than expected. You can retry the check or sign out and try again.'
              : 'Confirming your role and workspace access...'}
          </span>
        </div>

        {timedOut ? (
          <div className="auth-actions">
            <button type="button" className="primary-button" onClick={onRetry}>
              Retry check
            </button>
            <button type="button" className="ghost-button" onClick={onSignOut}>
              Sign out
            </button>
          </div>
        ) : null}
      </div>
    </div>
  )
}
