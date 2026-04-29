import { describe, expect, it } from 'vitest'

import {
  addCardToPortfolio,
  addDevCard,
  applyPendingAppStatePatch,
  applyCardUpdates,
  archiveEligibleCards,
  buildDashboardData,
  buildEditorPerformanceData,
  coerceAppState,
  createCardFromQuickInput,
  createEmptyPortfolio,
  createFreshStartState,
  createSeedState,
  getAgeToneFromMs,
  getBrandRemovalBlocker,
  getBoardStats,
  getCardScheduledHours,
  getCardMoveValidationMessage,
  getCreativeDriveFolderName,
  getDefaultBoardFilters,
  getDueStatus,
  getTeamMemberRemovalBlocker,
  getVisibleCards,
  getVisibleColumns,
  getRevisionCount,
  isThaiEditingPortfolio,
  markPortfolioMetadataUpdated,
  migrateLegacyDevBoardIntoMainBoard,
  moveCardInPortfolio,
  removeBrandFromPortfolio,
  removeCardFromPortfolio,
  removePortfolioFromAppState,
  removeTeamMemberFromPortfolio,
  renameBrandInPortfolio,
  renameTeamMemberInPortfolio,
  shouldAutoCreateCreativeDriveFolder,
  startEditorTimerForCard,
  type ViewerContext,
} from './board'
import { getScopedPortfolios, getVisiblePortfolioIds } from './accessHelpers'

const MANAGER_VIEWER: ViewerContext = {
  mode: 'manager',
  editorName: null,
  memberRole: 'Manager',
  visibleBrandNames: null,
}

const VIEWER_ACCESS: ViewerContext = {
  mode: 'viewer',
  editorName: null,
  memberRole: null,
  visibleBrandNames: null,
}

describe('board integrity helpers', () => {
  it('keeps cards linked when a brand name changes', () => {
    const portfolio = createSeedState().portfolios[0]
    const targetCard = portfolio.cards.find((card) => card.brand === portfolio.brands[0]?.name)

    expect(targetCard).toBeTruthy()

    const renamedPortfolio = renameBrandInPortfolio(portfolio, 0, 'Pluxy Prime')

    expect(renamedPortfolio.brands[0]?.name).toBe('Pluxy Prime')
    expect(
      renamedPortfolio.cards.find((card) => card.id === targetCard?.id)?.brand,
    ).toBe('Pluxy Prime')
    expect(portfolio.brands[0]?.name).toBe('Pluxy')
  })

  it('keeps card ownership linked when a team member name changes', () => {
    const portfolio = createSeedState().portfolios[0]
    const memberIndex = portfolio.team.findIndex((member) =>
      portfolio.cards.some((card) => card.owner === member.name),
    )
    const targetMember = portfolio.team[memberIndex]
    const targetCard = portfolio.cards.find((card) => card.owner === targetMember?.name)

    expect(memberIndex).toBeGreaterThanOrEqual(0)
    expect(targetMember).toBeTruthy()
    expect(targetCard).toBeTruthy()

    const renamedPortfolio = renameTeamMemberInPortfolio(portfolio, memberIndex, 'Daniel Tran')

    expect(renamedPortfolio.team[memberIndex]?.name).toBe('Daniel Tran')
    expect(
      renamedPortfolio.cards.find((card) => card.id === targetCard?.id)?.owner,
    ).toBe('Daniel Tran')
    expect(portfolio.team[memberIndex]?.name).toBe(targetMember?.name)
  })

  it('reassigns active and default portfolio ids when a portfolio is removed', () => {
    const state = createSeedState()
    const secondPortfolio = createEmptyPortfolio('Second Portfolio', state.portfolios.length)
    const nextState = {
      ...state,
      portfolios: [...state.portfolios, secondPortfolio],
      activePortfolioId: secondPortfolio.id,
      settings: {
        ...state.settings,
        general: {
          ...state.settings.general,
          defaultPortfolioId: secondPortfolio.id,
        },
      },
    }

    const reducedState = removePortfolioFromAppState(nextState, secondPortfolio.id)

    expect(reducedState.portfolios).toHaveLength(1)
    expect(reducedState.activePortfolioId).toBe(state.portfolios[0]?.id)
    expect(reducedState.settings.general.defaultPortfolioId).toBe(state.portfolios[0]?.id)
  })

  it('respects selected portfolio visibility for owner access records', () => {
    const state = createSeedState()
    const secondPortfolio = createEmptyPortfolio('BrandLab Thai', state.portfolios.length)
    const portfolios = [...state.portfolios, secondPortfolio]

    expect(
      getVisiblePortfolioIds(portfolios, {
        roleMode: 'owner',
        editorName: null,
        scopeMode: 'selected-portfolios',
        scopeAssignments: [{ portfolioId: state.portfolios[0]!.id, brandNames: [] }],
      }),
    ).toEqual([state.portfolios[0]!.id])
  })

  it('shows contributor cards when the access email is linked to the owning team member', () => {
    const state = createSeedState()
    const sourcePortfolio = state.portfolios[0]!
    const sourceCard = sourcePortfolio.cards.find((card) => card.owner)
    const sourceBrand = sourcePortfolio.brands[0]!
    const sourceMember = sourcePortfolio.team.find((member) => member.role === 'Editor')!
    const thaiPortfolio = {
      ...createEmptyPortfolio('BrandLab Thai', state.portfolios.length),
      id: 'portfolio-brandlab-thai',
      brands: [
        {
          ...sourceBrand,
          name: 'Nutrio',
          prefix: 'AA',
        },
      ],
      team: [
        {
          ...sourceMember,
          id: 'team-aim-tanakorn',
          name: 'Aim Tanakorn',
          accessEmail: 'tanakorn.panyadee2@gmail.com',
        },
      ],
      cards: [
        {
          ...sourceCard!,
          id: 'AA0001',
          title: 'Aim assigned card',
          brand: 'Nutrio',
          owner: 'Aim Tanakorn',
          stage: 'In Production' as const,
          archivedAt: null,
        },
      ],
      lastIdPerPrefix: {
        AA: 1,
      },
    }

    expect(sourceCard).toBeTruthy()

    const access = {
      email: 'tanakorn.panyadee2@gmail.com',
      roleMode: 'contributor' as const,
      editorName: 'Aim',
    }
    const scoped = getScopedPortfolios([sourcePortfolio, thaiPortfolio], access)

    expect(getVisiblePortfolioIds([sourcePortfolio, thaiPortfolio], access)).toEqual([thaiPortfolio.id])
    expect(scoped).toHaveLength(1)
    expect(scoped[0]?.id).toBe(thaiPortfolio.id)
    expect(scoped[0]?.brands.map((brand) => brand.name)).toEqual(['Nutrio'])
    expect(scoped[0]?.cards.map((card) => card.id)).toEqual(['AA0001'])
  })

  it('uses a flat Review lane for contributors while managers keep editor review lanes', () => {
    const state = createSeedState()
    const portfolio = state.portfolios[0]!
    const [firstEditor, secondEditor] = portfolio.team.filter((member) => member.role === 'Editor')
    const sourceCard = portfolio.cards.find((card) => card.owner)

    expect(firstEditor).toBeTruthy()
    expect(secondEditor).toBeTruthy()
    expect(sourceCard).toBeTruthy()

    const tunedPortfolio = {
      ...portfolio,
      cards: [
        {
          ...sourceCard!,
          id: 'OWNPROD',
          owner: firstEditor!.name,
          stage: 'In Production' as const,
          archivedAt: null,
          positionInSection: 0,
        },
        {
          ...sourceCard!,
          id: 'OWNREV',
          owner: firstEditor!.name,
          stage: 'Review' as const,
          archivedAt: null,
          positionInSection: 0,
        },
        {
          ...sourceCard!,
          id: 'OTHERREV',
          owner: secondEditor!.name,
          stage: 'Review' as const,
          archivedAt: null,
          positionInSection: 0,
        },
      ],
    }
    const contributorViewer: ViewerContext = {
      mode: 'contributor',
      editorName: firstEditor!.name,
      memberRole: firstEditor!.role,
      visibleBrandNames: null,
    }

    const contributorReviewColumn = getVisibleColumns(
      tunedPortfolio,
      contributorViewer,
      getDefaultBoardFilters(tunedPortfolio),
      state.settings,
    ).find((column) => column.id === 'Review')
    const managerReviewColumn = getVisibleColumns(
      tunedPortfolio,
      MANAGER_VIEWER,
      getDefaultBoardFilters(tunedPortfolio),
      state.settings,
    ).find((column) => column.id === 'Review')

    expect(contributorReviewColumn?.grouped).toBe(false)
    expect(contributorReviewColumn?.lanes).toHaveLength(1)
    expect(contributorReviewColumn?.lanes[0]?.owner).toBeNull()
    expect(contributorReviewColumn?.lanes[0]?.cards.map((card) => card.id)).toEqual(['OWNREV'])
    expect(
      getCardMoveValidationMessage(tunedPortfolio, contributorViewer, 'OWNPROD', 'Review', null),
    ).toBeNull()
    expect(managerReviewColumn?.grouped).toBe(true)
    expect(managerReviewColumn?.lanes.map((lane) => lane.owner)).toEqual(
      expect.arrayContaining([firstEditor!.name, secondEditor!.name]),
    )
  })

  it('detects Thai editing portfolios by name', () => {
    expect(isThaiEditingPortfolio({ ...createEmptyPortfolio('Brandlab Thai', 0), name: 'Brandlab Thai' })).toBe(true)
    expect(isThaiEditingPortfolio({ ...createEmptyPortfolio('BrandLab Thailand', 0), name: 'BrandLab Thailand' })).toBe(true)
    expect(isThaiEditingPortfolio(createEmptyPortfolio('BrandLab', 0))).toBe(false)
  })

  it('pins legacy workshop scripts and strategy cycles to the default portfolio', () => {
    const state = createSeedState()
    const secondPortfolio = createEmptyPortfolio('BrandLab Thai', state.portfolios.length)
    const defaultPortfolioId = state.portfolios[0]!.id

    const coerced = coerceAppState({
      ...state,
      portfolios: [...state.portfolios, secondPortfolio],
      scriptWorkshop: {
        scripts: [
          {
            id: 'script-legacy',
            title: 'Legacy script',
            brand: state.portfolios[0]!.brands[0]!.name,
            googleDocUrl: 'https://docs.google.com/document/d/legacy',
            reviews: {},
            comments: [],
          },
          {
            id: 'script-thai',
            portfolioId: secondPortfolio.id,
            title: 'Thai script',
            brand: secondPortfolio.brands[0]?.name ?? 'Thai Brand',
            googleDocUrl: 'https://docs.google.com/document/d/thai',
            reviews: {},
            comments: [],
          },
        ],
      },
      strategyCycles: [
        {
          id: 'strategy-legacy',
          name: 'Legacy cycle',
          startDate: '2026-04-01',
          endDate: '2026-04-30',
          objective: '',
          levers: [],
          conclusions: [],
          isActive: true,
          createdAt: '2026-04-01T00:00:00.000Z',
        },
        {
          id: 'strategy-thai',
          portfolioId: secondPortfolio.id,
          name: 'Thai cycle',
          startDate: '2026-04-01',
          endDate: '2026-04-30',
          objective: '',
          levers: [],
          conclusions: [],
          isActive: true,
          createdAt: '2026-04-01T00:00:00.000Z',
        },
      ],
    })

    expect(coerced.scriptWorkshop.scripts.find((script) => script.id === 'script-legacy')?.portfolioId).toBe(defaultPortfolioId)
    expect(coerced.scriptWorkshop.scripts.find((script) => script.id === 'script-thai')?.portfolioId).toBe(secondPortfolio.id)
    expect(coerced.strategyCycles?.find((cycle) => cycle.id === 'strategy-legacy')?.portfolioId).toBe(defaultPortfolioId)
    expect(coerced.strategyCycles?.find((cycle) => cycle.id === 'strategy-thai')?.portfolioId).toBe(secondPortfolio.id)
  })

  it('does not append a stale pending portfolio patch when the portfolio already exists', () => {
    const state = createSeedState()
    const portfolio = markPortfolioMetadataUpdated(
      {
        ...state.portfolios[0]!,
        name: 'Remote newer portfolio',
      },
      '2026-04-28T00:00:02.000Z',
    )
    const stalePendingPortfolio = {
      id: portfolio.id,
      name: 'Stale local portfolio',
      brands: portfolio.brands,
      team: portfolio.team,
      webhookUrl: portfolio.webhookUrl,
      lastIdPerPrefix: portfolio.lastIdPerPrefix,
      metadataUpdatedAt: '2026-04-28T00:00:01.000Z',
    }

    const patched = applyPendingAppStatePatch(
      {
        ...state,
        portfolios: [portfolio],
      },
      {
        portfolios: [stalePendingPortfolio],
        deletedCardIds: [],
        settings: state.settings,
        activePortfolioId: portfolio.id,
        version: state.version,
      },
    )

    expect(patched.portfolios.filter((item) => item.id === portfolio.id)).toHaveLength(1)
    expect(patched.portfolios[0]?.name).toBe('Remote newer portfolio')
  })

  it('creates a fresh-start state that keeps brands and products but clears cards and team members', () => {
    const state = createSeedState()
    const portfolio = state.portfolios[0]!

    expect(portfolio.cards.length).toBeGreaterThan(0)
    expect(portfolio.team.length).toBeGreaterThan(0)
    expect(portfolio.brands.length).toBeGreaterThan(0)

    const nextState = createFreshStartState(state)
    const nextPortfolio = nextState.portfolios[0]!

    expect(nextPortfolio.cards).toHaveLength(0)
    expect(nextPortfolio.team).toHaveLength(0)
    expect(nextPortfolio.brands).toEqual(portfolio.brands)
    expect(nextPortfolio.lastIdPerPrefix).toEqual(
      Object.fromEntries(portfolio.brands.map((brand) => [brand.prefix, 0])),
    )
    expect(portfolio.cards.length).toBeGreaterThan(0)
    expect(portfolio.team.length).toBeGreaterThan(0)
  })

  it('does not allow grouped-stage cards to become unassigned through direct updates', () => {
    const portfolio = createSeedState().portfolios[0]
    const targetCard = portfolio.cards.find(
      (card) =>
        card.owner !== null &&
        (card.stage === 'Briefed' ||
          card.stage === 'In Production' ||
          card.stage === 'Review'),
    )

    expect(targetCard).toBeTruthy()

    const updatedPortfolio = applyCardUpdates(
      portfolio,
      createSeedState().settings,
      targetCard!.id,
      { owner: null },
      'Naomi',
      '2026-03-11T12:00:00Z',
      MANAGER_VIEWER,
    )

    expect(
      updatedPortfolio.cards.find((card) => card.id === targetCard!.id)?.owner,
    ).toBe(targetCard!.owner)
  })

  it('keeps the product valid when a card is moved to a different brand', () => {
    const state = createSeedState()
    const portfolio = state.portfolios[0]
    const currentBrand = portfolio.brands[0]
    const nextBrand = portfolio.brands[1]
    const targetCard = portfolio.cards.find((card) => card.brand === currentBrand?.name)

    expect(targetCard).toBeTruthy()
    expect(nextBrand?.products[0]).toBeTruthy()

    const updatedPortfolio = applyCardUpdates(
      portfolio,
      state.settings,
      targetCard!.id,
      { brand: nextBrand!.name },
      'Naomi',
      '2026-03-12T09:00:00Z',
      MANAGER_VIEWER,
    )

    const updatedCard = updatedPortfolio.cards.find((card) => card.id === targetCard!.id)
    expect(updatedCard?.brand).toBe(nextBrand!.name)
    expect(updatedCard?.product).toBe(nextBrand!.products[0])
  })

  it('blocks deleting a brand that is still linked to cards', () => {
    const portfolio = createSeedState().portfolios[0]

    expect(getBrandRemovalBlocker(portfolio, 0)).toContain('Reassign those cards first.')
    expect(removeBrandFromPortfolio(portfolio, 0)).toBe(portfolio)
  })

  it('blocks removing a team member who still owns cards', () => {
    const portfolio = createSeedState().portfolios[0]
    const memberIndex = portfolio.team.findIndex((member) =>
      portfolio.cards.some((card) => card.owner === member.name),
    )

    expect(memberIndex).toBeGreaterThanOrEqual(0)
    expect(getTeamMemberRemovalBlocker(portfolio, memberIndex)).toContain('Reassign those cards first.')
    expect(removeTeamMemberFromPortfolio(portfolio, memberIndex)).toBe(portfolio)
  })

  it('allows removing the last manager from a portfolio when they do not own cards', () => {
    const portfolio = createSeedState().portfolios[0]
    const managerIndex = portfolio.team.findIndex((member) => member.role === 'Manager')

    expect(managerIndex).toBeGreaterThanOrEqual(0)
    expect(getTeamMemberRemovalBlocker(portfolio, managerIndex)).toBeNull()
    expect(removeTeamMemberFromPortfolio(portfolio, managerIndex).team).toHaveLength(
      portfolio.team.length - 1,
    )
  })

  it('rejects grouped-stage moves without a valid owner lane', () => {
    const portfolio = createSeedState().portfolios[0]
    const sourceCard = portfolio.cards[0]
    const backlogPortfolio = {
      ...portfolio,
      cards: portfolio.cards.map((card) =>
        card.id !== sourceCard?.id
          ? card
          : {
              ...card,
              owner: null,
              stage: 'Backlog' as const,
              stageEnteredAt: '2026-03-12T09:45:00Z',
              stageHistory: [
                {
                  stage: 'Backlog' as const,
                  enteredAt: '2026-03-12T09:45:00Z',
                  exitedAt: null,
                  durationDays: null,
                },
              ],
            },
      ),
    }

    expect(sourceCard).toBeTruthy()
    expect(
      moveCardInPortfolio(
        backlogPortfolio,
        sourceCard!.id,
        'Briefed',
        null,
        0,
        '2026-03-12T10:00:00Z',
        'Naomi',
        MANAGER_VIEWER,
      ),
    ).toBe(backlogPortfolio)
  })

  it('requires a revision reason and estimate for backward moves', () => {
    const portfolio = createSeedState().portfolios[0]
    const sourceCard = portfolio.cards.find((card) => card.stage === 'In Production' && card.owner)
    const reviewPortfolio = {
      ...portfolio,
      cards: portfolio.cards.map((card) =>
        card.id !== sourceCard?.id
          ? card
          : {
              ...card,
              stage: 'Review' as const,
              stageEnteredAt: '2026-03-12T10:00:00Z',
              stageHistory: [
                ...card.stageHistory,
                {
                  stage: 'Review' as const,
                  enteredAt: '2026-03-12T10:00:00Z',
                  exitedAt: null,
                  durationDays: null,
                },
              ],
            },
      ),
    }

    expect(sourceCard).toBeTruthy()
    expect(
      moveCardInPortfolio(
        reviewPortfolio,
        sourceCard!.id,
        'In Production',
        sourceCard!.owner,
        0,
        '2026-03-12T10:15:00Z',
        'Naomi',
        MANAGER_VIEWER,
      ),
    ).toBe(reviewPortfolio)
  })

  it('clears the revision estimate once the card moves forward again', () => {
    const portfolio = createSeedState().portfolios[0]
    const sourceCard = portfolio.cards.find((card) => card.stage === 'In Production' && card.owner)
    const destinationOwner =
      portfolio.team.find((member) => member.name !== sourceCard?.owner)?.name ?? sourceCard?.owner ?? null
    const reviewPortfolio = {
      ...portfolio,
      cards: portfolio.cards.map((card) =>
        card.id !== sourceCard?.id
          ? card
          : {
              ...card,
              stage: 'Review' as const,
              owner: destinationOwner,
              stageEnteredAt: '2026-03-12T10:00:00Z',
              stageHistory: [
                ...card.stageHistory,
                {
                  stage: 'Review' as const,
                  enteredAt: '2026-03-12T10:00:00Z',
                  exitedAt: null,
                  durationDays: null,
                },
              ],
            },
      ),
    }

    expect(sourceCard).toBeTruthy()

    const movedBack = moveCardInPortfolio(
      reviewPortfolio,
      sourceCard!.id,
      'In Production',
      destinationOwner,
      0,
      '2026-03-12T10:30:00Z',
      'Naomi',
      MANAGER_VIEWER,
      'Client feedback',
      4,
    )
    const movedForward = moveCardInPortfolio(
      movedBack,
      sourceCard!.id,
      'Review',
      destinationOwner,
      0,
      '2026-03-12T11:00:00Z',
      'Naomi',
      MANAGER_VIEWER,
    )

    expect(movedBack.cards.find((card) => card.id === sourceCard!.id)?.revisionEstimatedHours).toBe(4)
    expect(movedForward.cards.find((card) => card.id === sourceCard!.id)?.revisionEstimatedHours).toBeNull()
  })

  it('blocks forward stage moves while a card is marked blocked', () => {
    const state = createSeedState()
    const portfolio = state.portfolios[0]
    const briefedCard = portfolio.cards.find((card) => card.stage === 'Briefed' && card.owner)

    expect(briefedCard).toBeTruthy()

    const blockedPortfolio = applyCardUpdates(
      portfolio,
      state.settings,
      briefedCard!.id,
      {
        blocked: {
          reason: 'Waiting for footage',
          at: '2026-03-12T11:05:00Z',
        },
      },
      'Naomi',
      '2026-03-12T11:05:00Z',
      MANAGER_VIEWER,
    )

    expect(
      moveCardInPortfolio(
        blockedPortfolio,
        briefedCard!.id,
        'In Production',
        briefedCard!.owner,
        0,
        '2026-03-12T11:10:00Z',
        'Naomi',
        MANAGER_VIEWER,
      ),
    ).toBe(blockedPortfolio)
  })

  it('does not auto-archive blocked live cards', () => {
    const state = createSeedState()
    const portfolio = state.portfolios[0]
    const sourceCard = portfolio.cards[0]

    expect(sourceCard).toBeTruthy()

    const adjustedState = {
      ...state,
      settings: {
        ...state.settings,
        general: {
          ...state.settings.general,
          autoArchiveEnabled: true,
          autoArchiveDays: 7,
        },
      },
      portfolios: state.portfolios.map((item) =>
        item.id !== portfolio.id
          ? item
          : {
              ...item,
              cards: item.cards.map((card) =>
                card.id !== sourceCard!.id
                  ? card
                  : {
                      ...card,
                      stage: 'Live' as const,
                      stageEnteredAt: '2026-02-20T09:00:00Z',
                      blocked: {
                        reason: 'Launch issue',
                        at: '2026-02-21T09:00:00Z',
                      },
                    },
              ),
            },
      ),
    }

    const archivedState = archiveEligibleCards(adjustedState, new Date('2026-03-12T12:00:00Z').getTime())

    expect(
      archivedState.portfolios[0]?.cards.find((card) => card.id === sourceCard!.id)?.archivedAt,
    ).toBeNull()
  })

  it('does not mutate the original card positions when a lane is reindexed', () => {
    const portfolio = createSeedState().portfolios[0]
    const lanes = new Map<string, typeof portfolio.cards>()

    for (const card of portfolio.cards) {
      const laneKey = `${card.stage}::${card.owner ?? 'unassigned'}`
      const laneCards = lanes.get(laneKey) ?? []
      laneCards.push(card)
      lanes.set(laneKey, laneCards)
    }

    const laneCards = Array.from(lanes.values()).find((cards) => cards.length > 1)

    expect(laneCards).toBeTruthy()

    const sortedLaneCards = [...laneCards!].sort(
      (left, right) => left.positionInSection - right.positionInSection,
    )
    const sourceCard = sortedLaneCards[sortedLaneCards.length - 1]
    const originalPositions = new Map(
      sortedLaneCards.map((card) => [card.id, card.positionInSection]),
    )

    const movedPortfolio = moveCardInPortfolio(
      portfolio,
      sourceCard!.id,
      sourceCard!.stage,
      sourceCard!.owner,
      0,
      '2026-03-12T13:00:00Z',
      'Naomi',
      MANAGER_VIEWER,
    )

    expect(movedPortfolio).not.toBe(portfolio)
    expect(movedPortfolio.cards.find((card) => card.id === sourceCard!.id)?.positionInSection).toBe(0)

    for (const card of sortedLaneCards) {
      expect(card.positionInSection).toBe(originalPositions.get(card.id))
    }
  })

  it('migrates older saved app states to the current version', () => {
    const seed = createSeedState()
    const legacyState = {
      portfolios: [
        {
          ...seed.portfolios[0],
          cards: seed.portfolios[0]?.cards.map((card) => ({
            ...card,
            blocked: undefined,
            archivedAt: undefined,
          })),
        },
      ],
      settings: {
        ...seed.settings,
        taskLibrary: seed.settings.taskLibrary.map((taskType) => ({
          ...taskType,
          optionalFields: undefined,
        })),
      },
      activePortfolioId: seed.activePortfolioId,
      activeRole: seed.activeRole,
      activePage: seed.activePage,
      version: 1,
    }

    const migrated = coerceAppState(legacyState)

    expect(migrated.version).toBe(seed.version)
    expect(migrated.portfolios[0]?.cards[0]?.blocked ?? null).toBeNull()
    expect(migrated.portfolios[0]?.cards[0]?.archivedAt ?? null).toBeNull()
    expect(migrated.settings.taskLibrary.every((taskType) => Array.isArray(taskType.optionalFields))).toBe(true)
  })

  it('blocks direct editor stage skipping outside the UI layer', () => {
    const portfolio = createSeedState().portfolios[0]
    const sourceCard = portfolio.cards.find((card) => card.stage === 'Briefed' && card.owner)

    expect(sourceCard).toBeTruthy()

    const editorViewer: ViewerContext = {
      mode: 'contributor',
      editorName: sourceCard!.owner,
      memberRole: 'Editor',
      visibleBrandNames: null,
    }

    expect(
      moveCardInPortfolio(
        portfolio,
        sourceCard!.id,
        'Ready',
        sourceCard!.owner,
        0,
        '2026-03-12T14:00:00Z',
        'Naomi',
        editorViewer,
      ),
    ).toBe(portfolio)
  })

  it('allows contributors to update their own content fields but not manager-only metadata', () => {
    const state = createSeedState()
    const portfolio = state.portfolios[0]
    const sourceCard = portfolio.cards.find((card) => card.owner)

    expect(sourceCard).toBeTruthy()

    const editorViewer: ViewerContext = {
      mode: 'contributor',
      editorName: sourceCard!.owner,
      memberRole: 'Editor',
      visibleBrandNames: null,
    }

    const frameioUpdated = applyCardUpdates(
      portfolio,
      state.settings,
      sourceCard!.id,
      { frameioLink: 'https://frame.io/review/test-card' },
      'Naomi',
      '2026-03-12T14:05:00Z',
      editorViewer,
    )

    expect(frameioUpdated.cards.find((card) => card.id === sourceCard!.id)?.frameioLink).toBe(
      'https://frame.io/review/test-card',
    )

    const titleUpdated = applyCardUpdates(
      portfolio,
      state.settings,
      sourceCard!.id,
      { title: 'Edited title' },
      'Naomi',
      '2026-03-12T14:10:00Z',
      editorViewer,
    )

    expect(titleUpdated.cards.find((card) => card.id === sourceCard!.id)?.title).toBe('Edited title')
    expect(titleUpdated.cards.find((card) => card.id === sourceCard!.id)?.updatedAt).toBe(
      '2026-03-12T14:10:00Z',
    )

    const ownerUpdated = applyCardUpdates(
      portfolio,
      state.settings,
      sourceCard!.id,
      { owner: 'Another Editor' },
      'Naomi',
      '2026-03-12T14:15:00Z',
      editorViewer,
    )

    expect(ownerUpdated.cards.find((card) => card.id === sourceCard!.id)?.owner).toBe(sourceCard!.owner)
  })

  it('requires manager permissions to add or remove cards', () => {
    const state = createSeedState()
    const portfolio = state.portfolios[0]
    const candidate = createCardFromQuickInput(
      portfolio,
      state.settings,
      {
        title: 'Observer card',
        brand: portfolio.brands[0]!.name,
        taskTypeId: state.settings.taskLibrary[0]!.id,
      },
      'Naomi',
      '2026-03-12T14:15:00Z',
    )

    expect(addCardToPortfolio(portfolio, candidate, VIEWER_ACCESS)).toBe(portfolio)
    expect(removeCardFromPortfolio(portfolio, portfolio.cards[0]!.id, VIEWER_ACCESS)).toBe(portfolio)
  })

  it('validates quick-create input and falls back to a safe task type', () => {
    const state = createSeedState()
    const portfolio = state.portfolios[0]

    expect(() =>
      createCardFromQuickInput(
        portfolio,
        state.settings,
        {
          title: '   ',
          brand: portfolio.brands[0]!.name,
          taskTypeId: state.settings.taskLibrary[0]!.id,
        },
        'Naomi',
      ),
    ).toThrow('Enter a concept before creating the card.')

    expect(() =>
      createCardFromQuickInput(
        portfolio,
        state.settings,
        {
          title: 'New card',
          brand: 'Missing Brand',
          taskTypeId: state.settings.taskLibrary[0]!.id,
        },
        'Naomi',
      ),
    ).toThrow('Pick a valid brand before creating a card.')

    const fallbackTaskTypeId =
      state.settings.taskLibrary.find((taskType) => taskType.id === 'custom')?.id ??
      state.settings.taskLibrary[0]!.id
    const createdCard = createCardFromQuickInput(
      portfolio,
      state.settings,
      {
        title: 'Fallback task type card',
        brand: portfolio.brands[0]!.name,
        taskTypeId: 'missing-task-type',
      },
      'Naomi',
      '2026-03-12T14:20:00Z',
    )

    expect(createdCard.taskTypeId).toBe(fallbackTaskTypeId)
  })

  it('prevents duplicate card ids and uses member hours per day in dashboard workload', () => {
    const state = createSeedState()
    const portfolio = state.portfolios[0]
    const sourceCard = portfolio.cards.find((card) => card.stage === 'In Production' && card.owner)

    expect(sourceCard).toBeTruthy()

    const duplicateCard = {
      ...sourceCard!,
      title: 'Duplicate id attempt',
    }
    expect(addCardToPortfolio(portfolio, duplicateCard, MANAGER_VIEWER)).toBe(portfolio)

    const tunedPortfolio = {
      ...portfolio,
      team: portfolio.team.map((member) =>
        member.name === sourceCard!.owner
          ? {
              ...member,
              hoursPerDay: 5,
              weeklyHours: 25,
            }
          : member,
      ),
      cards: [
        {
          ...sourceCard!,
          estimatedHours: 10,
          revisionEstimatedHours: null,
          blocked: null,
          archivedAt: null,
        },
      ],
    }

    const dashboard = buildDashboardData([tunedPortfolio], state.settings, new Date('2026-03-12T14:30:00Z').getTime())

    expect(dashboard.teamGrid.find((row) => row.editorName === sourceCard!.owner)?.workloadDays).toBe(2)
  })

  it('creates quick-create cards with trimmed titles, brand prefixes, and generated names', () => {
    const state = createSeedState()
    const portfolio = state.portfolios[0]
    const brand = portfolio.brands[0]

    expect(brand).toBeTruthy()

    const createdCard = createCardFromQuickInput(
      portfolio,
      state.settings,
      {
        title: '  Launch teaser cut  ',
        brand: brand!.name,
        taskTypeId: state.settings.taskLibrary[0]!.id,
      },
      'Naomi',
      '2026-03-12T15:00:00Z',
    )

    expect(createdCard.title).toBe('Launch teaser cut')
    expect(createdCard.id.startsWith(brand!.prefix)).toBe(true)
    expect(createdCard.brand).toBe(brand!.name)
    expect(createdCard.product).toBe(brand!.products[0])
    expect(createdCard.stage).toBe('Backlog')
    expect(createdCard.generatedSheetName).toContain(createdCard.id)
    expect(createdCard.generatedAdName).toContain(createdCard.id)
    expect(createdCard.activityLog[0]?.type).toBe('created')
  })

  it('only auto-creates Drive folders for new creative asset task types', () => {
    expect(shouldAutoCreateCreativeDriveFolder('video-ugc-short')).toBe(true)
    expect(shouldAutoCreateCreativeDriveFolder('video-ugc-medium')).toBe(true)
    expect(shouldAutoCreateCreativeDriveFolder('static-single')).toBe(true)
    expect(shouldAutoCreateCreativeDriveFolder('iteration')).toBe(false)
    expect(shouldAutoCreateCreativeDriveFolder('lp-design')).toBe(false)
    expect(shouldAutoCreateCreativeDriveFolder('lp-dev')).toBe(false)
    expect(shouldAutoCreateCreativeDriveFolder('bug-fix')).toBe(false)
  })

  it('builds the simple creative Drive folder name from id, concept, and angle', () => {
    expect(
      getCreativeDriveFolderName({
        id: 'N001',
        product: 'Harmonate',
        title: '  Big bathroom reveal  ',
        angle: '  Before   After  ',
      }),
    ).toBe('N001 - Harmonate - Big bathroom reveal - Before After')

    expect(
      getCreativeDriveFolderName({
        id: 'N002',
        product: 'AniqaPlus',
        title: 'Static hook',
        angle: '',
      }),
    ).toBe('N002 - AniqaPlus - Static hook')
  })

  it('adds backlog cards at the end of the lane and updates prefix counters', () => {
    const state = createSeedState()
    const portfolio = state.portfolios[0]
    const brand = portfolio.brands[0]
    const backlogCount = portfolio.cards.filter(
      (card) => card.stage === 'Backlog' && card.archivedAt === null,
    ).length
    const card = createCardFromQuickInput(
      portfolio,
      state.settings,
      {
        title: 'Backlog queue append',
        brand: brand!.name,
        taskTypeId: state.settings.taskLibrary[0]!.id,
      },
      'Naomi',
      '2026-03-12T15:05:00Z',
    )

    const updatedPortfolio = addCardToPortfolio(portfolio, card, MANAGER_VIEWER)
    const addedCard = updatedPortfolio.cards.find((item) => item.id === card.id)

    expect(updatedPortfolio.cards).toHaveLength(portfolio.cards.length + 1)
    expect(addedCard?.positionInSection).toBe(backlogCount)
    expect(updatedPortfolio.lastIdPerPrefix[brand!.prefix]).toBeGreaterThan(
      portfolio.lastIdPerPrefix[brand!.prefix] ?? 0,
    )
  })

  it('removes cards when present and ignores missing card ids', () => {
    const portfolio = createSeedState().portfolios[0]
    const targetCard = portfolio.cards[0]

    expect(targetCard).toBeTruthy()

    const updatedPortfolio = removeCardFromPortfolio(portfolio, targetCard!.id, MANAGER_VIEWER)

    expect(updatedPortfolio.cards).toHaveLength(portfolio.cards.length - 1)
    expect(updatedPortfolio.cards.some((card) => card.id === targetCard!.id)).toBe(false)
    expect(removeCardFromPortfolio(portfolio, 'missing-card', MANAGER_VIEWER)).toBe(portfolio)
  })

  it('moves backlog cards forward with assignment, history, and activity entries', () => {
    const state = createSeedState()
    const portfolio = state.portfolios[0]
    const owner = portfolio.team.find((member) => member.role === 'Editor')?.name
    const createdCard = createCardFromQuickInput(
      portfolio,
      state.settings,
      {
        title: 'Forward move coverage card',
        brand: portfolio.brands[0]!.name,
        taskTypeId: state.settings.taskLibrary[0]!.id,
      },
      'Naomi',
      '2026-03-12T15:10:00Z',
    )
    const portfolioWithBacklogCard = addCardToPortfolio(portfolio, createdCard, MANAGER_VIEWER)

    expect(owner).toBeTruthy()

    const movedPortfolio = moveCardInPortfolio(
      portfolioWithBacklogCard,
      createdCard.id,
      'Briefed',
      owner!,
      0,
      '2026-03-12T15:15:00Z',
      'Naomi',
      MANAGER_VIEWER,
    )
    const movedCard = movedPortfolio.cards.find((card) => card.id === createdCard.id)

    expect(movedCard?.stage).toBe('Briefed')
    expect(movedCard?.owner).toBe(owner)
    expect(movedCard?.dateAssigned).toBe('2026-03-12')
    expect(movedCard?.stageHistory.at(-1)?.stage).toBe('Briefed')
    expect(movedCard?.stageHistory.at(-1)?.enteredAt).toBe('2026-03-12T15:15:00Z')
    expect(movedCard?.updatedAt).toBe('2026-03-12T15:15:00Z')
    expect(movedCard?.activityLog.some((entry) => entry.type === 'assigned')).toBe(true)
    expect(movedCard?.activityLog.some((entry) => entry.type === 'moved-forward')).toBe(true)
  })

  it('records activity entries for blocked, unblocked, estimate, archive, and unarchive updates', () => {
    const state = createSeedState()
    const portfolio = state.portfolios[0]
    const sourceCard = portfolio.cards[0]

    expect(sourceCard).toBeTruthy()

    const blockedPortfolio = applyCardUpdates(
      portfolio,
      state.settings,
      sourceCard!.id,
      {
        blocked: {
          reason: 'Waiting on brand feedback',
          at: '2026-03-12T15:20:00Z',
        },
      },
      'Naomi',
      '2026-03-12T15:20:00Z',
      MANAGER_VIEWER,
    )
    const unblockedPortfolio = applyCardUpdates(
      blockedPortfolio,
      state.settings,
      sourceCard!.id,
      { blocked: null },
      'Naomi',
      '2026-03-12T15:25:00Z',
      MANAGER_VIEWER,
    )
    const estimatedPortfolio = applyCardUpdates(
      unblockedPortfolio,
      state.settings,
      sourceCard!.id,
      { estimatedHours: sourceCard!.estimatedHours + 2 },
      'Naomi',
      '2026-03-12T15:30:00Z',
      MANAGER_VIEWER,
    )
    const archivedPortfolio = applyCardUpdates(
      estimatedPortfolio,
      state.settings,
      sourceCard!.id,
      { archivedAt: '2026-03-12T15:40:00Z' },
      'Naomi',
      '2026-03-12T15:40:00Z',
      MANAGER_VIEWER,
    )
    const restoredPortfolio = applyCardUpdates(
      archivedPortfolio,
      state.settings,
      sourceCard!.id,
      { archivedAt: null },
      'Naomi',
      '2026-03-12T15:45:00Z',
      MANAGER_VIEWER,
    )
    const updatedCard = restoredPortfolio.cards.find((card) => card.id === sourceCard!.id)

    expect(updatedCard?.activityLog.some((entry) => entry.type === 'blocked')).toBe(true)
    expect(updatedCard?.activityLog.some((entry) => entry.type === 'unblocked')).toBe(true)
    expect(updatedCard?.activityLog.filter((entry) => entry.type === 'effort').length).toBeGreaterThan(0)
    expect(updatedCard?.activityLog.some((entry) => entry.type === 'archive')).toBe(true)
    expect(updatedCard?.activityLog.some((entry) => entry.type === 'unarchive')).toBe(true)
  })

  it('filters visible cards across brand, owner, flags, editor visibility, and search', () => {
    const state = createSeedState()
    const portfolio = state.portfolios[0]
    const editorName = portfolio.team.find((member) => member.role === 'Editor')?.name
    const nowMs = new Date('2026-03-12T16:00:00Z').getTime()
    const tunedPortfolio = {
      ...portfolio,
      cards: portfolio.cards.slice(0, 4).map((card, index) => ({
        ...card,
        archivedAt: null,
        brand: portfolio.brands[index % 2]!.name,
        owner: index === 0 ? editorName ?? null : index === 1 ? 'Another Editor' : null,
        stage: index === 2 ? ('Backlog' as const) : ('Briefed' as const),
        blocked: index === 0 ? { reason: 'Blocked asset', at: '2026-03-10T09:00:00Z' } : null,
        stageEnteredAt:
          index === 0 ? '2026-03-01T09:00:00Z' : '2026-03-11T09:00:00Z',
        title: index === 3 ? 'Search target card' : card.title,
        brief: index === 3 ? '<p>Unique findable brief</p>' : card.brief,
      })),
    }
    const baseFilters = getDefaultBoardFilters(tunedPortfolio)

    expect(
      getVisibleCards(
        tunedPortfolio,
        MANAGER_VIEWER,
        { ...baseFilters, brandNames: [portfolio.brands[0]!.name] },
        state.settings,
        nowMs,
      ).every((card) => card.brand === portfolio.brands[0]!.name),
    ).toBe(true)

    const ownerFiltered = getVisibleCards(
      tunedPortfolio,
      MANAGER_VIEWER,
      { ...baseFilters, ownerNames: ['Another Editor'] },
      state.settings,
      nowMs,
    )
    expect(
      ownerFiltered.every((card) => card.stage === 'Backlog' || card.owner === 'Another Editor'),
    ).toBe(true)

    expect(
      getVisibleCards(
        tunedPortfolio,
        MANAGER_VIEWER,
        { ...baseFilters, blockedOnly: true },
        state.settings,
        nowMs,
      ),
    ).toHaveLength(1)
    expect(
      getVisibleCards(
        tunedPortfolio,
        MANAGER_VIEWER,
        { ...baseFilters, stuckOnly: true },
        state.settings,
        nowMs,
      ),
    ).toHaveLength(1)

    const editorViewer: ViewerContext = {
      mode: 'contributor',
      editorName: editorName ?? null,
      memberRole: 'Editor',
      visibleBrandNames: null,
    }
    const editorVisible = getVisibleCards(
      tunedPortfolio,
      editorViewer,
      baseFilters,
      state.settings,
      nowMs,
    )
    expect(editorVisible.every((card) => card.owner === editorName)).toBe(true)

    expect(
      getVisibleCards(
        tunedPortfolio,
        MANAGER_VIEWER,
        { ...baseFilters, searchQuery: 'unique findable' },
        state.settings,
        nowMs,
      ).map((card) => card.title),
    ).toContain('Search target card')
  })

  it('builds dashboard summaries and board stats with expected counts', () => {
    const state = createSeedState()
    const portfolio = state.portfolios[0]
    const nowMs = new Date('2026-03-12T16:10:00Z').getTime()
    const dashboard = buildDashboardData(state.portfolios, state.settings, nowMs)
    const boardStats = getBoardStats(
      portfolio,
      MANAGER_VIEWER,
      getDefaultBoardFilters(portfolio),
      state.settings,
      nowMs,
    )
    const expectedActiveCards = portfolio.cards.filter(
      (card) => !card.archivedAt && card.stage !== 'Live',
    ).length
    const expectedBacklogCards = portfolio.cards.filter(
      (card) => !card.archivedAt && card.stage === 'Backlog',
    ).length

    expect(dashboard.overviewCards[0]?.activeCards).toBe(expectedActiveCards)
    expect(dashboard.funnel.find((bucket) => bucket.stage === 'Backlog')?.total).toBe(
      expectedBacklogCards,
    )
    expect(boardStats.total).toBe(portfolio.cards.filter((card) => !card.archivedAt).length)
    expect(
      Object.values(boardStats.byStage).reduce((sum, value) => sum + value, 0),
    ).toBe(boardStats.total)
  })

  it('records movement history and auto-stops editor timer when moving to review', () => {
    const state = createSeedState()
    const portfolio = state.portfolios[0]!
    const sourceCard = portfolio.cards.find((card) => card.stage === 'In Production' && card.owner)

    expect(sourceCard).toBeTruthy()

    const startedPortfolio = startEditorTimerForCard(
      portfolio,
      sourceCard!.id,
      '2026-03-15T09:00:00Z',
    )
    const movedPortfolio = moveCardInPortfolio(
      startedPortfolio,
      sourceCard!.id,
      'Review',
      sourceCard!.owner,
      0,
      '2026-03-15T11:30:00Z',
      'Naomi',
      MANAGER_VIEWER,
    )
    const updatedCard = movedPortfolio.cards.find((card) => card.id === sourceCard!.id)

    expect(updatedCard?.columnMovementHistory.at(-1)).toMatchObject({
      from: 'In Production',
      to: 'Review',
    })
    expect(updatedCard?.editorTimer?.startedAt).toBe('2026-03-15T09:00:00Z')
    expect(updatedCard?.editorTimer?.stoppedAt).toBe('2026-03-15T11:30:00Z')
    expect(updatedCard?.editorTimer?.elapsedMs).toBe(2.5 * 60 * 60 * 1000)
  })

  it('keeps timer data null when start was never used', () => {
    const state = createSeedState()
    const portfolio = state.portfolios[0]!
    const sourceCard = portfolio.cards.find((card) => card.stage === 'In Production' && card.owner)

    expect(sourceCard).toBeTruthy()

    const movedPortfolio = moveCardInPortfolio(
      portfolio,
      sourceCard!.id,
      'Review',
      sourceCard!.owner,
      0,
      '2026-03-16T10:00:00Z',
      'Naomi',
      MANAGER_VIEWER,
    )
    const updatedCard = movedPortfolio.cards.find((card) => card.id === sourceCard!.id)
    expect(updatedCard?.editorTimer).toBeNull()
  })

  it('builds editor performance metrics from timer and movement history', () => {
    const state = createSeedState()
    const portfolio = state.portfolios[0]!
    const firstInProduction = portfolio.cards.find((card) => card.stage === 'In Production' && card.owner)
    expect(firstInProduction).toBeTruthy()

    const trackedCard = {
      ...firstInProduction!,
      owner: 'Fatima',
      editorTimer: {
        startedAt: '2026-03-20T08:00:00Z',
        stoppedAt: '2026-03-20T10:00:00Z',
        elapsedMs: 2 * 60 * 60 * 1000,
      },
      columnMovementHistory: [
        { from: 'Briefed' as const, to: 'In Production' as const, timestamp: '2026-03-19T09:00:00Z' },
        { from: 'In Production' as const, to: 'Review' as const, timestamp: '2026-03-20T10:00:00Z' },
        { from: 'Review' as const, to: 'Ready' as const, timestamp: '2026-03-20T13:00:00Z' },
      ],
      stageHistory: [
        { stage: 'Backlog' as const, enteredAt: '2026-03-18T08:00:00Z', exitedAt: '2026-03-18T10:00:00Z', durationDays: 0.1 },
        { stage: 'Briefed' as const, enteredAt: '2026-03-18T10:00:00Z', exitedAt: '2026-03-19T09:00:00Z', durationDays: 1 },
        { stage: 'In Production' as const, enteredAt: '2026-03-19T09:00:00Z', exitedAt: '2026-03-20T10:00:00Z', durationDays: 1 },
        { stage: 'Review' as const, enteredAt: '2026-03-20T10:00:00Z', exitedAt: '2026-03-20T13:00:00Z', durationDays: 0.1 },
        { stage: 'Ready' as const, enteredAt: '2026-03-20T13:00:00Z', exitedAt: null, durationDays: null },
      ],
      stage: 'Ready' as const,
    }
    const portfolioWithTracking = {
      ...portfolio,
      cards: portfolio.cards.map((card) => (card.id === trackedCard.id ? trackedCard : card)),
    }

    const metrics = buildEditorPerformanceData(
      [portfolioWithTracking],
      new Date('2026-03-19T00:00:00Z').getTime(),
      new Date('2026-03-21T00:00:00Z').getTime(),
      new Date('2026-03-21T00:00:00Z').getTime(),
    )

    const fatimaCycle = metrics.cycleTimeByEditor.find((row) => row.editorName === 'Fatima')
    const fatimaThroughput = metrics.throughputByEditor.find((row) => row.editorName === 'Fatima')
    const inProductionStage = metrics.stageBottlenecks.find((row) => row.stage === 'In Production')
    const fatimaComparison = metrics.editorComparison.find((row) => row.editorName === 'Fatima')

    expect(fatimaCycle?.avgCycleTimeHours).toBe(2)
    expect(fatimaThroughput?.cardsCompleted).toBe(1)
    expect(inProductionStage?.avgDurationHours).toBe(2)
    expect(fatimaComparison?.throughput).toBe(1)
    expect(fatimaComparison?.activeCards).toBeGreaterThanOrEqual(1)
  })

  it('coerces null, malformed, and already-valid app states safely', () => {
    const seed = createSeedState()
    const malformed = coerceAppState({
      portfolios: [{ id: 'broken', name: 'Broken', brands: [], team: [], cards: [], webhookUrl: '' }],
      settings: {
        general: {
          appName: 'Broken board',
        },
      },
      activeRole: {
        mode: 'invalid-role',
      },
    })
    const preserved = coerceAppState(seed)

    expect(coerceAppState(null).version).toBe(seed.version)
    expect(malformed.portfolios[0]?.team).toEqual([])
    expect(malformed.activeRole.mode).toBe(seed.activeRole.mode)
    expect(preserved.activePortfolioId).toBe(seed.activePortfolioId)
    expect(preserved.settings.general.appName).toBe(seed.settings.general.appName)
  })

  it('returns expected helper values for age, due status, revision count, and scheduled hours', () => {
    const settings = createSeedState().settings
    const card = {
      ...createSeedState().portfolios[0]!.cards[0]!,
      dueDate: '2026-03-12',
      estimatedHours: 6,
      revisionEstimatedHours: 3,
      stageHistory: [
        {
          stage: 'Backlog' as const,
          enteredAt: '2026-03-10T09:00:00Z',
          exitedAt: '2026-03-11T09:00:00Z',
          durationDays: 1,
        },
        {
          stage: 'Briefed' as const,
          enteredAt: '2026-03-11T09:00:00Z',
          exitedAt: null,
          durationDays: null,
          movedBack: true,
        },
      ],
    }

    expect(getAgeToneFromMs(1 * 24 * 60 * 60 * 1000, settings)).toBe('fresh')
    expect(getAgeToneFromMs(4 * 24 * 60 * 60 * 1000, settings)).toBe('aging')
    expect(getAgeToneFromMs(6 * 24 * 60 * 60 * 1000, settings)).toBe('stuck')
    expect(getDueStatus(card, new Date('2026-03-13T09:00:00Z').getTime())).toBe('overdue')
    expect(getDueStatus({ ...card, dueDate: '2026-03-14' }, new Date('2026-03-13T09:00:00Z').getTime())).toBe('soon')
    expect(getDueStatus({ ...card, dueDate: null }, new Date('2026-03-13T09:00:00Z').getTime())).toBe('none')
    expect(getRevisionCount(card)).toBe(1)
    expect(getCardScheduledHours(card)).toBe(3)
    expect(getCardScheduledHours({ ...card, revisionEstimatedHours: null, estimatedHours: 0 })).toBe(1)
  })
})


describe('backlog to production helpers', () => {
  it('requires production task type before creative cards can move to production', async () => {
    const backlog = await import('./backlog')
    const state = backlog.createBacklogSeedState()
    const creativeCard = backlog.addBacklogCard(state, {
      name: 'Angle test',
      taskType: 'creative',
      brand: 'Pluxy',
      addedBy: 'Naomi',
    }).cards[0]!

    const missingWithoutTaskType = backlog.getBacklogMissingProductionFields({
      ...creativeCard,
      brief: 'Brief',
      targetAudience: 'Audience',
      visualDirection: 'Visual',
      platform: 'Meta',
      funnelStage: 'Cold',
      angleTheme: 'Angle',
      cta: 'Shop now',
      referenceLinks: 'https://example.com',
    })

    expect(missingWithoutTaskType).toContain('Production Task Type')
    expect(missingWithoutTaskType).not.toContain('Brief')

    const missingWithTaskType = backlog.getBacklogMissingProductionFields({
      ...creativeCard,
      productionTaskType: 'video-ugc-short',
      brief: 'Brief',
      targetAudience: 'Audience',
      visualDirection: 'Visual',
      platform: 'Meta',
      funnelStage: 'Cold',
      angleTheme: 'Angle',
      cta: 'Shop now',
      referenceLinks: 'https://example.com',
    })

    expect(missingWithTaskType).not.toContain('Production Task Type')
  })

  it('maps backlog creative details into a created production card', () => {
    const state = createSeedState()
    const portfolio = state.portfolios[0]!
    const actor = 'Naomi'

    const created = createCardFromQuickInput(
      portfolio,
      state.settings,
      {
        title: 'Backlog concept',
        brand: portfolio.brands[0]!.name,
        taskTypeId: 'video-ugc-short',
        product: portfolio.brands[0]!.products[0]!,
        angle: 'Pain point angle',
        sourceCardId: null,
      },
      actor,
    )

    const mapped = {
      ...created,
      sourceBacklogCardId: 'BL0007',
      brief: 'Creative brief',
      audience: 'Busy parents',
      platform: 'TikTok' as const,
      funnelStage: 'Warm' as const,
      angle: 'Pain point angle',
      keyMessage: 'Fast cleanup',
      visualDirection: 'Before and after',
      cta: 'Buy now',
      referenceLinks: 'https://example.com/ref',
      adCopy: 'Primary text',
      notes: 'Internal notes',
    }

    const nextPortfolio = addCardToPortfolio(portfolio, mapped, MANAGER_VIEWER)
    const stored = nextPortfolio.cards.find((card) => card.id === mapped.id)

    expect(stored).toMatchObject({
      title: 'Backlog concept',
      brand: portfolio.brands[0]!.name,
      product: portfolio.brands[0]!.products[0]!,
      sourceBacklogCardId: 'BL0007',
      taskTypeId: 'video-ugc-short',
      brief: 'Creative brief',
      audience: 'Busy parents',
      platform: 'TikTok',
      funnelStage: 'Warm',
      angle: 'Pain point angle',
      keyMessage: 'Fast cleanup',
      visualDirection: 'Before and after',
      cta: 'Buy now',
      referenceLinks: 'https://example.com/ref',
      adCopy: 'Primary text',
      notes: 'Internal notes',
    })
  })
})

describe('legacy dev board migration', () => {
  function createStateWithProductionDevCard() {
    const state = createSeedState()
    const portfolio = state.portfolios[0]!
    const brand = portfolio.brands[0]!
    const card = {
      ...createCardFromQuickInput(
        portfolio,
        state.settings,
        {
          title: 'LP implementation from creative review',
          brand: brand.name,
          taskTypeId: 'lp-dev',
          product: brand.products[0]!,
          angle: 'Comparison page refresh',
          sourceCardId: null,
        },
        'Naomi',
      ),
      sourceBacklogCardId: 'BL0042',
      owner: 'Daniel T',
      dueDate: '2026-05-04',
      landingPage: 'https://example.com/current-lp',
      figmaUrl: 'https://figma.com/file/lp-design',
      brief: 'Build the approved LP design and keep the headline hierarchy.',
      keyMessage: 'Make the product comparison easier to understand.',
      visualDirection: 'Use the approved Figma design.',
      cta: 'Shop now',
      referenceLinks: 'https://example.com/reference',
      notes: 'QA on mobile before launch.',
      frameioLink: ['https://frame.io/review-link'],
    }
    const nextPortfolio = addCardToPortfolio(portfolio, card, MANAGER_VIEWER)

    return {
      state: {
        ...state,
        portfolios: state.portfolios.map((candidate) =>
          candidate.id === portfolio.id ? nextPortfolio : candidate,
        ),
      },
      portfolio: nextPortfolio,
      card,
    }
  }

  it('moves linked Dev board data into the existing main-board Dev card', () => {
    const { state, portfolio, card } = createStateWithProductionDevCard()
    const devBoard = addDevCard(state.devBoard, {
      title: card.title,
      brand: card.brand,
      sourceBacklogCardId: card.sourceBacklogCardId,
      sourceProductionCardId: card.id,
      sourceProductionPortfolioId: portfolio.id,
      taskDescription: 'Manual implementation notes from Daniel.',
      newUrlToUse: ['https://example.com/current-lp', 'https://figma.com/file/lp-design'],
      loomVideoUrl: 'https://loom.com/share/dev-context',
      assigneeId: 'daniel-t',
      dueDate: '2026-05-07',
      changeRequestType: 'Landing Page Update',
    })

    const migrated = migrateLegacyDevBoardIntoMainBoard({
      ...state,
      devBoard,
    })
    const migratedCard = migrated.portfolios[0]?.cards.find((candidate) => candidate.id === card.id)

    expect(migrated.devBoard.cards).toHaveLength(0)
    expect(migratedCard).toMatchObject({
      taskTypeId: 'lp-dev',
      owner: 'Daniel T',
      dueDate: '2026-05-07',
      landingPage: 'https://example.com/current-lp',
      figmaUrl: 'https://figma.com/file/lp-design',
    })
    expect(migratedCard?.brief).toBe('Build the approved LP design and keep the headline hierarchy.')
    expect(migratedCard?.notes).toContain('Migrated from Dev board card: DV0001')
    expect(migratedCard?.notes).toContain('Dev task description:\nManual implementation notes from Daniel.')
    expect(migratedCard?.links).toEqual(
      expect.arrayContaining([
        { url: 'https://example.com/current-lp', label: 'URL to use 1' },
        { url: 'https://figma.com/file/lp-design', label: 'URL to use 2' },
        { url: 'https://loom.com/share/dev-context', label: 'Loom video' },
      ]),
    )
    expect(migratedCard?.frameioLink).toEqual(['https://frame.io/review-link', 'https://loom.com/share/dev-context'])
  })

  it('creates a main-board Dev card for standalone legacy Dev board cards', () => {
    const state = createSeedState()
    const portfolio = state.portfolios[0]!
    const devBoard = addDevCard(state.devBoard, {
      title: 'Fix PDP sticky CTA',
      brand: portfolio.brands[0]!.name,
      taskDescription: 'Sticky CTA disappears below the comparison module.',
      newUrlToUse: 'https://example.com/pdp',
      assigneeId: 'daniel-t',
      dueDate: '2026-05-08',
      changeRequestType: 'Bug Fix',
    })

    const migrated = migrateLegacyDevBoardIntoMainBoard({
      ...state,
      devBoard,
    })
    const migratedCard = migrated.portfolios[0]?.cards.find((card) => card.sourceBacklogCardId === 'DV0001') ??
      migrated.portfolios[0]?.cards.find((card) => card.notes.includes('Migrated from Dev board card: DV0001'))

    expect(migrated.devBoard.cards).toHaveLength(0)
    expect(migratedCard).toMatchObject({
      title: 'Fix PDP sticky CTA',
      taskTypeId: 'bug-fix',
      owner: 'Daniel T',
      brief: 'Sticky CTA disappears below the comparison module.',
      landingPage: 'https://example.com/pdp',
      dueDate: '2026-05-08',
    })
    expect(migratedCard?.notes).toContain('Original Dev board column: To Brief')
  })

  it('runs legacy Dev board migration during state normalization', () => {
    const state = createSeedState()
    const devBoard = addDevCard(state.devBoard, {
      title: 'Normalized legacy Dev task',
      brand: state.portfolios[0]!.brands[0]!.name,
      taskDescription: 'Normalize this into the main board.',
      changeRequestType: 'New Feature',
    })

    const normalized = coerceAppState({
      ...state,
      devBoard,
    })

    expect(normalized.devBoard.cards).toHaveLength(0)
    expect(
      normalized.portfolios[0]?.cards.some((card) =>
        card.notes.includes('Migrated from Dev board card: DV0001'),
      ),
    ).toBe(true)
  })
})
