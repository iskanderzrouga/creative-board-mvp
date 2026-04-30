import { expect, test, type Page } from '@playwright/test'

const STORAGE_KEY = 'creative-board-state'
const PENDING_STATE_KEY = 'creative-board-pending-state'
const SYNC_METADATA_KEY = 'creative-board-sync-metadata'
const TEST_AUTH_MODE_KEY = 'editors-board-e2e-auth-mode'
const TEST_AUTH_EMAIL_KEY = 'editors-board-e2e-auth-email'
const TEST_REMOTE_STATE_KEY = 'editors-board-e2e-remote-state'

async function openFreshApp(page: Page) {
  await page.addInitScript(
    ({ storageKey, pendingStateKey, syncMetadataKey, authModeKey, authEmailKey, remoteStateKey }) => {
      window.localStorage.removeItem(storageKey)
      window.localStorage.removeItem(pendingStateKey)
      window.localStorage.removeItem(syncMetadataKey)
      window.localStorage.setItem(authModeKey, 'disabled')
      window.localStorage.removeItem(authEmailKey)
      window.localStorage.removeItem(remoteStateKey)
    },
    {
      storageKey: STORAGE_KEY,
      pendingStateKey: PENDING_STATE_KEY,
      syncMetadataKey: SYNC_METADATA_KEY,
      authModeKey: TEST_AUTH_MODE_KEY,
      authEmailKey: TEST_AUTH_EMAIL_KEY,
      remoteStateKey: TEST_REMOTE_STATE_KEY,
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

async function moveCardToLiveInLocalState(page: Page, title: string) {
  await expect
    .poll(() =>
      page.evaluate(
        ({ storageKey, cardTitle }) => window.localStorage.getItem(storageKey)?.includes(cardTitle) ?? false,
        { storageKey: PENDING_STATE_KEY, cardTitle: title },
      ),
    )
    .toBe(true)

  const nextState = await page.evaluate(
    ({ storageKey, cardTitle }) => {
      const rawState = window.localStorage.getItem(storageKey)
      if (!rawState) {
        throw new Error('Missing local board state.')
      }

      const state = JSON.parse(rawState)
      const portfolio = state.portfolios?.[0]
      const card = portfolio?.cards?.find((item: { title?: string }) => item.title === cardTitle)
      if (!card) {
        throw new Error('Missing created card.')
      }

      const movedAt = '2026-04-30T10:00:00.000Z'
      card.stage = 'Live'
      card.stageEnteredAt = movedAt
      card.updatedAt = movedAt
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

      return {
        cardId: card.id as string,
        stateJson: JSON.stringify(state),
        metadataJson: JSON.stringify({
          lastSyncedAt: null,
          pendingRemoteBaseUpdatedAt: null,
          pendingRemoteSignature: `test-${card.id}-${movedAt}`,
        }),
      }
    },
    {
      storageKey: PENDING_STATE_KEY,
      cardTitle: title,
    },
  )

  await page.addInitScript(
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

  return nextState.cardId
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
  await learningInput.blur()

  await expect(learningInput).toHaveValue('Winning hook needs a sharper above-the-fold proof point.')
  await expect
    .poll(() =>
      page.evaluate(
        ({ storageKey, targetCardId }) => {
          const rawState = window.localStorage.getItem(storageKey)
          if (!rawState) {
            return null
          }

          const state = JSON.parse(rawState)
          const card = state.portfolios
            ?.flatMap((portfolio: { cards?: Array<{ id?: string; launchLearning?: string }> }) => portfolio.cards ?? [])
            .find((item: { id?: string }) => item.id === targetCardId)

          return card?.launchLearning ?? null
        },
        {
          storageKey: PENDING_STATE_KEY,
          targetCardId: cardId,
        },
      ),
    )
    .toBe('Winning hook needs a sharper above-the-fold proof point.')
})
