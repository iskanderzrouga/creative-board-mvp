import { ButtonSpinner } from './ButtonSpinner'

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
  const inlineValidationMessage =
    !errorMessage && email.trim().length > 0 && !canSubmit
      ? 'Enter a valid work email to continue.'
      : null
  const displayErrorMessage = errorMessage ?? inlineValidationMessage

  return (
    <div className="auth-shell">
      <div className="auth-card">
        <div className="auth-copy">
          <span className="auth-kicker">Editors Board</span>
          <h1>Team access</h1>
          <p>
            Use your work email to request access to this workspace. If the owner has already
            added that email, we will send a sign-in link and create the account automatically.
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
                aria-invalid={displayErrorMessage ? 'true' : 'false'}
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
                className={`primary-button ${pending ? 'is-loading' : ''}`}
                disabled={!canSubmit || pending}
                onClick={onSubmit}
              >
                {pending ? (
                  <>
                    <ButtonSpinner />
                    <span>Sending...</span>
                  </>
                ) : (
                  'Send Magic Link'
                )}
              </button>
            </div>

            {infoMessage ? <p className="auth-helper">{infoMessage}</p> : null}
            {displayErrorMessage ? <p className="auth-error">{displayErrorMessage}</p> : null}
          </div>
        )}
      </div>
    </div>
  )
}
