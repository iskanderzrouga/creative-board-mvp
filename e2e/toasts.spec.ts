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
  await page.reload()
}

test('toasts stack and can be dismissed individually', async ({ page }) => {
  await openFreshLocalApp(page)

  await page.locator('.sidebar-nav').getByRole('button', { name: 'Settings', exact: true }).click()
  await expect(page.getByRole('heading', { name: 'General' })).toBeVisible()

  await page.getByLabel('Warning (amber) after days').fill('6')
  await expect(page.getByText('Amber must stay below red.')).toBeVisible()

  await page.getByLabel('Overloaded min (%)').fill('89')
  await expect(
    page.getByText('Thresholds must be in ascending order: healthy < stretched < overloaded.'),
  ).toBeVisible()

  await expect(page.locator('.toast')).toHaveCount(2)

  const firstToast = page.locator('.toast').filter({
    hasText: 'Amber must stay below red.',
  })
  await firstToast.getByRole('button', { name: 'Dismiss notification' }).click()

  await expect(firstToast).toHaveCount(0)
  await expect(
    page.locator('.toast').filter({
      hasText: 'Thresholds must be in ascending order: healthy < stretched < overloaded.',
    }),
  ).toHaveCount(1)
})
