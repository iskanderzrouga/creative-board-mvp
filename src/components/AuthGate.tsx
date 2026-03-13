import { useState } from 'react'
import { ButtonSpinner } from './ButtonSpinner'

type AuthStatus = 'disabled' | 'checking' | 'signed-out' | 'signed-in'
type AuthMode = 'sign-in' | 'sign-up'

interface AuthGateProps {
  authStatus: AuthStatus
  email: string
  pending: boolean
  errorMessage: string | null
  infoMessage: string | null
  onEmailChange: (value: string) => void
  onSubmit: () => void
  onPasswordSubmit: (password: string, mode: AuthMode) => void
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
  onSubmit: _onSubmit,
  onPasswordSubmit,
}: AuthGateProps) {
  const [password, setPassword] = useState('')
  const [mode, setMode] = useState<AuthMode>('sign-in')

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
    onPasswordSubmit(password, mode)
  }

  return (
    <div className="auth-shell">
      <div className="auth-card">
        <div className="auth-copy">
          <span className="auth-kicker">Editors Board</span>
          <h1>{mode === 'sign-in' ? 'Sign in' : 'Create account'}</h1>
          <p>
            {mode === 'sign-in'
              ? 'Sign in with your email and password to access the workspace.'
              : 'Create your account to get started. Your email must be pre-approved by the workspace owner.'}
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
                placeholder={mode === 'sign-up' ? 'At least 6 characters' : 'Your password'}
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
                    <span>{mode === 'sign-in' ? 'Signing in...' : 'Creating account...'}</span>
                  </>
                ) : mode === 'sign-in' ? (
                  'Sign in'
                ) : (
                  'Create account'
                )}
              </button>
            </div>

            <div className="auth-switch">
              {mode === 'sign-in' ? (
                <p className="auth-switch-text">
                  Don&apos;t have an account?{' '}
                  <button
                    type="button"
                    className="clear-link"
                    onClick={() => {
                      setMode('sign-up')
                      setPassword('')
                    }}
                  >
                    Create one
                  </button>
                </p>
              ) : (
                <p className="auth-switch-text">
                  Already have an account?{' '}
                  <button
                    type="button"
                    className="clear-link"
                    onClick={() => {
                      setMode('sign-in')
                      setPassword('')
                    }}
                  >
                    Sign in
                  </button>
                </p>
              )}
            </div>

            {infoMessage ? <p className="auth-helper">{infoMessage}</p> : null}
            {displayErrorMessage ? <p className="auth-error">{displayErrorMessage}</p> : null}
          </div>
        )}
      </div>
    </div>
  )
}
