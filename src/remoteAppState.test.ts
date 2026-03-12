import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { createSeedState } from './board'
import {
  E2E_REMOTE_STATE_KEY,
} from './supabase'
import {
  loadOrCreateRemoteAppState,
  RemoteStateConflictError,
  saveRemoteAppState,
} from './remoteAppState'

const E2E_AUTH_MODE_KEY = 'editors-board-e2e-auth-mode'

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

describe('remote app state sync', () => {
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

  it('loads, saves, and reloads remote state in e2e mode', async () => {
    const seed = createSeedState()
    const firstLoad = await loadOrCreateRemoteAppState(seed)

    expect(firstLoad.seeded).toBe(true)
    expect(firstLoad.lastSyncedAt).toBeTruthy()

    const updatedState = {
      ...seed,
      activePage: 'settings' as const,
    }

    const updatedAt = await saveRemoteAppState(updatedState, firstLoad.lastSyncedAt)
    const secondLoad = await loadOrCreateRemoteAppState(seed)

    expect(updatedAt).toBeTruthy()
    expect(secondLoad.seeded).toBe(false)
    expect(secondLoad.state.activePage).toBe('settings')
    expect(window.localStorage.getItem(E2E_REMOTE_STATE_KEY)).toContain('"activePage":"settings"')
  })

  it('throws a conflict error when the stored remote timestamp has moved on', async () => {
    const seed = createSeedState()
    const firstLoad = await loadOrCreateRemoteAppState(seed)
    const originalUpdatedAt = firstLoad.lastSyncedAt

    const otherSessionState = {
      ...seed,
      activePage: 'workload' as const,
    }

    window.localStorage.setItem(
      E2E_REMOTE_STATE_KEY,
      JSON.stringify({
        state: otherSessionState,
        updatedAt: '2099-01-01T00:00:00.000Z',
      }),
    )

    try {
      await saveRemoteAppState(
        {
          ...seed,
          activePage: 'analytics' as const,
        },
        originalUpdatedAt,
      )
    } catch (error) {
      expect(error).toBeInstanceOf(RemoteStateConflictError)
      expect((error as RemoteStateConflictError).latestState.activePage).toBe('workload')
      return
    }

    throw new Error('Expected a remote state conflict error.')
  })
})
