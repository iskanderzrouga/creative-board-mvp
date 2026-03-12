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
  getRoleActorName,
  getRoleFromWorkspaceAccess,
  getSearchCountLabel,
  isLikelyEmail,
  type BackwardMoveFormState,
} from './appHelpers'
import { AccessGate } from './components/AccessGate'
import { AccessVerificationGate } from './components/AccessVerificationGate'
import { AnalyticsPage } from './components/AnalyticsPage'
import { AuthGate } from './components/AuthGate'
import { BackwardMoveModal } from './components/BackwardMoveModal'
import { BoardPage } from './components/BoardPage'
import { CardDetailPanel } from './components/CardDetailPanel'
import { ConfirmDialog } from './components/ConfirmDialog'
import { DeleteCardModal } from './components/DeleteCardModal'
import { KeyboardShortcutsModal } from './components/KeyboardShortcutsModal'
import { PageHeader } from './components/PageHeader'
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
  isSupabaseConfigured,
} from './supabase'
import {
  GROUPED_STAGES,
  STAGES,
  addCardToPortfolio,
  applyCardUpdates,
  createCardFromQuickInput,
  createSeedState,
  getActivePortfolio,
  getAttentionSummary,
  getBoardStats,
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
  loadAppState,
  moveCardInPortfolio,
  removeCardFromPortfolio,
  type ActiveRole,
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

type PendingAppConfirm = 'reset-seed' | 'clear-all'

const ONBOARDING_DISMISSED_KEY = 'editors-board:onboarding-dismissed:v1'

function App() {
  const authEnabled = isSupabaseConfigured()
  const [state, setState] = useState<AppState>(() => loadAppState())
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
  const [editorMenuOpen, setEditorMenuOpen] = useState(false)
  const [settingsTab, setSettingsTab] = useState<SettingTab>('general')
  const [settingsPortfolioId, setSettingsPortfolioId] = useState(() => loadAppState().activePortfolioId)
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
  const [lastSyncedAt, setLastSyncedAt] = useState<string | null>(null)
  const [remoteSyncErrorShown, setRemoteSyncErrorShown] = useState(false)
  const [pendingAppConfirm, setPendingAppConfirm] = useState<PendingAppConfirm | null>(null)
  const [keyboardShortcutsOpen, setKeyboardShortcutsOpen] = useState(false)
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
  const nextToastIdRef = useRef(0)
  const toastTimerIdsRef = useRef<Record<number, number>>({})

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
    handleRetryAccessCheck,
    handleSaveWorkspaceAccessEntry,
    handleDeleteWorkspaceAccessEntry,
    handleSendMagicLink,
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

  const activePortfolio = getActivePortfolio(state)
  const currentPage = getCurrentPage(state)
  const editorOptions = activePortfolio ? getEditorOptions(activePortfolio) : []
  const currentEditor = activePortfolio
    ? getTeamMemberById(activePortfolio, state.activeRole.editorId)
    : null
  const isLaunchOpsActive =
    state.activeRole.mode === 'editor' && isLaunchOpsRole(currentEditor?.role ?? null)
  const viewerContext = useMemo<ViewerContext>(
    () => ({
      mode: state.activeRole.mode,
      editorName: state.activeRole.mode === 'editor' ? currentEditor?.name ?? null : null,
      memberRole: state.activeRole.mode === 'editor' ? currentEditor?.role ?? null : null,
    }),
    [currentEditor?.name, currentEditor?.role, state.activeRole.mode],
  )
  const attention = getAttentionSummary(activePortfolio, state.settings, nowMs)
  const searchBaseCards =
    activePortfolio && currentPage === 'board'
      ? getVisibleCards(
          activePortfolio,
          viewerContext,
          { ...boardFilters, searchQuery: '' },
          state.settings,
          nowMs,
        ).filter((card) => !card.archivedAt)
      : []
  const visibleBoardCards =
    activePortfolio && currentPage === 'board'
      ? getVisibleCards(activePortfolio, viewerContext, boardFilters, state.settings, nowMs)
      : []
  const columns = useMemo(
    () =>
      activePortfolio && currentPage === 'board'
        ? getVisibleColumns(activePortfolio, viewerContext, boardFilters, state.settings, nowMs, {
            showEmptyGroupedSections: dragCardId !== null && state.activeRole.mode === 'manager',
            manuallyExpandedStages: expandedStages,
          })
        : [],
    [
      activePortfolio,
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
    activePortfolio && currentPage === 'board'
      ? getBoardStats(activePortfolio, viewerContext, boardFilters, state.settings, nowMs)
      : null
  const hasActiveBoardFilters = Boolean(
    boardFilters.searchQuery.trim() ||
      boardFilters.ownerNames.length > 0 ||
      boardFilters.overdueOnly ||
      boardFilters.stuckOnly ||
      boardFilters.blockedOnly ||
      boardFilters.showArchived ||
      boardFilters.brandNames.length !== (activePortfolio?.brands.length ?? 0),
  )
  const summaryOwner =
    state.activeRole.mode === 'editor' && !isLaunchOpsActive
      ? viewerContext.editorName
      : boardFilters.ownerNames.length === 1
        ? boardFilters.ownerNames[0]
        : null
  const summary =
    activePortfolio && currentPage === 'board' && summaryOwner
      ? getEditorSummary(
          activePortfolio,
          summaryOwner,
          boardFilters.brandNames.length > 0
            ? boardFilters.brandNames
            : activePortfolio.brands.map((brand) => brand.name),
          state.settings,
        )
      : null

  const activeSelectedPortfolio = selectedCard
    ? state.portfolios.find((portfolio) => portfolio.id === selectedCard.portfolioId) ?? null
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
    activePortfolio && dragCardId
      ? activePortfolio.cards.find((card) => card.id === dragCardId) ?? null
      : null
  const lockedRole =
    workspaceAccess?.roleMode === 'editor'
      ? {
          mode: 'editor' as const,
          editorId:
            activePortfolio?.team.find((member) => member.name === workspaceAccess.editorName)?.id ??
            null,
        }
      : workspaceAccess
        ? {
            mode: workspaceAccess.roleMode,
            editorId: state.activeRole.editorId,
          }
        : null
  const headerUtilityContent =
    authStatus === 'signed-in' && authSession ? (
      <div className="session-toolbar">
        <SyncStatusPill syncStatus={syncStatus} lastSyncedAt={lastSyncedAt} />
        <span className="session-email">{authSession.email}</span>
        <button
          type="button"
          className="ghost-button shortcut-button"
          aria-label="Open keyboard shortcuts"
          onClick={() => setKeyboardShortcutsOpen(true)}
        >
          ?
        </button>
        <button
          type="button"
          className="ghost-button"
          disabled={signOutPending}
          onClick={handleSignOut}
        >
          {signOutPending ? 'Signing out...' : 'Sign out'}
        </button>
      </div>
    ) : null

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
    currentPage,
    searchRef,
    activePortfolio,
    roleMode: state.activeRole.mode,
    settings: state.settings,
    setQuickCreateValue,
    importInputRef,
  })

  useEffect(() => {
    return () => {
      Object.values(toastTimerIdsRef.current).forEach((timerId) => {
        window.clearTimeout(timerId)
      })
      toastTimerIdsRef.current = {}
    }
  }, [])

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
    const portfolio = state.portfolios.find((item) => item.id === portfolioId) ?? state.portfolios[0]
    setState((current) => ({
      ...current,
      activePortfolioId: portfolio.id,
    }))
    setBoardFilters(getDefaultBoardFilters(portfolio))
    setSettingsPortfolioId(portfolio.id)
    if (state.activeRole.mode === 'editor') {
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

  function setPage(page: AppPage) {
    if (page === 'analytics' && state.activeRole.mode === 'editor') {
      return
    }
    if (page === 'settings' && state.activeRole.mode !== 'manager') {
      return
    }
    if (page === 'workload' && state.activeRole.mode === 'editor') {
      return
    }

    setState((current) => ({
      ...current,
      activePage: page,
    }))
    setSelectedCard(null)
  }

  function focusBoardAttention() {
    if (!attention.hasAttention || !activePortfolio) {
      return
    }

    if (attention.overdueCount > 0) {
      setBoardFilters((current) => ({ ...current, overdueOnly: true, stuckOnly: false, blockedOnly: false }))
      return
    }

    if (attention.stuckCount > 0) {
      setBoardFilters((current) => ({ ...current, overdueOnly: false, stuckOnly: true, blockedOnly: false }))
      return
    }

    if (attention.blockedCount > 0) {
      setBoardFilters((current) => ({ ...current, overdueOnly: false, stuckOnly: false, blockedOnly: true }))
    }
  }

  function handleSidebarPageChange(page: AppPage) {
    setPage(page)
    if (page === 'board') {
      focusBoardAttention()
    }
  }

  function setRole(nextRole: ActiveRole) {
    let resolvedEditorId = nextRole.editorId
    if (nextRole.mode === 'editor' && activePortfolio) {
      const nextEditor =
        getTeamMemberById(activePortfolio, nextRole.editorId) ?? getEditorOptions(activePortfolio)[0]
      resolvedEditorId = nextEditor?.id ?? null
    }
    setState((current) => ({
      ...current,
      activeRole: {
        ...nextRole,
        editorId: resolvedEditorId,
      },
      activePage:
        nextRole.mode === 'observer'
          ? current.activePage === 'settings'
            ? 'board'
            : current.activePage
          : nextRole.mode === 'manager'
            ? current.activePage === 'analytics'
              ? 'board'
              : current.activePage
            : current.activePage === 'analytics' || current.activePage === 'settings'
              ? 'board'
              : current.activePage,
    }))
    setEditorMenuOpen(false)
  }

  function handleCopy(key: string, value: string) {
    void copyToClipboard(value).then(() => setCopyState({ key }))
  }

  function handleQuickCreate(openDetail: boolean) {
    if (!activePortfolio) {
      return
    }

    const actor = getRoleActorName(state.activeRole, activePortfolio)
    let card: Card

    try {
      card = createCardFromQuickInput(activePortfolio, state.settings, quickCreateValue, actor)
    } catch (error) {
      showToast(error instanceof Error ? error.message : 'That card could not be created.', 'red')
      return
    }

    let created = false
    updatePortfolio(activePortfolio.id, (portfolio) => {
      const nextPortfolio = addCardToPortfolio(portfolio, card, viewerContext)
      created = nextPortfolio !== portfolio
      return nextPortfolio
    })

    if (!created) {
      showToast('That card could not be created.', 'red')
      return
    }

    setQuickCreateOpen(false)
    setQuickCreateValue(getQuickCreateDefaults(activePortfolio, state.settings))
    showToast(`${card.id} created`, 'green')

    if (openDetail) {
      setSelectedCard({
        portfolioId: activePortfolio.id,
        cardId: card.id,
      })
    }
  }

  function openCard(portfolioId: string, cardId: string) {
    setSelectedCard({ portfolioId, cardId })
  }

  function saveOpenCard(updates: Partial<Card>) {
    if (!selectedCard || !activeSelectedPortfolio) {
      return
    }
    const actor = getRoleActorName(state.activeRole, activeSelectedPortfolio)
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

  function addCommentToCard(text: string) {
    if (!selectedCard || !activeSelectedPortfolio) {
      return
    }
    const author = getRoleActorName(state.activeRole, activeSelectedPortfolio)
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
                },
              ],
            }
          : card,
      ),
    }))
  }

  async function createDriveFolder() {
    if (!selectedCardData || !activeSelectedPortfolio) {
      return
    }

    const webhookUrl =
      activeSelectedPortfolio.webhookUrl || state.settings.integrations.globalDriveWebhookUrl
    if (!webhookUrl) {
      showToast('No Drive webhook configured', 'red')
      return
    }

    setCreatingDriveCardId(selectedCardData.id)
    try {
      await new Promise((resolve) => window.setTimeout(resolve, 500))
      showToast(
        `Drive folder creation is staged for the backend pass. Saved webhook target: ${webhookUrl}`,
        'blue',
      )
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
    if (!activePortfolio || !targetLane || targetLane.stage === 'Archived') {
      return {
        valid: false,
        message: 'That drop zone is not available.',
        tone: 'blue' as ToastTone,
      }
    }

    const validationMessage = getCardMoveValidationMessage(
      activePortfolio,
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
  ) {
    const portfolio = state.portfolios.find((item) => item.id === portfolioId)
    if (!portfolio) {
      return
    }
    const actor = getRoleActorName(state.activeRole, portfolio)
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
    } else if (card.stage === 'Backlog' && destinationOwner) {
      showToast(`${card.id} assigned to ${destinationOwner}`, 'blue')
    } else {
      showToast(`${card.id} → ${destinationStage}`, 'green')
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

    if (!activePortfolio || !target || !validation.valid) {
      clearBoardDragState()
      if (!validation.valid && validation.message) {
        showToast(validation.message, validation.tone)
      }
      return
    }

    const card = activePortfolio.cards.find((item) => item.id === cardId)
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

    if (isBackwardMove && state.activeRole.mode !== 'observer') {
      setPendingBackwardMove({
        portfolioId: activePortfolio.id,
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
      activePortfolio.id,
      card.id,
      target.lane.stage as StageId,
      nextOwner,
      destinationIndex,
      movedAt,
    )
  }

  function handleWorkloadDragEnd(event: DragEndEvent) {
    if (!activePortfolio || state.activeRole.mode !== 'manager') {
      setDragCardId(null)
      return
    }
    const overId = event.over ? String(event.over.id) : null
    const memberId = overId?.replace('workload-member-', '')
    const member = getTeamMemberById(activePortfolio, memberId ?? null)
    const card = activePortfolio.cards.find((item) => item.id === String(event.active.id))
    if (!member || !card) {
      setDragCardId(null)
      return
    }
    if (card.stage !== 'Backlog') {
      setDragCardId(null)
      return
    }
    applyMove(activePortfolio.id, card.id, 'Briefed', member.name, 0, new Date().toISOString())
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
    applyMove(
      pendingBackwardMove.portfolioId,
      pendingBackwardMove.cardId,
      pendingBackwardMove.destinationStage,
      pendingBackwardMove.destinationOwner,
      pendingBackwardMove.destinationIndex,
      pendingBackwardMove.movedAt,
      reason,
      revisionEstimatedHours,
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
    showToast('Board reset to seed data', 'amber')
  }

  function clearAllData() {
    setPendingAppConfirm('clear-all')
  }

  function confirmClearAllData() {
    const emptyState = createSeedState()
    emptyState.portfolios.forEach((portfolio) => {
      portfolio.cards = []
      portfolio.lastIdPerPrefix = Object.fromEntries(
        portfolio.brands.map((brand) => [brand.prefix, 0]),
      )
    })
    replaceState(emptyState)
    setSelectedCard(null)
    setPendingAppConfirm(null)
    showToast('All data cleared', 'amber')
  }

  const sidebarExpanded = sidebarPinned || sidebarHovered
  const toastView = <ToastStack toasts={toasts} onDismiss={dismissToast} />

  function resetBoardFilters() {
    setBoardFilters(getDefaultBoardFilters(activePortfolio))
  }

  function dismissOnboardingBanner() {
    setOnboardingDismissed(true)
    if (typeof window !== 'undefined') {
      window.localStorage.setItem(ONBOARDING_DISMISSED_KEY, '1')
    }
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
          onSubmit={handleSendMagicLink}
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
              ? 'Your sign-in worked, but the workspace access check needs another try before the shared board can open. Contact your workspace manager if the approved access list should already include this account.'
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
          portfolio={activePortfolio}
          portfolios={state.portfolios}
          role={state.activeRole}
          lockedRole={lockedRole}
          editorOptions={editorOptions}
          editorMenuOpen={editorMenuOpen}
          attention={attention}
          onTogglePinned={() => setSidebarPinned((current) => !current)}
          onPortfolioChange={switchToPortfolio}
          onPageChange={handleSidebarPageChange}
          onRoleChange={setRole}
          onToggleEditorMenu={() => setEditorMenuOpen((current) => !current)}
        />
      </div>

      <div className="main-shell">
        {currentPage === 'board' && !activePortfolio ? (
          <div className="page-shell">
            <PageHeader title={state.settings.general.appName} rightContent={headerUtilityContent} />
            <section className="board-empty-state" aria-live="polite">
              <strong>Create a portfolio in Settings to get started</strong>
              <p>
                The board needs at least one portfolio before cards, analytics, and workload can
                be managed in the shared workspace.
              </p>
              {state.activeRole.mode === 'manager' ? (
                <div className="board-empty-actions">
                  <button type="button" className="primary-button" onClick={() => setPage('settings')}>
                    Open settings
                  </button>
                </div>
              ) : null}
            </section>
          </div>
        ) : null}

        {currentPage === 'board' && activePortfolio ? (
          <BoardPage
            title={state.settings.general.appName}
            portfolio={activePortfolio}
            settings={state.settings}
            boardFilters={boardFilters}
            setBoardFilters={setBoardFilters}
            hasActiveFilters={hasActiveBoardFilters}
            stats={stats}
            summary={summary}
            columns={columns}
            expandedStages={expandedStages}
            setExpandedStages={setExpandedStages}
            showOnboarding={state.activeRole.mode === 'manager' && !onboardingDismissed}
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
              state.activeRole.mode === 'manager' ||
              (state.activeRole.mode === 'editor' &&
                (isLaunchOpsActive
                  ? card.stage === 'Ready'
                  : viewerContext.editorName === card.owner && canEditorDragStage(card.stage)))
            }
            onOpenCard={openCard}
            onQuickCreateOpen={() => {
              setQuickCreateValue(getQuickCreateDefaults(activePortfolio, state.settings))
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

        {currentPage === 'analytics' ? (
          <AnalyticsPage
            state={state}
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

        {currentPage === 'workload' && activePortfolio ? (
          <DndContext
            sensors={sensors}
            collisionDetection={closestCorners}
            onDragStart={handleWorkloadDragStart}
            onDragCancel={handleWorkloadDragCancel}
            onDragEnd={handleWorkloadDragEnd}
          >
            <WorkloadPage
              portfolio={activePortfolio}
              settings={state.settings}
              timeframe={timeframe}
              nowMs={nowMs}
              canAssign={state.activeRole.mode === 'manager'}
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
            settingsTab={settingsTab}
            settingsPortfolioId={settingsPortfolioId}
            importInputRef={importInputRef}
            headerUtilityContent={headerUtilityContent}
            workspaceAccessEntries={workspaceAccessEntries}
            workspaceAccessStatus={workspaceAccessStatus}
            workspaceAccessErrorMessage={workspaceAccessErrorMessage}
            workspaceAccessPendingEmail={workspaceAccessPendingEmail}
            onTabChange={setSettingsTab}
            onSettingsPortfolioChange={setSettingsPortfolioId}
            onBackToBoard={() => setPage('board')}
            onStateChange={updateState}
            onExportData={exportData}
            onImportClick={() => importInputRef.current?.click()}
            onResetData={resetToSeed}
            onClearAllData={clearAllData}
            onWorkspaceAccessSave={handleSaveWorkspaceAccessEntry}
            onWorkspaceAccessDelete={handleDeleteWorkspaceAccessEntry}
            showToast={showToast}
          />
        ) : null}
      </div>

      {quickCreateOpen && activePortfolio ? (
        <QuickCreateModal
          portfolio={activePortfolio}
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

      {selectedCardData && activeSelectedPortfolio ? (
        <CardDetailPanel
          key={selectedCardData.id}
          keyId={selectedCardData.id}
          portfolio={activeSelectedPortfolio}
          card={selectedCardData}
          settings={state.settings}
          viewerMode={state.activeRole.mode}
          viewerName={viewerContext.editorName}
          viewerMemberRole={viewerContext.memberRole}
          copyState={copyState}
          isCreatingDriveFolder={creatingDriveCardId === selectedCardData.id}
          nowMs={nowMs}
          onClose={() => setSelectedCard(null)}
          onCopy={handleCopy}
          onSave={saveOpenCard}
          onAddComment={addCommentToCard}
          onCreateDriveFolder={createDriveFolder}
          onRequestDelete={requestDeleteOpenCard}
        />
      ) : null}

      {pendingAppConfirm ? (
        <ConfirmDialog
          title={pendingAppConfirm === 'reset-seed' ? 'Reset to seed data?' : 'Clear all data?'}
          message={
            pendingAppConfirm === 'reset-seed' ? (
              <p>This restores the original demo workspace and removes your current changes.</p>
            ) : (
              <>
                <p>This removes every card from every portfolio and resets the running ID counters.</p>
                <p>This action cannot be undone.</p>
              </>
            )
          }
          confirmLabel={pendingAppConfirm === 'reset-seed' ? 'Reset board' : 'Clear all data'}
          onCancel={() => setPendingAppConfirm(null)}
          onConfirm={pendingAppConfirm === 'reset-seed' ? confirmResetToSeed : confirmClearAllData}
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
