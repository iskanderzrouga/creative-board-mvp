import { expect, test, type Locator, type Page } from '@playwright/test'

const STORAGE_KEY = 'creative-board-state'
const TEST_AUTH_MODE_KEY = 'editors-board-e2e-auth-mode'
const TEST_AUTH_EMAIL_KEY = 'editors-board-e2e-auth-email'
const TEST_REMOTE_STATE_KEY = 'editors-board-e2e-remote-state'

async function openFreshApp(page: Page) {
  await page.addInitScript(
    ({ storageKey, authModeKey, authEmailKey, remoteStateKey }) => {
      window.localStorage.removeItem(storageKey)
      window.localStorage.setItem(authModeKey, 'disabled')
      window.localStorage.removeItem(authEmailKey)
      window.localStorage.removeItem(remoteStateKey)
    },
    {
      storageKey: STORAGE_KEY,
      authModeKey: TEST_AUTH_MODE_KEY,
      authEmailKey: TEST_AUTH_EMAIL_KEY,
      remoteStateKey: TEST_REMOTE_STATE_KEY,
    },
  )
  await page.goto('/')
}

async function createCardAndCloseDetail(page: Page, title: string) {
  await page.getByRole('button', { name: '+ Add card' }).click()
  await page.getByLabel('Title').fill(title)
  await page.getByRole('button', { name: /Create & Open Detail/ }).click()
  await expect(page.getByLabel('Card title')).toHaveValue(title)
  await page.getByRole('button', { name: 'Close card detail panel' }).click()
  await expect(page.getByRole('button', { name: new RegExp(title) })).toBeVisible()
}

async function dragLocatorToTarget(page: Page, source: Locator, target: Locator) {
  await source.scrollIntoViewIfNeeded()
  await target.scrollIntoViewIfNeeded()

  const sourceBox = await source.boundingBox()
  const targetBox = await target.boundingBox()
  const viewport = page.viewportSize()

  if (!sourceBox || !targetBox || !viewport) {
    throw new Error('Missing drag source or target box')
  }

  const sourceX = Math.min(sourceBox.x + sourceBox.width / 2, viewport.width - 16)
  const sourceY = Math.min(sourceBox.y + Math.min(sourceBox.height / 2, 32), viewport.height - 16)
  const targetX = Math.min(targetBox.x + targetBox.width / 2, viewport.width - 16)
  const targetY = Math.min(targetBox.y + Math.min(targetBox.height / 2, 48), viewport.height - 16)

  await source.hover()
  await page.mouse.move(sourceX, sourceY)
  await page.mouse.down()
  await page.waitForTimeout(50)
  await page.mouse.move(sourceX + 16, sourceY + 16, { steps: 8 })
  await page.mouse.move(targetX, targetY, { steps: 24 })
  await page.mouse.up()
  await page.waitForTimeout(250)
}

function getCardButton(page: Page, title: string) {
  return page.getByRole('button', { name: new RegExp(title) })
}

test('manager can drag a backlog card into Briefed and move it back with a revision reason', async ({
  page,
}) => {
  await openFreshApp(page)

  const title = 'Phase 11 drag board card'
  await createCardAndCloseDetail(page, title)

  const cardButton = getCardButton(page, title)
  const briefedLane = page.getByRole('group', { name: 'Briefed lane for Daniel T' })
  const briefedDropTarget = briefedLane.getByRole('button').first()

  await dragLocatorToTarget(page, cardButton, briefedDropTarget)

  await expect(page.locator('.toast').filter({ hasText: /assigned to Daniel T/ })).toHaveCount(1)
  await expect(briefedLane.getByRole('button', { name: new RegExp(title) })).toBeVisible()

  const inProductionLane = page.getByRole('group', { name: 'In Production lane for Daniel T' })
  const inProductionDropTarget = inProductionLane.getByRole('button').first()
  await dragLocatorToTarget(
    page,
    briefedLane.getByRole('button', { name: new RegExp(title) }),
    inProductionDropTarget,
  )

  await expect(page.locator('.toast').filter({ hasText: /→ In Production/ })).toHaveCount(1)
  await expect(inProductionLane.getByRole('button', { name: new RegExp(title) })).toBeVisible()

  await dragLocatorToTarget(
    page,
    inProductionLane.getByRole('button', { name: new RegExp(title) }),
    briefedDropTarget,
  )

  await expect(page.getByRole('dialog', { name: /Moving .* back to Briefed/ })).toBeVisible()
  await page.getByLabel('Needs creative fixes · 4h').check()
  await page.getByRole('button', { name: 'Move Back' }).click()

  await expect(page.locator('.toast').filter({ hasText: /moved back to Briefed/ })).toHaveCount(1)
  await expect(briefedLane.getByRole('button', { name: new RegExp(title) })).toBeVisible()
})

test('manager gets a capacity warning when dragging into a full in-production lane', async ({
  page,
}) => {
  await openFreshApp(page)

  const title = 'Phase 11 WIP drag card'
  await createCardAndCloseDetail(page, title)

  const briefedLane = page.getByRole('group', { name: 'Briefed lane for Daniel T' })
  await dragLocatorToTarget(page, getCardButton(page, title), briefedLane.getByRole('button').first())
  await expect(page.locator('.toast').filter({ hasText: /assigned to Daniel T/ })).toHaveCount(1)

  const fullLane = page.getByRole('group', { name: 'In Production lane for Ezequiel' })
  const fullLaneDropTarget = fullLane.getByRole('button').first()

  await dragLocatorToTarget(
    page,
    briefedLane.getByRole('button', { name: new RegExp(title) }),
    fullLaneDropTarget,
  )

  await expect(page.locator('.toast').filter({ hasText: 'Ezequiel is at capacity (3/3)' })).toHaveCount(1)
  await expect(briefedLane.getByRole('button', { name: new RegExp(title) })).toBeVisible()
})

test('blocked cards cannot be dragged forward', async ({ page }) => {
  await openFreshApp(page)

  const title = 'Phase 11 blocked drag card'
  await createCardAndCloseDetail(page, title)

  const briefedLane = page.getByRole('group', { name: 'Briefed lane for Daniel T' })
  await dragLocatorToTarget(page, getCardButton(page, title), briefedLane.getByRole('button').first())
  await expect(page.locator('.toast').filter({ hasText: /assigned to Daniel T/ })).toHaveCount(1)

  const cardInBriefed = briefedLane.getByRole('button', { name: new RegExp(title) })
  await cardInBriefed.click()
  await page.getByPlaceholder('Waiting for raw footage...').fill('Blocked for missing footage')
  await page.getByRole('button', { name: 'Save Blocked' }).click()
  await page.getByRole('button', { name: 'Close card detail panel' }).click()

  const inProductionLane = page.getByRole('group', { name: 'In Production lane for Daniel T' })
  await dragLocatorToTarget(page, cardInBriefed, inProductionLane.getByRole('button').first())

  await expect(briefedLane.getByRole('button', { name: new RegExp(title) })).toBeVisible()
  await expect(inProductionLane.getByRole('button', { name: new RegExp(title) })).toHaveCount(0)
})
