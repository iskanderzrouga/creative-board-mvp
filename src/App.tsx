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
  getAllowedPageForDeveloper,
  getAllowedPageForRole,
  getBackwardMoveReasonOptions,
  getCurrentPage,
  type ExtendedAppPage,
  getDefaultBackwardMoveForm,
  getRoleFromWorkspaceAccess,
  getSearchCountLabel,
  isDeveloperRole,
  isBackwardMoveOtherReasonId,
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
import { DailyCheckinModal } from './components/DailyCheckinModal'
import { DailyPulsePage } from './components/DailyPulsePage'
import { NotificationBell } from './components/NotificationBell'
import { KeyboardShortcutsModal } from './components/KeyboardShortcutsModal'
import { PageHeader } from './components/PageHeader'
import { PasswordRecoveryGate } from './components/PasswordRecoveryGate'
import { QuickCreateModal } from './components/QuickCreateModal'
import { RemoteLoadingShell } from './components/RemoteLoadingShell'
import { SettingsPage } from './components/SettingsPage'
import { Sidebar } from './components/Sidebar'
import { ScriptWorkshopPage } from './components/ScriptWorkshopPage'
import { StrategyCyclesPage } from './components/StrategyCyclesPage'
import { SyncStatusPill } from './components/SyncStatusPill'
import { ToastStack } from './components/ToastStack'
import { FinancePage } from './components/FinancePage'
import { useAppEffects } from './hooks/useAppEffects'
import { WorkloadPage } from './components/WorkloadPage'
import { useWorkspaceSession } from './hooks/useWorkspaceSession'
import {
  loadBacklogState,
  type BacklogCard,
  type BacklogState,
} from './backlog'
import {
  isSupabaseConfigured,
} from './supabase'
import {
  formatDisplayDate,
  getCheckinDates,
  getCheckinsByDateRange,
  getDailyPulseRangeDays,
  getPreviousDayPlan,
  getTeamMembersForPulse,
  hasCheckinForDate,
  isDailyCheckinExemptUser,
  isDailyPulseExcludedPerson,
  normalizeDailyPulseRange,
  resolveViewerTimezone,
  submitDailyCheckin,
  type DailyPulseDateRange,
} from './dailyCheckins'
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
  getCardMoveValidationMessage,
  getDefaultBoardFilters,
  getEditorOptions,
  getEditorSummary,
  getNextProductionCardPriority,
  getQuickCreateDefaults,
  getTeamMemberById,
  getVisibleCards,
  getVisibleColumns,
  isProductionDevHandoffCard,
  getLatestScriptReview,
  isLaunchOpsRole,
  SCRIPT_REVIEWERS,
  createNotification,
  type ScriptConfidenceLevel,
  type ScriptReviewerId,
  markNotificationRead,
  markAllNotificationsRead,
  dismissNotification,
  loadAppState,
  loadSyncMetadata,
  moveCardInPortfolio,
  removeCardFromPortfolio,
  startEditorTimerForCard,
  setInProductionCardPriority,
  type ActiveRole,
  type AppNotification,
  type AppPage,
  type AppState,
  type BoardFilters,
  type Card,
  type DailyCheckinFormValues,
  type DailyPulseFeedItem,
  type LaneModel,
  type Portfolio,
  type QuickCreateInput,
  type SettingTab,
  type StageId,
  type StrategyCycle,
  type Timeframe,
  type ViewerContext,
} from './board'
import {
  notifyCreativeBlockerAdded,
  notifyCreativeBlockerRemoved,
  notifyCreativeReadyForReview,
  notifyCreativeTaskAssigned,
  notifyDevBlockerAdded,
  notifyDevBlockerRemoved,
  notifyDevReadyForReview,
  notifyDevTaskAssigned,
  notifyScriptReadyForReview,
} from './slackNotifications'

type ToastTone = 'green' | 'amber' | 'red' | 'blue'

interface ToastState {
  id: number
  message: string
  tone: ToastTone
}

type SyncStatus = 'local' | 'loading' | 'syncing' | 'synced' | 'error'
type ExtendedPage = ExtendedAppPage | 'finance'

interface CopyState {
  key: string
}

interface SelectedCardState {
  portfolioId: string
  cardId: string
}

interface CheckinTaskSummaryItem {
  id: string
  title: string
  stage: string
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

type PendingAppConfirm = 'reset-seed' | 'fresh-start'

const ONBOARDING_DISMISSED_KEY = 'editors-board:onboarding-dismissed:v1'
const CARD_PANEL_CLOSE_DELAY_MS = 240
const BACKLOG_ALLOWED_EMAIL_KEYS = new Set(['nicolas', 'naomi', 'iskander'])
const PERFORMANCE_ALLOWED_EMAIL_KEYS = new Set(['nicolas', 'naomi', 'iskander'])
const STRATEGY_LEADERS = [
  { name: 'Iskander', email: 'iskander@creativeboard.local' },
  { name: 'Naomi', email: 'naomi@creativeboard.local' },
  { name: 'Nicolas', email: 'nicolas@creativeboard.local' },
] as const

if (typeof window !== 'undefined') {
  try {
    const legacyState = window.localStorage.getItem('creative-board-state')
    if (legacyState && legacyState.length > 50000) {
      console.warn('[boot] Ignoring legacy local board cache; shared state loads from the current runtime source')
    }
  } catch {
    console.warn('[boot] localStorage unavailable; continuing without clearing browser storage')
  }
}

function hasDeveloperBoardRole(role: string | null | undefined) {
  const normalizedRole = role?.trim().toLowerCase() ?? null
  return (
    normalizedRole === 'developer' ||
    normalizedRole === 'dev' ||
    normalizedRole === 'development' ||
    normalizedRole === 'engineer' ||
    normalizedRole === 'dev/cro' ||
    normalizedRole === 'cro/dev' ||
    Boolean(normalizedRole?.includes('developer')) ||
    isDeveloperRole(role ?? null)
  )
}

function getPathForPage(page: ExtendedPage) {
  switch (page) {
    case 'backlog':
      return '/backlog'
    case 'analytics':
      return '/analytics'
    case 'workload':
      return '/workload'
    case 'pulse':
      return '/pulse'
    case 'scripts':
      return '/scripts'
    case 'strategy':
      return '/strategy'
    case 'finance':
      return '/finance'
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
    case '/dev':
      return 'board'
    case '/analytics':
      return 'analytics'
    case '/workload':
      return 'workload'
    case '/pulse':
      return 'pulse'
    case '/scripts':
      return 'scripts'
    case '/strategy':
      return 'strategy'
    case '/finance':
      return 'finance'
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

function canAccessPerformanceByEmail(email: string | null) {
  if (!email) {
    return false
  }

  const localPart = email.trim().toLowerCase().split('@')[0] ?? ''
  return PERFORMANCE_ALLOWED_EMAIL_KEYS.has(localPart)
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
  const mainDirtyRef = useRef(false)
  const backlogDirtyRef = useRef(false)
  const transferInProgressRef = useRef(false)
  const transferTimeoutRef = useRef<number | null>(null)
  const cardPanelCloseTimerRef = useRef<number | null>(null)
  const nextToastIdRef = useRef(0)
  const toastTimerIdsRef = useRef<Record<number, number>>({})
  const backlogRemoteHydratedRef = useRef(!authEnabled)
  const backlogRemoteSaveTimerRef = useRef<number | null>(null)
  const [routePage, setRoutePage] = useState<ExtendedPage>(() =>
    getPageFromPathname(
      typeof window !== 'undefined' ? window.location.pathname : '/board',
      getCurrentPage(loadAppState()),
    ),
  )
  const [dailyCheckinGateStatus, setDailyCheckinGateStatus] = useState<'checking' | 'required' | 'ready'>('checking')
  const [dailyCheckinTimezone, setDailyCheckinTimezone] = useState(() =>
    Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC',
  )
  const [dailyCheckinToday, setDailyCheckinToday] = useState('')
  const [dailyCheckinYesterdayPlan, setDailyCheckinYesterdayPlan] = useState<string | null>(null)
  const [dailyCheckinSubmitting, setDailyCheckinSubmitting] = useState(false)
  const [dailyCheckinError, setDailyCheckinError] = useState<string | null>(null)
  const [pulseDateRange, setPulseDateRange] = useState<DailyPulseDateRange | null>(null)
  const [pulsePersonFilter, setPulsePersonFilter] = useState('all')
  const [pulseFeedItems, setPulseFeedItems] = useState<DailyPulseFeedItem[]>([])
  const [pulseLoading, setPulseLoading] = useState(false)
  const [pulseError, setPulseError] = useState<string | null>(null)

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
  const allTeamMembers = useMemo(
    () =>
      state.portfolios.flatMap((portfolio) => portfolio.team).filter((member, index, list) => {
        const duplicateIndex = list.findIndex((current) => current.id === member.id)
        return duplicateIndex === index
      }),
    [state.portfolios],
  )
  const editorOptions = activePortfolioSource ? getEditorOptions(activePortfolioSource) : []
  const currentEditor = activePortfolioSource
    ? getTeamMemberById(activePortfolioSource, state.activeRole.editorId)
    : null
  const workspaceAccessEmail = workspaceAccess?.email?.trim().toLowerCase() ?? null
  const workspaceAccessEditorName = workspaceAccess?.editorName?.trim().toLowerCase() ?? null
  const accessMatchedMember =
    allTeamMembers.find((member) => {
      const memberEmail = member.accessEmail?.trim().toLowerCase() ?? null
      if (workspaceAccessEmail && memberEmail && workspaceAccessEmail === memberEmail) {
        return true
      }

      return Boolean(
        workspaceAccessEditorName && member.name.trim().toLowerCase() === workspaceAccessEditorName,
      )
    }) ?? null
  const isDeveloperUser =
    hasDeveloperBoardRole(currentEditor?.role ?? null) || hasDeveloperBoardRole(accessMatchedMember?.role ?? null)
  const productionPage: AppPage = isDeveloperUser
    ? (routePage === 'settings' ? 'settings' : routePage === 'pulse' ? 'pulse' : 'board')
    : getCurrentPage(state)
  const currentPage: ExtendedPage = isDeveloperUser
    ? getAllowedPageForDeveloper(routePage === 'finance' ? 'board' : routePage)
    : routePage === 'backlog' ||
        routePage === 'scripts' ||
        routePage === 'strategy' ||
        routePage === 'finance' ||
        routePage === 'pulse' ||
        routePage === 'settings'
      ? routePage
      : productionPage
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
    : 'Demo/local only'
  const backlogAccessEmail =
    authSession?.email?.trim().toLowerCase() ?? workspaceAccess?.email?.trim().toLowerCase() ?? null
  const canAccessPerformance = canAccessPerformanceByEmail(backlogAccessEmail)
  const dailyCheckinEmail = isDailyCheckinExemptUser(backlogAccessEmail) ? null : backlogAccessEmail
  const checkinIdentityKeys = useMemo(() => {
    const keys = new Set<string>()
    const normalizedEmail = dailyCheckinEmail?.trim().toLowerCase()
    const normalizedWorkspaceName = workspaceAccess?.editorName?.trim().toLowerCase()
    const normalizedCurrentEditorName = currentEditor?.name?.trim().toLowerCase()
    const normalizedMatchedMemberName = accessMatchedMember?.name?.trim().toLowerCase()

    if (normalizedEmail) {
      keys.add(normalizedEmail)
    }
    if (normalizedWorkspaceName) {
      keys.add(normalizedWorkspaceName)
    }
    if (normalizedCurrentEditorName) {
      keys.add(normalizedCurrentEditorName)
    }
    if (normalizedMatchedMemberName) {
      keys.add(normalizedMatchedMemberName)
    }

    return keys
  }, [accessMatchedMember?.name, currentEditor?.name, dailyCheckinEmail, workspaceAccess?.editorName])
  const checkinCreativeBoardTasks = useMemo<CheckinTaskSummaryItem[]>(() => {
    if (checkinIdentityKeys.size === 0) {
      return []
    }

    return state.portfolios
      .flatMap((portfolio) => portfolio.cards)
      .filter((card) => {
        if (card.archivedAt) {
          return false
        }
        const normalizedOwner = card.owner?.trim().toLowerCase()
        return Boolean(normalizedOwner && checkinIdentityKeys.has(normalizedOwner))
      })
      .map((card) => ({
        id: card.id,
        title: card.title,
        stage: card.stage,
      }))
  }, [checkinIdentityKeys, state.portfolios])
  const pulsePeopleOptions = useMemo(
    () => getTeamMembersForPulse(allTeamMembers).map((member) => member.name),
    [allTeamMembers],
  )
  const canAccessBacklog = !authEnabled || canAccessBacklogByEmail(backlogAccessEmail)

  useEffect(() => {
    if (pulsePersonFilter === 'all') {
      return
    }

    if (!pulsePeopleOptions.includes(pulsePersonFilter)) {
      setPulsePersonFilter('all')
    }
  }, [pulsePeopleOptions, pulsePersonFilter])
  const backlogBrandOptions = useMemo(() => {
    const uniqueBrands = new Set<string>()
    scopedPortfolios.forEach((portfolio) => {
      portfolio.brands.forEach((brand) => {
        uniqueBrands.add(brand.name)
      })
    })
    return Array.from(uniqueBrands)
  }, [scopedPortfolios])
  const backlogBrandStyles = useMemo(() => {
    const styles: Record<string, { background: string; color: string }> = {}
    scopedPortfolios.forEach((portfolio) => {
      portfolio.brands.forEach((brand) => {
        styles[brand.name] = {
          background: brand.surfaceColor,
          color: brand.textColor,
        }
      })
    })
    return styles
  }, [scopedPortfolios])
  const scriptWorkshopBrandOptions = useMemo(
    () => activePortfolioView?.brands.map((brand) => brand.name) ?? [],
    [activePortfolioView?.brands],
  )
  const scriptWorkshopBrandStyles = useMemo(() => {
    const styles: Record<string, { background: string; color: string }> = {}
    activePortfolioView?.brands.forEach((brand) => {
      styles[brand.name] = {
        background: brand.surfaceColor,
        color: brand.textColor,
      }
    })
    return styles
  }, [activePortfolioView?.brands])
  const canManageScripts = state.activeRole.mode === 'owner' || state.activeRole.mode === 'manager'
  const strategyCycles = state.strategyCycles ?? []
  const currentReviewerId = useMemo<ScriptReviewerId | null>(() => {
    const sessionEmail =
      authSession?.email?.trim().toLowerCase() ??
      workspaceAccess?.email?.trim().toLowerCase() ??
      null

    if (sessionEmail) {
      const byEmail = SCRIPT_REVIEWERS.find((reviewer) => reviewer.email.toLowerCase() === sessionEmail)
      if (byEmail) {
        return byEmail.id
      }
    }

    if (!authEnabled) {
      if (state.activeRole.mode === 'manager') {
        return 'naomi'
      }
      if (state.activeRole.mode === 'owner') {
        return 'iskander'
      }
      if (state.activeRole.mode === 'contributor' && activePortfolioSource) {
        const contributorName = getTeamMemberById(activePortfolioSource, state.activeRole.editorId)?.name ?? null
        const byName = SCRIPT_REVIEWERS.find((reviewer) => reviewer.name === contributorName)
        return byName?.id ?? null
      }
    }

    return null
  }, [
    activePortfolioSource,
    authEnabled,
    authSession?.email,
    state.activeRole.editorId,
    state.activeRole.mode,
    workspaceAccess?.email,
  ])
  const scriptAuthorName =
    (currentReviewerId ? SCRIPT_REVIEWERS.find((reviewer) => reviewer.id === currentReviewerId)?.name : null) ??
    userDisplayName
  const creativeProductionTaskTypeOptions = useMemo(
    () =>
      state.settings.taskLibrary
        .filter((taskType) => taskType.category === 'Creative')
        .map((taskType) => ({ id: taskType.id, name: taskType.name })),
    [state.settings.taskLibrary],
  )
  const devProductionTaskTypeOptions = useMemo(
    () =>
      state.settings.taskLibrary
        .filter((taskType) => taskType.category === 'Dev')
        .map((taskType) => ({ id: taskType.id, name: taskType.name })),
    [state.settings.taskLibrary],
  )
  const localModeBanner = !authEnabled ? (
    <section className="local-mode-banner" role="status" aria-live="polite">
      <div className="local-mode-copy">
        <strong>Demo mode: local browser only.</strong>
        <span>Supabase is not active here, so this is not the shared team workspace.</span>
      </div>
      <div className="local-mode-controls">
        <label className="local-mode-field">
          <span>Demo role</span>
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
    backlogState: backlogState,
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
      const nextPage = getPageFromPathname(window.location.pathname, state.activePage)

      if (isDeveloperUser) {
        const allowedPage = getAllowedPageForDeveloper(nextPage === 'finance' ? 'board' : nextPage)
        const nextActivePage = allowedPage === 'settings' ? 'settings' : allowedPage === 'pulse' ? 'pulse' : 'board'
        setRoutePage(allowedPage)
        setState((current) =>
          current.activePage === nextActivePage
            ? current
            : {
                ...current,
                activePage: nextActivePage,
              },
        )
        return
      }

      if (nextPage === 'backlog') {
        if (canAccessBacklog && (state.activeRole.mode === 'owner' || state.activeRole.mode === 'manager')) {
          setRoutePage('backlog')
        } else {
          const fallbackPage = getAllowedPageForRole(state.activePage, state.activeRole.mode)
          setRoutePage(fallbackPage)
          setState((current) => ({
            ...current,
            activePage: fallbackPage,
          }))
        }
        return
      }

      if (nextPage === 'scripts') {
        if (state.activeRole.mode === 'owner' || state.activeRole.mode === 'manager') {
          setRoutePage('scripts')
        } else {
          const fallbackPage = getAllowedPageForRole(state.activePage, state.activeRole.mode)
          setRoutePage(fallbackPage)
          setState((current) => ({
            ...current,
            activePage: fallbackPage,
          }))
        }
        return
      }

      if (nextPage === 'strategy') {
        if (state.activeRole.mode === 'owner' || state.activeRole.mode === 'manager') {
          setRoutePage('strategy')
        } else {
          const fallbackPage = getAllowedPageForRole(state.activePage, state.activeRole.mode)
          setRoutePage(fallbackPage)
          setState((current) => ({
            ...current,
            activePage: fallbackPage,
          }))
        }
        return
      }

      if (nextPage === 'finance') {
        if (authEnabled && (authStatus !== 'signed-in' || accessStatus === 'checking')) {
          return
        }
        if (canAccessPerformance) {
          setRoutePage('finance')
        } else {
          const fallbackPage = getAllowedPageForRole(state.activePage, state.activeRole.mode)
          setRoutePage(fallbackPage)
          setState((current) => ({
            ...current,
            activePage: fallbackPage,
          }))
        }
        return
      }

      const allowedPage = getAllowedPageForRole(nextPage, state.activeRole.mode)
      setRoutePage(allowedPage)
      setState((current) =>
        current.activePage === allowedPage
          ? current
          : {
              ...current,
              activePage: allowedPage,
            },
      )
    }

    handlePopState()
    window.addEventListener('popstate', handlePopState)

    return () => {
      window.removeEventListener('popstate', handlePopState)
    }
  }, [accessStatus, authEnabled, authStatus, canAccessBacklog, canAccessPerformance, isDeveloperUser, state.activePage, state.activeRole.mode])

  useEffect(() => {
    if (!canAccessBacklog && routePage === 'backlog') {
      setRoutePage(productionPage)
    }
  }, [canAccessBacklog, productionPage, routePage])

  useEffect(() => {
    if (isDeveloperUser) {
      if (routePage !== 'board' && routePage !== 'settings' && routePage !== 'pulse') {
        setRoutePage('board')
      }
      return
    }

    if (routePage === 'finance') {
      if (authEnabled && (authStatus !== 'signed-in' || accessStatus === 'checking')) {
        return
      }
      if (!canAccessPerformance) {
        setRoutePage(productionPage)
        return
      }
    }

    if (
      (routePage === 'scripts' || routePage === 'strategy') &&
      state.activeRole.mode !== 'owner' &&
      state.activeRole.mode !== 'manager'
    ) {
      setRoutePage(productionPage)
    }
  }, [accessStatus, authEnabled, authStatus, canAccessPerformance, isDeveloperUser, productionPage, routePage, state.activeRole.mode])

  useEffect(() => {
    if (authEnabled && (authStatus !== 'signed-in' || accessStatus !== 'granted')) {
      setDailyCheckinGateStatus('checking')
      return
    }

    const timezone = resolveViewerTimezone(allTeamMembers, dailyCheckinEmail, workspaceAccess?.editorName ?? null)
    const { today, yesterday } = getCheckinDates(timezone)
    setDailyCheckinTimezone(timezone)
    setDailyCheckinToday(today)
    setPulseDateRange((current) => current ?? { from: today, to: today })

    if (!dailyCheckinEmail) {
      setDailyCheckinGateStatus('ready')
      return
    }

    let cancelled = false
    setDailyCheckinGateStatus('checking')
    setDailyCheckinError(null)

    void hasCheckinForDate(dailyCheckinEmail, today).then(async ({ data, error }) => {
      if (cancelled) {
        return
      }

      if (error) {
        setDailyCheckinGateStatus('ready')
        return
      }

      if (data) {
        setDailyCheckinGateStatus('ready')
        return
      }

      const previousDayPlanResult = await getPreviousDayPlan(dailyCheckinEmail, yesterday)
      if (cancelled) {
        return
      }

      setDailyCheckinYesterdayPlan(previousDayPlanResult.data)
      setDailyCheckinGateStatus('required')
    })

    return () => {
      cancelled = true
    }
  }, [
    accessStatus,
    allTeamMembers,
    authEnabled,
    authStatus,
    dailyCheckinEmail,
    workspaceAccess?.editorName,
  ])

  useEffect(() => {
    if (!pulseDateRange) {
      return
    }

    const normalizedRange = normalizeDailyPulseRange(pulseDateRange)
    const rangeDays = getDailyPulseRangeDays(normalizedRange)
    const members = getTeamMembersForPulse(allTeamMembers)
    const checkinsByDateAndIdentity = new Map<string, DailyPulseFeedItem['checkin']>()
    let cancelled = false

    setPulseLoading(true)
    setPulseError(null)

    void getCheckinsByDateRange(normalizedRange).then(({ data, error }) => {
      if (cancelled) {
        return
      }

      if (error) {
        setPulseLoading(false)
        setPulseError('Daily Pulse is unavailable in local mode.')
        const fallbackItems = rangeDays.flatMap((date) => members.map((member) => ({ date, member, checkin: null })))
        setPulseFeedItems(fallbackItems)
        return
      }

      const visibleCheckins = data.filter(
        (checkin) => !isDailyPulseExcludedPerson({ email: checkin.user_email, name: checkin.user_name }),
      )

      visibleCheckins.forEach((checkin) => {
        const emailKey = checkin.user_email.trim().toLowerCase()
        const nameKey = checkin.user_name.trim().toLowerCase()
        checkinsByDateAndIdentity.set(`${checkin.checkin_date}:${emailKey}`, checkin)
        checkinsByDateAndIdentity.set(`${checkin.checkin_date}:${nameKey}`, checkin)
      })

      const withMissing = rangeDays.flatMap((date) =>
        members.map((member) => {
          const emailKey = member.email?.trim().toLowerCase() ?? ''
          const nameKey = member.name.trim().toLowerCase()
          return {
            date,
            member,
            checkin:
              checkinsByDateAndIdentity.get(`${date}:${emailKey}`) ??
              checkinsByDateAndIdentity.get(`${date}:${nameKey}`) ??
              null,
          }
        }),
      )

      const unknownContributors = visibleCheckins
        .filter((checkin) =>
          withMissing.every(
            (entry) =>
              entry.date !== checkin.checkin_date ||
              entry.member.name.trim().toLowerCase() !== checkin.user_name.trim().toLowerCase() &&
              (entry.member.email?.trim().toLowerCase() ?? '') !== checkin.user_email.trim().toLowerCase(),
          ),
        )
        .map((checkin) => ({
          date: checkin.checkin_date,
          member: {
            name: checkin.user_name,
            email: checkin.user_email,
          },
          checkin,
        }))

      const merged = [...withMissing, ...unknownContributors]
      merged.sort((a, b) => {
        if (a.date !== b.date) {
          return b.date.localeCompare(a.date)
        }
        if (!a.checkin && !b.checkin) {
          return a.member.name.localeCompare(b.member.name)
        }
        if (!a.checkin) {
          return 1
        }
        if (!b.checkin) {
          return -1
        }
        return a.checkin.created_at.localeCompare(b.checkin.created_at)
      })

      setPulseFeedItems(merged)
      setPulseLoading(false)
    })

    return () => {
      cancelled = true
    }
  }, [allTeamMembers, pulseDateRange])

  // Backlog localStorage persist + remote sync is now handled inside useAppEffects

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

  function markMainDirty(reason: string) {
    mainDirtyRef.current = true
    console.log('[main save] marked dirty', { reason, timestamp: new Date().toISOString() })
  }

  function markBacklogDirty(reason: string) {
    backlogDirtyRef.current = true
    console.log('[backlog save] marked dirty', { reason, timestamp: new Date().toISOString() })
  }

  function clearTransferTimeout() {
    if (transferTimeoutRef.current !== null) {
      window.clearTimeout(transferTimeoutRef.current)
      transferTimeoutRef.current = null
    }
  }

  function beginTransferWindow(context: string) {
    transferInProgressRef.current = true
    clearTransferTimeout()
    transferTimeoutRef.current = window.setTimeout(() => {
      transferInProgressRef.current = false
      transferTimeoutRef.current = null
      console.warn('[transfer] WARNING: transfer window auto-cleared by timeout — this should not happen in normal flow', {
        context,
        timestamp: new Date().toISOString(),
      })
    }, 1500)
    console.log('[transfer] creating destination card', { context, timestamp: new Date().toISOString() })
  }

  function endTransferWindow(context: string) {
    clearTransferTimeout()
    transferInProgressRef.current = false
    console.log('[transfer] transfer window closed', { context, timestamp: new Date().toISOString() })
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
    markMainDirty('local mutation')
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
    if (isDeveloperUser) {
      const allowedPage = getAllowedPageForDeveloper(page === 'finance' ? 'board' : page)
      setRoutePage(allowedPage)
      setState((current) => ({
        ...current,
        activePage: allowedPage === 'settings' ? 'settings' : allowedPage === 'pulse' ? 'pulse' : 'board',
      }))
      setSelectedCard(null)
      return
    }

    if (page === 'backlog') {
      if (!canAccessBacklog) {
        setRoutePage(productionPage)
        return
      }

      setRoutePage('backlog')
      setSelectedCard(null)
      return
    }

    if (page === 'scripts') {
      if (!(state.activeRole.mode === 'owner' || state.activeRole.mode === 'manager')) {
        return
      }
      setRoutePage('scripts')
      setSelectedCard(null)
      return
    }

    if (page === 'strategy') {
      if (!(state.activeRole.mode === 'owner' || state.activeRole.mode === 'manager')) {
        return
      }
      setRoutePage('strategy')
      setSelectedCard(null)
      return
    }

    if (page === 'finance') {
      if (!canAccessPerformance) {
        return
      }
      setRoutePage('finance')
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

  function handleSidebarPageChange(page: ExtendedPage) {
    setPage(page)
    if (touchSidebarEnabled) {
      setTouchSidebarOpen(false)
    }
  }

  async function handleDailyCheckinSubmit(values: DailyCheckinFormValues) {
    if (!dailyCheckinEmail || !dailyCheckinToday) {
      setDailyCheckinGateStatus('ready')
      return
    }

    setDailyCheckinSubmitting(true)
    setDailyCheckinError(null)
    const { error } = await submitDailyCheckin(
      dailyCheckinEmail,
      userDisplayName,
      dailyCheckinToday,
      values,
    )

    if (error) {
      if (error === 'supabase-not-configured') {
        setDailyCheckinGateStatus('ready')
        setDailyCheckinSubmitting(false)
        return
      }
      setDailyCheckinError('We could not submit your check-in. Please try again.')
      setDailyCheckinSubmitting(false)
      return
    }

    setDailyCheckinGateStatus('ready')
    setDailyCheckinSubmitting(false)
    if (isDeveloperUser) {
      setPage('board')
    }
  }

  function handleAddScript(input: { title: string; brand: string; googleDocUrl: string }) {
    if (!canManageScripts) {
      return
    }

    const timestamp = new Date().toISOString()
    const scriptId = `script-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`

    updateState((current) => ({
      ...current,
      scriptWorkshop: {
        scripts: [
          ...current.scriptWorkshop.scripts,
          {
            id: scriptId,
            title: input.title,
            brand: input.brand,
            googleDocUrl: input.googleDocUrl,
            reviews: {
              naomi: [],
              iskander: [],
              nicolas: [],
            },
            comments: [],
            createdAt: timestamp,
            updatedAt: timestamp,
          },
        ],
      },
    }))

    try {
      notifyScriptReadyForReview({
        scriptTitle: input.title,
        brand: input.brand,
      })
    } catch (error) {
      console.error('Script review notification trigger failed.', error)
    }
    showToast('Script added to active workshop.', 'green')
  }

  function handleUpdateScript(scriptId: string, updates: { title?: string; brand?: string; googleDocUrl?: string }) {
    if (!canManageScripts) {
      return
    }

    const timestamp = new Date().toISOString()
    updateState((current) => ({
      ...current,
      scriptWorkshop: {
        scripts: current.scriptWorkshop.scripts.map((script) =>
          script.id === scriptId
            ? {
                ...script,
                title: updates.title ?? script.title,
                brand: updates.brand ?? script.brand,
                googleDocUrl: updates.googleDocUrl ?? script.googleDocUrl,
                updatedAt: timestamp,
              }
            : script,
        ),
      },
    }))
  }

  function handleSubmitScriptReview(
    scriptId: string,
    reviewerId: ScriptReviewerId,
    confidence: ScriptConfidenceLevel,
    comment: string,
  ) {
    if (currentReviewerId !== reviewerId || !comment.trim()) {
      return
    }

    const timestamp = new Date().toISOString()
    const reviewId = `review-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`

    updateState((current) => ({
      ...current,
      scriptWorkshop: {
        scripts: current.scriptWorkshop.scripts.map((script) => {
          if (script.id !== scriptId) {
            return script
          }

          const nextHistory = [
            ...(script.reviews[reviewerId] ?? []),
            {
              id: reviewId,
              reviewerId,
              confidence,
              comment: comment.trim(),
              timestamp,
            },
          ]

          return {
            ...script,
            reviews: {
              ...script.reviews,
              [reviewerId]: nextHistory,
            },
            updatedAt: timestamp,
          }
        }),
      },
    }))

    const script = state.scriptWorkshop.scripts.find((item) => item.id === scriptId)
    const readyAfterSubmit = script
      ? SCRIPT_REVIEWERS.every((reviewer) => {
          if (reviewer.id === reviewerId) {
            return confidence === 'high'
          }
          return getLatestScriptReview(script, reviewer.id)?.confidence === 'high'
        })
      : false

    showToast(readyAfterSubmit ? 'Script is ready to launch.' : 'Review submitted.', 'green')
  }

  function handleAddScriptComment(scriptId: string, text: string) {
    if (!text.trim()) {
      return
    }

    const timestamp = new Date().toISOString()
    const commentId = `script-comment-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`

    updateState((current) => ({
      ...current,
      scriptWorkshop: {
        scripts: current.scriptWorkshop.scripts.map((script) =>
          script.id === scriptId
            ? {
                ...script,
                comments: [
                  ...script.comments,
                  {
                    id: commentId,
                    author: scriptAuthorName,
                    text: text.trim(),
                    timestamp,
                  },
                ],
                updatedAt: timestamp,
              }
            : script,
        ),
      },
    }))
  }

  function buildDefaultStrategyCycleLevers(): StrategyCycle['levers'] {
    return ['Creative', 'Funnel', 'Offers'].map((name, leverIndex) => ({
      id: `lever-${Date.now()}-${Math.random().toString(36).slice(2, 8)}-${leverIndex}`,
      name,
      objective: '',
      kpis: [0, 1, 2].map((kpiIndex) => ({
        id: `kpi-${Date.now()}-${Math.random().toString(36).slice(2, 8)}-${leverIndex}-${kpiIndex}`,
        description: '',
        target: 0,
        actual: 0,
      })),
    }))
  }

  function handleCreateStrategyCycle(input: { name: string; startDate: string; endDate: string }) {
    if (!input.name.trim() || !input.startDate || !input.endDate) {
      return
    }

    const createdAt = new Date().toISOString()
    const newCycle: StrategyCycle = {
      id: `strategy-cycle-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
      name: input.name.trim(),
      startDate: input.startDate,
      endDate: input.endDate,
      objective: '',
      levers: buildDefaultStrategyCycleLevers(),
      conclusions: STRATEGY_LEADERS.map((leader) => ({
        authorEmail: leader.email,
        authorName: leader.name,
        text: '',
        updatedAt: createdAt,
      })),
      isActive: true,
      createdAt,
    }

    updateState((current) => ({
      ...current,
      strategyCycles: [newCycle, ...(current.strategyCycles ?? []).map((cycle) => ({ ...cycle, isActive: false }))],
    }))
  }

  function handleUpdateStrategyCycle(cycleId: string, updater: (cycle: StrategyCycle) => StrategyCycle) {
    updateState((current) => ({
      ...current,
      strategyCycles: (current.strategyCycles ?? []).map((cycle) =>
        cycle.id === cycleId ? updater(cycle) : cycle,
      ),
    }))
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

  function handleBacklogToProduction(
    card: BacklogCard,
  ): { ok: true; cardId: string; portfolioId: string } | { ok: false; message: string } {
    beginTransferWindow('backlog->production')
    console.log('[Backlog→Production] handleBacklogToProduction called', {
      backlogCardId: card.id,
      backlogCardName: card.name,
      brand: card.brand,
      taskType: card.taskType,
      productionTaskType: card.productionTaskType,
    })

    const matchingPortfolioViews = scopedPortfolios.filter((portfolio) =>
      portfolio.brands.some((brand) => brand.name === card.brand),
    )
    console.log('[Backlog→Production] matching portfolios for brand', {
      brand: card.brand,
      portfolioIds: matchingPortfolioViews.map((portfolio) => portfolio.id),
    })

    if (matchingPortfolioViews.length !== 1) {
      const message =
        matchingPortfolioViews.length === 0
          ? `Could not find a Production portfolio for brand "${card.brand}".`
          : `More than one Production portfolio matches brand "${card.brand}".`
      console.error('[Backlog→Production] unable to resolve a unique target portfolio', {
        brand: card.brand,
        matchCount: matchingPortfolioViews.length,
      })
      console.log('[Backlog→Production] returning', { ok: false, message })
      return { ok: false, message }
    }

    const portfolioView = matchingPortfolioViews[0]
    const portfolioSource =
      state.portfolios.find((portfolio) => portfolio.id === portfolioView.id) ?? portfolioView ?? null

    if (!portfolioSource) {
      const message = 'Could not find the destination portfolio in the current workspace.'
      console.error('[Backlog→Production] target portfolio source missing', {
        portfolioId: portfolioView.id,
      })
      console.log('[Backlog→Production] returning', { ok: false, message })
      return { ok: false, message }
    }

    const existingProductionCard =
      portfolioSource.cards.find((existingCard) => existingCard.sourceBacklogCardId === card.id) ?? null
    if (existingProductionCard) {
      return {
        ok: true,
        cardId: existingProductionCard.id,
        portfolioId: portfolioSource.id,
      }
    }

    const quickCreateDefaults = getQuickCreateDefaults(portfolioSource, state.settings)
    const brand = portfolioSource.brands.find((item) => item.name === card.brand)
    const product = brand?.products[0] || quickCreateDefaults.product || ''
    const defaultDevTaskTypeId =
      state.settings.taskLibrary.find((taskType) => taskType.category === 'Dev')?.id ??
      quickCreateDefaults.taskTypeId ??
      state.settings.taskLibrary[0]?.id ??
      'custom'
    const taskTypeId =
      card.productionTaskType?.trim() ||
      (card.taskType === 'dev-cro' ? defaultDevTaskTypeId : quickCreateDefaults.taskTypeId) ||
      state.settings.taskLibrary[0]?.id ||
      'custom'
    const actor = getActorName(portfolioSource)

    console.log('[Backlog→Production] resolved target portfolio', {
      portfolioId: portfolioSource.id,
      portfolioName: portfolioSource.name,
      product,
    })

    let productionCard: Card

    try {
      productionCard = createCardFromQuickInput(
        portfolioSource,
        state.settings,
        {
          title: card.name,
          brand: card.brand,
          taskTypeId,
          product,
          angle: card.angleTheme ?? '',
          sourceCardId: null,
        },
        actor,
      )
      console.log('[Backlog→Production] createCardFromQuickInput result', {
        cardId: productionCard.id,
        stage: productionCard.stage,
        brand: productionCard.brand,
        product: productionCard.product,
      })
    } catch (error) {
      const message =
        error instanceof Error
          ? `Could not create the Production card: ${error.message}`
          : 'Could not create the Production card because the card data was invalid.'
      console.error('[Backlog→Production] createCardFromQuickInput failed', {
        error,
        taskTypeId,
        product,
      })
      console.log('[Backlog→Production] returning', { ok: false, message })
      return { ok: false, message }
    }

    const referenceLinks = card.referenceLinks ?? ''
    const devChangeUrl = card.taskType === 'dev-cro' ? card.linkForChanges?.trim() ?? '' : ''
    const devTestUrl = card.taskType === 'dev-cro' ? card.linkForTest?.trim() ?? '' : ''
    const devLinks = [
      devChangeUrl ? { url: devChangeUrl, label: 'Link for changes' } : null,
      devTestUrl ? { url: devTestUrl, label: 'Link for test' } : null,
    ].filter((link): link is { url: string; label: string } => link !== null)

    productionCard = {
      ...productionCard,
      sourceBacklogCardId: card.id,
      brief: card.taskType === 'creative' ? card.brief ?? '' : card.taskDescription ?? '',
      audience: card.targetAudience ?? '',
      platform: (card.platform as Card['platform'] | undefined) ?? productionCard.platform,
      funnelStage: (card.funnelStage as Card['funnelStage'] | undefined) ?? productionCard.funnelStage,
      angle: card.angleTheme ?? '',
      landingPage: devChangeUrl && !/figma\.com/i.test(devChangeUrl) ? devChangeUrl : productionCard.landingPage,
      figmaUrl: devChangeUrl && /figma\.com/i.test(devChangeUrl) ? devChangeUrl : productionCard.figmaUrl,
      keyMessage: card.keyMessage ?? '',
      visualDirection: card.visualDirection ?? '',
      cta: card.cta ?? '',
      referenceLinks,
      adCopy: card.adCopy ?? '',
      notes: card.notes ?? '',
      links: devLinks.length > 0 ? devLinks : productionCard.links,
      frameioLink: devTestUrl ? [devTestUrl] : productionCard.frameioLink,
    }

    let createdCardId: string | null = null
    let createdPortfolioId: string | null = null
    try {
      updatePortfolio(portfolioSource.id, (portfolio) => {
        const nextPortfolio = addCardToPortfolio(portfolio, productionCard, viewerContext)
        const insertedCard = nextPortfolio.cards.find((existingCard) => existingCard.id === productionCard.id) ?? null

        console.log('[Backlog→Production] addCardToPortfolio result', {
          portfolioId: portfolio.id,
          samePortfolioReference: nextPortfolio === portfolio,
          previousCardCount: portfolio.cards.length,
          nextCardCount: nextPortfolio.cards.length,
          insertedCardId: insertedCard?.id ?? null,
          insertedCardStage: insertedCard?.stage ?? null,
        })

        if (insertedCard) {
          createdCardId = insertedCard.id
          createdPortfolioId = portfolio.id
        }

        return nextPortfolio
      })
    } catch (error) {
      console.error('[Backlog→Production] addCardToPortfolio failed', {
        backlogCardId: card.id,
        productionCardId: productionCard.id,
        error,
      })
      return {
        ok: false,
        message:
          error instanceof Error
            ? `Could not move card to Production: ${error.message}`
            : 'Could not move card to Production due to an unexpected error.',
      }
    }

    console.log('[Backlog→Production] post-updatePortfolio state', {
      createdCardId,
      createdPortfolioId,
      statePortfolioCardCount:
        createdPortfolioId
          ? localFallbackStateRef.current.portfolios.find((portfolio) => portfolio.id === createdPortfolioId)?.cards.length ?? null
          : null,
    })

    if (!createdCardId || !createdPortfolioId) {
      const message =
        'Could not confirm that the Production card was inserted. Please refresh and try again.'
      console.error('[Backlog→Production] missing inserted card after updatePortfolio', {
        backlogCardId: card.id,
        productionCardId: productionCard.id,
      })
      console.log('[Backlog→Production] returning', { ok: false, message })
      return { ok: false, message }
    }

    if (state.activePortfolioId !== createdPortfolioId) {
      updateState((current) => ({
        ...current,
        activePortfolioId: createdPortfolioId!,
      }))
      console.log('[Backlog→Production] switched active portfolio', {
        activePortfolioId: createdPortfolioId,
      })
    }

    setBoardFilters((current) => {
      if (current.brandNames.length === 0 || current.brandNames.includes(card.brand)) {
        return current
      }

      const nextFilters = {
        ...current,
        brandNames: [...current.brandNames, card.brand],
      }
      console.log('[Backlog→Production] updated board filters for visibility', nextFilters)
      return nextFilters
    })

    const resolvedWebhookUrl =
      portfolioSource.webhookUrl.trim() || state.settings.integrations.globalDriveWebhookUrl.trim() || 'https://script.google.com/macros/s/AKfycbwGLeDoc3VSY8rM65iI6LCD14JsUHxgyxF-25yggFhZKv2p3s2y-tRvv1qvHJeHfykpng/exec'

    if (card.taskType === 'creative' && resolvedWebhookUrl) {
      const nextProductionCardId = createdCardId
      const webhookPayload = {
        cardId: nextProductionCardId,
        cardTitle: card.name,
        portfolioName: portfolioSource.name,
        brand: card.brand,
        parentFolderId: brand?.driveParentFolderId ?? '',
        brief: card.brief ?? '',
        targetAudience: card.targetAudience ?? '',
        keyMessage: card.keyMessage ?? '',
        visualDirection: card.visualDirection ?? '',
        platform: card.platform ?? '',
        funnelStage: card.funnelStage ?? '',
        angleTheme: card.angleTheme ?? '',
        cta: card.cta ?? '',
        referenceLinks: card.referenceLinks ?? '',
        adCopy: card.adCopy ?? '',
        notes: card.notes ?? '',
      }

      void (async () => {
        try {
          const response = await fetch(resolvedWebhookUrl, {
            method: 'POST',
            redirect: 'follow',
            body: JSON.stringify(webhookPayload),
          })

          let result: {
            success?: boolean
            folderUrl?: string
            subfolderUrl?: string
            briefDocUrl?: string
            message?: string
          } | null = null

          try {
            result = await response.json()
          } catch {
            throw new Error('Drive webhook returned an invalid JSON response.')
          }

          if (!response.ok || !result?.success) {
            throw new Error(result?.message || `Drive webhook failed with status ${response.status}.`)
          }

          updatePortfolio(portfolioSource.id, (portfolio) => ({
            ...portfolio,
            cards: portfolio.cards.map((existingCard) =>
              existingCard.id === nextProductionCardId
                ? {
                    ...existingCard,
                    driveFolderUrl: result?.folderUrl ?? existingCard.driveFolderUrl,
                    driveFolderCreated: true,
                  }
                : existingCard,
            ),
          }))
          showToast('Card moved to Production board. Drive folder created.', 'green')
        } catch (error) {
          console.error('Backlog to Production Drive folder creation failed.', {
            cardId: nextProductionCardId,
            error,
          })
          showToast(
            'Card moved to Production but Drive folder creation failed. Use the manual Create Drive Folder button.',
            'amber',
          )
        }
      })()
    }

    const result = { ok: true as const, cardId: createdCardId, portfolioId: createdPortfolioId }
    console.log('[Backlog→Production] returning', result)
    return result
  }

  function openCard(portfolioId: string, cardId: string) {
    if (cardPanelCloseTimerRef.current !== null) {
      window.clearTimeout(cardPanelCloseTimerRef.current)
      cardPanelCloseTimerRef.current = null
    }
    setIsClosingCardPanel(false)
    setSelectedCard({ portfolioId, cardId })
  }

  function handleSaveBoardCardTitle(portfolioId: string, cardId: string, title: string) {
    const nextTitle = title.trim()
    if (!nextTitle) {
      return
    }

    const actor = getActorName(state.portfolios.find((portfolio) => portfolio.id === portfolioId) ?? null)
    updatePortfolio(portfolioId, (portfolio) =>
      applyCardUpdates(
        portfolio,
        state.settings,
        cardId,
        { title: nextTitle },
        actor,
        new Date().toISOString(),
        viewerContext,
      ),
    )
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

    const previousCard = activeSelectedPortfolio.cards.find((card) => card.id === selectedCard.cardId) ?? null
    const nextCard = previousCard ? { ...previousCard, ...updates } : null

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

    if (!previousCard || !nextCard) {
      return
    }

    const resolveCreativeMemberName = (memberId: string | null | undefined) => {
      if (!memberId) {
        return 'Unassigned'
      }
      return getTeamMemberById(activeSelectedPortfolio, memberId)?.name ?? 'Unassigned'
    }
    const isDevCard = isProductionDevHandoffCard(state.settings, nextCard)
    const assigneeName = resolveCreativeMemberName(nextCard.owner ?? previousCard.owner)

    if (
      Object.prototype.hasOwnProperty.call(updates, 'owner') &&
      previousCard.owner !== nextCard.owner &&
      nextCard.owner
    ) {
      try {
        if (isDevCard) {
          notifyDevTaskAssigned({
            cardTitle: nextCard.title,
            assigneeName: resolveCreativeMemberName(nextCard.owner),
          })
        } else {
          notifyCreativeTaskAssigned({
            cardTitle: nextCard.title,
            brand: nextCard.brand,
            editorName: resolveCreativeMemberName(nextCard.owner),
          })
        }
      } catch (error) {
        console.error('Task assignment notification trigger failed.', error)
      }
    }

    const previousBlockerText = previousCard.blocked?.reason?.trim() ?? ''
    const nextBlockerText = nextCard.blocked?.reason?.trim() ?? ''

    if (!previousBlockerText && nextBlockerText) {
      try {
        if (isDevCard) {
          notifyDevBlockerAdded({
            cardTitle: nextCard.title,
            blockerText: nextBlockerText,
            assigneeName,
          })
        } else {
          notifyCreativeBlockerAdded({
            cardTitle: nextCard.title,
            brand: nextCard.brand,
            blockerText: nextBlockerText,
            editorName: assigneeName,
          })
        }
      } catch (error) {
        console.error('Blocker-added notification trigger failed.', error)
      }
    }

    if (previousBlockerText && !nextBlockerText) {
      try {
        if (isDevCard) {
          notifyDevBlockerRemoved({
            cardTitle: nextCard.title,
            assigneeName,
          })
        } else {
          notifyCreativeBlockerRemoved({
            cardTitle: nextCard.title,
            brand: nextCard.brand,
            editorName: assigneeName,
          })
        }
      } catch (error) {
        console.error('Blocker-removed notification trigger failed.', error)
      }
    }

    if (previousCard.stage !== 'Review' && nextCard.stage === 'Review') {
      try {
        if (isDevCard) {
          notifyDevReadyForReview({
            cardTitle: nextCard.title,
            assigneeName: resolveCreativeMemberName(nextCard.owner),
          })
        } else {
          notifyCreativeReadyForReview({
            cardTitle: nextCard.title,
            brand: nextCard.brand,
            editorName: resolveCreativeMemberName(nextCard.owner),
          })
        }
      } catch (error) {
        console.error('Ready-for-review notification trigger failed.', error)
      }
    }
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
      activeSelectedPortfolio.webhookUrl || state.settings.integrations.globalDriveWebhookUrl || 'https://script.google.com/macros/s/AKfycbwGLeDoc3VSY8rM65iI6LCD14JsUHxgyxF-25yggFhZKv2p3s2y-tRvv1qvHJeHfykpng/exec'
    if (!webhookUrl) {
      showToast('No Drive webhook configured — add one in Settings → General or the portfolio.', 'red')
      return
    }

    const brand = activeSelectedPortfolio.brands.find((item) => item.name === selectedCardData.brand)
    const payload = {
      cardId: selectedCardData.id,
      cardTitle: selectedCardData.title,
      portfolioName: activeSelectedPortfolio.name,
      brand: selectedCardData.brand,
      parentFolderId: brand?.driveParentFolderId ?? '',
      brief: selectedCardData.brief,
      targetAudience: selectedCardData.audience,
      keyMessage: selectedCardData.keyMessage,
      visualDirection: selectedCardData.visualDirection,
      platform: selectedCardData.platform,
      funnelStage: selectedCardData.funnelStage,
      angleTheme: selectedCardData.angle,
      cta: selectedCardData.cta,
      referenceLinks: selectedCardData.referenceLinks,
      adCopy: selectedCardData.adCopy,
      notes: selectedCardData.notes,
    }

    setCreatingDriveCardId(selectedCardData.id)
    try {
      await fetch(webhookUrl, {
        method: 'POST',
        mode: 'no-cors',
        redirect: 'follow',
        body: JSON.stringify(payload),
      })

      saveOpenCard({
        driveFolderCreated: true,
        driveFolderUrl: `https://drive.google.com/drive/search?q=${encodeURIComponent(selectedCardData.title)}`,
      })
      showToast('Drive folder creation triggered. Check your Drive in a few seconds.', 'green')
    } catch {
      showToast('Drive folder creation failed. Check your network connection.', 'red')
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
        tone:
          validationMessage.includes('already has 3 cards in production')
            ? ('red' as ToastTone)
            : ('blue' as ToastTone),
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
      console.error('Failed to move Production card because portfolio was not found.', {
        portfolioId,
        cardId,
      })
      showToast('Card move failed because the destination portfolio could not be found.', 'red')
      return
    }
    const actor = getActorName(portfolio)
    const card = portfolio.cards.find((item) => item.id === cardId)
    if (!card) {
      console.error('Failed to move Production card because card was not found.', {
        portfolioId,
        cardId,
      })
      showToast('Card move failed because the selected card could not be found.', 'red')
      return
    }
    let moved = false
    try {
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
    } catch (error) {
      console.error('Failed to move Production board card.', {
        portfolioId,
        cardId,
        destinationStage,
        destinationOwner,
        destinationIndex,
        error,
      })
      showToast(
        error instanceof Error ? `Card move failed: ${error.message}` : 'Card move failed due to an unexpected error.',
        'red',
      )
      return
    }

    if (!moved) {
      showToast('This move is not allowed by the current board rules.', 'red')
      return
    }

    if (destinationOwner && card.owner !== destinationOwner) {
      const destinationOwnerName = getTeamMemberById(portfolio, destinationOwner)?.name ?? 'Unassigned'
      try {
        if (isProductionDevHandoffCard(state.settings, card)) {
          notifyDevTaskAssigned({
            cardTitle: card.title,
            assigneeName: destinationOwnerName,
          })
        } else {
          notifyCreativeTaskAssigned({
            cardTitle: card.title,
            brand: card.brand,
            editorName: destinationOwnerName,
          })
        }
      } catch (error) {
        console.error('Task assignment notification trigger failed.', error)
      }
    }

    if (card.stage !== 'Review' && destinationStage === 'Review') {
      const reviewOwnerName =
        getTeamMemberById(portfolio, destinationOwner ?? card.owner)?.name ?? 'Unassigned'
      try {
        if (isProductionDevHandoffCard(state.settings, card)) {
          notifyDevReadyForReview({
            cardTitle: card.title,
            assigneeName: reviewOwnerName,
          })
        } else {
          notifyCreativeReadyForReview({
            cardTitle: card.title,
            brand: card.brand,
            editorName: reviewOwnerName,
          })
        }
      } catch (error) {
        console.error('Ready-for-review notification trigger failed.', error)
      }
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

  function handleCycleProductionPriority(portfolioId: string, cardId: string) {
    const portfolio = state.portfolios.find((item) => item.id === portfolioId)
    const card = portfolio?.cards.find((item) => item.id === cardId)
    if (!portfolio || !card || card.stage !== 'In Production') {
      return
    }

    handleSetProductionPriority(portfolioId, cardId, getNextProductionCardPriority(card.priority))
  }

  function handleStartEditorTimer(portfolioId: string, cardId: string) {
    if (state.activeRole.mode !== 'contributor' || !viewerContext.editorName) {
      return
    }

    const portfolio = state.portfolios.find((item) => item.id === portfolioId)
    const card = portfolio?.cards.find((item) => item.id === cardId)
    if (
      !portfolio ||
      !card ||
      card.stage !== 'In Production' ||
      card.owner !== viewerContext.editorName ||
      card.editorTimer !== null
    ) {
      return
    }

    const startedAt = new Date().toISOString()
    updatePortfolio(portfolioId, (currentPortfolio) =>
      startEditorTimerForCard(currentPortfolio, cardId, startedAt),
    )
    showToast(`${card.id} is now in progress`, 'blue')
  }

  function handleSetProductionPriority(
    portfolioId: string,
    cardId: string,
    nextPriority: 1 | 2 | 3,
  ) {
    setState((prev) => ({
      ...prev,
      portfolios: prev.portfolios.map((currentPortfolio) =>
        currentPortfolio.id === portfolioId
          ? setInProductionCardPriority(currentPortfolio, cardId, nextPriority)
          : currentPortfolio,
      ),
    }))
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
        sourceStage: card.stage,
        destinationStage: target.lane.stage as StageId,
        destinationOwner: nextOwner,
        destinationIndex,
        movedAt,
      })
      setBackwardMoveForm(getDefaultBackwardMoveForm(state.settings, card.stage))
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
    const reasonOptions = getBackwardMoveReasonOptions(pendingBackwardMove.sourceStage)
    const selectedReason = reasonOptions.find((reason) => reason.id === backwardMoveForm.reasonId) ?? null
    const reason =
      isBackwardMoveOtherReasonId(selectedReason?.id)
        ? backwardMoveForm.otherReason.trim()
        : selectedReason?.name ?? ''
    const revisionEstimatedHours =
      backwardMoveForm.estimatedHours === '' ? Number.NaN : Number(backwardMoveForm.estimatedHours)
    if (!reason || !Number.isFinite(revisionEstimatedHours) || revisionEstimatedHours < 0) {
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
  const dailyCheckinDateLabel = dailyCheckinToday
    ? formatDisplayDate(dailyCheckinToday, dailyCheckinTimezone)
    : formatDisplayDate(getCheckinDates(dailyCheckinTimezone).today, dailyCheckinTimezone)
  const toastView = <ToastStack toasts={toasts} onDismiss={dismissToast} />

  function resetBoardFilters() {
    setBoardFilters(getDefaultBoardFilters(activePortfolioView))
  }

  function dismissOnboardingBanner() {
    setOnboardingDismissed(true)
    if (typeof window !== 'undefined') {
      try {
        window.localStorage.setItem(ONBOARDING_DISMISSED_KEY, '1')
      } catch {
        console.warn('[storage] Write failed, continuing:', ONBOARDING_DISMISSED_KEY)
      }
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
        <RemoteLoadingShell />
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

  if (dailyCheckinGateStatus === 'checking') {
    return (
      <>
        <RemoteLoadingShell />
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
          isDeveloperUser={isDeveloperUser}
          canAccessBacklog={canAccessBacklog}
          canAccessPerformance={canAccessPerformance}
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
            activeViewerName={viewerContext.editorName}
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
            onCycleProductionPriority={handleCycleProductionPriority}
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
            onStartEditorTimer={handleStartEditorTimer}
            onSaveCardTitle={handleSaveBoardCardTitle}
          />
        ) : null}

        {currentPage === 'backlog' ? (
          <BacklogPage
            backlog={backlogState}
            brandOptions={backlogBrandOptions}
            brandStyles={backlogBrandStyles}
            creativeProductionTaskTypeOptions={creativeProductionTaskTypeOptions}
            devProductionTaskTypeOptions={devProductionTaskTypeOptions}
            actorName={userDisplayName}
            canCreate={canAccessBacklog}
            showToast={showToast}
            headerUtilityContent={headerUtilityContent}
            onChange={(updater) => {
              markBacklogDirty('local mutation')
              setBacklogState(updater)
            }}
            onMoveToProduction={handleBacklogToProduction}
            onTransferSourceDeleteConfirmed={({ path }) => {
              endTransferWindow(path)
            }}
            onTransferAborted={({ path }) => {
              endTransferWindow(path)
            }}
          />
        ) : null}

        {currentPage === 'scripts' && activePortfolioView ? (
          <ScriptWorkshopPage
            scripts={state.scriptWorkshop.scripts}
            brandOptions={scriptWorkshopBrandOptions}
            brandStyles={scriptWorkshopBrandStyles}
            canManageScripts={canManageScripts}
            currentReviewerId={currentReviewerId}
            currentAuthorName={scriptAuthorName}
            headerUtilityContent={headerUtilityContent}
            onAddScript={handleAddScript}
            onUpdateScript={handleUpdateScript}
            onSubmitReview={handleSubmitScriptReview}
            onAddComment={handleAddScriptComment}
          />
        ) : null}

        {currentPage === 'strategy' ? (
          <StrategyCyclesPage
            cycles={strategyCycles}
            roleMode={state.activeRole.mode}
            currentUserEmail={authSession?.email ?? workspaceAccess?.email ?? null}
            currentUserName={workspaceAccess?.editorName ?? currentEditor?.name ?? null}
            headerUtilityContent={headerUtilityContent}
            onCreateCycle={handleCreateStrategyCycle}
            onUpdateCycle={handleUpdateStrategyCycle}
          />
        ) : null}

        {currentPage === 'finance' ? (
          <FinancePage
            headerUtilityContent={headerUtilityContent}
          />
        ) : null}

        {currentPage === 'analytics' ? (
          <AnalyticsPage
            state={scopedState}
            nowMs={nowMs}
            activeRoleMode={state.activeRole.mode}
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

        {currentPage === 'pulse' ? (
          <DailyPulsePage
            timezone={dailyCheckinTimezone}
            selectedRange={pulseDateRange ?? { from: dailyCheckinToday, to: dailyCheckinToday }}
            todayDate={dailyCheckinToday}
            personFilter={pulsePersonFilter}
            peopleOptions={pulsePeopleOptions}
            feedItems={pulseFeedItems}
            loading={pulseLoading}
            errorMessage={pulseError}
            headerUtilityContent={headerUtilityContent}
            onDateRangeChange={(nextRange) => setPulseDateRange(normalizeDailyPulseRange(nextRange))}
            onPersonFilterChange={(value) => setPulsePersonFilter(value)}
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
          sourceStage={pendingBackwardMove.sourceStage}
          destinationStage={pendingBackwardMove.destinationStage}
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
          onSetProductionPriority={(priority) =>
            handleSetProductionPriority(activeSelectedPortfolioView.id, selectedCardData.id, priority)
          }
          onAddComment={addCommentToCard}
          onCreateDriveFolder={createDriveFolder}
          onRequestDelete={requestDeleteOpenCard}
          showEditorStartButton={
            selectedCardData.stage === 'In Production' &&
            selectedCardData.editorTimer === null
          }
          canStartEditorTimer={
            state.activeRole.mode === 'contributor' &&
            viewerContext.editorName === selectedCardData.owner &&
            selectedCardData.stage === 'In Production' &&
            selectedCardData.editorTimer === null
          }
          isEditorTimerInProgress={
            selectedCardData.stage === 'In Production' &&
            Boolean(selectedCardData.editorTimer?.startedAt) &&
            selectedCardData.editorTimer?.stoppedAt === null
          }
          canViewPerformanceData={state.activeRole.mode === 'owner' || state.activeRole.mode === 'manager'}
          onStartEditorTimer={() => handleStartEditorTimer(activeSelectedPortfolio.id, selectedCardData.id)}
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

      {dailyCheckinGateStatus === 'required' ? (
        <DailyCheckinModal
          dateLabel={dailyCheckinDateLabel}
          yesterdayPlan={dailyCheckinYesterdayPlan}
          creativeBoardTasks={checkinCreativeBoardTasks}
          submitting={dailyCheckinSubmitting}
          errorMessage={dailyCheckinError}
          onSubmit={handleDailyCheckinSubmit}
        />
      ) : null}

      {toastView}
    </div>
  )
}

export default App
