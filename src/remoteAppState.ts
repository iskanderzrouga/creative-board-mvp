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

export interface RemoteAppStateResult {
  state: AppState
  lastSyncedAt: string | null
  seeded: boolean
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
    state,
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
): Promise<RemoteAppStateResult> {
  if (isE2ERemoteMode()) {
    const delayMs = getE2ERemoteDelayMs()
    if (delayMs > 0) {
      await new Promise((resolve) => window.setTimeout(resolve, delayMs))
    }

    const stored = getStoredE2ERemoteState()
    if (stored) {
      return {
        state: stored.state,
        lastSyncedAt: stored.updatedAt,
        seeded: false,
      }
    }

    const updatedAt = new Date().toISOString()
    setStoredE2ERemoteState(fallbackState, updatedAt)
    return {
      state: fallbackState,
      lastSyncedAt: updatedAt,
      seeded: true,
    }
  }

  const supabase = getSupabaseClient()
  if (!supabase) {
    return {
      state: fallbackState,
      lastSyncedAt: null,
      seeded: false,
    }
  }

  const data = await getRemoteWorkspaceStateRow()

  if (data) {
    return {
      state: coerceAppState(data.state),
      lastSyncedAt: data.updated_at,
      seeded: false,
    }
  }

  const updatedAt = new Date().toISOString()
  const { data: seededRow, error: upsertError } = await supabase.from(WORKSPACE_STATE_TABLE).upsert(
    {
      workspace_id: REMOTE_WORKSPACE_ID,
      state: fallbackState,
      updated_at: updatedAt,
    },
    {
      onConflict: 'workspace_id',
    },
  ).select('updated_at').single<{ updated_at: string }>()

  if (upsertError) {
    const latest = await getRemoteWorkspaceStateRow()
    if (latest) {
      return {
        state: coerceAppState(latest.state),
        lastSyncedAt: latest.updated_at,
        seeded: false,
      }
    }
    throw upsertError
  }

  return {
    state: fallbackState,
    lastSyncedAt: seededRow?.updated_at ?? updatedAt,
    seeded: true,
  }
}

export async function saveRemoteAppState(state: AppState, expectedUpdatedAt: string | null) {
  const updatedAt = new Date().toISOString()

  if (isE2ERemoteMode()) {
    const stored = getStoredE2ERemoteState()
    if (stored && expectedUpdatedAt && stored.updatedAt !== expectedUpdatedAt) {
      throw new RemoteStateConflictError(stored.state, stored.updatedAt)
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
    .update({
      state,
      updated_at: updatedAt,
    })
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
    throw new RemoteStateConflictError(coerceAppState(latest.state), latest.updated_at)
  }

  const loaded = await loadOrCreateRemoteAppState(state)
  return loaded.lastSyncedAt
}
