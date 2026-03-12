import { describe, expect, it } from 'vitest'

import {
  addCardToPortfolio,
  applyCardUpdates,
  archiveEligibleCards,
  buildDashboardData,
  coerceAppState,
  createCardFromQuickInput,
  createEmptyPortfolio,
  createSeedState,
  getBrandRemovalBlocker,
  getTeamMemberRemovalBlocker,
  moveCardInPortfolio,
  removeBrandFromPortfolio,
  removeCardFromPortfolio,
  removePortfolioFromAppState,
  removeTeamMemberFromPortfolio,
  renameBrandInPortfolio,
  renameTeamMemberInPortfolio,
  type ViewerContext,
} from './board'

const MANAGER_VIEWER: ViewerContext = {
  mode: 'manager',
  editorName: null,
  memberRole: 'Manager',
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

  it('blocks removing the last manager from a portfolio', () => {
    const portfolio = createSeedState().portfolios[0]
    const managerIndex = portfolio.team.findIndex((member) => member.role === 'Manager')

    expect(managerIndex).toBeGreaterThanOrEqual(0)
    expect(getTeamMemberRemovalBlocker(portfolio, managerIndex)).toBe('At least one manager is required.')
    expect(removeTeamMemberFromPortfolio(portfolio, managerIndex)).toBe(portfolio)
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

    const movedBack = moveCardInPortfolio(
      reviewPortfolio,
      sourceCard!.id,
      'In Production',
      sourceCard!.owner,
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
      sourceCard!.owner,
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
      mode: 'editor',
      editorName: sourceCard!.owner,
      memberRole: 'Editor',
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

  it('allows editors to update their own Frame.io link but not protected fields', () => {
    const state = createSeedState()
    const portfolio = state.portfolios[0]
    const sourceCard = portfolio.cards.find((card) => card.owner)

    expect(sourceCard).toBeTruthy()

    const editorViewer: ViewerContext = {
      mode: 'editor',
      editorName: sourceCard!.owner,
      memberRole: 'Editor',
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

    expect(
      applyCardUpdates(
        portfolio,
        state.settings,
        sourceCard!.id,
        { title: 'Edited title' },
        'Naomi',
        '2026-03-12T14:10:00Z',
        editorViewer,
      ),
    ).toBe(portfolio)
  })

  it('requires manager permissions to add or remove cards', () => {
    const state = createSeedState()
    const portfolio = state.portfolios[0]
    const observerViewer: ViewerContext = {
      mode: 'observer',
      editorName: null,
      memberRole: null,
    }
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

    expect(addCardToPortfolio(portfolio, candidate, observerViewer)).toBe(portfolio)
    expect(removeCardFromPortfolio(portfolio, portfolio.cards[0]!.id, observerViewer)).toBe(portfolio)
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
    ).toThrow('Enter a card title before creating it.')

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
})
