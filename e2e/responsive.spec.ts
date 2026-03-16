import { expect, test, type Page } from '@playwright/test'

const STORAGE_KEY = 'creative-board-state'
const TEST_AUTH_MODE_KEY = 'editors-board-e2e-auth-mode'
const TEST_AUTH_EMAIL_KEY = 'editors-board-e2e-auth-email'
const TEST_REMOTE_STATE_KEY = 'editors-board-e2e-remote-state'

test.use({
  viewport: { width: 760, height: 1024 },
})

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

test('tablet layout keeps board navigation, detail, and settings usable', async ({
  page,
}) => {
  await openFreshApp(page)

  await expect(page.getByRole('heading', { name: 'Creative Board' })).toBeVisible()

  const distinctColumnOffsets = await page.locator('.stage-column').evaluateAll((nodes) =>
    Array.from(
      new Set(
        nodes.map((node) => Math.round((node as HTMLElement).getBoundingClientRect().left)),
      ),
    ).length,
  )
  expect(distinctColumnOffsets).toBeGreaterThan(1)

  await page.getByRole('button', { name: '+ Add card' }).click()
  await page.getByLabel('Title').fill('Tablet responsive card')
  await page.getByRole('button', { name: /Create & Open Detail/ }).click()

  const slidePanelBox = await page.locator('.slide-panel').boundingBox()
  expect(slidePanelBox?.width ?? 0).toBeGreaterThan(740)

  await page.getByRole('button', { name: 'Close card detail panel' }).click()

  await page.locator('.sidebar-nav').getByRole('button', { name: 'Settings', exact: true }).click()
  await expect(page.getByRole('heading', { name: 'General' })).toBeVisible()
  await expect(page.getByLabel('Warning (amber) after days')).toBeVisible()
  await expect(page.getByRole('button', { name: 'People' })).toBeVisible()
})
