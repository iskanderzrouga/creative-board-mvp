import {
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react'
import {
  DndContext,
  PointerSensor,
  closestCorners,
  useSensor,
  useSensors,
  type DragEndEvent,
  type DragOverEvent,
  type DragStartEvent,
} from '@dnd-kit/core'
import './App.css'
import {
  canEditorDragStage,
  copyToClipboard,
  getAllowedPageForRole,
  getCurrentPage,
  getDefaultBackwardMoveForm,
  getRoleFromWorkspaceAccess,
  getSearchCountLabel,
  isLikelyEmail,
  type BackwardMoveFormState,
} from './appHelpers'
import { getScopedPortfolios } from './accessHelpers'
import { AccessGate } from './components/AccessGate'
import { AccessVerificationGate } from './components/AccessVerificationGate'
import { AnalyticsPage } from './components/AnalyticsPage'
import { AuthGate } from './components/AuthGate'
import { BacklogPage } from './components/BacklogPage'
import { BackwardMoveModal } from './components/BackwardMoveModal'
import { BoardPage } from './components/BoardPage'
import { CardDetailPanel } from './components/CardDetailPanel'
import { ConfirmDialog } from './components/ConfirmDialog'
import { DeleteCardModal } from './components/DeleteCardModal'
import { NotificationBell } from './components/NotificationBell'
import { KeyboardShortcutsModal } from './components/KeyboardShortcutsModal'
import { PageHeader } from './components/PageHeader'
import { PasswordRecoveryGate } from './components/PasswordRecoveryGate'
import { QuickCreateModal } from './components/QuickCreateModal'
import { RemoteLoadingShell } from './components/RemoteLoadingShell'
import { SettingsPage } from './components/SettingsPage'
import { Sidebar } from './components/Sidebar'
import { SyncStatusPill } from './components/SyncStatusPill'
import { ToastStack } from './components/ToastStack'
import { useAppEffects } from './hooks/useAppEffects'
import { WorkloadPage } from './components/WorkloadPage'
import { useWorkspaceSession } from './hooks/useWorkspaceSession'
import {
  loadBacklogState,
  persistBacklogState,
  type BacklogState,
} from './backlog'
import {
  isSupabaseConfigured,
} from './supabase'
import {
  GROUPED_STAGES,
  STAGES,
  addCardToPortfolio,
  applyCardUpdates,
  createCardFromQuickInput,
  createFreshStartState,
  createSeedState,
  getActivePortfolio,
  getAttentionSummary,
  getBoardStats,
  getCardFolderName,
  getCardMoveValidationMessage,
  getDefaultBoardFilters,
  getEditorOptions,
  getEditorSummary,
  getRevisionReasonById,
  getQuickCreateDefaults,
  getTeamMemberById,
  getVisibleCards,
  getVisibleColumns,
  isLaunchOpsRole,
  createNotification,
  markNotificationRead,
  markAllNotificationsRead,
  dismissNotification,
  loadAppState,
  loadSyncMetadata,
  moveCardInPortfolio,
  removeCardFromPortfolio,
  type ActiveRole,
  type AppNotification,
  type AppPage,
  type AppState,
  type BoardFilters,
  type Card,
  type LaneModel,
  type Portfolio,
  type QuickCreateInput,
  type SettingTab,
  type StageId,
  type Timeframe,
  type ViewerContext,
} from './board'

type ToastTone = 'green' | 'amber' | 'red' | 'blue'

interface ToastState {
  id: number
  message: string
  tone: ToastTone
}

type SyncStatus = 'local' | 'loading' | 'syncing' | 'synced' | 'error'
type ExtendedPage = AppPage | 'backlog'

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

type PendingAppConfirm = 'reset-seed' | 'fresh-start'

const ONBOARDING_DISMISSED_KEY = 'editors-board:onboarding-dismissed:v1'
const CARD_PANEL_CLOSE_DELAY_MS = 240
const BACKLOG_ALLOWED_EMAIL_KEYS = new Set(['nicolas', 'naomi', 'iskander'])

function getPathForPage(page: ExtendedPage) {
  switch (page) {
    case 'backlog':
      return '/backlog'
    case 'analytics':
      return '/analytics'
    case 'workload':
      return '/workload'
    case 'settings':
      return '/settings'
    case 'board':
    default:
      return '/board'
  }
}

function getPageFromPathname(pathname: string, fallback: AppPage): ExtendedPage {
  switch (pathname) {
    case '/backlog':
      return 'backlog'
    case '/analytics':
      return 'analytics'
    case '/workload':
      return 'workload'
    case '/settings':
      return 'settings'
    case '/board':
    case '/':
      return 'board'
    default:
      return fallback
  }
}

function canAccessBacklogByEmail(email: string | null) {
  if (!email) {
    return false
  }

  const localPart = email.trim().toLowerCase().split('@')[0] ?? ''
  return BACKLOG_ALLOWED_EMAIL_KEYS.has(localPart)
}

function App() {
  const authEnabled = isSupabaseConfigured()
  const [state, setState] = useState<AppState>(() => loadAppState())
  const [backlogState, setBacklogState] = useState<BacklogState>(() => loadBacklogState())
  const [boardFilters, setBoardFilters] = useState<BoardFilters>(() =>
    getDefaultBoardFilters(getActivePortfolio(loadAppState())),
  )
  const [selectedCard, setSelectedCard] = useState<SelectedCardState | null>(null)
  const [toasts, setToasts] = useState<ToastState[]>([])
  const [copyState, setCopyState] = useState<CopyState | null>(null)
  const [nowMs, setNowMs] = useState(() => Date.now())
  const [quickCreateOpen, setQuickCreateOpen] = useState(false)
  const [quickCreateValue, setQuickCreateValue] = useState<QuickCreateInput>(() => {
    const initialState = loadAppState()
    return getQuickCreateDefaults(getActivePortfolio(initialState) ?? initialState.portfolios[0], initialState.settings)
  })
  const [sidebarPinned, setSidebarPinned] = useState(false)
  const [sidebarHovered, setSidebarHovered] = useState(false)
  const [compactLayout, setCompactLayout] = useState(() =>
    typeof window !== 'undefined' ? window.innerWidth <= 768 : false,
  )
  const [touchSidebarEnabled, setTouchSidebarEnabled] = useState(() =>
    typeof window !== 'undefined'
      ? window.innerWidth > 768 &&
        ((typeof window.matchMedia === 'function' &&
          window.matchMedia('(hover: none) and (pointer: coarse)').matches) ||
          window.navigator.maxTouchPoints > 0)
      : false,
  )
  const [touchSidebarOpen, setTouchSidebarOpen] = useState(false)
  const [editorMenuOpen, setEditorMenuOpen] = useState(false)
  const [settingsTab, setSettingsTab] = useState<SettingTab>('general')
  const [, setSettingsPortfolioId] = useState(() => loadAppState().activePortfolioId)
  const [timeframe, setTimeframe] = useState<Timeframe>('this-week')
  const [dragCardId, setDragCardId] = useState<string | null>(null)
  const [dragOverLaneId, setDragOverLaneId] = useState<string | null>(null)
  const [blockedLaneId, setBlockedLaneId] = useState<string | null>(null)
  const [expandedStages, setExpandedStages] = useState<StageId[]>([])
  const [pendingBackwardMove, setPendingBackwardMove] = useState<PendingBackwardMove | null>(null)
  const [pendingDeleteCard, setPendingDeleteCard] = useState<PendingDeleteCard | null>(null)
  const [backwardMoveForm, setBackwardMoveForm] = useState<BackwardMoveFormState>(() =>
    getDefaultBackwardMoveForm(loadAppState().settings),
  )
  const [creatingDriveCardId, setCreatingDriveCardId] = useState<string | null>(null)
  const [syncStatus, setSyncStatus] = useState<SyncStatus>(authEnabled ? 'loading' : 'local')
  const [lastSyncedAt, setLastSyncedAt] = useState<string | null>(() => loadSyncMetadata().lastSyncedAt)
  const [remoteSyncErrorShown, setRemoteSyncErrorShown] = useState(false)
  const [pendingAppConfirm, setPendingAppConfirm] = useState<PendingAppConfirm | null>(null)
  const [keyboardShortcutsOpen, setKeyboardShortcutsOpen] = useState(false)
  const [isClosingCardPanel, setIsClosingCardPanel] = useState(false)
  const [onboardingDismissed, setOnboardingDismissed] = useState(() => {
    if (typeof window === 'undefined') {
      return false
    }

    return window.localStorage.getItem(ONBOARDING_DISMISSED_KEY) === '1'
  })

  const searchRef = useRef<HTMLInputElement | null>(null)
  const importInputRef = useRef<HTMLInputElement | null>(null)
  const localFallbackStateRef = useRef(state)
  const remoteHydratedRef = useRef(!authEnabled)
  const remoteSaveTimerRef = useRef<number | null>(null)
  const cardPanelCloseTimerRef = useRef<number | null>(null)
  const nextToastIdRef = useRef(0)
  const toastTimerIdsRef = useRef<Record<number, number>>({})
  const backlogPersistTimerRef = useRef<number | null>(null)
  const [routePage, setRoutePage] = useState<ExtendedPage>(() =>
    getPageFromPathname(
      typeof window !== 'undefined' ? window.location.pathname : '/board',
      getCurrentPage(loadAppState()),
    ),
  )

  const {
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
    handlePasswordAuth,
    handleCompletePasswordRecovery,
    handleExitPasswordRecovery,
    handleSignOut,
    handleTryDifferentEmail,
  } = useWorkspaceSession({
    authEnabled,
    state,
    setState,
    clearSelectedCard: () => setSelectedCard(null),
    closeEditorMenu: () => setEditorMenuOpen(false),
    resetRemoteSession: () => {
      remoteHydratedRef.current = false
      setSyncStatus('loading')
      setLastSyncedAt(null)
    },
    showToast,
    getAllowedPageForRole,
    getRoleFromWorkspaceAccess,
    isLikelyEmail,
  })

  const scopedPortfolios = useMemo(
    () => (authEnabled ? getScopedPortfolios(state.portfolios, workspaceAccess) : state.portfolios),
    [authEnabled, state.portfolios, workspaceAccess],
  )
  const activePortfolioView =
    scopedPortfolios.find((portfolio) => portfolio.id === state.activePortfolioId) ??
    scopedPortfolios[0] ??
    null
  const activePortfolioSource =
    state.portfolios.find((portfolio) => portfolio.id === activePortfolioView?.id) ?? null
  const productionPage = getCurrentPage(state)
  const currentPage: ExtendedPage = routePage === 'backlog' ? 'backlog' : productionPage
  const editorOptions = activePortfolioSource ? getEditorOptions(activePortfolioSource) : []
  const currentEditor = activePortfolioSource
    ? getTeamMemberById(activePortfolioSource, state.activeRole.editorId)
    : null
  const isLaunchOpsActive =
    state.activeRole.mode === 'contributor' && isLaunchOpsRole(currentEditor?.role ?? null)
  const viewerContext = useMemo<ViewerContext>(
    () => ({
      mode: state.activeRole.mode,
      editorName: state.activeRole.mode === 'contributor' ? currentEditor?.name ?? null : null,
      memberRole: state.activeRole.mode === 'contributor' ? currentEditor?.role ?? null : null,
      visibleBrandNames: activePortfolioView?.brands.map((brand) => brand.name) ?? [],
    }),
    [activePortfolioView?.brands, currentEditor?.name, currentEditor?.role, state.activeRole.mode],
  )
  const attention = getAttentionSummary(activePortfolioView, state.settings, nowMs)
  const searchBaseCards =
    activePortfolioView && currentPage === 'board'
      ? getVisibleCards(
          activePortfolioView,
          viewerContext,
          { ...boardFilters, searchQuery: '' },
          state.settings,
          nowMs,
        ).filter((card) => !card.archivedAt)
      : []
  const visibleBoardCards =
    activePortfolioView && currentPage === 'board'
      ? getVisibleCards(activePortfolioView, viewerContext, boardFilters, state.settings, nowMs)
      : []
  const columns = useMemo(
    () =>
      activePortfolioView && currentPage === 'board'
        ? getVisibleColumns(activePortfolioView, viewerContext, boardFilters, state.settings, nowMs, {
            showEmptyGroupedSections:
              dragCardId !== null &&
              (state.activeRole.mode === 'owner' || state.activeRole.mode === 'manager'),
            manuallyExpandedStages: expandedStages,
          })
        : [],
    [
      activePortfolioView,
      boardFilters,
      currentPage,
      dragCardId,
      expandedStages,
      nowMs,
      state.activeRole.mode,
      state.settings,
      viewerContext,
    ],
  )
  const stats =
    activePortfolioView && currentPage === 'board'
      ? getBoardStats(activePortfolioView, viewerContext, boardFilters, state.settings, nowMs)
      : null
  const hasActiveBoardFilters = Boolean(
    boardFilters.searchQuery.trim() ||
      boardFilters.ownerNames.length > 0 ||
      boardFilters.stuckOnly ||
      boardFilters.blockedOnly ||
      boardFilters.showArchived ||
      boardFilters.brandNames.length !== (activePortfolioView?.brands.length ?? 0),
  )
  const summaryOwner =
    state.activeRole.mode === 'contributor' && !isLaunchOpsActive
      ? viewerContext.editorName
      : boardFilters.ownerNames.length === 1
        ? boardFilters.ownerNames[0]
        : null
  const summary =
    activePortfolioView && currentPage === 'board' && summaryOwner
      ? getEditorSummary(
          activePortfolioView,
          summaryOwner,
          boardFilters.brandNames.length > 0
            ? boardFilters.brandNames
            : activePortfolioView.brands.map((brand) => brand.name),
          state.settings,
        )
      : null
  const scopedState = useMemo<AppState>(
    () => ({
      ...state,
      portfolios: scopedPortfolios,
      activePortfolioId: activePortfolioView?.id ?? '',
    }),
    [activePortfolioView?.id, scopedPortfolios, state],
  )

  const activeSelectedPortfolio = selectedCard
    ? state.portfolios.find((portfolio) => portfolio.id === selectedCard.portfolioId) ?? null
    : null
  const activeSelectedPortfolioView = selectedCard
    ? scopedPortfolios.find((portfolio) => portfolio.id === selectedCard.portfolioId) ?? null
    : null
  const selectedCardData = selectedCard
    ? activeSelectedPortfolio?.cards.find((card) => card.id === selectedCard.cardId) ?? null
    : null
  const pendingBackwardCard = pendingBackwardMove
    ? state.portfolios
        .find((portfolio) => portfolio.id === pendingBackwardMove.portfolioId)
        ?.cards.find((card) => card.id === pendingBackwardMove.cardId) ?? null
    : null
  const pendingDeleteCardData = pendingDeleteCard
    ? state.portfolios
        .find((portfolio) => portfolio.id === pendingDeleteCard.portfolioId)
        ?.cards.find((card) => card.id === pendingDeleteCard.cardId) ?? null
    : null
  const activeDragCard =
    activePortfolioView && dragCardId
      ? activePortfolioView.cards.find((card) => card.id === dragCardId) ?? null
      : null
  const lockedRole =
    workspaceAccess?.roleMode === 'contributor'
      ? {
          mode: 'contributor' as const,
          editorId:
            activePortfolioSource?.team.find((member) => member.name === workspaceAccess.editorName)?.id ??
            null,
        }
      : workspaceAccess
        ? {
            mode: workspaceAccess.roleMode,
            editorId: state.activeRole.editorId,
          }
        : null
  const userDisplayName = authEnabled
    ? workspaceAccess?.editorName || authSession?.email || 'Workspace user'
    : 'Local User'
  const userSecondaryLabel = authEnabled
    ? authSession?.email ?? workspaceAccess?.email ?? null
    : 'Local mode'
  const backlogAccessEmail =
    authSession?.email?.trim().toLowerCase() ?? workspaceAccess?.email?.trim().toLowerCase() ?? null
  const canAccessBacklog = !authEnabled || canAccessBacklogByEmail(backlogAccessEmail)
  const backlogBrandOptions = useMemo(() => {
    const uniqueBrands = new Set<string>()
    scopedPortfolios.forEach((portfolio) => {
      portfolio.brands.forEach((brand) => {
        uniqueBrands.add(brand.name)
      })
    })
    return Array.from(uniqueBrands)
  }, [scopedPortfolios])
  const localModeBanner = !authEnabled ? (
    <section className="local-mode-banner" role="status" aria-live="polite">
      <div className="local-mode-copy">
        <strong>Running in local mode.</strong>
        <span>Configure Supabase to enable team login.</span>
      </div>
      <div className="local-mode-controls">
        <label className="local-mode-field">
          <span>Local role</span>
          <select
            aria-label="Local demo role"
            value={state.activeRole.mode}
            onChange={(event) =>
              setRole({
                mode: event.target.value as ActiveRole['mode'],
                editorId:
                  event.target.value === 'contributor'
                    ? editorOptions[0]?.id ?? state.activeRole.editorId
                    : null,
              })
            }
          >
            <option value="owner">Owner</option>
            <option value="manager">Manager</option>
            <option value="contributor">Contributor</option>
            <option value="viewer">Viewer</option>
          </select>
        </label>

        {state.activeRole.mode === 'contributor' ? (
          <label className="local-mode-field">
            <span>Teammate profile</span>
            <select
              aria-label="Local demo contributor identity"
              value={state.activeRole.editorId ?? editorOptions[0]?.id ?? ''}
              onChange={(event) =>
                setRole({
                  mode: 'contributor',
                  editorId: event.target.value || null,
                })
              }
            >
              {editorOptions.map((member) => (
                <option key={member.id} value={member.id}>
                  {member.name}
                </option>
              ))}
            </select>
          </label>
        ) : null}
      </div>
    </section>
  ) : null

  const headerUtilityContent = (
    <div className="session-toolbar">
      {authEnabled && authStatus === 'signed-in' && authSession ? (
        <SyncStatusPill syncStatus={syncStatus} lastSyncedAt={lastSyncedAt} />
      ) : null}
      {authEnabled && authStatus === 'signed-in' && authSession ? (
        <span className="session-email">{authSession.email}</span>
      ) : null}
      <NotificationBell
        notifications={state.notifications}
        onMarkRead={(id) => setState((prev) => markNotificationRead(prev, id))}
        onMarkAllRead={() => setState((prev) => markAllNotificationsRead(prev))}
        onDismiss={(id) => setState((prev) => dismissNotification(prev, id))}
        onNotificationClick={(notification: AppNotification) => {
          if (notification.portfolioId !== state.activePortfolioId) {
            setState((prev) => ({ ...prev, activePortfolioId: notification.portfolioId }))
          }
          setSelectedCard({ portfolioId: notification.portfolioId, cardId: notification.cardId })
          if (currentPage !== 'board') {
            setPage('board')
          }
        }}
      />
      <button
        type="button"
        className="ghost-button shortcut-button"
        aria-label="Open keyboard shortcuts"
        onClick={() => setKeyboardShortcutsOpen(true)}
      >
        ?
      </button>
    </div>
  )

  const sensors = useSensors(
    useSensor(PointerSensor, {
      activationConstraint: {
        distance: 6,
      },
    }),
  )

  const laneMap = useMemo(() => {
    const map: Record<string, LaneModel> = {}
    columns.forEach((column) => {
      column.lanes.forEach((lane) => {
        map[lane.id] = lane
      })
    })
    return map
  }, [columns])

  const itemToLaneMap = useMemo(() => {
    const map: Record<string, string> = {}
    columns.forEach((column) => {
      column.lanes.forEach((lane) => {
        lane.cards.forEach((card) => {
          map[card.id] = lane.id
        })
      })
    })
    return map
  }, [columns])

  useAppEffects({
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
    currentPage: productionPage,
    searchRef,
    activePortfolio: activePortfolioView,
    roleMode: state.activeRole.mode,
    settings: state.settings,
    settingsTab,
    setQuickCreateValue,
    importInputRef,
  })

  useEffect(() => {
    if (activePortfolioView || scopedPortfolios.length === 0) {
      return
    }

    const nextPortfolioId = scopedPortfolios[0]?.id
    if (!nextPortfolioId) {
      return
    }

    setState((current) =>
      current.activePortfolioId === nextPortfolioId
        ? current
        : {
            ...current,
            activePortfolioId: nextPortfolioId,
          },
    )
  }, [activePortfolioView, scopedPortfolios])

  useEffect(() => {
    const availableBrandNames = activePortfolioView?.brands.map((brand) => brand.name) ?? []
    const availableBrandSet = new Set(availableBrandNames)

    setBoardFilters((current) => {
      const nextBrandNames =
        current.brandNames.length === 0
          ? availableBrandNames
          : current.brandNames.filter((brandName) => availableBrandSet.has(brandName))

      const normalizedBrandNames =
        nextBrandNames.length > 0 || availableBrandNames.length === 0
          ? nextBrandNames
          : availableBrandNames

      const sameBrandSelection =
        normalizedBrandNames.length === current.brandNames.length &&
        normalizedBrandNames.every((brandName, index) => brandName === current.brandNames[index])

      return sameBrandSelection
        ? current
        : {
            ...current,
            brandNames: normalizedBrandNames,
      }
    })
  }, [activePortfolioView])

  useEffect(() => {
    if (typeof window === 'undefined') {
      return
    }

    if (routePage !== 'backlog' && routePage !== productionPage) {
      return
    }

    const nextPath = getPathForPage(currentPage)
    if (window.location.pathname !== nextPath) {
      window.history.replaceState({}, '', nextPath)
    }
  }, [currentPage, productionPage, routePage])

  useEffect(() => {
    if (typeof window === 'undefined') {
      return
    }

    const handlePopState = () => {
      const nextPage = getPageFromPathname(window.location.pathname, getCurrentPage(state))

      if (nextPage === 'backlog') {
        setRoutePage('backlog')
        return
      }

      setRoutePage(nextPage)
      setState((current) =>
        current.activePage === nextPage
          ? current
          : {
              ...current,
              activePage: nextPage,
            },
      )
    }

    handlePopState()
    window.addEventListener('popstate', handlePopState)

    return () => {
      window.removeEventListener('popstate', handlePopState)
    }
  }, [state])

  useEffect(() => {
    if (!canAccessBacklog && routePage === 'backlog') {
      setRoutePage(productionPage)
    }
  }, [canAccessBacklog, productionPage, routePage])

  useEffect(() => {
    if (typeof window === 'undefined') {
      return
    }

    if (backlogPersistTimerRef.current !== null) {
      window.clearTimeout(backlogPersistTimerRef.current)
    }

    backlogPersistTimerRef.current = window.setTimeout(() => {
      persistBacklogState(backlogState)
      backlogPersistTimerRef.current = null
    }, 180)

    return () => {
      if (backlogPersistTimerRef.current !== null) {
        window.clearTimeout(backlogPersistTimerRef.current)
      }
    }
  }, [backlogState])

  useEffect(() => {
    if (typeof window === 'undefined') {
      return
    }

    const compactQuery = window.matchMedia('(max-width: 768px)')
    const touchQuery = window.matchMedia('(hover: none) and (pointer: coarse)')

    const updateLayoutState = () => {
      const isCompact = compactQuery.matches
      const allowTouchSidebar = !isCompact && (touchQuery.matches || window.navigator.maxTouchPoints > 0)

      setCompactLayout(isCompact)
      setTouchSidebarEnabled(allowTouchSidebar)

      if (!allowTouchSidebar) {
        setTouchSidebarOpen(false)
      }
    }

    updateLayoutState()

    const handleCompactChange = () => updateLayoutState()
    const handleTouchChange = () => updateLayoutState()

    compactQuery.addEventListener('change', handleCompactChange)
    touchQuery.addEventListener('change', handleTouchChange)

    return () => {
      compactQuery.removeEventListener('change', handleCompactChange)
      touchQuery.removeEventListener('change', handleTouchChange)
    }
  }, [])

  useEffect(() => {
    return () => {
      Object.values(toastTimerIdsRef.current).forEach((timerId) => {
        window.clearTimeout(timerId)
      })
      toastTimerIdsRef.current = {}
      if (cardPanelCloseTimerRef.current !== null) {
        window.clearTimeout(cardPanelCloseTimerRef.current)
      }
      if (backlogPersistTimerRef.current !== null) {
        window.clearTimeout(backlogPersistTimerRef.current)
      }
    }
  }, [])

  useEffect(() => {
    if (selectedCard) {
      setIsClosingCardPanel(false)
      if (cardPanelCloseTimerRef.current !== null) {
        window.clearTimeout(cardPanelCloseTimerRef.current)
        cardPanelCloseTimerRef.current = null
      }
    }
  }, [selectedCard])

  function dismissToast(id: number) {
    const timerId = toastTimerIdsRef.current[id]
    if (timerId !== undefined) {
      window.clearTimeout(timerId)
      delete toastTimerIdsRef.current[id]
    }

    setToasts((current) => current.filter((toast) => toast.id !== id))
  }

  function showToast(message: string, tone: ToastTone) {
    const id = nextToastIdRef.current + 1
    nextToastIdRef.current = id

    setToasts((current) => [
      ...current,
      {
        id,
        message,
        tone,
      },
    ])

    toastTimerIdsRef.current[id] = window.setTimeout(() => {
      dismissToast(id)
    }, tone === 'red' ? 5000 : 3000)
  }

  function syncStateControls(nextState: AppState) {
    const nextPortfolio =
      nextState.portfolios.find((portfolio) => portfolio.id === nextState.activePortfolioId) ??
      nextState.portfolios[0] ??
      null

    if (nextPortfolio) {
      setBoardFilters((current) => ({
        ...current,
        brandNames:
          current.brandNames.filter((brand) =>
            nextPortfolio.brands.some((item) => item.name === brand),
          ).length > 0
            ? current.brandNames.filter((brand) =>
                nextPortfolio.brands.some((item) => item.name === brand),
              )
            : nextPortfolio.brands.map((brand) => brand.name),
        ownerNames:
          current.ownerNames.filter((owner) =>
            nextPortfolio.team.some((member) => member.name === owner),
          ),
      }))
      setSettingsPortfolioId(nextPortfolio.id)
    }
  }

  function replaceState(nextState: AppState) {
    localFallbackStateRef.current = nextState
    setState(() => nextState)
    syncStateControls(nextState)
  }

  function updateState(updater: (state: AppState) => AppState) {
    replaceState(updater(localFallbackStateRef.current))
  }

  function updatePortfolio(
    portfolioId: string,
    updater: (portfolio: Portfolio) => Portfolio,
  ) {
    updateState((current) => ({
      ...current,
      portfolios: current.portfolios.map((portfolio) =>
        portfolio.id === portfolioId ? updater(portfolio) : portfolio,
      ),
    }))
  }

  function switchToPortfolio(portfolioId: string) {
    const portfolioView =
      scopedPortfolios.find((item) => item.id === portfolioId) ?? scopedPortfolios[0] ?? null
    const portfolio =
      state.portfolios.find((item) => item.id === portfolioView?.id) ??
      state.portfolios.find((item) => item.id === portfolioId) ??
      state.portfolios[0]
    if (!portfolio || !portfolioView) {
      return
    }
    setState((current) => ({
      ...current,
      activePortfolioId: portfolio.id,
    }))
    setBoardFilters(getDefaultBoardFilters(portfolioView))
    setSettingsPortfolioId(portfolio.id)
    if (touchSidebarEnabled) {
      setTouchSidebarOpen(false)
    }
    if (state.activeRole.mode === 'contributor') {
      const nextEditor = getEditorOptions(portfolio)[0]
      setState((current) => ({
        ...current,
        activePortfolioId: portfolio.id,
        activeRole: {
          ...current.activeRole,
          editorId: nextEditor?.id ?? current.activeRole.editorId,
        },
      }))
    }
  }

  function setPage(page: ExtendedPage) {
    if (page === 'backlog') {
      if (!canAccessBacklog) {
        setRoutePage(productionPage)
        return
      }

      setRoutePage('backlog')
      setSelectedCard(null)
      return
    }

    if (getAllowedPageForRole(page, state.activeRole.mode) !== page) {
      return
    }

    setRoutePage(page)
    setState((current) => ({
      ...current,
      activePage: page,
    }))
    setSelectedCard(null)
  }

  function focusBoardAttention() {
    if (!attention.hasAttention || !activePortfolioView) {
      return
    }

    if (attention.stuckCount > 0) {
      setBoardFilters((current) => ({ ...current, stuckOnly: true, blockedOnly: false }))
      return
    }

    if (attention.blockedCount > 0) {
      setBoardFilters((current) => ({ ...current, stuckOnly: false, blockedOnly: true }))
    }
  }

  function handleSidebarPageChange(page: ExtendedPage) {
    setPage(page)
    if (touchSidebarEnabled) {
      setTouchSidebarOpen(false)
    }
    if (page === 'board') {
      focusBoardAttention()
    }
  }

  function getActorName(portfolio: Portfolio | null) {
    if (!authEnabled) {
      return 'Local User'
    }

    if (workspaceAccess?.editorName) {
      return workspaceAccess.editorName
    }

    if (authSession?.email) {
      return authSession.email
    }

    return portfolio?.team.find((member) => member.id === state.activeRole.editorId)?.name ?? 'Workspace user'
  }

  function setRole(nextRole: ActiveRole) {
    if (lockedRole && nextRole.mode !== lockedRole.mode) {
      return
    }

    let resolvedEditorId = nextRole.editorId
    if (nextRole.mode === 'contributor' && activePortfolioSource) {
      const nextEditor =
        getTeamMemberById(activePortfolioSource, nextRole.editorId) ??
        getEditorOptions(activePortfolioSource)[0]
      resolvedEditorId = nextEditor?.id ?? null
    }
    setState((current) => ({
      ...current,
      activeRole: {
        ...nextRole,
        editorId: resolvedEditorId,
      },
      activePage: getAllowedPageForRole(current.activePage, nextRole.mode),
    }))
    setEditorMenuOpen(false)
  }

  function handleCopy(key: string, value: string) {
    void copyToClipboard(value).then(() => setCopyState({ key }))
  }

  function handleQuickCreate() {
    if (!activePortfolioView) {
      return
    }

    const actor = getActorName(activePortfolioView)
    let card: Card

    try {
      card = createCardFromQuickInput(activePortfolioView, state.settings, quickCreateValue, actor)
    } catch (error) {
      showToast(error instanceof Error ? error.message : 'That card could not be created.', 'red')
      return
    }

    let created = false
    updatePortfolio(activePortfolioView.id, (portfolio) => {
      const nextPortfolio = addCardToPortfolio(portfolio, card, viewerContext)
      created = nextPortfolio !== portfolio
      return nextPortfolio
    })

    if (!created) {
      showToast('That card could not be created.', 'red')
      return
    }

    setQuickCreateOpen(false)
    setQuickCreateValue(getQuickCreateDefaults(activePortfolioView, state.settings))
    showToast(`${card.id} created`, 'green')
    setSelectedCard({
      portfolioId: activePortfolioView.id,
      cardId: card.id,
    })
  }

  function openCard(portfolioId: string, cardId: string) {
    if (cardPanelCloseTimerRef.current !== null) {
      window.clearTimeout(cardPanelCloseTimerRef.current)
      cardPanelCloseTimerRef.current = null
    }
    setIsClosingCardPanel(false)
    setSelectedCard({ portfolioId, cardId })
  }

  function requestCloseSelectedCard() {
    if (cardPanelCloseTimerRef.current !== null) {
      window.clearTimeout(cardPanelCloseTimerRef.current)
    }

    setIsClosingCardPanel(true)
    cardPanelCloseTimerRef.current = window.setTimeout(() => {
      setSelectedCard(null)
      setIsClosingCardPanel(false)
      cardPanelCloseTimerRef.current = null
    }, CARD_PANEL_CLOSE_DELAY_MS)
  }

  function saveOpenCard(updates: Partial<Card>) {
    if (!selectedCard || !activeSelectedPortfolio) {
      return
    }
    const actor = getActorName(activeSelectedPortfolio)
    updatePortfolio(activeSelectedPortfolio.id, (portfolio) =>
      applyCardUpdates(
        portfolio,
        state.settings,
        selectedCard.cardId,
        updates,
        actor,
        new Date().toISOString(),
        viewerContext,
      ),
    )
  }

  function requestDeleteOpenCard() {
    if (!selectedCard) {
      return
    }

    setPendingDeleteCard(selectedCard)
  }

  function handleDeleteCard() {
    if (!pendingDeleteCard) {
      return
    }

    const portfolio =
      state.portfolios.find((item) => item.id === pendingDeleteCard.portfolioId) ?? null
    if (!portfolio) {
      setPendingDeleteCard(null)
      return
    }

    const targetCard =
      portfolio.cards.find((card) => card.id === pendingDeleteCard.cardId) ?? null

    let deleted = false
    updatePortfolio(portfolio.id, (currentPortfolio) => {
      const nextPortfolio = removeCardFromPortfolio(
        currentPortfolio,
        pendingDeleteCard.cardId,
        viewerContext,
      )
      deleted = nextPortfolio !== currentPortfolio
      return nextPortfolio
    })

    if (!deleted) {
      showToast('That card could not be deleted.', 'red')
      return
    }

    setPendingDeleteCard(null)
    setSelectedCard(null)

    if (targetCard) {
      showToast(`${targetCard.id} deleted`, 'amber')
    }
  }

  function addCommentToCard(text: string, imageDataUrl?: string) {
    if (!selectedCard || !activeSelectedPortfolio) {
      return
    }
    const author = getActorName(activeSelectedPortfolio)
    const commentCard = activeSelectedPortfolio.cards.find((c) => c.id === selectedCard.cardId)
    updatePortfolio(activeSelectedPortfolio.id, (portfolio) => ({
      ...portfolio,
      cards: portfolio.cards.map((card) =>
        card.id === selectedCard.cardId
          ? {
              ...card,
              comments: [
                ...card.comments,
                {
                  author,
                  text,
                  timestamp: new Date().toISOString(),
                  ...(imageDataUrl ? { imageDataUrl } : {}),
                },
              ],
            }
          : card,
      ),
    }))
    if (commentCard) {
      const notification = createNotification(
        'comment_added',
        `New comment on "${commentCard.title}"`,
        selectedCard.cardId,
        activeSelectedPortfolio.id,
      )
      setState((prev) => ({
        ...prev,
        notifications: [...prev.notifications, notification],
      }))
    }
  }

  async function createDriveFolder() {
    if (!selectedCardData || !activeSelectedPortfolio) {
      return
    }

    const webhookUrl =
      activeSelectedPortfolio.webhookUrl || state.settings.integrations.globalDriveWebhookUrl
    if (!webhookUrl) {
      showToast('No Drive webhook configured — add one in Settings → General or the portfolio.', 'red')
      return
    }

    const brand = activeSelectedPortfolio.brands.find(
      (b) => b.name === selectedCardData.brand,
    )
    if (!brand?.driveParentFolderId) {
      showToast(
        `No Drive folder ID configured for brand "${selectedCardData.brand}" — add one in Settings → Portfolios.`,
        'red',
      )
      return
    }

    setCreatingDriveCardId(selectedCardData.id)
    try {
      const response = await fetch(webhookUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          cardId: selectedCardData.id,
          cardTitle: selectedCardData.title,
          productName: selectedCardData.product,
          brandName: selectedCardData.brand,
          parentFolderId: brand.driveParentFolderId,
          folderName: getCardFolderName(selectedCardData),
        }),
      })

      let folderUrl: string | null = null
      try {
        const result = await response.json()
        folderUrl = result?.folderUrl ?? result?.folder_url ?? null
      } catch {
        // response may not be JSON (e.g. plain text from Apps Script)
      }

      if (folderUrl) {
        saveOpenCard({ driveFolderUrl: folderUrl, driveFolderCreated: true })
        showToast('Drive folder created!', 'green')
      } else {
        // Mark as created even without URL — user can find it in Drive
        saveOpenCard({ driveFolderCreated: true })
        showToast('Drive folder request sent — check your Google Drive.', 'blue')
      }
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Unknown error'
      showToast(`Drive folder creation failed: ${message}`, 'red')
    } finally {
      setCreatingDriveCardId(null)
    }
  }

  function getDragMidpoint(event: DragOverEvent | DragEndEvent) {
    const translatedRect = event.active.rect.current.translated
    const initialRect = event.active.rect.current.initial
    const activeRect = translatedRect ?? initialRect

    if (!activeRect) {
      return null
    }

    return activeRect.top + activeRect.height / 2
  }

  function getDropTarget(
    overId: string | null,
    dragMidpointY: number | null = null,
    overRect: { top: number; height: number } | null = null,
  ) {
    if (!overId) {
      return null
    }
    const lane = laneMap[overId] ?? laneMap[itemToLaneMap[overId]]
    if (!lane) {
      return null
    }
    if (laneMap[overId]) {
      return {
        lane,
        destinationIndex: lane.allCardIds.length,
      }
    }
    const overIndex = lane.allCardIds.indexOf(overId)
    const insertAfterHoveredCard =
      overIndex !== -1 &&
      dragMidpointY !== null &&
      overRect !== null &&
      dragMidpointY > overRect.top + overRect.height / 2

    return {
      lane,
      destinationIndex:
        overIndex === -1
          ? lane.allCardIds.length
          : overIndex + (insertAfterHoveredCard ? 1 : 0),
    }
  }

  function validateBoardDrop(cardId: string, targetLane: LaneModel | null) {
    if (!activePortfolioView || !targetLane || targetLane.stage === 'Archived') {
      return {
        valid: false,
        message: 'That drop zone is not available.',
        tone: 'blue' as ToastTone,
      }
    }

    const validationMessage = getCardMoveValidationMessage(
      activePortfolioView,
      viewerContext,
      cardId,
      targetLane.stage as StageId,
      targetLane.owner,
    )
    if (validationMessage) {
      return {
        valid: false,
        message: validationMessage,
        tone: validationMessage.includes('at capacity') ? ('red' as ToastTone) : ('blue' as ToastTone),
      }
    }

    return {
      valid: true,
      message: '',
      tone: 'green' as ToastTone,
    }
  }

  function clearBoardDragState() {
    setDragCardId(null)
    setDragOverLaneId(null)
    setBlockedLaneId(null)
  }

  function handleBoardDragStart(event: DragStartEvent) {
    setDragCardId(String(event.active.id))
  }

  function handleBoardDragOver(event: DragOverEvent) {
    const target = getDropTarget(
      event.over ? String(event.over.id) : null,
      getDragMidpoint(event),
      event.over ? { top: event.over.rect.top, height: event.over.rect.height } : null,
    )
    const validation = validateBoardDrop(String(event.active.id), target?.lane ?? null)
    setDragOverLaneId(target?.lane.id ?? null)
    setBlockedLaneId(validation.valid ? null : target?.lane.id ?? null)
  }

  function applyMove(
    portfolioId: string,
    cardId: string,
    destinationStage: StageId,
    destinationOwner: string | null,
    destinationIndex: number,
    movedAt: string,
    revisionReason?: string,
    revisionEstimatedHours?: number | null,
    revisionFeedback?: string,
  ) {
    const portfolio = state.portfolios.find((item) => item.id === portfolioId)
    if (!portfolio) {
      return
    }
    const actor = getActorName(portfolio)
    const card = portfolio.cards.find((item) => item.id === cardId)
    if (!card) {
      return
    }
    let moved = false
    updatePortfolio(portfolioId, (currentPortfolio) => {
      const nextPortfolio = moveCardInPortfolio(
        currentPortfolio,
        cardId,
        destinationStage,
        destinationOwner,
        destinationIndex,
        movedAt,
        actor,
        viewerContext,
        revisionReason,
        revisionEstimatedHours,
        revisionFeedback,
        state.settings,
      )
      moved = nextPortfolio !== currentPortfolio
      return nextPortfolio
    })

    if (!moved) {
      showToast('That move is not allowed.', 'red')
      return
    }

    if (revisionReason) {
      showToast(`${card.id} moved back to ${destinationStage}`, 'amber')
      const notification = createNotification(
        'revision_requested',
        `"${card.title}" moved back to ${destinationStage}`,
        cardId,
        portfolioId,
      )
      setState((prev) => ({
        ...prev,
        notifications: [...prev.notifications, notification],
      }))
    } else if (card.stage === 'Backlog' && destinationOwner) {
      showToast(`${card.id} assigned to ${destinationOwner}`, 'blue')
      const notification = createNotification(
        'card_assigned',
        `"${card.title}" assigned to ${destinationOwner}`,
        cardId,
        portfolioId,
      )
      setState((prev) => ({
        ...prev,
        notifications: [...prev.notifications, notification],
      }))
    } else {
      showToast(`${card.id} → ${destinationStage}`, 'green')
      const notification = createNotification(
        'card_moved',
        `"${card.title}" moved to ${destinationStage}`,
        cardId,
        portfolioId,
      )
      setState((prev) => ({
        ...prev,
        notifications: [...prev.notifications, notification],
      }))
    }
  }

  function handleBoardDragEnd(event: DragEndEvent) {
    const cardId = String(event.active.id)
    const target = getDropTarget(
      event.over ? String(event.over.id) : null,
      getDragMidpoint(event),
      event.over ? { top: event.over.rect.top, height: event.over.rect.height } : null,
    )
    const validation = validateBoardDrop(cardId, target?.lane ?? null)

    if (!activePortfolioView || !target || !validation.valid) {
      clearBoardDragState()
      if (!validation.valid && validation.message) {
        showToast(validation.message, validation.tone)
      }
      return
    }

    const card = activePortfolioView.cards.find((item) => item.id === cardId)
    if (!card) {
      clearBoardDragState()
      return
    }

    const sourceLaneId = card.archivedAt ? `Archived::flat` : `${card.stage}::${(GROUPED_STAGES as readonly StageId[]).includes(card.stage) ? card.owner ?? 'flat' : 'flat'}`
    const sourceLane = laneMap[sourceLaneId]
    const sourceIndex = sourceLane?.allCardIds.indexOf(card.id) ?? -1
    let destinationIndex = target.destinationIndex
    if (sourceLaneId === target.lane.id && sourceIndex !== -1 && sourceIndex < destinationIndex) {
      destinationIndex -= 1
    }

    const nextOwner = target.lane.stage === 'Backlog' ? null : target.lane.owner ?? card.owner
    if (
      sourceLaneId === target.lane.id &&
      sourceIndex !== -1 &&
      sourceIndex === destinationIndex &&
      nextOwner === card.owner
    ) {
      clearBoardDragState()
      return
    }

    const movedAt = new Date().toISOString()
    const isBackwardMove = STAGES.indexOf(target.lane.stage as StageId) < STAGES.indexOf(card.stage)
    clearBoardDragState()

    if (isBackwardMove && state.activeRole.mode !== 'viewer') {
      setPendingBackwardMove({
        portfolioId: activePortfolioView.id,
        cardId: card.id,
        destinationStage: target.lane.stage as StageId,
        destinationOwner: nextOwner,
        destinationIndex,
        movedAt,
      })
      setBackwardMoveForm(getDefaultBackwardMoveForm(state.settings))
      return
    }

    applyMove(
      activePortfolioView.id,
      card.id,
      target.lane.stage as StageId,
      nextOwner,
      destinationIndex,
      movedAt,
    )
  }

  function handleWorkloadDragEnd(event: DragEndEvent) {
    if (
      !activePortfolioView ||
      (state.activeRole.mode !== 'owner' && state.activeRole.mode !== 'manager')
    ) {
      setDragCardId(null)
      return
    }
    const overId = event.over ? String(event.over.id) : null
    const memberId = overId?.replace('workload-member-', '')
    const member = getTeamMemberById(activePortfolioView, memberId ?? null)
    const card = activePortfolioView.cards.find((item) => item.id === String(event.active.id))
    if (!member || !card) {
      setDragCardId(null)
      return
    }
    if (card.stage !== 'Backlog') {
      setDragCardId(null)
      return
    }
    applyMove(activePortfolioView.id, card.id, 'Briefed', member.name, 0, new Date().toISOString())
    setDragCardId(null)
  }

  function handleWorkloadDragStart(event: DragStartEvent) {
    setDragCardId(String(event.active.id))
  }

  function handleWorkloadDragCancel() {
    setDragCardId(null)
  }

  function handleConfirmBackwardMove() {
    if (!pendingBackwardMove) {
      return
    }
    const selectedReason = getRevisionReasonById(state.settings, backwardMoveForm.reasonId)
    const reason =
      selectedReason?.id === 'revision-other'
        ? backwardMoveForm.otherReason.trim()
        : selectedReason?.name ?? ''
    const revisionEstimatedHours = Number(backwardMoveForm.estimatedHours) || 0
    if (!reason || revisionEstimatedHours <= 0) {
      return
    }
    const revisionFeedback = backwardMoveForm.feedback.trim()
    applyMove(
      pendingBackwardMove.portfolioId,
      pendingBackwardMove.cardId,
      pendingBackwardMove.destinationStage,
      pendingBackwardMove.destinationOwner,
      pendingBackwardMove.destinationIndex,
      pendingBackwardMove.movedAt,
      reason,
      revisionEstimatedHours,
      revisionFeedback,
    )
    setPendingBackwardMove(null)
  }

  function exportData() {
    const blob = new Blob([JSON.stringify(state, null, 2)], { type: 'application/json' })
    const url = URL.createObjectURL(blob)
    const link = document.createElement('a')
    link.href = url
    link.download = 'creative-board-data.json'
    link.click()
    URL.revokeObjectURL(url)
  }

  function resetToSeed() {
    setPendingAppConfirm('reset-seed')
  }

  function confirmResetToSeed() {
    const nextState = createSeedState()
    replaceState(nextState)
    setSelectedCard(null)
    setPendingAppConfirm(null)
    showToast('Board reset to defaults', 'amber')
  }

  function freshStartData() {
    setPendingAppConfirm('fresh-start')
  }

  function confirmFreshStartData() {
    const nextState = createFreshStartState(localFallbackStateRef.current)
    replaceState({
      ...nextState,
      activeRole: { mode: 'owner', editorId: null },
      activePage: 'settings',
    })
    setRoutePage('settings')
    setSelectedCard(null)
    setPendingAppConfirm(null)
    showToast('Fresh start applied. Brands and products were kept.', 'amber')

    if (authEnabled && workspaceAccess?.email) {
      void handlePruneWorkspaceAccessEntries(workspaceAccess.email).then(
        ({ removedCount, failedCount }) => {
          if (removedCount === 0 && failedCount === 0) {
            return
          }

          if (failedCount > 0) {
            showToast(
              'Cards and board people were cleared, but some login access records still need review.',
              'amber',
            )
            return
          }

          showToast(
            removedCount === 1
              ? 'Removed 1 older login access record.'
              : `Removed ${removedCount} older login access records.`,
            'blue',
          )
        },
      )
    }
  }

  const sidebarExpanded = compactLayout || sidebarPinned || sidebarHovered || touchSidebarOpen
  const toastView = <ToastStack toasts={toasts} onDismiss={dismissToast} />

  function resetBoardFilters() {
    setBoardFilters(getDefaultBoardFilters(activePortfolioView))
  }

  function dismissOnboardingBanner() {
    setOnboardingDismissed(true)
    if (typeof window !== 'undefined') {
      window.localStorage.setItem(ONBOARDING_DISMISSED_KEY, '1')
    }
  }

  if (authEnabled && passwordRecoveryActive) {
    return (
      <>
        <PasswordRecoveryGate
          authStatus={authStatus}
          email={authSession?.email ?? loginEmail ?? null}
          pending={passwordRecoveryPending}
          errorMessage={passwordRecoveryErrorMessage}
          onSubmit={handleCompletePasswordRecovery}
          onBackToSignIn={() => {
            void handleExitPasswordRecovery()
          }}
        />
        {toastView}
      </>
    )
  }

  if (authEnabled && authStatus !== 'signed-in') {
    return (
      <>
        <AuthGate
          authStatus={authStatus}
          email={loginEmail}
          pending={loginPending}
          errorMessage={loginErrorMessage}
          infoMessage={loginInfoMessage}
          onEmailChange={setLoginEmail}
          onPasswordSubmit={handlePasswordAuth}
        />
        {toastView}
      </>
    )
  }

  if (
    authEnabled &&
    authStatus === 'signed-in' &&
    accessStatus === 'granted' &&
    authSession &&
    syncStatus === 'loading'
  ) {
    return (
      <>
        <RemoteLoadingShell
          email={authSession.email}
          signOutPending={signOutPending}
          onSignOut={handleSignOut}
        />
        {toastView}
      </>
    )
  }

  if (
    authEnabled &&
    authStatus === 'signed-in' &&
    authSession &&
    (accessStatus === 'checking' || accessCheckTimedOut)
  ) {
    return (
      <>
        <AccessVerificationGate
          email={authSession.email}
          timedOut={accessCheckTimedOut}
          signOutPending={signOutPending}
          onRetry={handleRetryAccessCheck}
          onUseDifferentEmail={handleTryDifferentEmail}
          onSignOut={handleSignOut}
        />
        {toastView}
      </>
    )
  }

  if (
    authEnabled &&
    authStatus === 'signed-in' &&
    accessStatus !== 'granted' &&
    authSession
  ) {
    return (
      <>
        <AccessGate
          email={authSession.email}
          message={
            accessErrorMessage ??
            'This account does not have workspace access yet.'
          }
          title={accessStatus === 'error' ? 'We could not confirm access' : undefined}
          description={
            accessStatus === 'error'
              ? 'Your sign-in worked, but the workspace access check needs another try before the shared board can open. Contact your workspace owner if the approved access list should already include this account.'
              : undefined
          }
          onRetry={accessStatus === 'error' ? handleRetryAccessCheck : undefined}
          onUseDifferentEmail={handleTryDifferentEmail}
          signOutPending={signOutPending}
          onSignOut={handleSignOut}
        />
        {toastView}
      </>
    )
  }

  return (
    <div className="app-frame">
      <div
        className={`sidebar-hover-zone ${sidebarExpanded ? 'is-expanded' : ''}`}
        onMouseEnter={() => setSidebarHovered(true)}
        onMouseLeave={() => setSidebarHovered(false)}
      >
        <Sidebar
          expanded={sidebarExpanded}
          page={currentPage}
          portfolio={activePortfolioView}
          portfolios={scopedPortfolios}
          role={state.activeRole}
          canAccessBacklog={canAccessBacklog}
          userName={userDisplayName}
          userSecondaryLabel={userSecondaryLabel}
          signOutPending={signOutPending}
          attention={attention}
          onTogglePinned={() => {
            if (touchSidebarEnabled) {
              setTouchSidebarOpen((current) => !current)
              return
            }

            setSidebarPinned((current) => !current)
          }}
          onPortfolioChange={switchToPortfolio}
          onPageChange={handleSidebarPageChange}
          onSignOut={authEnabled ? handleSignOut : undefined}
        />
      </div>

      <div className="main-shell">
        {localModeBanner}

        {currentPage === 'board' && !activePortfolioView ? (
          <div className="page-shell">
            <PageHeader title={state.settings.general.appName} rightContent={headerUtilityContent} />
            <section className="board-empty-state" aria-live="polite">
              <strong>No visible portfolio is available right now</strong>
              <p>
                This account does not have access to a visible portfolio yet. Ask your workspace
                owner to update Access, or add work to a portfolio that matches this teammate
                profile.
              </p>
              {state.activeRole.mode === 'owner' ? (
                <div className="board-empty-actions">
                  <button type="button" className="primary-button" onClick={() => setPage('settings')}>
                    Open settings
                  </button>
                </div>
              ) : null}
            </section>
          </div>
        ) : null}

        {currentPage === 'board' && activePortfolioView ? (
          <BoardPage
            title={state.settings.general.appName}
            portfolio={activePortfolioView}
            settings={state.settings}
            boardFilters={boardFilters}
            setBoardFilters={setBoardFilters}
            hasActiveFilters={hasActiveBoardFilters}
            stats={stats}
            summary={summary}
            columns={columns}
            expandedStages={expandedStages}
            setExpandedStages={setExpandedStages}
            showOnboarding={state.activeRole.mode === 'owner' && !onboardingDismissed}
            searchCountLabel={
              boardFilters.searchQuery
                ? getSearchCountLabel(visibleBoardCards.length, searchBaseCards.length)
                : undefined
            }
            searchRef={searchRef}
            headerUtilityContent={headerUtilityContent}
            activeRoleMode={state.activeRole.mode}
            dragCardId={dragCardId}
            dragOverLaneId={dragOverLaneId}
            blockedLaneId={blockedLaneId}
            activeDragCard={activeDragCard}
            nowMs={nowMs}
            sensors={sensors}
            canDragCard={(card) =>
              state.activeRole.mode === 'owner' ||
              state.activeRole.mode === 'manager' ||
              (state.activeRole.mode === 'contributor' &&
                (isLaunchOpsActive
                  ? card.stage === 'Ready'
                  : viewerContext.editorName === card.owner && canEditorDragStage(card.stage)))
            }
            onOpenCard={openCard}
            onQuickCreateOpen={() => {
              setQuickCreateValue(getQuickCreateDefaults(activePortfolioView, state.settings))
              setQuickCreateOpen(true)
            }}
            onOpenSettings={() => setPage('settings')}
            onResetFilters={resetBoardFilters}
            onDismissOnboarding={dismissOnboardingBanner}
            onDragStart={handleBoardDragStart}
            onDragOver={handleBoardDragOver}
            onDragCancel={clearBoardDragState}
            onDragEnd={handleBoardDragEnd}
          />
        ) : null}

        {currentPage === 'backlog' ? (
          <BacklogPage
            backlog={backlogState}
            brandOptions={backlogBrandOptions}
            actorName={userDisplayName}
            canCreate={canAccessBacklog}
            headerUtilityContent={headerUtilityContent}
            onChange={setBacklogState}
          />
        ) : null}

        {currentPage === 'analytics' ? (
          <AnalyticsPage
            state={scopedState}
            nowMs={nowMs}
            headerUtilityContent={headerUtilityContent}
            onOpenCard={(portfolioId, cardId) => openCard(portfolioId, cardId)}
            onOpenPortfolioBoard={(portfolioId) => {
              switchToPortfolio(portfolioId)
              setPage('board')
            }}
            onOpenEditorBoard={(portfolioId, ownerName) => {
              switchToPortfolio(portfolioId)
              setPage('board')
              setBoardFilters((current) => ({
                ...current,
                ownerNames: [ownerName],
              }))
            }}
          />
        ) : null}

        {currentPage === 'workload' && activePortfolioView ? (
          <DndContext
            sensors={sensors}
            collisionDetection={closestCorners}
            onDragStart={handleWorkloadDragStart}
            onDragCancel={handleWorkloadDragCancel}
            onDragEnd={handleWorkloadDragEnd}
          >
            <WorkloadPage
              portfolio={activePortfolioView}
              settings={state.settings}
              timeframe={timeframe}
              nowMs={nowMs}
              canAssign={state.activeRole.mode === 'owner' || state.activeRole.mode === 'manager'}
              activeDragCardId={dragCardId}
              headerUtilityContent={headerUtilityContent}
              onTimeframeChange={setTimeframe}
              onOpenEditorBoard={(ownerName) => {
                setPage('board')
                setBoardFilters((current) => ({
                  ...current,
                  ownerNames: [ownerName],
                }))
              }}
              onOpenCard={(portfolioId, cardId) => openCard(portfolioId, cardId)}
            />
          </DndContext>
        ) : null}

        {currentPage === 'settings' ? (
          <SettingsPage
            state={state}
            authEnabled={authEnabled}
            settingsTab={settingsTab}
            headerUtilityContent={headerUtilityContent}
            workspaceAccessEntries={workspaceAccessEntries}
            workspaceAccessStatus={workspaceAccessStatus}
            workspaceAccessErrorMessage={workspaceAccessErrorMessage}
            workspaceAccessPendingEmail={workspaceAccessPendingEmail}
            onTabChange={setSettingsTab}
            onSettingsPortfolioChange={setSettingsPortfolioId}
            onBackToBoard={() => setPage('board')}
            onStateChange={updateState}
            localRole={state.activeRole}
            localEditorOptions={editorOptions}
            onLocalRoleChange={setRole}
          onExportData={exportData}
          onImportClick={() => importInputRef.current?.click()}
          onResetData={resetToSeed}
          onFreshStartData={freshStartData}
          onWorkspaceAccessSave={handleSaveWorkspaceAccessEntry}
          onWorkspaceAccessDelete={handleDeleteWorkspaceAccessEntry}
          showToast={showToast}
          />
        ) : null}
      </div>

      <input ref={importInputRef} type="file" accept="application/json" hidden />

      {quickCreateOpen && activePortfolioView ? (
        <QuickCreateModal
          portfolio={activePortfolioView}
          settings={state.settings}
          value={quickCreateValue}
          onChange={(updates) => setQuickCreateValue((current) => ({ ...current, ...updates }))}
          onClose={() => setQuickCreateOpen(false)}
          onCreate={handleQuickCreate}
        />
      ) : null}

      {pendingBackwardMove && pendingBackwardCard ? (
        <BackwardMoveModal
          card={pendingBackwardCard}
          destinationStage={pendingBackwardMove.destinationStage}
          settings={state.settings}
          formState={backwardMoveForm}
          onChange={(updates) =>
            setBackwardMoveForm((current) => ({
              ...current,
              ...updates,
            }))
          }
          onCancel={() => setPendingBackwardMove(null)}
          onConfirm={handleConfirmBackwardMove}
        />
      ) : null}

      {pendingDeleteCardData ? (
        <DeleteCardModal
          card={pendingDeleteCardData}
          onCancel={() => setPendingDeleteCard(null)}
          onConfirm={handleDeleteCard}
        />
      ) : null}

      {selectedCardData && activeSelectedPortfolio && activeSelectedPortfolioView ? (
        <CardDetailPanel
          key={selectedCardData.id}
          keyId={selectedCardData.id}
          portfolio={activeSelectedPortfolioView}
          card={selectedCardData}
          settings={state.settings}
          viewerMode={state.activeRole.mode}
          viewerName={viewerContext.editorName}
          viewerMemberRole={viewerContext.memberRole}
          copyState={copyState}
          isCreatingDriveFolder={creatingDriveCardId === selectedCardData.id}
          isOpen={!isClosingCardPanel}
          nowMs={nowMs}
          onClose={requestCloseSelectedCard}
          onCopy={handleCopy}
          onSave={saveOpenCard}
          onAddComment={addCommentToCard}
          onCreateDriveFolder={createDriveFolder}
          onRequestDelete={requestDeleteOpenCard}
        />
      ) : null}

      {pendingAppConfirm ? (
        <ConfirmDialog
          title={pendingAppConfirm === 'reset-seed' ? 'Reset to defaults?' : 'Start fresh?'}
          message={
            pendingAppConfirm === 'reset-seed' ? (
              <p>This restores the original demo workspace and removes your current changes.</p>
            ) : (
              <>
                <p>
                  This keeps your brands, products, and workspace settings, but removes cards,
                  board people, and extra login access records.
                </p>
                <p>Your current owner login will be kept so you do not get locked out.</p>
                <p>This action cannot be undone.</p>
              </>
            )
          }
          confirmLabel={pendingAppConfirm === 'reset-seed' ? 'Reset board' : 'Start fresh'}
          onCancel={() => setPendingAppConfirm(null)}
          onConfirm={pendingAppConfirm === 'reset-seed' ? confirmResetToSeed : confirmFreshStartData}
        />
      ) : null}

      {keyboardShortcutsOpen ? (
        <KeyboardShortcutsModal onClose={() => setKeyboardShortcutsOpen(false)} />
      ) : null}

      {toastView}
    </div>
  )
}

export default App
