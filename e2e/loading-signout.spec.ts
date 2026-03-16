import { expect, test } from '@playwright/test'

const STORAGE_KEY = 'creative-board-state'
const TEST_AUTH_MODE_KEY = 'editors-board-e2e-auth-mode'
const TEST_AUTH_EMAIL_KEY = 'editors-board-e2e-auth-email'
const TEST_REMOTE_STATE_KEY = 'editors-board-e2e-remote-state'
const TEST_REMOTE_DELAY_KEY = 'editors-board-e2e-remote-delay-ms'

test('authenticated loading shell appears before the shared board and sign out returns to sign-in', async ({
  page,
}) => {
  await page.addInitScript(
    ({ storageKey, authModeKey, authEmailKey, remoteStateKey, remoteDelayKey }) => {
      window.localStorage.setItem(authModeKey, 'enabled')
      window.localStorage.setItem(authEmailKey, 'team@example.com')
      window.localStorage.removeItem(storageKey)
      window.localStorage.removeItem(remoteStateKey)
      window.localStorage.setItem(remoteDelayKey, '3500')
    },
    {
      storageKey: STORAGE_KEY,
      authModeKey: TEST_AUTH_MODE_KEY,
      authEmailKey: TEST_AUTH_EMAIL_KEY,
      remoteStateKey: TEST_REMOTE_STATE_KEY,
      remoteDelayKey: TEST_REMOTE_DELAY_KEY,
    },
  )

  await page.goto('/')

  await expect(page.getByRole('heading', { name: 'Loading your latest board' })).toBeVisible()
  await expect(page.getByText('Loading shared workspace')).toBeVisible()
  await expect(page.getByText('team@example.com')).toBeVisible()

  await expect(page.getByRole('heading', { name: 'Creative Board' })).toBeVisible()
  await page.getByRole('button', { name: 'Expand sidebar' }).click()
  await page.getByRole('button', { name: 'Sign out' }).click()

  await expect(page.getByRole('heading', { name: 'Sign in' })).toBeVisible()
  await expect(page.getByLabel('Email')).toHaveValue('')
  expect(
    await page.evaluate(
      (authEmailKey) => window.localStorage.getItem(authEmailKey),
      TEST_AUTH_EMAIL_KEY,
    ),
  ).toBeNull()
})
