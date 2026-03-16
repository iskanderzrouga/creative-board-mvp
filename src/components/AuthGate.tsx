import { useState } from 'react'
import { ButtonSpinner } from './ButtonSpinner'
import { resetPasswordForEmail } from '../supabase'

type AuthStatus = 'disabled' | 'checking' | 'signed-out' | 'signed-in'
type AuthView = 'auth' | 'forgot-password'

interface AuthGateProps {
  authStatus: AuthStatus
  email: string
  pending: boolean
  errorMessage: string | null
  infoMessage: string | null
  onEmailChange: (value: string) => void
  onPasswordSubmit: (password: string) => void
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
  onPasswordSubmit,
}: AuthGateProps) {
  const [password, setPassword] = useState('')
  const [view, setView] = useState<AuthView>('auth')
  const [resetEmail, setResetEmail] = useState('')
  const [resetPending, setResetPending] = useState(false)
  const [resetSuccess, setResetSuccess] = useState(false)
  const [resetError, setResetError] = useState<string | null>(null)

  const canSubmit = isLikelyEmail(email) && password.length >= 6
  const inlineValidationMessage =
    !errorMessage && email.trim().length > 0 && !isLikelyEmail(email)
      ? 'Enter a valid email address.'
      : !errorMessage && password.length > 0 && password.length < 6
        ? 'Password must be at least 6 characters.'
        : null
  const displayErrorMessage = errorMessage ?? inlineValidationMessage

  function handleSubmit() {
    if (!canSubmit || pending) return
    onPasswordSubmit(password)
  }

  function handleForgotPasswordClick() {
    setResetEmail(email)
    setResetPending(false)
    setResetSuccess(false)
    setResetError(null)
    setView('forgot-password')
  }

  function handleBackToSignIn() {
    setView('auth')
    setResetEmail('')
    setResetPending(false)
    setResetSuccess(false)
    setResetError(null)
  }

  async function handleSendResetLink() {
    const trimmed = resetEmail.trim()
    if (!trimmed) {
      setResetError('Enter your email address.')
      return
    }

    if (!isLikelyEmail(trimmed)) {
      setResetError('Enter a valid email address.')
      return
    }

    setResetPending(true)
    setResetError(null)

    try {
      await resetPasswordForEmail(trimmed)
      setResetSuccess(true)
    } catch (error) {
      setResetError(
        error instanceof Error ? error.message : 'Could not send the reset link. Try again.',
      )
    } finally {
      setResetPending(false)
    }
  }

  if (view === 'forgot-password') {
    return (
      <div className="auth-shell">
        <div className="auth-card">
          <div className="auth-copy">
            <span className="auth-kicker">Editors Board</span>
            <h1>Reset password</h1>
            <p>
              {resetSuccess
                ? 'If this email is approved for the workspace, a password email is on the way.'
                : 'Enter your approved work email and we will send you a link to set or reset your password.'}
            </p>
          </div>

          {resetSuccess ? (
            <div className="auth-form">
              <p className="auth-helper">
                Sent to {resetEmail.trim().toLowerCase()}. Check spam too. If you were just added to the workspace, this email also helps finish setting up your account.
              </p>
              <div className="auth-switch">
                <p className="auth-switch-text">
                  <button
                    type="button"
                    className="clear-link"
                    onClick={handleBackToSignIn}
                  >
                    Back to sign in
                  </button>
                </p>
              </div>
            </div>
          ) : (
            <div className="auth-form">
              <label className="quick-create-field full-width">
                <span>Email</span>
                <input
                  autoFocus
                  type="email"
                  value={resetEmail}
                  placeholder="you@company.com"
                  aria-invalid={resetError ? 'true' : 'false'}
                  onChange={(event) => {
                    setResetEmail(event.target.value)
                    setResetError(null)
                  }}
                  onKeyDown={(event) => {
                    if (event.key === 'Enter' && !resetPending) {
                      event.preventDefault()
                      void handleSendResetLink()
                    }
                  }}
                />
              </label>

              <div className="auth-actions">
                <button
                  type="button"
                  className={`primary-button ${resetPending ? 'is-loading' : ''}`}
                  disabled={!isLikelyEmail(resetEmail) || resetPending}
                  onClick={() => void handleSendResetLink()}
                >
                  {resetPending ? (
                    <>
                      <ButtonSpinner />
                      <span>Sending...</span>
                    </>
                  ) : (
                    'Send reset link'
                  )}
                </button>
              </div>

              <div className="auth-switch">
                <p className="auth-switch-text">
                  <button
                    type="button"
                    className="clear-link"
                    onClick={handleBackToSignIn}
                  >
                    Back to sign in
                  </button>
                </p>
              </div>

              {resetError ? <p className="auth-error">{resetError}</p> : null}
            </div>
          )}
        </div>
      </div>
    )
  }

  return (
    <div className="auth-shell">
      <div className="auth-card">
        <div className="auth-copy">
          <span className="auth-kicker">Editors Board</span>
          <h1>Sign in</h1>
          <p>
            Sign in with your approved work email and password. Need to set a password for the
            first time? Use Forgot password.
          </p>
        </div>

        {authStatus === 'checking' ? (
          <div className="auth-status-card">
            <strong>Checking your session...</strong>
            <span>If you were already signed in, we are restoring your workspace.</span>
          </div>
        ) : (
          <div className="auth-form">
            <label className="quick-create-field full-width">
              <span>Email</span>
              <input
                autoFocus
                type="email"
                value={email}
                placeholder="you@company.com"
                aria-invalid={displayErrorMessage ? 'true' : 'false'}
                onChange={(event) => onEmailChange(event.target.value)}
                onKeyDown={(event) => {
                  if (event.key === 'Enter' && !pending) {
                    event.preventDefault()
                    handleSubmit()
                  }
                }}
              />
            </label>

            <label className="quick-create-field full-width">
              <span>Password</span>
              <input
                type="password"
                value={password}
                placeholder="Your password"
                onChange={(event) => setPassword(event.target.value)}
                onKeyDown={(event) => {
                  if (event.key === 'Enter' && !pending) {
                    event.preventDefault()
                    handleSubmit()
                  }
                }}
              />
            </label>

            <div className="auth-actions">
              <button
                type="button"
                className={`primary-button ${pending ? 'is-loading' : ''}`}
                disabled={!canSubmit || pending}
                onClick={handleSubmit}
              >
                {pending ? (
                  <>
                    <ButtonSpinner />
                    <span>Signing in...</span>
                  </>
                ) : (
                  'Sign in'
                )}
              </button>
            </div>

            <div className="auth-switch">
              <p className="auth-switch-text">
                <button
                  type="button"
                  className="clear-link"
                  onClick={handleForgotPasswordClick}
                >
                  Forgot password?
                </button>
              </p>
            </div>

            {infoMessage ? <p className="auth-helper">{infoMessage}</p> : null}
            {displayErrorMessage ? <p className="auth-error">{displayErrorMessage}</p> : null}
          </div>
        )}
      </div>
    </div>
  )
}
