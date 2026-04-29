import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import {
  PENDING_STATE_PATCH_KEY,
  PENDING_STATE_KEY,
  addDevCard,
  createEmptyPortfolio,
  createSeedState,
  loadAppState,
  loadPendingAppStatePatch,
  loadSyncMetadata,
  markPortfolioMetadataUpdated,
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

function bumpStoredRemoteUpdatedAt(updatedAt = '2099-01-01T00:00:00.000Z') {
  const raw = window.localStorage.getItem(E2E_REMOTE_STATE_KEY)
  if (!raw) {
    return
  }

  const parsed = JSON.parse(raw) as { state: unknown; updatedAt: string }
  window.localStorage.setItem(
    E2E_REMOTE_STATE_KEY,
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
    const shellPortfolio = markPortfolioMetadataUpdated(
      createEmptyPortfolio('Untitled portfolio', seed.portfolios.length),
      '2026-04-28T00:00:00.000Z',
    )
    const shellState = {
      ...seed,
      portfolios: [...seed.portfolios, shellPortfolio],
    }
    const renamedState = {
      ...shellState,
      portfolios: shellState.portfolios.map((portfolio) =>
        portfolio.id === shellPortfolio.id
          ? markPortfolioMetadataUpdated({
              ...portfolio,
              name: 'BrandLab Thai',
              webhookUrl: 'https://example.com/brandlab-thai',
            }, '2026-04-28T00:00:01.000Z')
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

  it('keeps pending local cards on refresh when the full pending state is available', async () => {
    const seed = createSeedState()
    const firstLoad = await loadOrCreateRemoteAppState(seed)
    const basePortfolio = seed.portfolios[0]!
    const sourceCard = basePortfolio.cards[0]!
    const pendingCard = {
      ...sourceCard,
      id: 'PX9999',
      title: 'Pending creative should survive refresh',
      dateCreated: '2026-04-29',
      dateAssigned: '2026-04-29',
      stageEnteredAt: '2026-04-29T10:00:00.000Z',
      updatedAt: '2026-04-29T10:00:00.000Z',
      driveFolderCreated: true,
      driveFolderUrl: 'https://drive.google.com/drive/folders/pending-card',
    }
    const pendingState = {
      ...seed,
      portfolios: seed.portfolios.map((portfolio) =>
        portfolio.id === basePortfolio.id
          ? {
              ...portfolio,
              cards: [...portfolio.cards, pendingCard],
              lastIdPerPrefix: {
                ...portfolio.lastIdPerPrefix,
                PX: Math.max(portfolio.lastIdPerPrefix.PX ?? 0, 9999),
              },
            }
          : portfolio,
      ),
    }

    persistAppState(pendingState)
    persistSyncMetadata({
      lastSyncedAt: firstLoad.lastSyncedAt,
      pendingRemoteBaseUpdatedAt: firstLoad.lastSyncedAt,
      pendingRemoteSignature: getRemoteStateSignature(pendingState),
    })

    const rehydrated = await loadOrCreateRemoteAppState(loadAppState(), {
      ...loadSyncMetadata(),
      pendingStatePatch: loadPendingAppStatePatch(),
    })

    expect(rehydrated.keptLocalChanges).toBe(true)
    expect(
      rehydrated.state.portfolios
        .find((portfolio) => portfolio.id === basePortfolio.id)
        ?.cards.some((card) => card.id === pendingCard.id),
    ).toBe(true)
  })

  it('keeps a pending local card deletion on refresh when only the small pending patch is available', async () => {
    const seed = createSeedState()
    const firstLoad = await loadOrCreateRemoteAppState(seed)
    const basePortfolio = seed.portfolios[0]!
    const deletedCard = basePortfolio.cards[0]!
    const pendingState = {
      ...seed,
      deletedCardIds: [deletedCard.id],
      portfolios: seed.portfolios.map((portfolio) =>
        portfolio.id === basePortfolio.id
          ? {
              ...portfolio,
              cards: portfolio.cards.filter((card) => card.id !== deletedCard.id),
            }
          : portfolio,
      ),
    }

    persistAppState(pendingState)
    window.localStorage.removeItem(PENDING_STATE_KEY)
    persistSyncMetadata({
      lastSyncedAt: firstLoad.lastSyncedAt,
      pendingRemoteBaseUpdatedAt: firstLoad.lastSyncedAt,
      pendingRemoteSignature: getRemoteStateSignature(pendingState),
    })

    const rehydrated = await loadOrCreateRemoteAppState(loadAppState(), {
      ...loadSyncMetadata(),
      pendingStatePatch: loadPendingAppStatePatch(),
    })

    expect(rehydrated.keptLocalChanges).toBe(true)
    expect(
      rehydrated.state.portfolios
        .find((portfolio) => portfolio.id === basePortfolio.id)
        ?.cards.some((card) => card.id === deletedCard.id),
    ).toBe(false)
  })

  it('saves through a merge when the client has no remote base timestamp yet', async () => {
    const seed = createSeedState()
    await loadOrCreateRemoteAppState(seed)
    const portfolioId = seed.portfolios[0]!.id
    const renamedState = {
      ...seed,
      portfolios: seed.portfolios.map((portfolio) =>
        portfolio.id === portfolioId
          ? markPortfolioMetadataUpdated(
              {
                ...portfolio,
                name: 'BrandLab Thailand',
              },
              '2026-04-28T00:00:01.000Z',
            )
          : portfolio,
      ),
    }

    const result = await saveRemoteAppStateWithRetryMerge(renamedState, null)
    const synced = await loadOrCreateRemoteAppState(seed)

    expect(result.merged).toBe(true)
    expect(synced.state.portfolios.find((portfolio) => portfolio.id === portfolioId)?.name).toBe(
      'BrandLab Thailand',
    )
  })

  it('does not let a stale portfolio shell erase newer remote brands, products, or team', async () => {
    const seed = createSeedState()
    const firstLoad = await loadOrCreateRemoteAppState(seed)
    const shellPortfolio = markPortfolioMetadataUpdated(
      createEmptyPortfolio('BrandLab Thai', seed.portfolios.length),
      '2026-04-28T00:00:00.000Z',
    )
    const shellState = {
      ...seed,
      portfolios: [...seed.portfolios, shellPortfolio],
    }
    const shellSavedAt = await saveRemoteAppState(shellState, firstLoad.lastSyncedAt)
    const remoteEditedState = {
      ...shellState,
      portfolios: shellState.portfolios.map((portfolio) =>
        portfolio.id === shellPortfolio.id
          ? markPortfolioMetadataUpdated(
              {
                ...portfolio,
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
                    id: 'member-remote-newer',
                    name: 'Remote Newer',
                    role: 'Manager',
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
              },
              '2026-04-28T00:00:03.000Z',
            )
          : portfolio,
      ),
    }
    await saveRemoteAppState(remoteEditedState, shellSavedAt)

    const result = await saveRemoteAppStateWithRetryMerge(shellState, shellSavedAt)
    const synced = await loadOrCreateRemoteAppState(seed)
    const syncedPortfolio = synced.state.portfolios.find(
      (portfolio) => portfolio.id === shellPortfolio.id,
    )

    expect(result.merged).toBe(true)
    expect(syncedPortfolio?.brands.map((brand) => brand.name)).toEqual(['Nutrio'])
    expect(syncedPortfolio?.brands[0]?.products).toEqual(['Sleep'])
    expect(syncedPortfolio?.team.map((member) => member.name)).toEqual(['Remote Newer'])
  })

  it('keeps newer creative card field edits when a stale save conflicts with remote state', async () => {
    const seed = createSeedState()
    const firstLoad = await loadOrCreateRemoteAppState(seed)
    const portfolio = seed.portfolios[0]!
    const card = portfolio.cards[0]!
    const remoteEditedState = {
      ...seed,
      portfolios: seed.portfolios.map((item) =>
        item.id === portfolio.id
          ? {
              ...item,
              cards: item.cards.map((candidate) =>
                candidate.id === card.id
                  ? {
                      ...candidate,
                      brief: 'Remote older brief',
                      updatedAt: '2026-04-29T00:00:01.000Z',
                    }
                  : candidate,
              ),
            }
          : item,
      ),
    }
    const localEditedState = {
      ...seed,
      portfolios: seed.portfolios.map((item) =>
        item.id === portfolio.id
          ? {
              ...item,
              cards: item.cards.map((candidate) =>
                candidate.id === card.id
                  ? {
                      ...candidate,
                      brief: 'Local newer brief',
                      updatedAt: '2026-04-29T00:00:02.000Z',
                    }
                  : candidate,
              ),
            }
          : item,
      ),
    }

    await saveRemoteAppState(remoteEditedState, firstLoad.lastSyncedAt)
    bumpStoredRemoteUpdatedAt()
    const result = await saveRemoteAppStateWithRetryMerge(localEditedState, firstLoad.lastSyncedAt)
    const synced = await loadOrCreateRemoteAppState(seed)
    const syncedCard = synced.state.portfolios[0]?.cards.find((candidate) => candidate.id === card.id)

    expect(result.merged).toBe(true)
    expect(syncedCard?.brief).toBe('Local newer brief')
    expect(syncedCard?.updatedAt).toBe('2026-04-29T00:00:02.000Z')
  })

  it('merges card comments during stale saves instead of dropping either side', async () => {
    const seed = createSeedState()
    const firstLoad = await loadOrCreateRemoteAppState(seed)
    const portfolio = seed.portfolios[0]!
    const card = portfolio.cards[0]!
    const remoteComment = {
      author: 'Remote reviewer',
      text: 'Remote comment should stay',
      timestamp: '2026-04-29T00:00:03.000Z',
    }
    const localComment = {
      author: 'Local reviewer',
      text: 'Local comment should survive refresh',
      timestamp: '2026-04-29T00:00:01.000Z',
    }
    const remoteEditedState = {
      ...seed,
      portfolios: seed.portfolios.map((item) =>
        item.id === portfolio.id
          ? {
              ...item,
              cards: item.cards.map((candidate) =>
                candidate.id === card.id
                  ? {
                      ...candidate,
                      comments: [remoteComment],
                      updatedAt: '2026-04-29T00:00:04.000Z',
                    }
                  : candidate,
              ),
            }
          : item,
      ),
    }
    const localEditedState = {
      ...seed,
      portfolios: seed.portfolios.map((item) =>
        item.id === portfolio.id
          ? {
              ...item,
              cards: item.cards.map((candidate) =>
                candidate.id === card.id
                  ? {
                      ...candidate,
                      comments: [localComment],
                      updatedAt: '2026-04-29T00:00:01.000Z',
                    }
                  : candidate,
              ),
            }
          : item,
      ),
    }

    await saveRemoteAppState(remoteEditedState, firstLoad.lastSyncedAt)
    bumpStoredRemoteUpdatedAt()
    const result = await saveRemoteAppStateWithRetryMerge(localEditedState, firstLoad.lastSyncedAt)
    const synced = await loadOrCreateRemoteAppState(seed)
    const syncedCard = synced.state.portfolios[0]?.cards.find((candidate) => candidate.id === card.id)

    expect(result.merged).toBe(true)
    expect(syncedCard?.comments.map((comment) => comment.text)).toEqual([
      'Local comment should survive refresh',
      'Remote comment should stay',
    ])
  })

  it('does not resurrect locally deleted cards during stale save conflict merges', async () => {
    const seed = createSeedState()
    const firstLoad = await loadOrCreateRemoteAppState(seed)
    const portfolio = seed.portfolios[0]!
    const deletedCard = portfolio.cards[0]!
    const remoteNewCard = {
      ...deletedCard,
      id: 'PX9001',
      title: 'Remote card created after local base',
      comments: [],
      dateCreated: '2026-04-29',
      dateAssigned: '2026-04-29',
      stageEnteredAt: '2026-04-29T00:00:03.000Z',
      updatedAt: '2026-04-29T00:00:03.000Z',
    }
    const remoteEditedState = {
      ...seed,
      portfolios: seed.portfolios.map((item) =>
        item.id === portfolio.id
          ? {
              ...item,
              cards: [...item.cards, remoteNewCard],
            }
          : item,
      ),
    }
    const localDeletedState = {
      ...seed,
      deletedCardIds: [deletedCard.id],
      portfolios: seed.portfolios.map((item) =>
        item.id === portfolio.id
          ? {
              ...item,
              cards: item.cards.filter((candidate) => candidate.id !== deletedCard.id),
            }
          : item,
      ),
    }

    await saveRemoteAppState(remoteEditedState, firstLoad.lastSyncedAt)
    bumpStoredRemoteUpdatedAt()
    const result = await saveRemoteAppStateWithRetryMerge(localDeletedState, firstLoad.lastSyncedAt)
    const synced = await loadOrCreateRemoteAppState(seed)
    const syncedCards = synced.state.portfolios[0]?.cards ?? []

    expect(result.merged).toBe(true)
    expect(syncedCards.some((card) => card.id === deletedCard.id)).toBe(false)
    expect(syncedCards.some((card) => card.id === remoteNewCard.id)).toBe(true)
    expect(synced.state.deletedCardIds).toContain(deletedCard.id)
  })

  it('keeps newer legacy Dev board field edits by migrating them into main-board cards during conflicts', async () => {
    const seed = createSeedState()
    const brand = seed.portfolios[0]!.brands[0]!.name
    const devBoard = addDevCard(seed.devBoard, {
      title: 'Dev conflict request',
      brand,
      sourceBacklogCardId: 'BL0099',
    })
    const baseState = {
      ...seed,
      devBoard,
    }
    const firstLoad = await loadOrCreateRemoteAppState(baseState)
    const card = devBoard.cards[0]!
    const remoteEditedState = {
      ...baseState,
      devBoard: {
        ...devBoard,
        cards: devBoard.cards.map((candidate) =>
          candidate.id === card.id
            ? {
                ...candidate,
                taskDescription: 'Remote older dev context',
                updatedAt: '2026-04-29T00:00:01.000Z',
              }
            : candidate,
        ),
      },
    }
    const localEditedState = {
      ...baseState,
      devBoard: {
        ...devBoard,
        cards: devBoard.cards.map((candidate) =>
          candidate.id === card.id
            ? {
                ...candidate,
                taskDescription: 'Local newer dev context',
                updatedAt: '2026-04-29T00:00:02.000Z',
              }
            : candidate,
        ),
      },
    }

    await saveRemoteAppState(remoteEditedState, firstLoad.lastSyncedAt)
    bumpStoredRemoteUpdatedAt()
    const result = await saveRemoteAppStateWithRetryMerge(localEditedState, firstLoad.lastSyncedAt)
    const synced = await loadOrCreateRemoteAppState(seed)
    const syncedCard = synced.state.portfolios[0]?.cards.find((candidate) =>
      candidate.notes.includes(`Migrated from Dev board card: ${card.id}`),
    )

    expect(result.merged).toBe(true)
    expect(synced.state.devBoard.cards).toHaveLength(0)
    expect(syncedCard?.sourceBacklogCardId).toBe('BL0099')
    expect(syncedCard?.brief).toBe('Local newer dev context')
  })

  it.each([
    { storageMode: 'full pending state' },
    { storageMode: 'small pending patch' },
  ])('rehydrates pending portfolio edits from $storageMode after a partial remote save moved the timestamp', async ({ storageMode }) => {
    const seed = createSeedState()
    const firstLoad = await loadOrCreateRemoteAppState(seed)
    const shellPortfolio = markPortfolioMetadataUpdated(
      createEmptyPortfolio('Untitled portfolio', seed.portfolios.length),
      '2026-04-28T00:00:00.000Z',
    )
    const shellState = {
      ...seed,
      portfolios: [...seed.portfolios, shellPortfolio],
    }
    const pendingState = {
      ...shellState,
      portfolios: shellState.portfolios.map((portfolio) =>
        portfolio.id === shellPortfolio.id
          ? markPortfolioMetadataUpdated({
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
            }, '2026-04-28T00:00:01.000Z')
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
