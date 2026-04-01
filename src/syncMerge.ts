import type { AppState, Card, DevCard, ScriptWorkshopItem } from './board'
import type { BacklogCard, BacklogState } from './backlog'

function toMs(value: string | null | undefined) {
  if (!value) return null
  const parsed = Date.parse(value)
  return Number.isFinite(parsed) ? parsed : null
}

function mergeTimestampedCards<T extends { id: string; updatedAt?: string }>(
  localCards: T[],
  remoteCards: T[],
) {
  const merged = new Map<string, T>()

  for (const remoteCard of remoteCards) {
    merged.set(remoteCard.id, remoteCard)
  }

  for (const localCard of localCards) {
    const remoteCard = merged.get(localCard.id)
    if (!remoteCard) {
      merged.set(localCard.id, localCard)
      continue
    }

    const localUpdatedAtMs = toMs(localCard.updatedAt)
    const remoteUpdatedAtMs = toMs(remoteCard.updatedAt)

    if (localUpdatedAtMs !== null && remoteUpdatedAtMs !== null) {
      if (localUpdatedAtMs > remoteUpdatedAtMs) {
        merged.set(localCard.id, localCard)
      }
      continue
    }

    if (localUpdatedAtMs !== null && remoteUpdatedAtMs === null) {
      merged.set(localCard.id, localCard)
    }
  }

  return Array.from(merged.values())
}

export function mergeIncomingAppState(localState: AppState, remoteState: AppState): AppState {
  const remotePortfolioMap = new Map(remoteState.portfolios.map((portfolio) => [portfolio.id, portfolio]))
  const localPortfolioMap = new Map(localState.portfolios.map((portfolio) => [portfolio.id, portfolio]))

  const mergedPortfolioIds = new Set([
    ...remotePortfolioMap.keys(),
    ...localPortfolioMap.keys(),
  ])

  const mergedPortfolios = Array.from(mergedPortfolioIds).map((portfolioId) => {
    const remotePortfolio = remotePortfolioMap.get(portfolioId)
    const localPortfolio = localPortfolioMap.get(portfolioId)
    if (!remotePortfolio) {
      return localPortfolio!
    }
    if (!localPortfolio) {
      return remotePortfolio
    }

    const mergedCards = mergeTimestampedCards<Card>(localPortfolio.cards, remotePortfolio.cards)
    return {
      ...remotePortfolio,
      cards: mergedCards,
      lastIdPerPrefix: {
        ...remotePortfolio.lastIdPerPrefix,
        ...localPortfolio.lastIdPerPrefix,
      },
    }
  })

  return {
    ...remoteState,
    portfolios: mergedPortfolios,
    devBoard: {
      ...remoteState.devBoard,
      cards: mergeTimestampedCards<DevCard>(localState.devBoard.cards, remoteState.devBoard.cards),
      lastCardNumber: Math.max(remoteState.devBoard.lastCardNumber, localState.devBoard.lastCardNumber),
    },
    scriptWorkshop: {
      ...remoteState.scriptWorkshop,
      scripts: mergeTimestampedCards<ScriptWorkshopItem>(
        localState.scriptWorkshop.scripts,
        remoteState.scriptWorkshop.scripts,
      ),
    },
  }
}

export function mergeIncomingBacklogState(localState: BacklogState, remoteState: BacklogState): BacklogState {
  return {
    cards: mergeTimestampedCards<BacklogCard>(localState.cards, remoteState.cards),
    lastCardNumber: Math.max(remoteState.lastCardNumber, localState.lastCardNumber),
  }
}

