import {
  useEffect,
  useRef,
  useState,
  type Dispatch,
  type SetStateAction,
} from 'react'
import {
  clearStoredAuthSession,
  deleteWorkspaceAccessEntry,
  ensureWorkspaceAccessSchema,
  getAuthSession,
  getWorkspaceAccessCheckTimeoutMs,
  getWorkspaceAccess,
  isPasswordRecoveryFlowPending,
  listWorkspaceAccessEntries,
  onAuthStateChange,
  sendPasswordSetupEmail,
  signInWithMagicLink,
  signInWithPassword,
  signOutOfSupabase,
  updatePassword,
  upsertWorkspaceAccessEntry,
  type AuthSessionState,
  type WorkspaceAccessEntry,
  type WorkspaceAccessState,
} from '../supabase'
import {
  getActivePortfolio,
  type AccessScopeMode,
  type ActiveRole,
  type AppState,
  type PortfolioAccessScope,
  type RoleMode,
} from '../board'

const EMAIL_RATE_LIMIT_COOLDOWN_MS = 60_000
const ACCESS_REFETCH_COOLDOWN_MS = 30_000
const ACCESS_CACHE_KEY = 'eb_workspace_access_cache'

type ToastTone = 'green' | 'amber' | 'red' | 'blue'
type AuthStatus = 'disabled' | 'checking' | 'signed-out' | 'signed-in'
type AccessStatus = 'disabled' | 'checking' | 'granted' | 'denied' | 'error'
type WorkspaceDirectoryStatus = 'idle' | 'loading' | 'ready' | 'error'

function getCachedAccess(email: string): WorkspaceAccessState | null {
  try {
    const raw = sessionStorage.getItem(ACCESS_CACHE_KEY)
    if (!raw) return null
    const cached = JSON.parse(raw) as WorkspaceAccessState
    if (cached.email === email.trim().toLowerCase()) return cached
    return null
  } catch {
    return null
  }
}

function setCachedAccess(access: WorkspaceAccessState) {
  try {
    sessionStorage.setItem(ACCESS_CACHE_KEY, JSON.stringify(access))
  } catch {
    // Silently ignore storage errors
  }
}

function clearCachedAccess() {
  try {
    sessionStorage.removeItem(ACCESS_CACHE_KEY)
  } catch {
    // Silently ignore storage errors
  }
}

interface UseWorkspaceSessionOptions {
  authEnabled: boolean
  state: AppState
  setState: Dispatch<SetStateAction<AppState>>
  clearSelectedCard: () => void
  closeEditorMenu: () => void
  resetRemoteSession: () => void
  showToast: (message: string, tone: ToastTone) => void
  getAllowedPageForRole: (page: AppState['activePage'], roleMode: RoleMode) => AppState['activePage']
  getRoleFromWorkspaceAccess: (
    access: WorkspaceAccessState | null,
    currentRole: ActiveRole,
  ) => ActiveRole
  isLikelyEmail: (value: string) => boolean
}

export function useWorkspaceSession({
  authEnabled,
  state,
  setState,
  clearSelectedCard,
  closeEditorMenu,
  resetRemoteSession,
  showToast,
  getAllowedPageForRole,
  getRoleFromWorkspaceAccess,
  isLikelyEmail,
}: UseWorkspaceSessionOptions) {
  const [authStatus, setAuthStatus] = useState<AuthStatus>(authEnabled ? 'checking' : 'disabled')
  const [authSession, setAuthSession] = useState<AuthSessionState | null>(null)
  const [workspaceAccess, setWorkspaceAccess] = useState<WorkspaceAccessState | null>(() => {
    if (!authEnabled) return null
    try {
      const raw = sessionStorage.getItem(ACCESS_CACHE_KEY)
      if (!raw) return null
      const cached = JSON.parse(raw) as WorkspaceAccessState
      if (cached.roleMode === 'contributor' && !cached.editorName) return null
      return cached
    } catch {
      return null
    }
  })
  const [accessStatus, setAccessStatus] = useState<AccessStatus>(() => {
    if (!authEnabled) return 'disabled'
    try {
      const raw = sessionStorage.getItem(ACCESS_CACHE_KEY)
      if (!raw) return 'checking'
      const cached = JSON.parse(raw) as WorkspaceAccessState
      if (cached.roleMode === 'contributor' && !cached.editorName) return 'checking'
      return 'granted'
    } catch {
      return 'checking'
    }
  })
  const [accessErrorMessage, setAccessErrorMessage] = useState<string | null>(null)
  const [accessCheckTimedOut, setAccessCheckTimedOut] = useState(false)
  const [workspaceAccessEntries, setWorkspaceAccessEntries] = useState<WorkspaceAccessEntry[]>([])
  const [workspaceAccessStatus, setWorkspaceAccessStatus] = useState<WorkspaceDirectoryStatus>('idle')
  const [workspaceAccessErrorMessage, setWorkspaceAccessErrorMessage] = useState<string | null>(null)
  const [workspaceAccessPendingEmail, setWorkspaceAccessPendingEmail] = useState<string | null>(null)
  const [loginEmail, setLoginEmail] = useState('')
  const [loginPending, setLoginPending] = useState(false)
  const [loginInfoMessage, setLoginInfoMessage] = useState<string | null>(null)
  const [loginErrorMessage, setLoginErrorMessage] = useState<string | null>(null)
  const [loginCooldownUntil, setLoginCooldownUntil] = useState<number | null>(null)
  const [accessCheckAttempt, setAccessCheckAttempt] = useState(0)
  const [signOutPending, setSignOutPending] = useState(false)
  const [passwordRecoveryActive, setPasswordRecoveryActive] = useState(() =>
    authEnabled && isPasswordRecoveryFlowPending(),
  )
  const [passwordRecoveryPending, setPasswordRecoveryPending] = useState(false)
  const [passwordRecoveryErrorMessage, setPasswordRecoveryErrorMessage] = useState<string | null>(null)
  const lastWorkspaceAccessFetchAtRef = useRef(0)

  const resetRemoteSessionRef = useRef(resetRemoteSession)
  const closeEditorMenuRef = useRef(closeEditorMenu)

  useEffect(() => {
    resetRemoteSessionRef.current = resetRemoteSession
  }, [resetRemoteSession])

  useEffect(() => {
    closeEditorMenuRef.current = closeEditorMenu
  }, [closeEditorMenu])

  useEffect(() => {
    if (!authEnabled) {
      setAccessStatus('disabled')
      setAccessCheckTimedOut(false)
      setPasswordRecoveryActive(false)
      setPasswordRecoveryPending(false)
      setPasswordRecoveryErrorMessage(null)
      return
    }

    let cancelled = false
    const isRecoveryFlow = isPasswordRecoveryFlowPending()

    void getAuthSession()
      .then((session) => {
        if (cancelled) {
          return
        }

        // During password recovery, do NOT use the cached session — it may
        // belong to a different user (e.g. Nicolas) who was previously signed
        // in on this browser.  Wait for the PASSWORD_RECOVERY event from
        // onAuthStateChange which carries the correct recovery session.
        if (isRecoveryFlow) {
          return
        }

        setAuthSession(session)
        setAuthStatus(session ? 'signed-in' : 'signed-out')
        if (!session) {
          setWorkspaceAccess(null)
          setAccessErrorMessage(null)
          setAccessCheckTimedOut(false)
          setAccessStatus('checking')
        }
      })
      .catch(() => {
        if (cancelled) {
          return
        }

        setAuthSession(null)
        setAuthStatus('signed-out')
        setWorkspaceAccess(null)
        setAccessErrorMessage(null)
        setAccessCheckTimedOut(false)
        setAccessStatus('checking')
      })

    const unsubscribe = onAuthStateChange((event, session) => {
      if (cancelled) {
        return
      }

      setAuthSession(session)
      setAuthStatus(session ? 'signed-in' : 'signed-out')

      if (event === 'PASSWORD_RECOVERY') {
        setPasswordRecoveryActive(true)
        setPasswordRecoveryPending(false)
        setPasswordRecoveryErrorMessage(null)
      } else if (!session) {
        setPasswordRecoveryActive(false)
        setPasswordRecoveryPending(false)
        setPasswordRecoveryErrorMessage(null)
      }

      if (session) {
        setLoginPending(false)
        setLoginInfoMessage(null)
        setLoginErrorMessage(null)
      } else {
        setWorkspaceAccess(null)
        setAccessErrorMessage(null)
        setAccessCheckTimedOut(false)
        setAccessStatus('checking')
        resetRemoteSessionRef.current()
      }
    })

    return () => {
      cancelled = true
      unsubscribe()
    }
  }, [authEnabled])

  useEffect(() => {
    if (!passwordRecoveryActive) {
      setPasswordRecoveryPending(false)
      setPasswordRecoveryErrorMessage(null)
      return
    }

    if (authStatus === 'signed-out') {
      setPasswordRecoveryPending(false)
      setPasswordRecoveryErrorMessage(
        'This reset link is invalid, expired, or has already been used. Request a new one from sign in.',
      )
    }
  }, [authStatus, passwordRecoveryActive])

  useEffect(() => {
    if (!authEnabled) {
      return
    }

    if (authStatus !== 'signed-in' || !authSession) {
      if (authStatus === 'signed-out') {
        setWorkspaceAccess(null)
        setAccessErrorMessage(null)
        setAccessCheckTimedOut(false)
        setAccessStatus('checking')
      }
      return
    }

    let cancelled = false
    let timedOut = false
    const accessCheckTimeoutMs = getWorkspaceAccessCheckTimeoutMs()

    // Use cached access to avoid the "Checking access" flash on reload
    const cached = getCachedAccess(authSession.email)
    if (cached && !(cached.roleMode === 'contributor' && !cached.editorName)) {
      setWorkspaceAccess(cached)
      setAccessStatus('granted')
    } else {
      setAccessStatus('checking')
    }
    setAccessErrorMessage(null)
    setAccessCheckTimedOut(false)

    const timeoutId = window.setTimeout(() => {
      if (cancelled) {
        return
      }

      timedOut = true
      setWorkspaceAccess(null)
      setAccessCheckTimedOut(true)
      setAccessStatus('error')
      setAccessErrorMessage(
        'We could not confirm workspace access yet. Retry, try a different email, or contact your workspace owner.',
      )
    }, accessCheckTimeoutMs)

    lastWorkspaceAccessFetchAtRef.current = Date.now()
    void getWorkspaceAccess()
      .then((access) => {
        if (cancelled || timedOut) {
          return
        }

        window.clearTimeout(timeoutId)
        setWorkspaceAccess(access)
        setAccessCheckTimedOut(false)

        if (!access) {
          setAccessStatus('denied')
          clearCachedAccess()
          setAccessErrorMessage(
            'This email is not on the approved access list. Contact your workspace owner.',
          )
          return
        }

        if (access.roleMode === 'contributor' && !access.editorName) {
          setAccessStatus('error')
          setAccessErrorMessage(
            'Your account is set up but hasn\'t been linked to a team member profile yet. Please ask your workspace owner to complete your setup in Settings > People.',
          )
          return
        }

        setAccessStatus('granted')
        setCachedAccess(access)
      })
      .catch(() => {
        if (cancelled || timedOut) {
          return
        }

        window.clearTimeout(timeoutId)
        setWorkspaceAccess(null)
        setAccessCheckTimedOut(false)
        setAccessStatus('error')
        clearCachedAccess()
        setAccessErrorMessage(
          'Workspace access could not be verified right now. Retry, try a different email, or contact your workspace owner.',
        )
      })

    return () => {
      cancelled = true
      window.clearTimeout(timeoutId)
    }
  }, [accessCheckAttempt, authEnabled, authSession, authStatus])

  useEffect(() => {
    if (!workspaceAccess) {
      return
    }

    setState((current) => {
      const nextRoleBase = getRoleFromWorkspaceAccess(workspaceAccess, current.activeRole)
      const currentPortfolio = getActivePortfolio(current)
      const resolvedEditorId =
        workspaceAccess.roleMode === 'contributor'
          ? currentPortfolio?.team.find((member) => member.name === workspaceAccess.editorName)?.id ??
            null
          : nextRoleBase.editorId
      const nextRole: ActiveRole = {
        mode: nextRoleBase.mode,
        editorId: resolvedEditorId,
      }
      const nextPage = getAllowedPageForRole(current.activePage, nextRole.mode)

      if (
        current.activeRole.mode === nextRole.mode &&
        current.activeRole.editorId === nextRole.editorId &&
        current.activePage === nextPage
      ) {
        return current
      }

      return {
        ...current,
        activeRole: nextRole,
        activePage: nextPage,
      }
    })
    closeEditorMenuRef.current()
  }, [getAllowedPageForRole, getRoleFromWorkspaceAccess, setState, state.activePortfolioId, state.portfolios, workspaceAccess])

  // Re-fetch workspace access when the window regains focus (e.g. after admin edits scope)
  useEffect(() => {
    if (!authEnabled || authStatus !== 'signed-in' || accessStatus !== 'granted' || !workspaceAccess) {
      return
    }

    const handleFocus = () => {
      const now = Date.now()
      if (now - lastWorkspaceAccessFetchAtRef.current < ACCESS_REFETCH_COOLDOWN_MS) {
        return
      }
      lastWorkspaceAccessFetchAtRef.current = now
      void getWorkspaceAccess()
        .then((access) => {
          if (!access) {
            return
          }
          setWorkspaceAccess(access)
        })
        .catch(() => {
          // Silently ignore transient network errors on refocus
        })
    }

    window.addEventListener('focus', handleFocus)
    return () => window.removeEventListener('focus', handleFocus)
  }, [authEnabled, authStatus, accessStatus, workspaceAccess !== null])

  useEffect(() => {
    if (
      !authEnabled ||
      authStatus !== 'signed-in' ||
      accessStatus !== 'granted' ||
      workspaceAccess?.roleMode !== 'owner'
    ) {
      setWorkspaceAccessEntries([])
      setWorkspaceAccessStatus('idle')
      setWorkspaceAccessErrorMessage(null)
      return
    }

    let cancelled = false
    setWorkspaceAccessStatus('loading')
    setWorkspaceAccessErrorMessage(null)

    void ensureWorkspaceAccessSchema().then(() => listWorkspaceAccessEntries())
      .then((entries) => {
        if (cancelled) {
          return
        }
        setWorkspaceAccessEntries(entries)
        setWorkspaceAccessStatus('ready')
      })
      .catch(() => {
        if (cancelled) {
          return
        }
        setWorkspaceAccessEntries([])
        setWorkspaceAccessStatus('error')
        setWorkspaceAccessErrorMessage('Login access records could not be loaded.')
      })

    return () => {
      cancelled = true
    }
  }, [accessStatus, authEnabled, authStatus, workspaceAccess?.roleMode])

  async function handleSaveWorkspaceAccessEntry(entry: {
    email: string
    roleMode: RoleMode
    editorName: string | null
    scopeMode: AccessScopeMode
    scopeAssignments: PortfolioAccessScope[]
    previousEmail?: string
  }) {
    const normalizedEmail = entry.email.trim().toLowerCase()
    const previousEmail = entry.previousEmail?.trim().toLowerCase() ?? normalizedEmail
    const isExistingEntry = workspaceAccessEntries.some((item) => item.email === previousEmail)
    if (!normalizedEmail) {
      return
    }

    if (workspaceAccess?.email === previousEmail && normalizedEmail !== previousEmail) {
      showToast(
        'Ask another owner to change the email on your own signed-in workspace account.',
        'amber',
      )
      return
    }

    if (workspaceAccess?.email === normalizedEmail && entry.roleMode !== 'owner') {
      showToast(
        'Keep your own workspace account as an owner, or another owner will need to change it.',
        'amber',
      )
      return
    }

    setWorkspaceAccessPendingEmail(isExistingEntry ? previousEmail : '__new__')
    setWorkspaceAccessErrorMessage(null)

    try {
      const saved = await upsertWorkspaceAccessEntry(entry)
      const shouldSendPasswordSetupEmail =
        !isExistingEntry || previousEmail !== normalizedEmail
      let passwordSetupEmailResult:
        | {
            emailSent: boolean
            createdUser: boolean
          }
        | null = null

      if (isExistingEntry && previousEmail !== normalizedEmail) {
        try {
          await deleteWorkspaceAccessEntry(previousEmail)
        } catch {
          try {
            setWorkspaceAccessEntries(await listWorkspaceAccessEntries())
            setWorkspaceAccessStatus('ready')
          } catch {
            setWorkspaceAccessStatus('error')
          }
          setWorkspaceAccessErrorMessage(
            'Saved the new email, but the old login access row still needs cleanup.',
          )
          showToast('Saved the new email, but the old login access row still needs cleanup.', 'amber')
          return
        }
      }

      // Re-fetch entries from Supabase to confirm the round-trip (especially scope fields)
      try {
        const refreshedEntries = await listWorkspaceAccessEntries()
        setWorkspaceAccessEntries(refreshedEntries)
      } catch {
        // If re-fetch fails, fall back to local state update
        setWorkspaceAccessEntries((current) =>
          [...current.filter((item) => item.email !== previousEmail && item.email !== normalizedEmail), saved].sort((left, right) =>
            left.email.localeCompare(right.email),
          ),
        )
      }
      setWorkspaceAccessStatus('ready')

      if (shouldSendPasswordSetupEmail) {
        try {
          passwordSetupEmailResult = await sendPasswordSetupEmail(normalizedEmail)
        } catch (error) {
          const message =
            error instanceof Error
              ? error.message
              : 'Could not send the password setup email.'
          setWorkspaceAccessErrorMessage(message)
          showToast(
            `Saved access for ${normalizedEmail}, but the password email could not be sent. They can still use Forgot password from sign in.`,
            'amber',
          )
          return
        }
      }

      showToast(
        shouldSendPasswordSetupEmail
          ? passwordSetupEmailResult?.createdUser
            ? isExistingEntry && previousEmail !== normalizedEmail
              ? `Updated login access email to ${normalizedEmail} and sent a setup email`
              : `Added ${normalizedEmail} to login access and sent a setup email`
            : isExistingEntry && previousEmail !== normalizedEmail
              ? `Updated login access email to ${normalizedEmail} and sent a password email`
              : `Saved access for ${normalizedEmail} and sent a password email`
          : `Updated access for ${normalizedEmail}`,
        'green',
      )
    } catch (error) {
      setWorkspaceAccessStatus('error')
      setWorkspaceAccessErrorMessage(
        error instanceof Error ? error.message : 'Could not save login access.',
      )
      showToast('Could not save login access.', 'red')
      throw error
    } finally {
      setWorkspaceAccessPendingEmail(null)
    }
  }

  async function handleDeleteWorkspaceAccessEntry(email: string) {
    const normalizedEmail = email.trim().toLowerCase()
    if (!normalizedEmail) {
      return
    }

    if (workspaceAccess?.email === normalizedEmail) {
      showToast('You cannot remove your own owner access from this screen.', 'amber')
      return
    }

    setWorkspaceAccessPendingEmail(normalizedEmail)
    setWorkspaceAccessErrorMessage(null)

    try {
      await deleteWorkspaceAccessEntry(normalizedEmail)
      setWorkspaceAccessEntries((current) =>
        current.filter((item) => item.email !== normalizedEmail),
      )
      setWorkspaceAccessStatus('ready')
      showToast(`Removed login access for ${normalizedEmail}`, 'amber')
    } catch (error) {
      setWorkspaceAccessStatus('error')
      setWorkspaceAccessErrorMessage(
        error instanceof Error ? error.message : 'Could not remove login access.',
      )
      showToast('Could not remove login access.', 'red')
    } finally {
      setWorkspaceAccessPendingEmail(null)
    }
  }

  async function handlePruneWorkspaceAccessEntries(keepEmail: string) {
    const normalizedKeepEmail = keepEmail.trim().toLowerCase()
    if (!normalizedKeepEmail) {
      return { removedCount: 0, failedCount: 0 }
    }

    const entriesToRemove = workspaceAccessEntries.filter(
      (entry) => entry.email !== normalizedKeepEmail,
    )
    if (entriesToRemove.length === 0) {
      return { removedCount: 0, failedCount: 0 }
    }

    let removedCount = 0
    let failedCount = 0

    setWorkspaceAccessPendingEmail('__bulk__')
    setWorkspaceAccessErrorMessage(null)

    for (const entry of entriesToRemove) {
      try {
        await deleteWorkspaceAccessEntry(entry.email)
        removedCount += 1
      } catch {
        failedCount += 1
      }
    }

    if (removedCount > 0) {
      try {
        const refreshedEntries = await listWorkspaceAccessEntries()
        setWorkspaceAccessEntries(refreshedEntries)
        setWorkspaceAccessStatus('ready')
      } catch {
        setWorkspaceAccessEntries((current) =>
          current.filter((entry) => entry.email === normalizedKeepEmail),
        )
        setWorkspaceAccessStatus(failedCount > 0 ? 'error' : 'ready')
      }
    }

    if (failedCount > 0) {
      setWorkspaceAccessStatus('error')
      setWorkspaceAccessErrorMessage(
        'Some login access records could not be removed. Review Login Access and try again.',
      )
    }

    setWorkspaceAccessPendingEmail(null)

    return { removedCount, failedCount }
  }

  async function handleSendMagicLink() {
    const normalizedEmail = loginEmail.trim()

    if (!normalizedEmail) {
      setLoginErrorMessage('Enter your work email to continue.')
      return
    }

    if (!isLikelyEmail(normalizedEmail)) {
      setLoginErrorMessage('Enter a valid work email to continue.')
      return
    }

    const remainingCooldownMs =
      loginCooldownUntil && loginCooldownUntil > Date.now()
        ? loginCooldownUntil - Date.now()
        : 0
    if (remainingCooldownMs > 0) {
      setLoginErrorMessage(null)
      setLoginInfoMessage(
        `Email links are limited to about once per minute. Check your inbox or wait ${Math.ceil(
          remainingCooldownMs / 1000,
        )}s before trying again.`,
      )
      return
    }

    setLoginPending(true)
    setLoginErrorMessage(null)
    setLoginInfoMessage(null)

    try {
      const result = await signInWithMagicLink(normalizedEmail)
      const session = await getAuthSession()

      if (session) {
        setAuthSession(session)
        setAuthStatus('signed-in')
        setLoginPending(false)
        setLoginCooldownUntil(null)
        return
      }

      if (!result.deliveredInstantly) {
        setLoginCooldownUntil(Date.now() + EMAIL_RATE_LIMIT_COOLDOWN_MS)
      }

      setLoginInfoMessage(
        result.deliveredInstantly
          ? 'Signed in. Loading the shared workspace...'
          : 'Magic link sent. Open it from your inbox to finish signing in.',
      )
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Could not send the magic link.'
      const normalizedMessage = message.toLowerCase()
      if (normalizedMessage.includes('rate limit')) {
        setLoginCooldownUntil(Date.now() + EMAIL_RATE_LIMIT_COOLDOWN_MS)
      }
      setLoginErrorMessage(
        normalizedMessage.includes('rate limit')
          ? 'Email rate limit exceeded. Check your inbox and wait about a minute before trying again.'
          : normalizedMessage.includes('not approved') ||
              normalizedMessage.includes('user not found') ||
              normalizedMessage.includes('signup') ||
              normalizedMessage.includes('sign up')
          ? 'This email is not on the approved access list. Contact your workspace owner to get access.'
          : message,
      )
    } finally {
      setLoginPending(false)
    }
  }

  async function handlePasswordAuth(password: string) {
    const normalizedEmail = loginEmail.trim()

    if (!normalizedEmail) {
      setLoginErrorMessage('Enter your email.')
      return
    }

    if (!isLikelyEmail(normalizedEmail)) {
      setLoginErrorMessage('Enter a valid email address.')
      return
    }

    if (!password || password.length < 6) {
      setLoginErrorMessage('Password must be at least 6 characters.')
      return
    }

    setLoginPending(true)
    setLoginErrorMessage(null)
    setLoginInfoMessage(null)

    try {
      await signInWithPassword(normalizedEmail, password)

      const session = await getAuthSession()
      if (session) {
        setAuthSession(session)
        setAuthStatus('signed-in')
        setLoginPending(false)
        return
      }

      setLoginInfoMessage('Signed in. Loading the workspace...')
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Authentication failed.'
      const normalizedMessage = message.toLowerCase()
      setLoginErrorMessage(
        normalizedMessage.includes('not approved') || normalizedMessage.includes('not on the approved')
          ? 'This email is not on the approved access list. Contact your workspace owner.'
          : normalizedMessage.includes('incorrect email or password')
            ? 'Incorrect email or password. If you were just added, use Forgot password to set one first.'
          : normalizedMessage.includes('email not confirmed')
            ? 'Check your email for the latest password setup link, then try signing in again.'
          : message,
      )
    } finally {
      setLoginPending(false)
    }
  }

  function resetSignedOutUi(nextLoginInfoMessage: string | null = null) {
    clearStoredAuthSession()
    clearCachedAccess()
    setAuthSession(null)
    setAuthStatus('signed-out')
    setPasswordRecoveryActive(false)
    setPasswordRecoveryPending(false)
    setPasswordRecoveryErrorMessage(null)
    setWorkspaceAccess(null)
    setAccessStatus('checking')
    setAccessErrorMessage(null)
    setAccessCheckTimedOut(false)
    setWorkspaceAccessEntries([])
    setWorkspaceAccessStatus('idle')
    setWorkspaceAccessErrorMessage(null)
    setWorkspaceAccessPendingEmail(null)
    setLoginEmail('')
    setLoginPending(false)
    setLoginCooldownUntil(null)
    setLoginInfoMessage(nextLoginInfoMessage)
    setLoginErrorMessage(null)
    setAccessCheckAttempt(0)
    clearSelectedCard()
    closeEditorMenuRef.current()
    resetRemoteSessionRef.current()
  }

  async function handleSignOut() {
    setSignOutPending(true)

    try {
      await signOutOfSupabase()
      resetSignedOutUi()
      showToast('Signed out', 'blue')
    } catch {
      resetSignedOutUi()
      showToast('Signed out locally. The shared session could not be revoked right now.', 'amber')
    } finally {
      setSignOutPending(false)
    }
  }

  function handleTryDifferentEmail() {
    resetSignedOutUi('Use a different approved work email to continue.')
  }

  async function handleCompletePasswordRecovery(nextPassword: string) {
    if (authStatus !== 'signed-in') {
      setPasswordRecoveryErrorMessage(
        'This reset link is invalid, expired, or has already been used. Request a new one from sign in.',
      )
      return
    }

    if (!nextPassword || nextPassword.length < 6) {
      setPasswordRecoveryErrorMessage('Password must be at least 6 characters.')
      return
    }

    setPasswordRecoveryPending(true)
    setPasswordRecoveryErrorMessage(null)

    try {
      await updatePassword(nextPassword)
      setPasswordRecoveryActive(false)
      showToast('Password updated. You are signed in with the new password.', 'green')
    } catch (error) {
      setPasswordRecoveryErrorMessage(
        error instanceof Error ? error.message : 'Could not update the password.',
      )
    } finally {
      setPasswordRecoveryPending(false)
    }
  }

  async function handleExitPasswordRecovery() {
    if (authStatus === 'signed-in') {
      await handleSignOut()
      return
    }

    resetSignedOutUi()
  }

  function handleRetryAccessCheck() {
    if (!authEnabled || authStatus !== 'signed-in' || !authSession) {
      return
    }

    setWorkspaceAccess(null)
    setAccessCheckTimedOut(false)
    setAccessErrorMessage(null)
    setAccessStatus('checking')
    setAccessCheckAttempt((current) => current + 1)
  }

  return {
    authStatus,
    authSession,
    workspaceAccess,
    accessStatus,
    accessErrorMessage,
    accessCheckTimedOut,
    workspaceAccessEntries,
    workspaceAccessStatus,
    workspaceAccessErrorMessage,
    workspaceAccessPendingEmail,
    loginEmail,
    setLoginEmail,
    loginPending,
    loginInfoMessage,
    loginErrorMessage,
    signOutPending,
    passwordRecoveryActive,
    passwordRecoveryPending,
    passwordRecoveryErrorMessage,
    handleRetryAccessCheck,
    handleSaveWorkspaceAccessEntry,
    handleDeleteWorkspaceAccessEntry,
    handlePruneWorkspaceAccessEntries,
    handleSendMagicLink,
    handlePasswordAuth,
    handleCompletePasswordRecovery,
    handleExitPasswordRecovery,
    handleSignOut,
    handleTryDifferentEmail,
  }
}
