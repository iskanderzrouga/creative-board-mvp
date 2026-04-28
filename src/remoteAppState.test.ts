import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import {
  PENDING_STATE_PATCH_KEY,
  PENDING_STATE_KEY,
  createEmptyPortfolio,
  createSeedState,
  loadAppState,
  loadPendingAppStatePatch,
  loadSyncMetadata,
  persistAppState,
  persistSyncMetadata,
  type WorkingDay,
} from './board'
import {
  E2E_REMOTE_STATE_KEY,
} from './supabase'
import {
  createWorkspaceStateSeedRow,
  createWorkspaceStateUpdateRow,
  getRemoteStateSignature,
  loadOrCreateRemoteAppState,
  RemoteStateConflictError,
  saveRemoteAppState,
  saveRemoteAppStateWithRetryMerge,
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
    try {
      window.localStorage.setItem(E2E_AUTH_MODE_KEY, 'enabled')
    } catch {
      console.warn('[storage] Write failed, continuing:', E2E_AUTH_MODE_KEY)
    }
  })

  afterEach(() => {
    Reflect.deleteProperty(globalThis, 'window')
  })

  it('loads, saves, and reloads shared remote state while keeping local view state local', async () => {
    const seed = createSeedState()
    const firstLoad = await loadOrCreateRemoteAppState(seed)

    expect(firstLoad.seeded).toBe(true)
    expect(firstLoad.lastSyncedAt).toBeTruthy()

    const updatedState = {
      ...seed,
      activePage: 'settings' as const,
      settings: {
        ...seed.settings,
        general: {
          ...seed.settings.general,
          appName: 'Shared remote workspace',
        },
      },
    }

    const updatedAt = await saveRemoteAppState(updatedState, firstLoad.lastSyncedAt)
    const secondLoad = await loadOrCreateRemoteAppState(seed)

    expect(updatedAt).toBeTruthy()
    expect(secondLoad.seeded).toBe(false)
    expect(secondLoad.state.settings.general.appName).toBe('Shared remote workspace')
    expect(secondLoad.state.activePage).toBe(seed.activePage)
    expect(window.localStorage.getItem(E2E_REMOTE_STATE_KEY)).toContain('"appName":"Shared remote workspace"')
    expect(window.localStorage.getItem(E2E_REMOTE_STATE_KEY)).toContain('"activePage":"board"')
  })

  it('throws a conflict error when the stored remote timestamp has moved on while preserving local view state', async () => {
    const seed = createSeedState()
    const firstLoad = await loadOrCreateRemoteAppState(seed)
    const originalUpdatedAt = firstLoad.lastSyncedAt

    const otherSessionState = {
      ...seed,
      settings: {
        ...seed.settings,
        general: {
          ...seed.settings.general,
          appName: 'Other session change',
        },
      },
    }

    try {
      window.localStorage.setItem(
        E2E_REMOTE_STATE_KEY,
        JSON.stringify({
          state: otherSessionState,
          updatedAt: '2099-01-01T00:00:00.000Z',
        }),
      )
    } catch {
      console.warn('[storage] Write failed, continuing:', E2E_REMOTE_STATE_KEY)
    }

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
      expect((error as RemoteStateConflictError).latestState.settings.general.appName).toBe(
        'Other session change',
      )
      expect((error as RemoteStateConflictError).latestState.activePage).toBe('analytics')
      return
    }

    throw new Error('Expected a remote state conflict error.')
  })

  it('keeps newer local shared changes on reload when the remote version has not changed yet', async () => {
    const seed = createSeedState()
    const firstLoad = await loadOrCreateRemoteAppState(seed)
    const localDeletion = {
      ...seed,
      portfolios: seed.portfolios.map((portfolio, index) =>
        index !== 0
          ? portfolio
          : {
              ...portfolio,
              team: portfolio.team.filter((member) => member.name !== 'Naomi'),
            },
      ),
    }

    const reloaded = await loadOrCreateRemoteAppState(localDeletion, {
      pendingRemoteBaseUpdatedAt: firstLoad.lastSyncedAt,
      pendingRemoteSignature: getRemoteStateSignature(localDeletion),
    })

    expect(reloaded.state.portfolios[0]?.team.some((member) => member.name === 'Naomi')).toBe(false)
    expect(reloaded.remoteSignature).toBe(getRemoteStateSignature(seed))
    expect(reloaded.keptLocalChanges).toBe(true)

    const updatedAt = await saveRemoteAppState(reloaded.state, reloaded.lastSyncedAt)
    const synced = await loadOrCreateRemoteAppState(seed)

    expect(updatedAt).toBeTruthy()
    expect(synced.state.portfolios[0]?.team.some((member) => member.name === 'Naomi')).toBe(false)
  })

  it('loads pending local shared changes only while matching sync metadata is present', () => {
    const seed = createSeedState()
    const pendingState = {
      ...seed,
      settings: {
        ...seed.settings,
        general: {
          ...seed.settings.general,
          appName: 'Pending shared workspace',
        },
      },
    }

    persistAppState(pendingState)
    expect(window.localStorage.getItem(PENDING_STATE_PATCH_KEY)).toBeTruthy()
    expect(loadAppState().settings.general.appName).toBe(seed.settings.general.appName)

    persistSyncMetadata({
      lastSyncedAt: '2026-04-28T00:00:00.000Z',
      pendingRemoteBaseUpdatedAt: '2026-04-28T00:00:00.000Z',
      pendingRemoteSignature: getRemoteStateSignature(pendingState),
    })

    expect(loadAppState().settings.general.appName).toBe('Pending shared workspace')

    persistSyncMetadata({
      lastSyncedAt: '2026-04-28T00:00:01.000Z',
      pendingRemoteBaseUpdatedAt: null,
      pendingRemoteSignature: null,
    })

    expect(window.localStorage.getItem(PENDING_STATE_KEY)).toBeNull()
    expect(window.localStorage.getItem(PENDING_STATE_PATCH_KEY)).toBeNull()
    expect(loadAppState().settings.general.appName).toBe(seed.settings.general.appName)
  })

  it('keeps local portfolio edits when a stale in-flight shell save wins the race first', async () => {
    const seed = createSeedState()
    const firstLoad = await loadOrCreateRemoteAppState(seed)
    const shellPortfolio = createEmptyPortfolio('Untitled portfolio', seed.portfolios.length)
    const shellState = {
      ...seed,
      portfolios: [...seed.portfolios, shellPortfolio],
    }
    const renamedState = {
      ...shellState,
      portfolios: shellState.portfolios.map((portfolio) =>
        portfolio.id === shellPortfolio.id
          ? {
              ...portfolio,
              name: 'BrandLab Thai',
              webhookUrl: 'https://example.com/brandlab-thai',
            }
          : portfolio,
      ),
    }

    await saveRemoteAppState(shellState, firstLoad.lastSyncedAt)
    const storedShell = JSON.parse(window.localStorage.getItem(E2E_REMOTE_STATE_KEY) ?? '{}') as {
      state: unknown
    }
    window.localStorage.setItem(
      E2E_REMOTE_STATE_KEY,
      JSON.stringify({
        state: storedShell.state,
        updatedAt: '2099-01-01T00:00:00.000Z',
      }),
    )

    const result = await saveRemoteAppStateWithRetryMerge(renamedState, firstLoad.lastSyncedAt)
    const synced = await loadOrCreateRemoteAppState(seed)
    const syncedPortfolio = synced.state.portfolios.find(
      (portfolio) => portfolio.id === shellPortfolio.id,
    )

    expect(result.merged).toBe(true)
    expect(syncedPortfolio?.name).toBe('BrandLab Thai')
    expect(syncedPortfolio?.webhookUrl).toBe('https://example.com/brandlab-thai')
  })

  it.each([
    { storageMode: 'full pending state' },
    { storageMode: 'small pending patch' },
  ])('rehydrates pending portfolio edits from $storageMode after a partial remote save moved the timestamp', async ({ storageMode }) => {
    const seed = createSeedState()
    const firstLoad = await loadOrCreateRemoteAppState(seed)
    const shellPortfolio = createEmptyPortfolio('Untitled portfolio', seed.portfolios.length)
    const shellState = {
      ...seed,
      portfolios: [...seed.portfolios, shellPortfolio],
    }
    const pendingState = {
      ...shellState,
      portfolios: shellState.portfolios.map((portfolio) =>
        portfolio.id === shellPortfolio.id
          ? {
              ...portfolio,
              name: 'BrandLab Thai',
              brands: [
                {
                  name: 'Nutrio',
                  prefix: 'NT',
                  products: ['Sleep'],
                  driveParentFolderId: '',
                  facebookPage: '',
                  defaultLandingPage: '',
                  color: '#2563eb',
                  surfaceColor: '#eff6ff',
                  textColor: '#1e3a8a',
                },
              ],
              team: [
                {
                  id: 'member-refresh',
                  name: 'Refresh QA',
                  role: 'Editor',
                  weeklyHours: 40,
                  hoursPerDay: 8,
                  workingHoursPerDay: 8,
                  workStartHour: 9,
                  workEndHour: 17,
                  workingDays: ['Mon', 'Tue', 'Wed', 'Thu', 'Fri'] as WorkingDay[],
                  timezone: 'UTC',
                  wipCap: 3,
                  active: true,
                  accessEmail: null,
                },
              ],
              lastIdPerPrefix: {
                NT: 0,
              },
            }
          : portfolio,
      ),
    }

    await saveRemoteAppState(shellState, firstLoad.lastSyncedAt)
    persistAppState(pendingState)
    if (storageMode === 'small pending patch') {
      window.localStorage.removeItem(PENDING_STATE_KEY)
    }
    persistSyncMetadata({
      lastSyncedAt: firstLoad.lastSyncedAt,
      pendingRemoteBaseUpdatedAt: firstLoad.lastSyncedAt,
      pendingRemoteSignature: getRemoteStateSignature(pendingState),
    })

    const rehydrated = await loadOrCreateRemoteAppState(loadAppState(), {
      ...loadSyncMetadata(),
      pendingStatePatch: loadPendingAppStatePatch(),
    })
    const rehydratedPortfolio = rehydrated.state.portfolios.find(
      (portfolio) => portfolio.id === shellPortfolio.id,
    )

    expect(rehydrated.keptLocalChanges).toBe(true)
    expect(rehydratedPortfolio?.name).toBe('BrandLab Thai')
    expect(rehydratedPortfolio?.brands.map((brand) => brand.name)).toEqual(['Nutrio'])
    expect(rehydratedPortfolio?.team.map((member) => member.name)).toEqual(['Refresh QA'])

    await saveRemoteAppState(rehydrated.state, rehydrated.lastSyncedAt)
    const synced = await loadOrCreateRemoteAppState(seed)
    const syncedPortfolio = synced.state.portfolios.find(
      (portfolio) => portfolio.id === shellPortfolio.id,
    )

    expect(syncedPortfolio?.name).toBe('BrandLab Thai')
    expect(syncedPortfolio?.brands.map((brand) => brand.name)).toEqual(['Nutrio'])
    expect(syncedPortfolio?.team.map((member) => member.name)).toEqual(['Refresh QA'])
  })

  it('omits client-owned timestamps and local view state from real workspace_state write payloads', () => {
    const seed = {
      ...createSeedState(),
      activePage: 'settings' as const,
      notifications: [
        {
          id: 'notif-1',
          type: 'card_moved' as const,
          message: 'Moved a card',
          cardId: 'card-1',
          portfolioId: 'portfolio-brandlab',
          createdAt: '2026-03-16T00:00:00.000Z',
          read: false,
        },
      ],
    }

    expect(createWorkspaceStateSeedRow('primary', seed)).toEqual({
      workspace_id: 'primary',
      state: {
        ...seed,
        activePortfolioId: seed.settings.general.defaultPortfolioId,
        activeRole: {
          mode: 'owner',
          editorId: null,
        },
        activePage: 'board',
        notifications: [],
      },
    })
    expect(createWorkspaceStateSeedRow('primary', seed)).not.toHaveProperty('updated_at')

    expect(createWorkspaceStateUpdateRow(seed)).toEqual({
      state: {
        ...seed,
        activePortfolioId: seed.settings.general.defaultPortfolioId,
        activeRole: {
          mode: 'owner',
          editorId: null,
        },
        activePage: 'board',
        notifications: [],
      },
    })
    expect(createWorkspaceStateUpdateRow(seed)).not.toHaveProperty('updated_at')
    expect(getRemoteStateSignature(seed)).toBe(getRemoteStateSignature({ ...seed, activePage: 'board' }))
  })
})
