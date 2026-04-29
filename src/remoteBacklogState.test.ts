import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import {
  addBacklogCard,
  createBacklogSeedState,
  deleteBacklogCard,
  updateBacklogCard,
} from './backlog'
import {
  loadOrCreateRemoteBacklogState,
  mergeRemoteBacklogWithLocal,
  saveRemoteBacklogState,
  saveRemoteBacklogStateWithRetryMerge,
} from './remoteBacklogState'

const E2E_AUTH_MODE_KEY = 'editors-board-e2e-auth-mode'
const E2E_BACKLOG_KEY = 'editors-board-e2e-remote-backlog'

function bumpStoredBacklogUpdatedAt(updatedAt = '2099-01-01T00:00:00.000Z') {
  const raw = window.localStorage.getItem(E2E_BACKLOG_KEY)
  if (!raw) {
    return
  }

  const parsed = JSON.parse(raw) as { state: unknown; updatedAt: string }
  window.localStorage.setItem(
    E2E_BACKLOG_KEY,
    JSON.stringify({
      ...parsed,
      updatedAt,
    }),
  )
}

function createLocalStorageMock() {
  const store = new Map<string, string>()

  return {
    get length() {
      return store.size
    },
    getItem(key: string) {
      return store.has(key) ? store.get(key)! : null
    },
    key(index: number) {
      return Array.from(store.keys())[index] ?? null
    },
    setItem(key: string, value: string) {
      store.set(key, value)
    },
    removeItem(key: string) {
      store.delete(key)
    },
    clear() {
      store.clear()
    },
  }
}

function createSeedBacklogWithCard() {
  return addBacklogCard(createBacklogSeedState(), {
    name: 'Backlog sync card',
    taskType: 'creative',
    brand: 'Pluxy',
    addedBy: 'Naomi',
    dateAdded: '2026-04-29T00:00:00.000Z',
  })
}

describe('remote backlog state sync', () => {
  beforeEach(() => {
    Object.defineProperty(globalThis, 'window', {
      value: {
        localStorage: createLocalStorageMock(),
      },
      configurable: true,
      writable: true,
    })
    window.localStorage.setItem(E2E_AUTH_MODE_KEY, 'enabled')
  })

  afterEach(() => {
    Reflect.deleteProperty(globalThis, 'window')
  })

  it('keeps the newer version of an existing backlog card', () => {
    const base = createSeedBacklogWithCard()
    const card = base.cards[0]!
    const remoteState = updateBacklogCard(base, card.id, {
      description: 'Remote older idea',
      updatedAt: '2026-04-29T00:00:01.000Z',
    })
    const localState = updateBacklogCard(base, card.id, {
      description: 'Local newer idea',
      updatedAt: '2026-04-29T00:00:02.000Z',
    })

    const merged = mergeRemoteBacklogWithLocal(remoteState, localState)

    expect(merged.cards).toHaveLength(1)
    expect(merged.cards[0]?.description).toBe('Local newer idea')
    expect(merged.cards[0]?.updatedAt).toBe('2026-04-29T00:00:02.000Z')
  })

  it('keeps a deletion tombstone from reintroducing a transferred backlog card', () => {
    const remoteState = createSeedBacklogWithCard()
    const deletedLocalState = deleteBacklogCard(remoteState, remoteState.cards[0]!.id)

    const merged = mergeRemoteBacklogWithLocal(remoteState, deletedLocalState)

    expect(merged.cards).toHaveLength(0)
    expect(merged.deletedCards.map((deletedCard) => deletedCard.cardId)).toContain('BL0001')
  })

  it('saves a merged backlog state through a stale remote timestamp', async () => {
    const base = createSeedBacklogWithCard()
    const card = base.cards[0]!
    const firstLoad = await loadOrCreateRemoteBacklogState(base)
    const remoteEditedState = updateBacklogCard(base, card.id, {
      description: 'Remote older context',
      updatedAt: '2026-04-29T00:00:01.000Z',
    })
    const localEditedState = updateBacklogCard(base, card.id, {
      description: 'Local newer context',
      updatedAt: '2026-04-29T00:00:02.000Z',
    })

    await saveRemoteBacklogState(remoteEditedState, firstLoad.lastSyncedAt)
    bumpStoredBacklogUpdatedAt()
    const result = await saveRemoteBacklogStateWithRetryMerge(localEditedState, firstLoad.lastSyncedAt)
    const synced = await loadOrCreateRemoteBacklogState(createBacklogSeedState())

    expect(result.merged).toBe(true)
    expect(synced.state.cards[0]?.description).toBe('Local newer context')
  })
})
