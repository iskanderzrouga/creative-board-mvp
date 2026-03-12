import {
  useEffect,
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
  persistAppState,
  type AppPage,
  type AppState,
  type GlobalSettings,
  type Portfolio,
  type QuickCreateInput,
  type RoleMode,
  type StageId,
} from '../board'
import {
  loadOrCreateRemoteAppState,
  saveRemoteAppState,
} from '../remoteAppState'

type AuthStatus = 'disabled' | 'checking' | 'signed-out' | 'signed-in'
type AccessStatus = 'disabled' | 'checking' | 'granted' | 'denied' | 'error'
type SyncStatus = 'local' | 'loading' | 'syncing' | 'synced' | 'error'
type ToastTone = 'green' | 'amber' | 'red' | 'blue'

interface ToastState {
  message: string
  tone: ToastTone
}

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
  remoteSyncErrorShown: boolean
  setRemoteSyncErrorShown: Dispatch<SetStateAction<boolean>>
  setSyncStatus: Dispatch<SetStateAction<SyncStatus>>
  setLastSyncedAt: Dispatch<SetStateAction<string | null>>
  replaceState: (nextState: AppState) => void
  showToast: (message: string, tone: ToastTone) => void
  toast: ToastState | null
  setToast: Dispatch<SetStateAction<ToastState | null>>
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
  editorMenuOpen: boolean
  setEditorMenuOpen: Dispatch<SetStateAction<boolean>>
  currentPage: AppPage
  searchRef: RefObject<HTMLInputElement | null>
  activePortfolio: Portfolio | null
  roleMode: RoleMode
  settings: GlobalSettings
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
  remoteSyncErrorShown,
  setRemoteSyncErrorShown,
  setSyncStatus,
  setLastSyncedAt,
  replaceState,
  showToast,
  toast,
  setToast,
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
  editorMenuOpen,
  setEditorMenuOpen,
  currentPage,
  searchRef,
  activePortfolio,
  roleMode,
  settings,
  setQuickCreateValue,
  importInputRef,
}: UseAppEffectsOptions) {
  const replaceStateRef = useRef(replaceState)
  const showToastRef = useRef(showToast)

  useEffect(() => {
    replaceStateRef.current = replaceState
  }, [replaceState])

  useEffect(() => {
    showToastRef.current = showToast
  }, [showToast])

  useEffect(() => {
    persistAppState(state)
  }, [state])

  useEffect(() => {
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

    void loadOrCreateRemoteAppState(localFallbackStateRef.current)
      .then((result) => {
        if (cancelled) {
          return
        }

        replaceStateRef.current(result.state)
        remoteHydratedRef.current = true
        setLastSyncedAt(result.lastSyncedAt)
        setSyncStatus(result.lastSyncedAt ? 'synced' : 'local')
        setRemoteSyncErrorShown(false)

        if (result.seeded) {
          setToast({
            message: 'Shared workspace is ready.',
            tone: 'green',
          })
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
          setToast({
            message:
              'Supabase sync is configured but unavailable right now. The board is using the local saved copy.',
            tone: 'amber',
          })
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
    setToast,
  ])

  useEffect(() => {
    if (!authEnabled || authStatus !== 'signed-in' || accessStatus !== 'granted' || !remoteHydratedRef.current) {
      return
    }

    if (remoteSaveTimerRef.current !== null) {
      window.clearTimeout(remoteSaveTimerRef.current)
    }

    setSyncStatus('syncing')
    remoteSaveTimerRef.current = window.setTimeout(() => {
      void saveRemoteAppState(state)
        .then((updatedAt) => {
          setLastSyncedAt(updatedAt)
          setSyncStatus(updatedAt ? 'synced' : 'local')
          setRemoteSyncErrorShown(false)
        })
        .catch(() => {
          setSyncStatus('error')
          if (!remoteSyncErrorShown) {
            setRemoteSyncErrorShown(true)
            setToast({
              message:
                'Changes were saved locally, but the Supabase sync failed. Check your auth session and public key.',
              tone: 'amber',
            })
          }
        })
    }, 800)

    return () => {
      if (remoteSaveTimerRef.current !== null) {
        window.clearTimeout(remoteSaveTimerRef.current)
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
    setToast,
    state,
  ])

  useEffect(() => {
    const timer = window.setTimeout(() => {
      if (toast) {
        setToast(null)
      }
    }, 3000)

    return () => window.clearTimeout(timer)
  }, [setToast, toast])

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
    pendingBackwardMove,
    pendingDeleteCard,
    quickCreateOpen,
    roleMode,
    searchRef,
    selectedCard,
    setEditorMenuOpen,
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
  }, [importInputRef, setSelectedCard])
}
