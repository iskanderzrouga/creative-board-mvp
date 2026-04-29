import {
  applyPendingAppStatePatch,
  coerceAppState,
  migrateLegacyDevBoardIntoMainBoard,
  type AppState,
  type Card,
  type DevCard,
  type DevBoardState,
  type PendingAppStatePatch,
  type Portfolio,
} from './board'
import {
  E2E_REMOTE_STATE_KEY,
  getSupabaseClient,
  isE2EAuthOverrideEnabled,
  REMOTE_WORKSPACE_ID,
} from './supabase'

const WORKSPACE_STATE_TABLE = 'workspace_state'
const E2E_REMOTE_DELAY_KEY = 'editors-board-e2e-remote-delay-ms'

interface WorkspaceStateRow {
  state: unknown
  updated_at: string
}

interface StoredRemoteState {
  state: AppState
  updatedAt: string
}

function getRemoteDefaultPortfolioId(state: AppState) {
  if (state.portfolios.some((portfolio) => portfolio.id === state.settings.general.defaultPortfolioId)) {
    return state.settings.general.defaultPortfolioId
  }

  return state.portfolios[0]?.id ?? ''
}

function createRemoteStateSnapshot(state: AppState): AppState {
  const migratedState = migrateLegacyDevBoardIntoMainBoard(state)

  return {
    ...migratedState,
    activePortfolioId: getRemoteDefaultPortfolioId(migratedState),
    activeRole: {
      mode: 'owner',
      editorId: null,
    },
    activePage: 'board',
    notifications: [],
  }
}

export function getRemoteStateSignature(state: AppState) {
  const snapshot = createRemoteStateSnapshot(state)
  const { strategyCycles, notifications, version, ...sharedState } = snapshot
  return JSON.stringify({
    ...sharedState,
    strategyCycles: strategyCycles ?? [],
    notifications,
    version,
  })
}

export function mergeRemoteAppStateWithLocalState(remoteState: AppState, localState: AppState): AppState {
  const activePortfolioId = remoteState.portfolios.some(
    (portfolio) => portfolio.id === localState.activePortfolioId,
  )
    ? localState.activePortfolioId
    : getRemoteDefaultPortfolioId(remoteState)

  return {
    ...remoteState,
    activePortfolioId,
    activeRole: localState.activeRole,
    activePage: localState.activePage,
    notifications: localState.notifications,
  }
}

export function createWorkspaceStateSeedRow(workspaceId: string, state: AppState) {
  return {
    workspace_id: workspaceId,
    state: createRemoteStateSnapshot(state),
  }
}

export function createWorkspaceStateUpdateRow(state: AppState) {
  return {
    state: createRemoteStateSnapshot(state),
  }
}

export interface RemoteAppStateResult {
  state: AppState
  lastSyncedAt: string | null
  remoteSignature: string
  keptLocalChanges: boolean
  seeded: boolean
}

interface LoadRemoteAppStateOptions {
  pendingRemoteBaseUpdatedAt?: string | null
  pendingRemoteSignature?: string | null
  pendingStatePatch?: PendingAppStatePatch | null
}

export class RemoteStateConflictError extends Error {
  latestState: AppState
  latestRemoteState: AppState
  latestUpdatedAt: string

  constructor(state: AppState, remoteState: AppState, updatedAt: string) {
    super('Remote workspace changed before this save completed.')
    this.name = 'RemoteStateConflictError'
    this.latestState = state
    this.latestRemoteState = remoteState
    this.latestUpdatedAt = updatedAt
  }
}

function parseTimestamp(value: string | null | undefined) {
  if (!value) {
    return 0
  }
  const parsed = Date.parse(value)
  return Number.isFinite(parsed) ? parsed : 0
}

function getCreativeCardUpdatedAt(card: Card) {
  const explicitUpdatedAt = parseTimestamp(card.updatedAt)
  if (explicitUpdatedAt > 0) {
    return explicitUpdatedAt
  }

  let latest = Math.max(
    parseTimestamp(card.stageEnteredAt),
    parseTimestamp(card.dateAssigned),
    parseTimestamp(card.dateCreated),
  )

  if (card.blocked?.at) {
    latest = Math.max(latest, parseTimestamp(card.blocked.at))
  }

  for (const entry of card.columnMovementHistory) {
    latest = Math.max(latest, parseTimestamp(entry.timestamp))
  }
  for (const entry of card.stageHistory) {
    latest = Math.max(latest, parseTimestamp(entry.enteredAt), parseTimestamp(entry.exitedAt))
  }
  for (const entry of card.comments) {
    latest = Math.max(latest, parseTimestamp(entry.timestamp))
  }
  for (const entry of card.activityLog) {
    latest = Math.max(latest, parseTimestamp(entry.timestamp))
  }

  return latest
}

function getDevCardUpdatedAt(card: DevCard) {
  const explicitUpdatedAt = parseTimestamp(card.updatedAt)
  return explicitUpdatedAt > 0 ? explicitUpdatedAt : parseTimestamp(card.dateCreated)
}

function mergeCreativeCards(remoteCards: Card[], localCards: Card[]) {
  const merged = new Map<string, Card>()
  for (const card of remoteCards) {
    merged.set(card.id, card)
  }

  for (const localCard of localCards) {
    const remoteCard = merged.get(localCard.id)
    if (!remoteCard) {
      merged.set(localCard.id, localCard)
      continue
    }

    const remoteUpdatedAt = getCreativeCardUpdatedAt(remoteCard)
    const localUpdatedAt = getCreativeCardUpdatedAt(localCard)
    merged.set(localCard.id, localUpdatedAt >= remoteUpdatedAt ? localCard : remoteCard)
  }

  return Array.from(merged.values())
}

function mergeDevCards(remoteCards: DevCard[], localCards: DevCard[]) {
  const merged = new Map<string, DevCard>()
  for (const card of remoteCards) {
    merged.set(card.id, card)
  }

  for (const localCard of localCards) {
    const remoteCard = merged.get(localCard.id)
    if (!remoteCard) {
      merged.set(localCard.id, localCard)
      continue
    }

    const remoteUpdatedAt = getDevCardUpdatedAt(remoteCard)
    const localUpdatedAt = getDevCardUpdatedAt(localCard)
    merged.set(localCard.id, localUpdatedAt >= remoteUpdatedAt ? localCard : remoteCard)
  }

  return Array.from(merged.values())
}

function mergePortfolios(remotePortfolios: Portfolio[], localPortfolios: Portfolio[]) {
  const localById = new Map(localPortfolios.map((portfolio) => [portfolio.id, portfolio]))
  const merged: Portfolio[] = remotePortfolios.map((remotePortfolio) => {
    const localPortfolio = localById.get(remotePortfolio.id)
    if (!localPortfolio) {
      return remotePortfolio
    }

    const remoteMetadataUpdatedAt = parseTimestamp(remotePortfolio.metadataUpdatedAt)
    const localMetadataUpdatedAt = parseTimestamp(localPortfolio.metadataUpdatedAt)
    const metadataPortfolio =
      localMetadataUpdatedAt > remoteMetadataUpdatedAt ? localPortfolio : remotePortfolio
    const lastIdPerPrefix = new Map<string, number>()
    for (const [prefix, value] of Object.entries(remotePortfolio.lastIdPerPrefix)) {
      lastIdPerPrefix.set(prefix, value)
    }
    for (const [prefix, value] of Object.entries(localPortfolio.lastIdPerPrefix)) {
      lastIdPerPrefix.set(prefix, Math.max(lastIdPerPrefix.get(prefix) ?? 0, value))
    }

    return {
      ...metadataPortfolio,
      cards: mergeCreativeCards(remotePortfolio.cards, localPortfolio.cards),
      lastIdPerPrefix: Object.fromEntries(lastIdPerPrefix),
    }
  })

  for (const localPortfolio of localPortfolios) {
    if (!remotePortfolios.some((portfolio) => portfolio.id === localPortfolio.id)) {
      merged.push(localPortfolio)
    }
  }

  return merged
}

export function mergeRemoteAppStateCardLevel(remoteState: AppState, localState: AppState): AppState {
  const mergedSharedState: AppState = {
    ...remoteState,
    portfolios: mergePortfolios(remoteState.portfolios, localState.portfolios),
    devBoard: {
      cards: mergeDevCards(remoteState.devBoard.cards, localState.devBoard.cards),
      lastCardNumber: Math.max(remoteState.devBoard.lastCardNumber, localState.devBoard.lastCardNumber),
    } as DevBoardState,
  }

  return mergeRemoteAppStateWithLocalState(
    migrateLegacyDevBoardIntoMainBoard(mergedSharedState),
    localState,
  )
}

export interface SaveRemoteAppStateWithMergeResult {
  updatedAt: string | null
  savedState: AppState
  merged: boolean
}

function hasBrowser() {
  return typeof window !== 'undefined'
}

function getStoredE2ERemoteState() {
  if (!hasBrowser()) {
    return null
  }

  const raw = window.localStorage.getItem(E2E_REMOTE_STATE_KEY)
  if (!raw) {
    return null
  }

  try {
    const parsed = JSON.parse(raw) as StoredRemoteState
    return {
      state: coerceAppState(parsed.state),
      updatedAt: parsed.updatedAt,
    }
  } catch {
    return null
  }
}

function setStoredE2ERemoteState(state: AppState, updatedAt: string) {
  if (!hasBrowser()) {
    return
  }

  const payload: StoredRemoteState = {
    state: createRemoteStateSnapshot(state),
    updatedAt,
  }

  try {
    window.localStorage.setItem(E2E_REMOTE_STATE_KEY, JSON.stringify(payload))
  } catch {
    console.warn('[storage] Write failed, continuing:', E2E_REMOTE_STATE_KEY)
  }
}

async function getRemoteWorkspaceStateRow() {
  const supabase = getSupabaseClient()
  if (!supabase) {
    return null
  }

  const { data, error } = await supabase
    .from(WORKSPACE_STATE_TABLE)
    .select('state, updated_at')
    .eq('workspace_id', REMOTE_WORKSPACE_ID)
    .maybeSingle<WorkspaceStateRow>()

  if (error) {
    throw error
  }

  return data
}

function isE2ERemoteMode() {
  return hasBrowser() && isE2EAuthOverrideEnabled()
}

function getE2ERemoteDelayMs() {
  if (!hasBrowser()) {
    return 0
  }

  const raw = window.localStorage.getItem(E2E_REMOTE_DELAY_KEY)
  const parsed = Number(raw)
  return Number.isFinite(parsed) && parsed > 0 ? parsed : 0
}

export function isRemotePersistenceConfigured() {
  return getSupabaseClient() !== null || isE2ERemoteMode()
}

export async function loadOrCreateRemoteAppState(
  fallbackState: AppState,
  options: LoadRemoteAppStateOptions = {},
): Promise<RemoteAppStateResult> {
  const fallbackSignature = getRemoteStateSignature(fallbackState)

  if (isE2ERemoteMode()) {
    const delayMs = getE2ERemoteDelayMs()
    if (delayMs > 0) {
      await new Promise((resolve) => window.setTimeout(resolve, delayMs))
    }

    const stored = getStoredE2ERemoteState()
    if (stored) {
      const remoteSignature = getRemoteStateSignature(stored.state)
      const patchedRemoteState = options.pendingRemoteSignature && options.pendingStatePatch
        ? applyPendingAppStatePatch(stored.state, options.pendingStatePatch)
        : null
      const hasPendingPatch = Boolean(options.pendingRemoteSignature && options.pendingStatePatch)
      const hasPendingLocalChanges = hasPendingPatch || options.pendingRemoteSignature === fallbackSignature
      const shouldKeepLocalChanges =
        !hasPendingPatch &&
        hasPendingLocalChanges &&
        options.pendingRemoteBaseUpdatedAt === stored.updatedAt &&
        options.pendingRemoteSignature === fallbackSignature

      return {
        state: patchedRemoteState ?? (shouldKeepLocalChanges
          ? fallbackState
          : hasPendingLocalChanges
            ? mergeRemoteAppStateCardLevel(stored.state, fallbackState)
            : mergeRemoteAppStateWithLocalState(stored.state, fallbackState)),
        lastSyncedAt: stored.updatedAt,
        remoteSignature,
        keptLocalChanges: hasPendingLocalChanges,
        seeded: false,
      }
    }

    const updatedAt = new Date().toISOString()
    setStoredE2ERemoteState(fallbackState, updatedAt)
    return {
      state: fallbackState,
      lastSyncedAt: updatedAt,
      remoteSignature: fallbackSignature,
      keptLocalChanges: false,
      seeded: true,
    }
  }

  const supabase = getSupabaseClient()
  if (!supabase) {
    return {
      state: fallbackState,
      lastSyncedAt: null,
      remoteSignature: fallbackSignature,
      keptLocalChanges: false,
      seeded: false,
    }
  }

  const data = await getRemoteWorkspaceStateRow()

  if (data) {
    const remoteState = coerceAppState(data.state)
    const remoteSignature = getRemoteStateSignature(remoteState)
    const patchedRemoteState = options.pendingRemoteSignature && options.pendingStatePatch
      ? applyPendingAppStatePatch(remoteState, options.pendingStatePatch)
      : null
    const hasPendingPatch = Boolean(options.pendingRemoteSignature && options.pendingStatePatch)
    const hasPendingLocalChanges = hasPendingPatch || options.pendingRemoteSignature === fallbackSignature
    const shouldKeepLocalChanges =
      !hasPendingPatch &&
      hasPendingLocalChanges &&
      options.pendingRemoteBaseUpdatedAt === data.updated_at &&
      options.pendingRemoteSignature === fallbackSignature

    return {
      state: patchedRemoteState ?? (shouldKeepLocalChanges
        ? fallbackState
        : hasPendingLocalChanges
          ? mergeRemoteAppStateCardLevel(remoteState, fallbackState)
          : mergeRemoteAppStateWithLocalState(remoteState, fallbackState)),
      lastSyncedAt: data.updated_at,
      remoteSignature,
      keptLocalChanges: hasPendingLocalChanges,
      seeded: false,
    }
  }

  const { data: seededRow, error: upsertError } = await supabase.from(WORKSPACE_STATE_TABLE).upsert(
    createWorkspaceStateSeedRow(REMOTE_WORKSPACE_ID, fallbackState),
    {
      onConflict: 'workspace_id',
    },
  ).select('updated_at').single<{ updated_at: string }>()

  if (upsertError) {
    const latest = await getRemoteWorkspaceStateRow()
    if (latest) {
      const latestState = coerceAppState(latest.state)
      return {
        state: mergeRemoteAppStateWithLocalState(latestState, fallbackState),
        lastSyncedAt: latest.updated_at,
        remoteSignature: getRemoteStateSignature(latestState),
        keptLocalChanges: false,
        seeded: false,
      }
    }
    throw upsertError
  }

  return {
    state: fallbackState,
    lastSyncedAt: seededRow?.updated_at ?? null,
    remoteSignature: fallbackSignature,
    keptLocalChanges: false,
    seeded: true,
  }
}

export async function saveRemoteAppState(state: AppState, expectedUpdatedAt: string | null) {
  const updatedAt = new Date().toISOString()

  if (isE2ERemoteMode()) {
    const stored = getStoredE2ERemoteState()
    if (stored && !expectedUpdatedAt) {
      throw new RemoteStateConflictError(
        mergeRemoteAppStateCardLevel(stored.state, state),
        stored.state,
        stored.updatedAt,
      )
    }
    if (stored && expectedUpdatedAt && stored.updatedAt !== expectedUpdatedAt) {
      const latestRemoteState = stored.state
      throw new RemoteStateConflictError(
        mergeRemoteAppStateWithLocalState(latestRemoteState, state),
        latestRemoteState,
        stored.updatedAt,
      )
    }
    setStoredE2ERemoteState(state, updatedAt)
    return updatedAt
  }

  const supabase = getSupabaseClient()
  if (!supabase) {
    return null
  }

  if (!expectedUpdatedAt) {
    const loaded = await loadOrCreateRemoteAppState(state)
    if (loaded.seeded || !loaded.lastSyncedAt) {
      return loaded.lastSyncedAt
    }
    throw new RemoteStateConflictError(
      mergeRemoteAppStateCardLevel(loaded.state, state),
      loaded.state,
      loaded.lastSyncedAt,
    )
  }

  const { data, error } = await supabase
    .from(WORKSPACE_STATE_TABLE)
    .update(createWorkspaceStateUpdateRow(state))
    .eq('workspace_id', REMOTE_WORKSPACE_ID)
    .eq('updated_at', expectedUpdatedAt)
    .select('updated_at')
    .maybeSingle<{ updated_at: string }>()

  if (error) {
    throw error
  }

  if (data?.updated_at) {
    return data.updated_at
  }

  const latest = await getRemoteWorkspaceStateRow()
  if (latest) {
    const latestRemoteState = coerceAppState(latest.state)
    throw new RemoteStateConflictError(
      mergeRemoteAppStateWithLocalState(latestRemoteState, state),
      latestRemoteState,
      latest.updated_at,
    )
  }

  const loaded = await loadOrCreateRemoteAppState(state)
  return loaded.lastSyncedAt
}

export async function saveRemoteAppStateWithRetryMerge(
  state: AppState,
  expectedUpdatedAt: string | null,
  maxConflictRetries = 3,
): Promise<SaveRemoteAppStateWithMergeResult> {
  let candidateState = state
  let candidateExpectedUpdatedAt = expectedUpdatedAt
  let latestRemoteState = state
  let latestRemoteUpdatedAt = expectedUpdatedAt ?? ''

  for (let attempt = 0; attempt < maxConflictRetries; attempt += 1) {
    try {
      const updatedAt = await saveRemoteAppState(candidateState, candidateExpectedUpdatedAt)
      return {
        updatedAt,
        savedState: candidateState,
        merged: attempt > 0,
      }
    } catch (error) {
      if (!(error instanceof RemoteStateConflictError)) {
        throw error
      }

      latestRemoteState = error.latestRemoteState
      latestRemoteUpdatedAt = error.latestUpdatedAt
      const mergedState = mergeRemoteAppStateCardLevel(latestRemoteState, candidateState)
      candidateState = mergedState
      candidateExpectedUpdatedAt = error.latestUpdatedAt
    }
  }

  throw new RemoteStateConflictError(candidateState, latestRemoteState, latestRemoteUpdatedAt)
}
