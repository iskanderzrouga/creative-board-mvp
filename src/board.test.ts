import { describe, expect, it } from 'vitest'

import {
  applyCardUpdates,
  createEmptyPortfolio,
  createSeedState,
  getBrandRemovalBlocker,
  getTeamMemberRemovalBlocker,
  removeBrandFromPortfolio,
  removePortfolioFromAppState,
  removeTeamMemberFromPortfolio,
  renameBrandInPortfolio,
  renameTeamMemberInPortfolio,
} from './board'

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
})
