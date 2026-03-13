interface AccessVerificationGateProps {
  email: string
  timedOut: boolean
  signOutPending?: boolean
  onRetry: () => void
  onUseDifferentEmail?: () => void
  onSignOut: () => void
}

export function AccessVerificationGate({
  email,
  timedOut,
  signOutPending = false,
  onRetry,
  onUseDifferentEmail,
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
              ? 'This is taking longer than expected. Retry the check, try a different email, or contact your workspace owner if this account should already be approved.'
              : 'Confirming your role and workspace access...'}
          </span>
        </div>

        {timedOut ? (
          <div className="auth-actions">
            <button type="button" className="primary-button" onClick={onRetry}>
              Retry check
            </button>
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
        ) : null}
      </div>
    </div>
  )
}
