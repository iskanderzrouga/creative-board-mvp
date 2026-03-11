import { describe, expect, it } from 'vitest'

import {
  createEmptyPortfolio,
  createSeedState,
  removePortfolioFromAppState,
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
})
