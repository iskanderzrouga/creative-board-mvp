import {
  useEffect,
  useLayoutEffect,
  useRef,
  type Dispatch,
  type MutableRefObject,
  type RefObject,
  type SetStateAction,
} from 'react'
import {
  archiveEligibleCards,
  coerceAppState,
  getQuickCreateDefaults,
  loadSyncMetadata,
  persistAppState,
  persistSyncMetadata,
  type AppPage,
  type AppState,
  type GlobalSettings,
  type Portfolio,
  type QuickCreateInput,
  type RoleMode,
  type SettingTab,
  type StageId,
} from '../board'
import {
  loadBacklogSyncMetadata,
  persistBacklogState,
  persistBacklogSyncMetadata,
  type BacklogState,
} from '../backlog'
import {
  getRemoteStateSignature,
  loadOrCreateRemoteAppState,
  RemoteStateConflictError,
  saveRemoteAppStateWithRetryMerge,
} from '../remoteAppState'
import {
  getRemoteBacklogSignature,
  loadOrCreateRemoteBacklogState,
  RemoteBacklogConflictError,
  saveRemoteBacklogState,
} from '../remoteBacklogState'

type AuthStatus = 'disabled' | 'checking' | 'signed-out' | 'signed-in'
type AccessStatus = 'disabled' | 'checking' | 'granted' | 'denied' | 'error'
type SyncStatus = 'local' | 'loading' | 'syncing' | 'synced' | 'error'
type ToastTone = 'green' | 'amber' | 'red' | 'blue'

const LOCAL_PERSIST_DEBOUNCE_MS = 200
const REMOTE_SAVE_DEBOUNCE_MS = 2000
const REMOTE_SAVE_RETRY_DELAYS_MS = [0, 1200, 3000]
const REMOTE_VISIBILITY_REFRESH_COOLDOWN_MS = 30_000

interface CopyState {
  key: string
}

interface SelectedCardState {
  portfolioId: string
  cardId: string
}

interface PendingBackwardMove {
  portfolioId: string
  cardId: string
  sourceStage: StageId
  destinationStage: StageId
  destinationOwner: string | null
  destinationIndex: number
  movedAt: string
}

interface PendingDeleteCard {
  portfolioId: string
  cardId: string
}

interface UseAppEffectsOptions {
  state: AppState
  setState: Dispatch<SetStateAction<AppState>>
  backlogState: BacklogState
  setBacklogState: Dispatch<SetStateAction<BacklogState>>
  backlogRemoteHydratedRef: MutableRefObject<boolean>
  backlogRemoteSaveTimerRef: MutableRefObject<number | null>
  authEnabled: boolean
  authStatus: AuthStatus
  accessStatus: AccessStatus
  localFallbackStateRef: MutableRefObject<AppState>
  remoteHydratedRef: MutableRefObject<boolean>
  remoteSaveTimerRef: MutableRefObject<number | null>
  mainDirtyRef: MutableRefObject<boolean>
  backlogDirtyRef: MutableRefObject<boolean>
  transferInProgressRef: MutableRefObject<boolean>
  syncStatus: SyncStatus
  lastSyncedAt: string | null
  remoteSyncErrorShown: boolean
  setRemoteSyncErrorShown: Dispatch<SetStateAction<boolean>>
  setSyncStatus: Dispatch<SetStateAction<SyncStatus>>
  setLastSyncedAt: Dispatch<SetStateAction<string | null>>
  replaceState: (nextState: AppState) => void
  showToast: (message: string, tone: ToastTone) => void
  copyState: CopyState | null
  setCopyState: Dispatch<SetStateAction<CopyState | null>>
  setNowMs: Dispatch<SetStateAction<number>>
  pendingDeleteCard: PendingDeleteCard | null
  setPendingDeleteCard: Dispatch<SetStateAction<PendingDeleteCard | null>>
  pendingBackwardMove: PendingBackwardMove | null
  setPendingBackwardMove: Dispatch<SetStateAction<PendingBackwardMove | null>>
  quickCreateOpen: boolean
  setQuickCreateOpen: Dispatch<SetStateAction<boolean>>
  selectedCard: SelectedCardState | null
  setSelectedCard: Dispatch<SetStateAction<SelectedCardState | null>>
  keyboardShortcutsOpen: boolean
  setKeyboardShortcutsOpen: Dispatch<SetStateAction<boolean>>
  editorMenuOpen: boolean
  setEditorMenuOpen: Dispatch<SetStateAction<boolean>>
  currentPage: AppPage
  searchRef: RefObject<HTMLInputElement | null>
  activePortfolio: Portfolio | null
  roleMode: RoleMode
  settings: GlobalSettings
  settingsTab: SettingTab
  setQuickCreateValue: Dispatch<SetStateAction<QuickCreateInput>>
  importInputRef: RefObject<HTMLInputElement | null>
}

export function useAppEffects({
  state,
  setState,
  backlogState,
  setBacklogState,
  backlogRemoteHydratedRef,
  backlogRemoteSaveTimerRef,
  authEnabled,
  authStatus,
  accessStatus,
  localFallbackStateRef,
  remoteHydratedRef,
  remoteSaveTimerRef,
  mainDirtyRef,
  backlogDirtyRef,
  transferInProgressRef,
  syncStatus,
  lastSyncedAt,
  remoteSyncErrorShown,
  setRemoteSyncErrorShown,
  setSyncStatus,
  setLastSyncedAt,
  replaceState,
  showToast,
  copyState,
  setCopyState,
  setNowMs,
  pendingDeleteCard,
  setPendingDeleteCard,
  pendingBackwardMove,
  setPendingBackwardMove,
  quickCreateOpen,
  setQuickCreateOpen,
  selectedCard,
  setSelectedCard,
  keyboardShortcutsOpen,
  setKeyboardShortcutsOpen,
  editorMenuOpen,
  setEditorMenuOpen,
  currentPage,
  searchRef,
  activePortfolio,
  roleMode,
  settings,
  settingsTab,
  setQuickCreateValue,
  importInputRef,
}: UseAppEffectsOptions) {
  const replaceStateRef = useRef(replaceState)
  const showToastRef = useRef(showToast)
  const lastSyncedAtRef = useRef(lastSyncedAt)
  const lastRemoteStateSignatureRef = useRef<string | null>(null)
  const localPersistTimerRef = useRef<number | null>(null)
  const lastFetchTimestampRef = useRef(0)
  const backlogLastSyncedAtRef = useRef<string | null>(null)
  const backlogLastRemoteSignatureRef = useRef<string | null>(null)
  const backlogLocalPersistTimerRef = useRef<number | null>(null)
  const backlogStateRef = useRef(backlogState)

  useEffect(() => {
    replaceStateRef.current = replaceState
  }, [replaceState])

  useEffect(() => {
    showToastRef.current = showToast
  }, [showToast])

  useLayoutEffect(() => {
    lastSyncedAtRef.current = lastSyncedAt
  }, [lastSyncedAt])

  useEffect(() => {
    if (localPersistTimerRef.current !== null) {
      window.clearTimeout(localPersistTimerRef.current)
    }

    localPersistTimerRef.current = window.setTimeout(() => {
      persistAppState(state)
    }, LOCAL_PERSIST_DEBOUNCE_MS)

    return () => {
      if (localPersistTimerRef.current !== null) {
        window.clearTimeout(localPersistTimerRef.current)
        localPersistTimerRef.current = null
      }
    }
  }, [state])

  useEffect(() => {
    function flushPendingLocalState() {
      const currentRemoteStateSignature = getRemoteStateSignature(localFallbackStateRef.current)
      const hasPendingRemoteChanges =
        authEnabled &&
        authStatus === 'signed-in' &&
        accessStatus === 'granted' &&
        remoteHydratedRef.current &&
        currentRemoteStateSignature !== lastRemoteStateSignatureRef.current

      if (localPersistTimerRef.current !== null) {
        window.clearTimeout(localPersistTimerRef.current)
        localPersistTimerRef.current = null
        persistAppState(localFallbackStateRef.current)
      }

      persistSyncMetadata({
        lastSyncedAt: lastSyncedAtRef.current,
        pendingRemoteBaseUpdatedAt: hasPendingRemoteChanges ? lastSyncedAtRef.current : null,
        pendingRemoteSignature: hasPendingRemoteChanges ? currentRemoteStateSignature : null,
      })

      // Flush pending backlog state
      const currentBacklogSignature = getRemoteBacklogSignature(backlogStateRef.current)
      const hasPendingBacklogChanges =
        authEnabled &&
        authStatus === 'signed-in' &&
        accessStatus === 'granted' &&
        backlogRemoteHydratedRef.current &&
        currentBacklogSignature !== backlogLastRemoteSignatureRef.current

      if (backlogLocalPersistTimerRef.current !== null) {
        window.clearTimeout(backlogLocalPersistTimerRef.current)
        backlogLocalPersistTimerRef.current = null
        persistBacklogState(backlogStateRef.current)
      }

      persistBacklogSyncMetadata({
        lastSyncedAt: backlogLastSyncedAtRef.current,
        pendingRemoteBaseUpdatedAt: hasPendingBacklogChanges ? backlogLastSyncedAtRef.current : null,
        pendingRemoteSignature: hasPendingBacklogChanges ? currentBacklogSignature : null,
      })
    }

    window.addEventListener('pagehide', flushPendingLocalState)
    window.addEventListener('beforeunload', flushPendingLocalState)

    return () => {
      window.removeEventListener('pagehide', flushPendingLocalState)
      window.removeEventListener('beforeunload', flushPendingLocalState)
    }
  }, [accessStatus, authEnabled, authStatus, backlogRemoteHydratedRef, localFallbackStateRef, remoteHydratedRef])

  useLayoutEffect(() => {
    localFallbackStateRef.current = state
  }, [localFallbackStateRef, state])

  useEffect(() => {
    if (!authEnabled || authStatus !== 'signed-in' || accessStatus !== 'granted') {
      if (!authEnabled) {
        setSyncStatus('local')
      }
      return
    }

    let cancelled = false
    setSyncStatus('loading')
    const syncMetadata = loadSyncMetadata()

    void loadOrCreateRemoteAppState(localFallbackStateRef.current, {
      pendingRemoteBaseUpdatedAt: syncMetadata.pendingRemoteBaseUpdatedAt,
      pendingRemoteSignature: syncMetadata.pendingRemoteSignature,
    })
      .then((result) => {
        if (cancelled) {
          return
        }

        replaceStateRef.current(result.state)
        remoteHydratedRef.current = true
        setLastSyncedAt(result.lastSyncedAt)
        setSyncStatus(result.lastSyncedAt ? 'synced' : 'local')
        lastRemoteStateSignatureRef.current = result.remoteSignature
        persistSyncMetadata({
          lastSyncedAt: result.lastSyncedAt,
          pendingRemoteBaseUpdatedAt: result.keptLocalChanges ? result.lastSyncedAt : null,
          pendingRemoteSignature: result.keptLocalChanges
            ? getRemoteStateSignature(result.state)
            : null,
        })
        setRemoteSyncErrorShown(false)

        if (result.seeded) {
          showToastRef.current('Shared workspace is ready.', 'green')
        }
      })
      .catch(() => {
        if (cancelled) {
          return
        }

        remoteHydratedRef.current = true
        setSyncStatus('error')
        if (!remoteSyncErrorShown) {
          setRemoteSyncErrorShown(true)
          showToastRef.current(
            'Supabase sync is configured but unavailable right now. The board is using the local saved copy.',
            'amber',
          )
        }
      })

    return () => {
      cancelled = true
    }
  }, [
    accessStatus,
    authEnabled,
    authStatus,
    localFallbackStateRef,
    remoteHydratedRef,
    remoteSyncErrorShown,
    setLastSyncedAt,
    setRemoteSyncErrorShown,
    setSyncStatus,
  ])

  useEffect(() => {
    if (!authEnabled || authStatus !== 'signed-in' || accessStatus !== 'granted' || !remoteHydratedRef.current) {
      return
    }

    let cancelled = false
    let retryTimerId: number | null = null
    const currentRemoteStateSignature = getRemoteStateSignature(state)

    if (lastRemoteStateSignatureRef.current === currentRemoteStateSignature) {
      return
    }

    if (remoteSaveTimerRef.current !== null) {
      window.clearTimeout(remoteSaveTimerRef.current)
    }

    setSyncStatus('syncing')
    persistSyncMetadata({
      lastSyncedAt: lastSyncedAtRef.current,
      pendingRemoteBaseUpdatedAt: lastSyncedAtRef.current,
      pendingRemoteSignature: currentRemoteStateSignature,
    })
    mainDirtyRef.current = true
    console.log('[main save] saving', {
      count: state.portfolios.reduce((count, portfolio) => count + portfolio.cards.length, 0),
      timestamp: new Date().toISOString(),
    })
    remoteSaveTimerRef.current = window.setTimeout(() => {
      remoteSaveTimerRef.current = null

      const attemptSave = (attemptIndex: number) => {
        console.log('[save] Saving to remote', {
          roleMode,
          cardCount: state.portfolios.reduce((count, portfolio) => count + portfolio.cards.length, 0),
        })
        void saveRemoteAppStateWithRetryMerge(state, lastSyncedAtRef.current, 3)
          .then((result) => {
            if (cancelled) {
              return
            }

            lastRemoteStateSignatureRef.current = getRemoteStateSignature(result.savedState)
            if (result.merged) {
              if (transferInProgressRef.current) {
                console.warn('[main sync] skipping remote replace — transfer in progress')
              } else {
              replaceStateRef.current(result.savedState)
              showToastRef.current('Board synced with latest changes.', 'green')
              }
            }

            setLastSyncedAt(result.updatedAt)
            mainDirtyRef.current = false
            console.log('[main save] success', { updatedAt: result.updatedAt })
            persistSyncMetadata({
              lastSyncedAt: result.updatedAt,
              pendingRemoteBaseUpdatedAt: null,
              pendingRemoteSignature: null,
            })
            setSyncStatus(result.updatedAt ? 'synced' : 'local')
            setRemoteSyncErrorShown(false)
          })
          .catch((error) => {
            if (cancelled) {
              return
            }

            console.error('[save] Remote save failed', { error, attempt: attemptIndex + 1 })
            if (error instanceof RemoteStateConflictError) {
              setSyncStatus('error')
              showToastRef.current(
                'Sync conflict — your changes are saved locally and will sync shortly.',
                'amber',
              )
              return
            }

            const nextDelay = REMOTE_SAVE_RETRY_DELAYS_MS[attemptIndex + 1]
            if (nextDelay !== undefined) {
              retryTimerId = window.setTimeout(() => {
                attemptSave(attemptIndex + 1)
              }, nextDelay)
              return
            }

            setSyncStatus('error')
            if (!remoteSyncErrorShown) {
              setRemoteSyncErrorShown(true)
              showToastRef.current(
                'Changes were saved locally, but the Supabase sync failed. Check your auth session and public key.',
                'amber',
              )
            }
          })
      }

      attemptSave(0)
    }, REMOTE_SAVE_DEBOUNCE_MS)

    return () => {
      cancelled = true
      if (remoteSaveTimerRef.current !== null) {
        window.clearTimeout(remoteSaveTimerRef.current)
        remoteSaveTimerRef.current = null
      }
      if (retryTimerId !== null) {
        window.clearTimeout(retryTimerId)
      }
    }
  }, [
    accessStatus,
    authEnabled,
    authStatus,
    remoteHydratedRef,
    remoteSaveTimerRef,
    remoteSyncErrorShown,
    setLastSyncedAt,
    setRemoteSyncErrorShown,
    setSyncStatus,
    roleMode,
    state,
  ])

  useEffect(() => {
    if (!authEnabled || authStatus !== 'signed-in' || accessStatus !== 'granted' || !remoteHydratedRef.current) {
      return
    }

    let cancelled = false

    function handleVisibilityChange() {
      const now = Date.now()
      if (
        document.visibilityState !== 'visible' ||
        syncStatus === 'syncing' ||
        remoteSaveTimerRef.current !== null ||
        now - lastFetchTimestampRef.current < REMOTE_VISIBILITY_REFRESH_COOLDOWN_MS
      ) {
        return
      }

      const syncMetadata = loadSyncMetadata()

      void loadOrCreateRemoteAppState(localFallbackStateRef.current, {
        pendingRemoteBaseUpdatedAt: syncMetadata.pendingRemoteBaseUpdatedAt,
        pendingRemoteSignature: syncMetadata.pendingRemoteSignature,
      })
        .then((result) => {
          lastFetchTimestampRef.current = Date.now()
          if (cancelled || !result.lastSyncedAt || result.lastSyncedAt === lastSyncedAtRef.current) {
            return
          }

          if (mainDirtyRef.current) {
            console.warn('[main sync] skipping remote replace — dirty')
            return
          }

          if (transferInProgressRef.current) {
            console.warn('[main sync] skipping remote replace — transfer in progress')
            return
          }

          console.log('[sync] Replacing local state from remote', { remoteUpdatedAt: result.lastSyncedAt })
          replaceStateRef.current(result.state)
          lastRemoteStateSignatureRef.current = result.remoteSignature
          setLastSyncedAt(result.lastSyncedAt)
          persistSyncMetadata({
            lastSyncedAt: result.lastSyncedAt,
            pendingRemoteBaseUpdatedAt: result.keptLocalChanges ? result.lastSyncedAt : null,
            pendingRemoteSignature: result.keptLocalChanges
              ? getRemoteStateSignature(result.state)
              : null,
          })
          setSyncStatus('synced')
          setRemoteSyncErrorShown(false)
          showToastRef.current('Shared workspace refreshed.', 'blue')
        })
        .catch(() => {
          if (cancelled) {
            return
          }

          setSyncStatus('error')
        })
    }

    document.addEventListener('visibilitychange', handleVisibilityChange)
    return () => {
      cancelled = true
      document.removeEventListener('visibilitychange', handleVisibilityChange)
    }
  }, [
    accessStatus,
    authEnabled,
    authStatus,
    localFallbackStateRef,
    remoteHydratedRef,
    remoteSaveTimerRef,
    setLastSyncedAt,
    setRemoteSyncErrorShown,
    setSyncStatus,
    syncStatus,
  ])

  // --- Backlog sync effects ---

  useLayoutEffect(() => {
    backlogStateRef.current = backlogState
  }, [backlogState])

  useEffect(() => {
    if (backlogLocalPersistTimerRef.current !== null) {
      window.clearTimeout(backlogLocalPersistTimerRef.current)
    }

    backlogLocalPersistTimerRef.current = window.setTimeout(() => {
      persistBacklogState(backlogState)
      backlogLocalPersistTimerRef.current = null
    }, 180)

    return () => {
      if (backlogLocalPersistTimerRef.current !== null) {
        window.clearTimeout(backlogLocalPersistTimerRef.current)
        backlogLocalPersistTimerRef.current = null
      }
    }
  }, [backlogState])

  useEffect(() => {
    if (!authEnabled || authStatus !== 'signed-in' || accessStatus !== 'granted') {
      return
    }

    let cancelled = false
    const syncMetadata = loadBacklogSyncMetadata()

    void loadOrCreateRemoteBacklogState(backlogStateRef.current, {
      pendingRemoteBaseUpdatedAt: syncMetadata.pendingRemoteBaseUpdatedAt,
      pendingRemoteSignature: syncMetadata.pendingRemoteSignature,
    })
      .then((result) => {
        if (cancelled) {
          return
        }

        setBacklogState(result.state)
        backlogRemoteHydratedRef.current = true
        backlogLastSyncedAtRef.current = result.lastSyncedAt
        backlogLastRemoteSignatureRef.current = result.remoteSignature
        persistBacklogSyncMetadata({
          lastSyncedAt: result.lastSyncedAt,
          pendingRemoteBaseUpdatedAt: null,
          pendingRemoteSignature: null,
        })
      })
      .catch(() => {
        if (cancelled) {
          return
        }

        backlogRemoteHydratedRef.current = true
      })

    return () => {
      cancelled = true
    }
  }, [
    accessStatus,
    authEnabled,
    authStatus,
    backlogRemoteHydratedRef,
    setBacklogState,
  ])

  useEffect(() => {
    if (!authEnabled || authStatus !== 'signed-in' || accessStatus !== 'granted' || !backlogRemoteHydratedRef.current) {
      return
    }

    let cancelled = false
    let retryTimerId: number | null = null
    const currentSignature = getRemoteBacklogSignature(backlogState)

    if (backlogLastRemoteSignatureRef.current === currentSignature) {
      return
    }

    if (backlogRemoteSaveTimerRef.current !== null) {
      window.clearTimeout(backlogRemoteSaveTimerRef.current)
    }

    backlogDirtyRef.current = true
    persistBacklogSyncMetadata({
      lastSyncedAt: backlogLastSyncedAtRef.current,
      pendingRemoteBaseUpdatedAt: backlogLastSyncedAtRef.current,
      pendingRemoteSignature: currentSignature,
    })
    console.log('[backlog save] saving', {
      count: backlogState.cards.length,
      timestamp: new Date().toISOString(),
    })
    backlogRemoteSaveTimerRef.current = window.setTimeout(() => {
      backlogRemoteSaveTimerRef.current = null

      const attemptSave = (attemptIndex: number) => {
        void saveRemoteBacklogState(backlogState, backlogLastSyncedAtRef.current)
          .then((updatedAt) => {
            if (cancelled) {
              return
            }

            backlogLastRemoteSignatureRef.current = currentSignature
            backlogLastSyncedAtRef.current = updatedAt
            backlogDirtyRef.current = false
            console.log('[backlog save] success', { updatedAt })
            persistBacklogSyncMetadata({
              lastSyncedAt: updatedAt,
              pendingRemoteBaseUpdatedAt: null,
              pendingRemoteSignature: null,
            })
          })
          .catch((error) => {
            if (cancelled) {
              return
            }

            if (error instanceof RemoteBacklogConflictError) {
              if (backlogDirtyRef.current || transferInProgressRef.current) {
                console.warn(
                  backlogDirtyRef.current
                    ? '[backlog sync] skipping remote replace — dirty'
                    : '[backlog sync] skipping remote replace — transfer in progress',
                )
                return
              }
              setBacklogState(error.latestState)
              // Use the REMOTE-ONLY signature (not the merged state's).
              // This ensures the save effect detects a difference between
              // local (merged) and remote, and re-saves the merged result.
              backlogLastRemoteSignatureRef.current = error.latestRemoteSignature
              backlogLastSyncedAtRef.current = error.latestUpdatedAt
              persistBacklogSyncMetadata({
                lastSyncedAt: error.latestUpdatedAt,
                pendingRemoteBaseUpdatedAt: error.latestUpdatedAt,
                pendingRemoteSignature: getRemoteBacklogSignature(error.latestState),
              })
              showToastRef.current(
                'Another session saved newer backlog changes. The latest version has been loaded.',
                'amber',
              )
              return
            }

            const nextDelay = REMOTE_SAVE_RETRY_DELAYS_MS[attemptIndex + 1]
            if (nextDelay !== undefined) {
              retryTimerId = window.setTimeout(() => {
                attemptSave(attemptIndex + 1)
              }, nextDelay)
            }
          })
      }

      attemptSave(0)
    }, REMOTE_SAVE_DEBOUNCE_MS)

    return () => {
      cancelled = true
      if (backlogRemoteSaveTimerRef.current !== null) {
        window.clearTimeout(backlogRemoteSaveTimerRef.current)
        backlogRemoteSaveTimerRef.current = null
      }
      if (retryTimerId !== null) {
        window.clearTimeout(retryTimerId)
      }
    }
  }, [
    accessStatus,
    authEnabled,
    authStatus,
    backlogRemoteHydratedRef,
    backlogRemoteSaveTimerRef,
    backlogState,
    setBacklogState,
  ])

  useEffect(() => {
    if (!authEnabled || authStatus !== 'signed-in' || accessStatus !== 'granted' || !backlogRemoteHydratedRef.current) {
      return
    }

    let cancelled = false

    function handleBacklogVisibilityChange() {
      if (
        document.visibilityState !== 'visible' ||
        backlogRemoteSaveTimerRef.current !== null
      ) {
        return
      }

      const syncMetadata = loadBacklogSyncMetadata()

      void loadOrCreateRemoteBacklogState(backlogStateRef.current, {
        pendingRemoteBaseUpdatedAt: syncMetadata.pendingRemoteBaseUpdatedAt,
        pendingRemoteSignature: syncMetadata.pendingRemoteSignature,
      })
        .then((result) => {
          if (cancelled || !result.lastSyncedAt || result.lastSyncedAt === backlogLastSyncedAtRef.current) {
            return
          }

          if (backlogDirtyRef.current) {
            console.warn('[backlog sync] skipping remote replace — dirty')
            return
          }

          if (transferInProgressRef.current) {
            console.warn('[backlog sync] skipping remote replace — transfer in progress')
            return
          }

          setBacklogState(result.state)
          backlogLastRemoteSignatureRef.current = result.remoteSignature
          backlogLastSyncedAtRef.current = result.lastSyncedAt
          persistBacklogSyncMetadata({
            lastSyncedAt: result.lastSyncedAt,
            pendingRemoteBaseUpdatedAt: null,
            pendingRemoteSignature: null,
          })
        })
        .catch(() => {
          // Silently fail — backlog refresh is best-effort
        })
    }

    document.addEventListener('visibilitychange', handleBacklogVisibilityChange)
    return () => {
      cancelled = true
      document.removeEventListener('visibilitychange', handleBacklogVisibilityChange)
    }
  }, [
    accessStatus,
    authEnabled,
    authStatus,
    backlogRemoteHydratedRef,
    backlogRemoteSaveTimerRef,
    setBacklogState,
  ])

  // --- End backlog sync effects ---

  useEffect(() => {
    if (!copyState) {
      return
    }

    const timer = window.setTimeout(() => setCopyState(null), 1200)
    return () => window.clearTimeout(timer)
  }, [copyState, setCopyState])

  useEffect(() => {
    const timer = window.setInterval(() => {
      const nextNow = Date.now()
      setNowMs(nextNow)
      setState((current) => archiveEligibleCards(current, nextNow))
    }, 60_000)

    return () => window.clearInterval(timer)
  }, [setNowMs, setState])

  useEffect(() => {
    function handleKeyDown(event: KeyboardEvent) {
      const hasModifier = event.metaKey || event.ctrlKey

      if (event.key === 'Escape') {
        if (keyboardShortcutsOpen) {
          setKeyboardShortcutsOpen(false)
          return
        }
        if (pendingDeleteCard) {
          setPendingDeleteCard(null)
          return
        }
        if (pendingBackwardMove) {
          setPendingBackwardMove(null)
          return
        }
        if (quickCreateOpen) {
          setQuickCreateOpen(false)
          return
        }
        if (selectedCard) {
          setSelectedCard(null)
          return
        }
        if (editorMenuOpen) {
          setEditorMenuOpen(false)
        }
      }

      if (hasModifier && event.key.toLowerCase() === 'k' && currentPage === 'board') {
        event.preventDefault()
        searchRef.current?.focus()
      }

      if (
        hasModifier &&
        event.key.toLowerCase() === 'n' &&
        currentPage === 'board' &&
        roleMode === 'manager' &&
        activePortfolio
      ) {
        event.preventDefault()
        setQuickCreateValue(getQuickCreateDefaults(activePortfolio, settings))
        setQuickCreateOpen(true)
      }
    }

    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [
    activePortfolio,
    currentPage,
    editorMenuOpen,
    keyboardShortcutsOpen,
    pendingBackwardMove,
    pendingDeleteCard,
    quickCreateOpen,
    roleMode,
    searchRef,
    selectedCard,
    setEditorMenuOpen,
    setKeyboardShortcutsOpen,
    setPendingBackwardMove,
    setPendingDeleteCard,
    setQuickCreateOpen,
    setQuickCreateValue,
    setSelectedCard,
    settings,
  ])

  useEffect(() => {
    const input = importInputRef.current
    if (!input) {
      return
    }

    function handleChange(event: Event) {
      const target = event.target as HTMLInputElement
      const file = target.files?.[0]
      if (!file) {
        return
      }

      void file.text().then((text) => {
        try {
          const parsed = coerceAppState(JSON.parse(text))
          replaceStateRef.current(parsed)
          setSelectedCard(null)
          showToastRef.current('Board data imported', 'green')
        } catch {
          showToastRef.current('Import failed. Please use a valid export file.', 'red')
        } finally {
          target.value = ''
        }
      })
    }

    input.addEventListener('change', handleChange)
    return () => input.removeEventListener('change', handleChange)
  }, [importInputRef, setSelectedCard, settingsTab])
}
