import { expect, test, type Page } from '@playwright/test'

const STORAGE_KEY = 'creative-board-state'
const PENDING_STATE_KEY = 'creative-board-pending-state'
const SYNC_METADATA_KEY = 'creative-board-sync-metadata'
const TEST_AUTH_MODE_KEY = 'editors-board-e2e-auth-mode'
const TEST_AUTH_EMAIL_KEY = 'editors-board-e2e-auth-email'
const TEST_REMOTE_STATE_KEY = 'editors-board-e2e-remote-state'
const TEST_RESET_KEY = 'editors-board-e2e-launch-learnings-reset'

async function openFreshApp(page: Page) {
  await page.addInitScript(
    ({ storageKey, pendingStateKey, syncMetadataKey, authModeKey, authEmailKey, remoteStateKey, resetKey }) => {
      if (!window.sessionStorage.getItem(resetKey)) {
        window.localStorage.removeItem(storageKey)
        window.localStorage.removeItem(pendingStateKey)
        window.localStorage.removeItem(syncMetadataKey)
        window.localStorage.removeItem(authEmailKey)
        window.localStorage.removeItem(remoteStateKey)
        window.sessionStorage.setItem(resetKey, '1')
      }
      window.localStorage.setItem(authModeKey, 'disabled')
    },
    {
      storageKey: STORAGE_KEY,
      pendingStateKey: PENDING_STATE_KEY,
      syncMetadataKey: SYNC_METADATA_KEY,
      authModeKey: TEST_AUTH_MODE_KEY,
      authEmailKey: TEST_AUTH_EMAIL_KEY,
      remoteStateKey: TEST_REMOTE_STATE_KEY,
      resetKey: TEST_RESET_KEY,
    },
  )
  await page.goto('/')
}

async function createCard(page: Page, title: string) {
  await page.getByRole('button', { name: '+ Add card' }).click()
  await page.getByRole('button', { name: 'Continue' }).click()
  await page.getByLabel('Concept').fill(title)
  await page.getByRole('button', { name: 'Create card' }).click()
  await expect(page.getByRole('button', { name: title, exact: true })).toBeVisible()
  await page.getByRole('button', { name: 'Close card detail panel' }).click()
}

async function moveCardsToLiveInLocalState(
  page: Page,
  cards: Array<{ title: string; brand?: string }>,
) {
  await expect
    .poll(() =>
      page.evaluate(
        ({ storageKey, cardTitles }) => {
          const rawState = window.localStorage.getItem(storageKey)
          return cardTitles.every((cardTitle) => rawState?.includes(cardTitle) ?? false)
        },
        { storageKey: PENDING_STATE_KEY, cardTitles: cards.map((card) => card.title) },
      ),
    )
    .toBe(true)

  const nextState = await page.evaluate(
    ({ storageKey, cardsToMove }) => {
      const rawState = window.localStorage.getItem(storageKey)
      if (!rawState) {
        throw new Error('Missing local board state.')
      }

      const state = JSON.parse(rawState)
      const portfolio = state.portfolios?.[0]
      const movedAt = '2026-04-30T10:00:00.000Z'
      const cardIds: Record<string, string> = {}

      for (const cardToMove of cardsToMove) {
        const card = portfolio?.cards?.find((item: { title?: string }) => item.title === cardToMove.title)
        if (!card) {
          throw new Error(`Missing created card: ${cardToMove.title}`)
        }

        card.stage = 'Live'
        card.stageEnteredAt = movedAt
        card.updatedAt = movedAt
        if (cardToMove.brand) {
          card.brand = cardToMove.brand
        }
        card.stageHistory = [
          ...(Array.isArray(card.stageHistory) ? card.stageHistory : []).map(
            (entry: { exitedAt?: string | null }) =>
              entry.exitedAt === null ? { ...entry, exitedAt: movedAt, durationDays: 0 } : entry,
          ),
          {
            stage: 'Live',
            enteredAt: movedAt,
            exitedAt: null,
            durationDays: null,
          },
        ]
        cardIds[cardToMove.title] = card.id as string
      }

      return {
        cardIds,
        stateJson: JSON.stringify(state),
        metadataJson: JSON.stringify({
          lastSyncedAt: null,
          pendingRemoteBaseUpdatedAt: null,
          pendingRemoteSignature: `test-${Object.values(cardIds).join('-')}-${movedAt}`,
        }),
      }
    },
    {
      storageKey: PENDING_STATE_KEY,
      cardsToMove: cards,
    },
  )

  await page.evaluate(
    ({ storageKey, syncMetadataKey, stateJson, metadataJson }) => {
      window.localStorage.setItem(storageKey, stateJson)
      window.localStorage.setItem(syncMetadataKey, metadataJson)
    },
    {
      storageKey: PENDING_STATE_KEY,
      syncMetadataKey: SYNC_METADATA_KEY,
      stateJson: nextState.stateJson,
      metadataJson: nextState.metadataJson,
    },
  )

  await page.addInitScript(
    ({ storageKey, syncMetadataKey, stateJson, metadataJson, cardIds }) => {
      const existingState = window.localStorage.getItem(storageKey)
      let shouldSeedLiveCard = true
      if (existingState) {
        try {
          const parsed = JSON.parse(existingState) as {
            portfolios?: Array<{ cards?: Array<{ id?: string; stage?: string }> }>
          }
          const existingCards = parsed.portfolios?.flatMap((portfolio) => portfolio.cards ?? []) ?? []
          shouldSeedLiveCard = cardIds.some((cardId) => {
            const existingCard = existingCards.find((card) => card.id === cardId)
            return existingCard?.stage !== 'Live'
          })
        } catch {
          shouldSeedLiveCard = true
        }
      }

      if (shouldSeedLiveCard) {
        window.localStorage.setItem(storageKey, stateJson)
      }
      if (!window.localStorage.getItem(syncMetadataKey)) {
        window.localStorage.setItem(syncMetadataKey, metadataJson)
      }
    },
    {
      storageKey: PENDING_STATE_KEY,
      syncMetadataKey: SYNC_METADATA_KEY,
      stateJson: nextState.stateJson,
      metadataJson: nextState.metadataJson,
      cardIds: Object.values(nextState.cardIds),
    },
  )

  return nextState.cardIds
}

async function moveCardToLiveInLocalState(page: Page, title: string) {
  const cardIds = await moveCardsToLiveInLocalState(page, [{ title }])
  return cardIds[title]
}

test('owner can save launch learnings on a live card', async ({ page }) => {
  await openFreshApp(page)

  const title = 'Launch learning coverage card'
  await createCard(page, title)
  const cardId = await moveCardToLiveInLocalState(page, title)

  await page.goto('/learnings')
  await expect(page.getByRole('heading', { name: 'Launch Learnings' })).toBeVisible()
  await expect(page.getByRole('button', { name: title })).toBeVisible()

  const learningInput = page.getByLabel(`Learnings for ${cardId}`)
  await learningInput.fill('Winning hook needs a sharper above-the-fold proof point.')
  await page.reload()
  await expect(page.getByLabel(`Learnings for ${cardId}`)).toHaveValue(
    'Winning hook needs a sharper above-the-fold proof point.',
  )
})

test('owner can filter launch learnings by brand', async ({ page }) => {
  await openFreshApp(page)

  const pluxyTitle = 'Launch learning Pluxy card'
  const viviTitle = 'Launch learning Vivi card'
  await createCard(page, pluxyTitle)
  await createCard(page, viviTitle)
  await moveCardsToLiveInLocalState(page, [
    { title: pluxyTitle, brand: 'Pluxy' },
    { title: viviTitle, brand: 'Vivi' },
  ])

  await page.goto('/learnings')
  await expect(page.getByRole('button', { name: pluxyTitle })).toBeVisible()
  await expect(page.getByRole('button', { name: viviTitle })).toBeVisible()

  await page.getByLabel('Brand filter').selectOption('Vivi')
  await expect(page.getByRole('button', { name: viviTitle })).toBeVisible()
  await expect(page.getByRole('button', { name: pluxyTitle })).toHaveCount(0)

  await page.getByLabel('Brand filter').selectOption('Pluxy')
  await expect(page.getByRole('button', { name: pluxyTitle })).toBeVisible()
  await expect(page.getByRole('button', { name: viviTitle })).toHaveCount(0)
})
