import {
  useEffect,
  useRef,
  useState,
  type Dispatch,
  type SetStateAction,
} from 'react'
import {
  deleteWorkspaceAccessEntry,
  getAuthSession,
  getWorkspaceAccess,
  listWorkspaceAccessEntries,
  onAuthStateChange,
  signInWithMagicLink,
  signOutOfSupabase,
  upsertWorkspaceAccessEntry,
  type AuthSessionState,
  type WorkspaceAccessEntry,
  type WorkspaceAccessState,
} from '../supabase'
import {
  getActivePortfolio,
  type ActiveRole,
  type AppState,
  type RoleMode,
} from '../board'

const EMAIL_RATE_LIMIT_COOLDOWN_MS = 60_000

type ToastTone = 'green' | 'amber' | 'red' | 'blue'
type AuthStatus = 'disabled' | 'checking' | 'signed-out' | 'signed-in'
type AccessStatus = 'disabled' | 'checking' | 'granted' | 'denied' | 'error'
type WorkspaceDirectoryStatus = 'idle' | 'loading' | 'ready' | 'error'

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
  const [workspaceAccess, setWorkspaceAccess] = useState<WorkspaceAccessState | null>(null)
  const [accessStatus, setAccessStatus] = useState<AccessStatus>(authEnabled ? 'checking' : 'disabled')
  const [accessErrorMessage, setAccessErrorMessage] = useState<string | null>(null)
  const [workspaceAccessEntries, setWorkspaceAccessEntries] = useState<WorkspaceAccessEntry[]>([])
  const [workspaceAccessStatus, setWorkspaceAccessStatus] = useState<WorkspaceDirectoryStatus>('idle')
  const [workspaceAccessErrorMessage, setWorkspaceAccessErrorMessage] = useState<string | null>(null)
  const [workspaceAccessPendingEmail, setWorkspaceAccessPendingEmail] = useState<string | null>(null)
  const [loginEmail, setLoginEmail] = useState('')
  const [loginPending, setLoginPending] = useState(false)
  const [loginInfoMessage, setLoginInfoMessage] = useState<string | null>(null)
  const [loginErrorMessage, setLoginErrorMessage] = useState<string | null>(null)
  const [loginCooldownUntil, setLoginCooldownUntil] = useState<number | null>(null)

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
      return
    }

    let cancelled = false

    void getAuthSession()
      .then((session) => {
        if (cancelled) {
          return
        }

        setAuthSession(session)
        setAuthStatus(session ? 'signed-in' : 'signed-out')
        if (!session) {
          setWorkspaceAccess(null)
          setAccessErrorMessage(null)
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
        setAccessStatus('checking')
      })

    const unsubscribe = onAuthStateChange((session) => {
      if (cancelled) {
        return
      }

      setAuthSession(session)
      setAuthStatus(session ? 'signed-in' : 'signed-out')

      if (session) {
        setLoginPending(false)
        setLoginInfoMessage(null)
        setLoginErrorMessage(null)
      } else {
        setWorkspaceAccess(null)
        setAccessErrorMessage(null)
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
    if (!authEnabled) {
      return
    }

    if (authStatus !== 'signed-in' || !authSession) {
      if (authStatus === 'signed-out') {
        setWorkspaceAccess(null)
        setAccessErrorMessage(null)
        setAccessStatus('checking')
      }
      return
    }

    let cancelled = false
    setAccessStatus('checking')
    setAccessErrorMessage(null)

    void getWorkspaceAccess()
      .then((access) => {
        if (cancelled) {
          return
        }

        setWorkspaceAccess(access)

        if (!access) {
          setAccessStatus('denied')
          setAccessErrorMessage(
            `${authSession.email} is not on the approved workspace access list yet.`,
          )
          return
        }

        if (access.roleMode === 'editor' && !access.editorName) {
          setAccessStatus('error')
          setAccessErrorMessage(
            'This account is missing its editor assignment. Add an editor name in workspace_access.',
          )
          return
        }

        setAccessStatus('granted')
      })
      .catch(() => {
        if (cancelled) {
          return
        }

        setWorkspaceAccess(null)
        setAccessStatus('error')
        setAccessErrorMessage(
          'Workspace access could not be verified. Check Supabase policies and your session.',
        )
      })

    return () => {
      cancelled = true
    }
  }, [authEnabled, authSession, authStatus])

  useEffect(() => {
    if (!workspaceAccess) {
      return
    }

    setState((current) => {
      const nextRoleBase = getRoleFromWorkspaceAccess(workspaceAccess, current.activeRole)
      const currentPortfolio = getActivePortfolio(current)
      const resolvedEditorId =
        workspaceAccess.roleMode === 'editor'
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

  useEffect(() => {
    if (
      !authEnabled ||
      authStatus !== 'signed-in' ||
      accessStatus !== 'granted' ||
      workspaceAccess?.roleMode !== 'manager'
    ) {
      setWorkspaceAccessEntries([])
      setWorkspaceAccessStatus('idle')
      setWorkspaceAccessErrorMessage(null)
      return
    }

    let cancelled = false
    setWorkspaceAccessStatus('loading')
    setWorkspaceAccessErrorMessage(null)

    void listWorkspaceAccessEntries()
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
        setWorkspaceAccessErrorMessage('Workspace access records could not be loaded.')
      })

    return () => {
      cancelled = true
    }
  }, [accessStatus, authEnabled, authStatus, workspaceAccess?.roleMode])

  async function handleSaveWorkspaceAccessEntry(entry: {
    email: string
    roleMode: RoleMode
    editorName: string | null
  }) {
    const normalizedEmail = entry.email.trim().toLowerCase()
    if (!normalizedEmail) {
      return
    }

    if (workspaceAccess?.email === normalizedEmail && entry.roleMode !== 'manager') {
      showToast(
        'Keep your own workspace account as a manager, or another manager will need to change it.',
        'amber',
      )
      return
    }

    setWorkspaceAccessPendingEmail(
      workspaceAccessEntries.some((item) => item.email === normalizedEmail)
        ? normalizedEmail
        : '__new__',
    )
    setWorkspaceAccessErrorMessage(null)

    try {
      const saved = await upsertWorkspaceAccessEntry(entry)
      setWorkspaceAccessEntries((current) =>
        [...current.filter((item) => item.email !== normalizedEmail), saved].sort((left, right) =>
          left.email.localeCompare(right.email),
        ),
      )
      setWorkspaceAccessStatus('ready')
      showToast(
        workspaceAccessEntries.some((item) => item.email === normalizedEmail)
          ? `Updated access for ${normalizedEmail}`
          : `Added ${normalizedEmail} to workspace access`,
        'green',
      )
    } catch (error) {
      setWorkspaceAccessStatus('error')
      setWorkspaceAccessErrorMessage(
        error instanceof Error ? error.message : 'Could not save workspace access.',
      )
      showToast('Could not save workspace access.', 'red')
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
      showToast('You cannot remove your own manager access from this screen.', 'amber')
      return
    }

    if (!window.confirm(`Remove workspace access for ${normalizedEmail}?`)) {
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
      showToast(`Removed workspace access for ${normalizedEmail}`, 'amber')
    } catch (error) {
      setWorkspaceAccessStatus('error')
      setWorkspaceAccessErrorMessage(
        error instanceof Error ? error.message : 'Could not remove workspace access.',
      )
      showToast('Could not remove workspace access.', 'red')
    } finally {
      setWorkspaceAccessPendingEmail(null)
    }
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
          : 'Magic link sent to the approved account. Open it from your inbox to enter the shared workspace.',
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
          ? 'This email is not on the approved access list. Contact your workspace manager to get access.'
          : message,
      )
    } finally {
      setLoginPending(false)
    }
  }

  async function handleSignOut() {
    try {
      await signOutOfSupabase()
      setAuthSession(null)
      setAuthStatus('signed-out')
      setLoginInfoMessage(null)
      setLoginErrorMessage(null)
      clearSelectedCard()
      showToast('Signed out', 'blue')
    } catch {
      showToast('Could not sign out right now.', 'red')
    }
  }

  return {
    authStatus,
    authSession,
    workspaceAccess,
    accessStatus,
    accessErrorMessage,
    workspaceAccessEntries,
    workspaceAccessStatus,
    workspaceAccessErrorMessage,
    workspaceAccessPendingEmail,
    loginEmail,
    setLoginEmail,
    loginPending,
    loginInfoMessage,
    loginErrorMessage,
    handleSaveWorkspaceAccessEntry,
    handleDeleteWorkspaceAccessEntry,
    handleSendMagicLink,
    handleSignOut,
  }
}
