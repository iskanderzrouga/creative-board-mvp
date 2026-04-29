import {
  coerceBacklogState,
  getBacklogCardUpdatedAt,
  type BacklogCard,
  type BacklogDeletedCard,
  type BacklogState,
} from './backlog'
import {
  getSupabaseClient,
  isE2EAuthOverrideEnabled,
  REMOTE_WORKSPACE_ID,
} from './supabase'

const WORKSPACE_BACKLOG_TABLE = 'workspace_backlog'
const E2E_BACKLOG_KEY = 'editors-board-e2e-remote-backlog'

interface WorkspaceBacklogRow {
  state: unknown
  updated_at: string
}

interface StoredRemoteBacklog {
  state: BacklogState
  updatedAt: string
}

export interface RemoteBacklogResult {
  state: BacklogState
  lastSyncedAt: string | null
  remoteSignature: string
  seeded: boolean
}

interface LoadRemoteBacklogOptions {
  pendingRemoteBaseUpdatedAt?: string | null
  pendingRemoteSignature?: string | null
}

export class RemoteBacklogConflictError extends Error {
  latestState: BacklogState
  latestUpdatedAt: string
  latestRemoteSignature: string

  constructor(state: BacklogState, updatedAt: string, remoteSignature: string) {
    super('Remote backlog changed before this save completed.')
    this.name = 'RemoteBacklogConflictError'
    this.latestState = state
    this.latestUpdatedAt = updatedAt
    this.latestRemoteSignature = remoteSignature
  }
}

function hasBrowser() {
  return typeof window !== 'undefined'
}

export function getRemoteBacklogSignature(state: BacklogState) {
  return JSON.stringify(state)
}

function parseTimestamp(value: string | null | undefined) {
  if (!value) {
    return 0
  }

  const parsed = Date.parse(value)
  return Number.isFinite(parsed) ? parsed : 0
}

function getLatestDeletedCards(
  remoteDeletedCards: BacklogDeletedCard[],
  localDeletedCards: BacklogDeletedCard[],
) {
  const byCardId = new Map<string, BacklogDeletedCard>()

  for (const deletedCard of [...remoteDeletedCards, ...localDeletedCards]) {
    const existing = byCardId.get(deletedCard.cardId)
    if (!existing || parseTimestamp(deletedCard.deletedAt) >= parseTimestamp(existing.deletedAt)) {
      byCardId.set(deletedCard.cardId, deletedCard)
    }
  }

  return byCardId
}

function isDeletedByNewerTombstone(card: BacklogCard, deletedCards: Map<string, BacklogDeletedCard>) {
  const deletedCard = deletedCards.get(card.id)
  return Boolean(deletedCard && parseTimestamp(deletedCard.deletedAt) >= getBacklogCardUpdatedAt(card))
}

export function mergeRemoteBacklogWithLocal(
  remoteState: BacklogState,
  localState: BacklogState,
): BacklogState {
  const deletedByCardId = getLatestDeletedCards(remoteState.deletedCards, localState.deletedCards)
  const remoteCardMap = new Map<string, BacklogCard>()
  for (const card of remoteState.cards) {
    if (!isDeletedByNewerTombstone(card, deletedByCardId)) {
      remoteCardMap.set(card.id, card)
    }
  }

  for (const card of localState.cards) {
    if (isDeletedByNewerTombstone(card, deletedByCardId)) {
      remoteCardMap.delete(card.id)
      continue
    }

    const remoteCard = remoteCardMap.get(card.id)
    if (remoteCard) {
      remoteCardMap.set(
        card.id,
        getBacklogCardUpdatedAt(card) >= getBacklogCardUpdatedAt(remoteCard) ? card : remoteCard,
      )
    } else {
      // Only re-add a local card if it's genuinely NEW (created locally
      // after the last sync).  A card whose numeric ID is ≤ the remote's
      // lastCardNumber was previously synced and then deleted remotely —
      // re-adding it would undo the delete.
      const numericId = Number(card.id.replace('BL', ''))
      if (Number.isFinite(numericId) && numericId > remoteState.lastCardNumber) {
        remoteCardMap.set(card.id, card)
      }
    }
  }

  const mergedCards = Array.from(remoteCardMap.values())
  const lastCardNumber = Math.max(remoteState.lastCardNumber, localState.lastCardNumber)

  return {
    cards: mergedCards,
    lastCardNumber,
    deletedCards: Array.from(deletedByCardId.values()),
  }
}

function isE2ERemoteMode() {
  return hasBrowser() && isE2EAuthOverrideEnabled()
}

function getStoredE2ERemoteBacklog(): StoredRemoteBacklog | null {
  if (!hasBrowser()) {
    return null
  }

  const raw = window.localStorage.getItem(E2E_BACKLOG_KEY)
  if (!raw) {
    return null
  }

  try {
    const parsed = JSON.parse(raw) as StoredRemoteBacklog
    return {
      state: coerceBacklogState(parsed.state),
      updatedAt: parsed.updatedAt,
    }
  } catch {
    return null
  }
}

function setStoredE2ERemoteBacklog(state: BacklogState, updatedAt: string) {
  if (!hasBrowser()) {
    return
  }

  const payload: StoredRemoteBacklog = { state, updatedAt }
  try {
    window.localStorage.setItem(E2E_BACKLOG_KEY, JSON.stringify(payload))
  } catch {
    console.warn('[storage] Write failed, continuing:', E2E_BACKLOG_KEY)
  }
}

async function getRemoteBacklogRow() {
  const supabase = getSupabaseClient()
  if (!supabase) {
    return null
  }

  const { data, error } = await supabase
    .from(WORKSPACE_BACKLOG_TABLE)
    .select('state, updated_at')
    .eq('workspace_id', REMOTE_WORKSPACE_ID)
    .maybeSingle<WorkspaceBacklogRow>()

  if (error) {
    throw error
  }

  return data
}

export async function loadOrCreateRemoteBacklogState(
  fallbackState: BacklogState,
  options: LoadRemoteBacklogOptions = {},
): Promise<RemoteBacklogResult> {
  const fallbackSignature = getRemoteBacklogSignature(fallbackState)

  if (isE2ERemoteMode()) {
    const stored = getStoredE2ERemoteBacklog()
    if (stored) {
      const remoteSignature = getRemoteBacklogSignature(stored.state)
      const shouldKeepLocal =
        options.pendingRemoteBaseUpdatedAt === stored.updatedAt &&
        options.pendingRemoteSignature === fallbackSignature

      return {
        state: shouldKeepLocal
          ? fallbackState
          : mergeRemoteBacklogWithLocal(stored.state, fallbackState),
        lastSyncedAt: stored.updatedAt,
        remoteSignature,
        seeded: false,
      }
    }

    const updatedAt = new Date().toISOString()
    setStoredE2ERemoteBacklog(fallbackState, updatedAt)
    return {
      state: fallbackState,
      lastSyncedAt: updatedAt,
      remoteSignature: fallbackSignature,
      seeded: true,
    }
  }

  const supabase = getSupabaseClient()
  if (!supabase) {
    return {
      state: fallbackState,
      lastSyncedAt: null,
      remoteSignature: fallbackSignature,
      seeded: false,
    }
  }

  const data = await getRemoteBacklogRow()

  if (data) {
    const remoteState = coerceBacklogState(data.state)
    const remoteSignature = getRemoteBacklogSignature(remoteState)
    const shouldKeepLocal =
      options.pendingRemoteBaseUpdatedAt === data.updated_at &&
      options.pendingRemoteSignature === fallbackSignature

    return {
      state: shouldKeepLocal
        ? fallbackState
        : mergeRemoteBacklogWithLocal(remoteState, fallbackState),
      lastSyncedAt: data.updated_at,
      remoteSignature,
      seeded: false,
    }
  }

  const { data: seededRow, error: upsertError } = await supabase
    .from(WORKSPACE_BACKLOG_TABLE)
    .upsert(
      {
        workspace_id: REMOTE_WORKSPACE_ID,
        state: fallbackState,
      },
      { onConflict: 'workspace_id' },
    )
    .select('updated_at')
    .single<{ updated_at: string }>()

  if (upsertError) {
    const latest = await getRemoteBacklogRow()
    if (latest) {
      const latestState = coerceBacklogState(latest.state)
      return {
        state: mergeRemoteBacklogWithLocal(latestState, fallbackState),
        lastSyncedAt: latest.updated_at,
        remoteSignature: getRemoteBacklogSignature(latestState),
        seeded: false,
      }
    }
    throw upsertError
  }

  return {
    state: fallbackState,
    lastSyncedAt: seededRow?.updated_at ?? null,
    remoteSignature: fallbackSignature,
    seeded: true,
  }
}

export async function saveRemoteBacklogState(
  state: BacklogState,
  expectedUpdatedAt: string | null,
) {
  const updatedAt = new Date().toISOString()

  if (isE2ERemoteMode()) {
    const stored = getStoredE2ERemoteBacklog()
    if (stored && expectedUpdatedAt && stored.updatedAt !== expectedUpdatedAt) {
      throw new RemoteBacklogConflictError(
        mergeRemoteBacklogWithLocal(stored.state, state),
        stored.updatedAt,
        getRemoteBacklogSignature(stored.state),
      )
    }
    setStoredE2ERemoteBacklog(state, updatedAt)
    return updatedAt
  }

  const supabase = getSupabaseClient()
  if (!supabase) {
    return null
  }

  if (!expectedUpdatedAt) {
    const loaded = await loadOrCreateRemoteBacklogState(state)
    if (loaded.seeded || !loaded.lastSyncedAt) {
      return loaded.lastSyncedAt
    }
    throw new RemoteBacklogConflictError(
      mergeRemoteBacklogWithLocal(loaded.state, state),
      loaded.lastSyncedAt,
      loaded.remoteSignature,
    )
  }

  const { data, error } = await supabase
    .from(WORKSPACE_BACKLOG_TABLE)
    .update({ state })
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

  const latest = await getRemoteBacklogRow()
  if (latest) {
    const latestRemoteState = coerceBacklogState(latest.state)
    throw new RemoteBacklogConflictError(
      mergeRemoteBacklogWithLocal(latestRemoteState, state),
      latest.updated_at,
      getRemoteBacklogSignature(latestRemoteState),
    )
  }

  const loaded = await loadOrCreateRemoteBacklogState(state)
  return loaded.lastSyncedAt
}

export interface SaveRemoteBacklogStateWithMergeResult {
  updatedAt: string | null
  savedState: BacklogState
  merged: boolean
}

export async function saveRemoteBacklogStateWithRetryMerge(
  state: BacklogState,
  expectedUpdatedAt: string | null,
  maxConflictRetries = 3,
): Promise<SaveRemoteBacklogStateWithMergeResult> {
  let candidateState = state
  let candidateExpectedUpdatedAt = expectedUpdatedAt
  let latestRemoteUpdatedAt = expectedUpdatedAt ?? ''
  let latestRemoteSignature = getRemoteBacklogSignature(state)

  for (let attempt = 0; attempt < maxConflictRetries; attempt += 1) {
    try {
      const updatedAt = await saveRemoteBacklogState(candidateState, candidateExpectedUpdatedAt)
      return {
        updatedAt,
        savedState: candidateState,
        merged: attempt > 0,
      }
    } catch (error) {
      if (!(error instanceof RemoteBacklogConflictError)) {
        throw error
      }

      latestRemoteUpdatedAt = error.latestUpdatedAt
      latestRemoteSignature = error.latestRemoteSignature
      candidateState = error.latestState
      candidateExpectedUpdatedAt = error.latestUpdatedAt
    }
  }

  throw new RemoteBacklogConflictError(candidateState, latestRemoteUpdatedAt, latestRemoteSignature)
}
