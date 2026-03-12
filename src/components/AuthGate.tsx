type AuthStatus = 'disabled' | 'checking' | 'signed-out' | 'signed-in'

interface AuthGateProps {
  authStatus: AuthStatus
  email: string
  pending: boolean
  errorMessage: string | null
  infoMessage: string | null
  onEmailChange: (value: string) => void
  onSubmit: () => void
}

function isLikelyEmail(value: string) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value.trim())
}

export function AuthGate({
  authStatus,
  email,
  pending,
  errorMessage,
  infoMessage,
  onEmailChange,
  onSubmit,
}: AuthGateProps) {
  const canSubmit = isLikelyEmail(email)

  return (
    <div className="auth-shell">
      <div className="auth-card">
        <div className="auth-copy">
          <span className="auth-kicker">Editors Board</span>
          <h1>Team access</h1>
          <p>
            Sign in with an approved work email to open the shared live workspace. The
            first approved sign-in creates the account automatically, and the saved
            state now lives in Supabase instead of only in this browser.
          </p>
        </div>

        {authStatus === 'checking' ? (
          <div className="auth-status-card">
            <strong>Checking your session...</strong>
            <span>If you already used a magic link, we are restoring your workspace.</span>
          </div>
        ) : (
          <div className="auth-form">
            <label className="quick-create-field full-width">
              <span>Work email</span>
              <input
                autoFocus
                type="email"
                value={email}
                placeholder="team@company.com"
                onChange={(event) => onEmailChange(event.target.value)}
                onKeyDown={(event) => {
                  if (event.key === 'Enter' && !pending) {
                    event.preventDefault()
                    onSubmit()
                  }
                }}
              />
            </label>

            <div className="auth-actions">
              <button
                type="button"
                className="primary-button"
                disabled={!canSubmit || pending}
                onClick={onSubmit}
              >
                {pending ? 'Sending...' : 'Send Magic Link'}
              </button>
            </div>

            {infoMessage ? <p className="auth-helper">{infoMessage}</p> : null}
            {errorMessage ? <p className="auth-error">{errorMessage}</p> : null}
          </div>
        )}
      </div>
    </div>
  )
}
