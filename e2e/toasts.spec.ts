import { expect, test, type Page } from '@playwright/test'

const STORAGE_KEY = 'creative-board-state'
const TEST_AUTH_MODE_KEY = 'editors-board-e2e-auth-mode'
const TEST_AUTH_EMAIL_KEY = 'editors-board-e2e-auth-email'
const TEST_REMOTE_STATE_KEY = 'editors-board-e2e-remote-state'

async function openFreshLocalApp(page: Page) {
  await page.goto('/')
  await page.evaluate(
    ({ storageKey, authModeKey, authEmailKey, remoteStateKey }) => {
      window.localStorage.removeItem(storageKey)
      window.localStorage.removeItem(authModeKey)
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
  await page.reload()
}

test('toasts stack and can be dismissed individually', async ({ page }) => {
  await openFreshLocalApp(page)

  await page.locator('.sidebar-nav').getByRole('button', { name: 'Settings', exact: true }).click()
  await expect(page.getByRole('heading', { name: 'Settings' })).toBeVisible()

  await page.getByLabel('Amber warning at days').fill('6')
  await expect(page.getByText('Amber warning must stay lower than the red warning threshold.')).toBeVisible()

  await page.getByRole('button', { name: 'Capacity' }).click()
  await page.getByLabel('Red min %').fill('89')
  await expect(
    page.getByText('Utilization thresholds must stay in order: green max < yellow max < red min.'),
  ).toBeVisible()

  await expect(page.locator('.toast')).toHaveCount(2)

  const firstToast = page.locator('.toast').filter({
    hasText: 'Amber warning must stay lower than the red warning threshold.',
  })
  await firstToast.getByRole('button', { name: 'Dismiss notification' }).click()

  await expect(firstToast).toHaveCount(0)
  await expect(
    page.locator('.toast').filter({
      hasText: 'Utilization thresholds must stay in order: green max < yellow max < red min.',
    }),
  ).toHaveCount(1)
})
