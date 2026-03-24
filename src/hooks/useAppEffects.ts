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
  getRemoteStateSignature,
  loadOrCreateRemoteAppState,
  RemoteStateConflictError,
  saveRemoteAppState,
} from '../remoteAppState'

type AuthStatus = 'disabled' | 'checking' | 'signed-out' | 'signed-in'
type AccessStatus = 'disabled' | 'checking' | 'granted' | 'denied' | 'error'
type SyncStatus = 'local' | 'loading' | 'syncing' | 'synced' | 'error'
type ToastTone = 'green' | 'amber' | 'red' | 'blue'

const LOCAL_PERSIST_DEBOUNCE_MS = 200
const REMOTE_SAVE_DEBOUNCE_MS = 800
const REMOTE_SAVE_RETRY_DELAYS_MS = [0, 1200, 3000]

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
  authEnabled: boolean
  authStatus: AuthStatus
  accessStatus: AccessStatus
  localFallbackStateRef: MutableRefObject<AppState>
  remoteHydratedRef: MutableRefObject<boolean>
  remoteSaveTimerRef: MutableRefObject<number | null>
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
  authEnabled,
  authStatus,
  accessStatus,
  localFallbackStateRef,
  remoteHydratedRef,
  remoteSaveTimerRef,
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
    }

    window.addEventListener('pagehide', flushPendingLocalState)
    window.addEventListener('beforeunload', flushPendingLocalState)

    return () => {
      window.removeEventListener('pagehide', flushPendingLocalState)
      window.removeEventListener('beforeunload', flushPendingLocalState)
    }
  }, [accessStatus, authEnabled, authStatus, localFallbackStateRef, remoteHydratedRef])

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
    remoteSaveTimerRef.current = window.setTimeout(() => {
      remoteSaveTimerRef.current = null

      const attemptSave = (attemptIndex: number) => {
        void saveRemoteAppState(state, lastSyncedAtRef.current)
          .then((updatedAt) => {
            if (cancelled) {
              return
            }

            lastRemoteStateSignatureRef.current = currentRemoteStateSignature
            setLastSyncedAt(updatedAt)
            persistSyncMetadata({
              lastSyncedAt: updatedAt,
              pendingRemoteBaseUpdatedAt: null,
              pendingRemoteSignature: null,
            })
            setSyncStatus(updatedAt ? 'synced' : 'local')
            setRemoteSyncErrorShown(false)
          })
          .catch((error) => {
            if (cancelled) {
              return
            }

            if (error instanceof RemoteStateConflictError) {
              replaceStateRef.current(error.latestState)
              lastRemoteStateSignatureRef.current = getRemoteStateSignature(error.latestState)
              setLastSyncedAt(error.latestUpdatedAt)
              persistSyncMetadata({
                lastSyncedAt: error.latestUpdatedAt,
                pendingRemoteBaseUpdatedAt: null,
                pendingRemoteSignature: null,
              })
              setSyncStatus('synced')
              setRemoteSyncErrorShown(false)
              showToastRef.current(
                'Another session saved newer workspace changes. The latest shared version has been loaded.',
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
    state,
  ])

  useEffect(() => {
    if (!authEnabled || authStatus !== 'signed-in' || accessStatus !== 'granted' || !remoteHydratedRef.current) {
      return
    }

    let cancelled = false

    function handleVisibilityChange() {
      if (
        document.visibilityState !== 'visible' ||
        syncStatus === 'syncing' ||
        remoteSaveTimerRef.current !== null
      ) {
        return
      }

      const syncMetadata = loadSyncMetadata()

      void loadOrCreateRemoteAppState(localFallbackStateRef.current, {
        pendingRemoteBaseUpdatedAt: syncMetadata.pendingRemoteBaseUpdatedAt,
        pendingRemoteSignature: syncMetadata.pendingRemoteSignature,
      })
        .then((result) => {
          if (cancelled || !result.lastSyncedAt || result.lastSyncedAt === lastSyncedAtRef.current) {
            return
          }

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
