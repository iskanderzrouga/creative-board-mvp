import { useState } from 'react'
import { ButtonSpinner } from './ButtonSpinner'

type AuthStatus = 'disabled' | 'checking' | 'signed-out' | 'signed-in'

interface PasswordRecoveryGateProps {
  authStatus: AuthStatus
  email: string | null
  pending: boolean
  errorMessage: string | null
  onSubmit: (password: string) => void
  onBackToSignIn: () => void
}

export function PasswordRecoveryGate({
  authStatus,
  email,
  pending,
  errorMessage,
  onSubmit,
  onBackToSignIn,
}: PasswordRecoveryGateProps) {
  const [password, setPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')

  const validationMessage =
    password.length > 0 && password.length < 6
      ? 'Password must be at least 6 characters.'
      : confirmPassword.length > 0 && confirmPassword !== password
        ? 'Passwords do not match.'
        : null
  const canSubmit =
    authStatus === 'signed-in' &&
    password.length >= 6 &&
    confirmPassword === password &&
    !pending
  const visibleError = errorMessage ?? validationMessage

  if (authStatus === 'checking') {
    return (
      <div className="auth-shell">
        <div className="auth-card">
          <div className="auth-copy">
            <span className="auth-kicker">Editors Board</span>
            <h1>Reset password</h1>
            <p>Verifying your reset link so you can choose a new password.</p>
          </div>

          <div className="auth-status-card" aria-live="polite">
            <strong>Checking your recovery link...</strong>
            <span>This should only take a moment.</span>
          </div>
        </div>
      </div>
    )
  }

  if (authStatus !== 'signed-in') {
    return (
      <div className="auth-shell">
        <div className="auth-card">
          <div className="auth-copy">
            <span className="auth-kicker">Editors Board</span>
            <h1>Reset link expired</h1>
            <p>Request a new password reset link from the sign-in screen to continue.</p>
          </div>

          <div className="auth-status-card" aria-live="polite">
            <strong>We could not open this recovery link.</strong>
            <span>
              {errorMessage ?? 'The link may have expired, already been used, or been opened on a different device.'}
            </span>
          </div>

          <div className="auth-actions">
            <button type="button" className="ghost-button" onClick={onBackToSignIn}>
              Back to sign in
            </button>
          </div>
        </div>
      </div>
    )
  }

  return (
    <div className="auth-shell">
      <div className="auth-card">
        <div className="auth-copy">
          <span className="auth-kicker">Editors Board</span>
          <h1>Set a new password</h1>
          <p>
            {email ? `Choose a new password for ${email}.` : 'Choose a new password to finish resetting your account.'}
          </p>
        </div>

        <div className="auth-form">
          <label className="quick-create-field full-width">
            <span>New password</span>
            <input
              autoFocus
              type="password"
              value={password}
              placeholder="At least 6 characters"
              aria-invalid={visibleError ? 'true' : 'false'}
              onChange={(event) => setPassword(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === 'Enter' && canSubmit) {
                  event.preventDefault()
                  onSubmit(password)
                }
              }}
            />
          </label>

          <label className="quick-create-field full-width">
            <span>Confirm new password</span>
            <input
              type="password"
              value={confirmPassword}
              placeholder="Repeat your new password"
              aria-invalid={visibleError ? 'true' : 'false'}
              onChange={(event) => setConfirmPassword(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === 'Enter' && canSubmit) {
                  event.preventDefault()
                  onSubmit(password)
                }
              }}
            />
          </label>

          <div className="auth-actions">
            <button
              type="button"
              className={`primary-button ${pending ? 'is-loading' : ''}`}
              disabled={!canSubmit}
              onClick={() => onSubmit(password)}
            >
              {pending ? (
                <>
                  <ButtonSpinner />
                  <span>Updating...</span>
                </>
              ) : (
                'Update password'
              )}
            </button>
            <button type="button" className="ghost-button" disabled={pending} onClick={onBackToSignIn}>
              Back to sign in
            </button>
          </div>

          <p className="auth-helper">Use at least 6 characters. After saving, you can keep using the workspace.</p>
          {visibleError ? <p className="auth-error">{visibleError}</p> : null}
        </div>
      </div>
    </div>
  )
}
