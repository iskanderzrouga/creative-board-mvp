import { expect, test } from '@playwright/test'

const STORAGE_KEY = 'creative-board-state'
const TEST_AUTH_MODE_KEY = 'editors-board-e2e-auth-mode'
const TEST_AUTH_EMAIL_KEY = 'editors-board-e2e-auth-email'
const TEST_ACCESS_STATE_KEY = 'editors-board-e2e-access-state'
const TEST_ACCESS_DELAY_KEY = 'editors-board-e2e-access-delay-ms'
const TEST_ACCESS_TIMEOUT_KEY = 'editors-board-e2e-access-timeout-ms'
const TEST_REMOTE_STATE_KEY = 'editors-board-e2e-remote-state'

test('denied access can return to team access and try a different email', async ({ page }) => {
  await page.addInitScript(
    ({
      storageKey,
      authModeKey,
      authEmailKey,
      accessStateKey,
      accessDelayKey,
      accessTimeoutKey,
      remoteStateKey,
    }) => {
      window.localStorage.setItem(authModeKey, 'enabled')
      window.localStorage.setItem(authEmailKey, 'blocked@example.com')
      window.localStorage.setItem(accessStateKey, 'denied')
      window.localStorage.removeItem(storageKey)
      window.localStorage.removeItem(remoteStateKey)
      window.localStorage.removeItem(accessDelayKey)
      window.localStorage.removeItem(accessTimeoutKey)
    },
    {
      storageKey: STORAGE_KEY,
      authModeKey: TEST_AUTH_MODE_KEY,
      authEmailKey: TEST_AUTH_EMAIL_KEY,
      accessStateKey: TEST_ACCESS_STATE_KEY,
      accessDelayKey: TEST_ACCESS_DELAY_KEY,
      accessTimeoutKey: TEST_ACCESS_TIMEOUT_KEY,
      remoteStateKey: TEST_REMOTE_STATE_KEY,
    },
  )

  await page.goto('/')

  await expect(page.getByRole('heading', { name: 'Access needed' })).toBeVisible()
  await expect(page.getByText('approved access list')).toBeVisible()

  await page.getByRole('button', { name: 'Try a different email' }).click()

  await expect(page.getByRole('heading', { name: 'Team access' })).toBeVisible()
  await expect(page.getByLabel('Work email')).toHaveValue('')
  await expect(page.getByText('Use a different approved work email to continue.')).toBeVisible()

  expect(
    await page.evaluate(
      (authEmailKey) => window.localStorage.getItem(authEmailKey),
      TEST_AUTH_EMAIL_KEY,
    ),
  ).toBeNull()
})

test('timed out access verification shows retry and different-email recovery', async ({
  page,
}) => {
  await page.addInitScript(
    ({
      storageKey,
      authModeKey,
      authEmailKey,
      accessStateKey,
      accessDelayKey,
      accessTimeoutKey,
      remoteStateKey,
    }) => {
      window.localStorage.setItem(authModeKey, 'enabled')
      window.localStorage.setItem(authEmailKey, 'team@example.com')
      window.localStorage.setItem(accessStateKey, 'granted')
      window.localStorage.setItem(accessDelayKey, '250')
      window.localStorage.setItem(accessTimeoutKey, '100')
      window.localStorage.removeItem(storageKey)
      window.localStorage.removeItem(remoteStateKey)
    },
    {
      storageKey: STORAGE_KEY,
      authModeKey: TEST_AUTH_MODE_KEY,
      authEmailKey: TEST_AUTH_EMAIL_KEY,
      accessStateKey: TEST_ACCESS_STATE_KEY,
      accessDelayKey: TEST_ACCESS_DELAY_KEY,
      accessTimeoutKey: TEST_ACCESS_TIMEOUT_KEY,
      remoteStateKey: TEST_REMOTE_STATE_KEY,
    },
  )

  await page.goto('/')

  await expect(page.getByRole('heading', { name: 'Checking access' })).toBeVisible()
  await expect(
    page.getByText(
      'Retry the check, try a different email, or contact your workspace manager if this account should already be approved.',
    ),
  ).toBeVisible()
  await expect(page.getByRole('button', { name: 'Retry check' })).toBeVisible()
  await expect(page.getByRole('button', { name: 'Try a different email' })).toBeVisible()

  await page.getByRole('button', { name: 'Try a different email' }).click()

  await expect(page.getByRole('heading', { name: 'Team access' })).toBeVisible()
  await expect(page.getByLabel('Work email')).toHaveValue('')
})
