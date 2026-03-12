import { expect, test, type Page } from '@playwright/test'
import { mkdirSync } from 'node:fs'

const STORAGE_KEY = 'creative-board-state'
const TEST_AUTH_MODE_KEY = 'editors-board-e2e-auth-mode'
const TEST_AUTH_EMAIL_KEY = 'editors-board-e2e-auth-email'
const TEST_REMOTE_STATE_KEY = 'editors-board-e2e-remote-state'

function ensureArtifactsDir() {
  mkdirSync('artifacts/phase-2', { recursive: true })
}

async function openFreshAuthGate(page: Page) {
  await page.addInitScript(
    ({ storageKey, authModeKey, authEmailKey, remoteStateKey }) => {
      window.localStorage.removeItem(storageKey)
      window.localStorage.removeItem(remoteStateKey)
      window.localStorage.setItem(authModeKey, 'enabled')
      window.localStorage.removeItem(authEmailKey)
    },
    {
      storageKey: STORAGE_KEY,
      authModeKey: TEST_AUTH_MODE_KEY,
      authEmailKey: TEST_AUTH_EMAIL_KEY,
      remoteStateKey: TEST_REMOTE_STATE_KEY,
    },
  )

  await page.goto('/')
  await expect(page.getByRole('heading', { name: 'Team access' })).toBeVisible()
}

test('team access validates work email format before send', async ({ page }) => {
  await openFreshAuthGate(page)

  const emailInput = page.getByLabel('Work email')
  const sendButton = page.getByRole('button', { name: 'Send Magic Link' })

  await emailInput.fill('team')
  await expect(sendButton).toBeDisabled()
  await expect(page.getByText('Enter a valid work email to continue.')).toBeVisible()

  await emailInput.fill('team@example.com')
  await expect(sendButton).toBeEnabled()
  await expect(page.getByText('Enter a valid work email to continue.')).toHaveCount(0)
})

test('authenticated team login syncs the shared workspace across pages', async ({
  browser,
}) => {
  ensureArtifactsDir()

  const context = await browser.newContext()
  const page = await context.newPage()

  await page.addInitScript(
    ({ storageKey, authModeKey, remoteStateKey }) => {
      window.localStorage.setItem(authModeKey, 'enabled')
      window.localStorage.removeItem(storageKey)
      window.localStorage.removeItem(remoteStateKey)
      window.localStorage.removeItem('editors-board-e2e-auth-email')
    },
    {
      storageKey: STORAGE_KEY,
      authModeKey: TEST_AUTH_MODE_KEY,
      remoteStateKey: TEST_REMOTE_STATE_KEY,
    },
  )

  await page.goto('/')
  await expect(page.getByRole('heading', { name: 'Team access' })).toBeVisible()

  await page.getByLabel('Work email').fill('team@example.com')
  await page.getByRole('button', { name: 'Send Magic Link' }).dispatchEvent('click')

  await expect(page.getByRole('heading', { name: 'Creative Board' })).toBeVisible()
  await expect(page.getByText('team@example.com')).toBeVisible()

  await page.getByRole('button', { name: '+ Add card' }).click()
  await page.getByLabel('Title').fill('Authenticated sync card')
  await page.getByRole('button', { name: 'Create', exact: true }).click()

  await expect(page.getByText('Authenticated sync card')).toBeVisible()
  await page.waitForFunction(
    ({ remoteStateKey, cardTitle }) => {
      const raw = window.localStorage.getItem(remoteStateKey)
      if (!raw) {
        return false
      }

      return raw.includes(cardTitle)
    },
    {
      remoteStateKey: TEST_REMOTE_STATE_KEY,
      cardTitle: 'Authenticated sync card',
    },
  )

  await page.screenshot({
    path: 'artifacts/phase-2/authenticated-sync.png',
    fullPage: true,
  })

  const secondPage = await context.newPage()
  await secondPage.addInitScript((storageKey) => {
    window.localStorage.removeItem(storageKey)
  }, STORAGE_KEY)

  await secondPage.goto('/')
  await expect(secondPage.getByRole('heading', { name: 'Creative Board' })).toBeVisible()
  await expect(secondPage.getByText('Authenticated sync card')).toBeVisible()
  await expect(secondPage.getByText('team@example.com')).toBeVisible()

  await context.close()
})
