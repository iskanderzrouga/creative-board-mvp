import { expect, test } from '@playwright/test'
import { mkdirSync } from 'node:fs'

const STORAGE_KEY = 'creative-board-state'
const TEST_AUTH_MODE_KEY = 'editors-board-e2e-auth-mode'
const TEST_AUTH_EMAIL_KEY = 'editors-board-e2e-auth-email'
const TEST_REMOTE_STATE_KEY = 'editors-board-e2e-remote-state'

test('capture refreshed board UI', async ({ page }) => {
  mkdirSync('artifacts/ui-refresh', { recursive: true })
  await page.setViewportSize({ width: 1680, height: 1000 })
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
  await expect(page.getByRole('heading', { name: 'Creative Board' })).toBeVisible()
  await page.waitForTimeout(400)
  await page.screenshot({ path: 'artifacts/ui-refresh/board-refreshed.png' })
  await page
    .locator('.stage-column.stage-briefed')
    .first()
    .screenshot({ path: 'artifacts/ui-refresh/column-closeup.png' })

  await page.getByRole('group', { name: 'Board layout' }).getByRole('button', { name: 'List' }).click()
  await page.waitForTimeout(300)
  await page.screenshot({ path: 'artifacts/ui-refresh/list-refreshed.png' })
})
