interface AccessGateProps {
  email: string
  message: string
  onSignOut: () => void
}

export function AccessGate({ email, message, onSignOut }: AccessGateProps) {
  return (
    <div className="auth-shell">
      <div className="auth-card">
        <div className="auth-copy">
          <span className="auth-kicker">Editors Board</span>
          <h1>Access restricted</h1>
          <p>
            This workspace is limited to approved team accounts. Your sign-in worked,
            but this email does not have permission to open the shared board yet.
          </p>
        </div>

        <div className="auth-status-card">
          <strong>{email}</strong>
          <span>{message}</span>
        </div>

        <div className="auth-actions">
          <button type="button" className="ghost-button" onClick={onSignOut}>
            Sign out
          </button>
        </div>
      </div>
    </div>
  )
}
