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

  await expect(page.getByRole('status', { name: 'Loading board' })).toBeVisible()
  await expect(page.getByText('Loading your latest board')).toBeHidden()
  await expect(page.getByText('Loading shared workspace')).toBeHidden()
  await expect(page.getByText('team@example.com')).toBeHidden()

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

test('authenticated card edits do not reopen the loading shell', async ({ page }) => {
  await page.addInitScript(
    ({ storageKey, authModeKey, authEmailKey, remoteStateKey, remoteDelayKey }) => {
      window.localStorage.setItem(authModeKey, 'enabled')
      window.localStorage.setItem(authEmailKey, 'team@example.com')
      window.localStorage.removeItem(storageKey)
      window.localStorage.removeItem(remoteStateKey)
      window.localStorage.removeItem(remoteDelayKey)
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
  await expect(page.getByRole('heading', { name: 'Creative Board' })).toBeVisible()
  await expect(page.getByRole('status', { name: 'Loading board' })).toHaveCount(0)

  await page.getByRole('button', { name: '+ Add card' }).click()
  await page.getByRole('button', { name: 'Continue' }).click()
  await page.getByLabel('Concept').fill('No loading flash card')
  await page.getByRole('button', { name: 'Create card' }).click()
  await expect(page.locator('.production-detail-panel.is-open')).toBeVisible()

  await page.evaluate(() => {
    const testWindow = window as Window & {
      __loadingShellHits?: number
      __loadingShellObserver?: MutationObserver
    }

    testWindow.__loadingShellHits = 0
    testWindow.__loadingShellObserver?.disconnect()
    testWindow.__loadingShellObserver = new MutationObserver(() => {
      if (document.querySelector('.remote-loading-frame, .remote-loading-mark')) {
        testWindow.__loadingShellHits = (testWindow.__loadingShellHits ?? 0) + 1
      }
    })
    testWindow.__loadingShellObserver.observe(document.body, {
      childList: true,
      subtree: true,
      attributes: true,
      attributeFilter: ['class', 'aria-busy'],
    })
  })

  const angleField = page.locator('.production-detail-panel label').filter({ hasText: 'Angle / Theme' })
  await angleField.locator('.panel-input').click()
  await angleField.locator('input.panel-input').fill('No loading flash')
  await page
    .locator('.production-detail-panel label')
    .filter({ hasText: 'Audience' })
    .locator('.panel-input')
    .click()
  await page.waitForTimeout(500)

  const loadingShellHits = await page.evaluate(() => {
    const testWindow = window as Window & {
      __loadingShellHits?: number
      __loadingShellObserver?: MutationObserver
    }
    testWindow.__loadingShellObserver?.disconnect()
    return testWindow.__loadingShellHits ?? 0
  })

  expect(loadingShellHits).toBe(0)
  await expect(page.locator('.production-detail-panel.is-open')).toBeVisible()
  await expect(page.getByRole('status', { name: 'Loading board' })).toHaveCount(0)
})
