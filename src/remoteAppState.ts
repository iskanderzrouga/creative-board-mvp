import { coerceAppState, type AppState } from './board'
import {
  E2E_REMOTE_STATE_KEY,
  getSupabaseClient,
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
  return {
    ...state,
    activePortfolioId: getRemoteDefaultPortfolioId(state),
    activeRole: {
      mode: 'owner',
      editorId: null,
    },
    activePage: 'board',
    notifications: [],
  }
}

export function getRemoteStateSignature(state: AppState) {
  return JSON.stringify(createRemoteStateSnapshot(state))
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
}

export class RemoteStateConflictError extends Error {
  latestState: AppState
  latestUpdatedAt: string

  constructor(state: AppState, updatedAt: string) {
    super('Remote workspace changed before this save completed.')
    this.name = 'RemoteStateConflictError'
    this.latestState = state
    this.latestUpdatedAt = updatedAt
  }
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

  window.localStorage.setItem(E2E_REMOTE_STATE_KEY, JSON.stringify(payload))
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
  return hasBrowser() && window.localStorage.getItem('editors-board-e2e-auth-mode') === 'enabled'
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
      const shouldKeepLocalChanges =
        options.pendingRemoteBaseUpdatedAt === stored.updatedAt &&
        options.pendingRemoteSignature === fallbackSignature

      return {
        state: shouldKeepLocalChanges
          ? fallbackState
          : mergeRemoteAppStateWithLocalState(stored.state, fallbackState),
        lastSyncedAt: stored.updatedAt,
        remoteSignature,
        keptLocalChanges: shouldKeepLocalChanges,
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
    const shouldKeepLocalChanges =
      options.pendingRemoteBaseUpdatedAt === data.updated_at &&
      options.pendingRemoteSignature === fallbackSignature

    return {
      state: shouldKeepLocalChanges
        ? fallbackState
        : mergeRemoteAppStateWithLocalState(remoteState, fallbackState),
      lastSyncedAt: data.updated_at,
      remoteSignature,
      keptLocalChanges: shouldKeepLocalChanges,
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
    if (stored && expectedUpdatedAt && stored.updatedAt !== expectedUpdatedAt) {
      throw new RemoteStateConflictError(
        mergeRemoteAppStateWithLocalState(stored.state, state),
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
    return loaded.lastSyncedAt
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
    throw new RemoteStateConflictError(
      mergeRemoteAppStateWithLocalState(coerceAppState(latest.state), state),
      latest.updated_at,
    )
  }

  const loaded = await loadOrCreateRemoteAppState(state)
  return loaded.lastSyncedAt
}
