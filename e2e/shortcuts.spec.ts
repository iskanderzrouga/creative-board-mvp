import { expect, test } from '@playwright/test'

const STORAGE_KEY = 'creative-board-state'
const TEST_AUTH_MODE_KEY = 'editors-board-e2e-auth-mode'
const TEST_AUTH_EMAIL_KEY = 'editors-board-e2e-auth-email'
const TEST_REMOTE_STATE_KEY = 'editors-board-e2e-remote-state'

test('keyboard shortcuts help opens from the header and closes with Escape', async ({ page }) => {
  await page.addInitScript(
    ({ storageKey, authModeKey, authEmailKey, remoteStateKey }) => {
      window.localStorage.setItem(authModeKey, 'enabled')
      window.localStorage.setItem(authEmailKey, 'team@example.com')
      window.localStorage.removeItem(storageKey)
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
  await expect(page.getByRole('heading', { name: 'Creative Board' })).toBeVisible()

  await page.getByRole('button', { name: 'Open keyboard shortcuts' }).click()

  await expect(page.getByRole('dialog', { name: 'Keyboard shortcuts' })).toBeVisible()
  await expect(page.getByText('Cmd+N / Ctrl+N')).toBeVisible()
  await expect(page.getByText('Cmd+K / Ctrl+K')).toBeVisible()

  await page.keyboard.press('Escape')

  await expect(page.getByRole('dialog', { name: 'Keyboard shortcuts' })).toBeHidden()
})
