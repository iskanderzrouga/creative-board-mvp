import { expect, test, type Page } from '@playwright/test'
import { mkdirSync } from 'node:fs'

const STORAGE_KEY = 'creative-board-state'
const TEST_AUTH_MODE_KEY = 'editors-board-e2e-auth-mode'
const TEST_AUTH_EMAIL_KEY = 'editors-board-e2e-auth-email'
const TEST_PASSWORD_RECOVERY_KEY = 'editors-board-e2e-password-recovery'
const TEST_REMOTE_STATE_KEY = 'editors-board-e2e-remote-state'

function ensureArtifactsDir() {
  mkdirSync('artifacts/phase-2', { recursive: true })
}

async function openFreshAuthGate(page: Page) {
  await page.addInitScript(
    ({ storageKey, authModeKey, authEmailKey, recoveryKey, remoteStateKey }) => {
      window.localStorage.removeItem(storageKey)
      window.localStorage.removeItem(remoteStateKey)
      window.localStorage.removeItem(recoveryKey)
      window.localStorage.setItem(authModeKey, 'enabled')
      window.localStorage.removeItem(authEmailKey)
    },
    {
      storageKey: STORAGE_KEY,
      authModeKey: TEST_AUTH_MODE_KEY,
      authEmailKey: TEST_AUTH_EMAIL_KEY,
      recoveryKey: TEST_PASSWORD_RECOVERY_KEY,
      remoteStateKey: TEST_REMOTE_STATE_KEY,
    },
  )

  await page.goto('/')
  await expect(page.getByRole('heading', { name: 'Sign in' })).toBeVisible()
}

test('sign-in validates email and password format before submit', async ({ page }) => {
  await openFreshAuthGate(page)

  const emailInput = page.getByLabel('Email')
  const passwordInput = page.getByLabel('Password')
  const signInButton = page.getByRole('button', { name: 'Sign in' })

  await emailInput.fill('team')
  await passwordInput.fill('secret1')
  await expect(signInButton).toBeDisabled()
  await expect(page.getByText('Enter a valid email address.')).toBeVisible()

  await emailInput.fill('team@example.com')
  await passwordInput.fill('123')
  await expect(signInButton).toBeDisabled()
  await expect(page.getByText('Password must be at least 6 characters.')).toBeVisible()

  await passwordInput.fill('secret1')
  await expect(signInButton).toBeEnabled()
  await expect(page.getByText('Enter a valid email address.')).toHaveCount(0)
  await expect(page.getByText('Password must be at least 6 characters.')).toHaveCount(0)
})

test('forgot password shows clearer reset guidance', async ({ page }) => {
  await openFreshAuthGate(page)

  await page.getByLabel('Email').fill('team@example.com')
  await page.getByRole('button', { name: 'Forgot password?' }).click()

  await expect(page.getByRole('heading', { name: 'Reset password' })).toBeVisible()
  await expect(
    page.getByText('Enter your email and we will send you a link to reset your password.'),
  ).toBeVisible()

  await page.getByRole('button', { name: 'Send reset link' }).click()

  await expect(
    page.getByText('If this email already has a password-based account, a reset link is on the way.'),
  ).toBeVisible()
  await expect(
    page.getByText(
      'Sent to team@example.com. Check spam too. If nothing arrives, make sure you are using the same email you sign in with.',
    ),
  ).toBeVisible()
})

test('password recovery flow lets a user choose a new password', async ({ page }) => {
  await page.addInitScript(
    ({ storageKey, authModeKey, authEmailKey, recoveryKey, remoteStateKey }) => {
      window.localStorage.removeItem(storageKey)
      window.localStorage.removeItem(remoteStateKey)
      window.localStorage.setItem(authModeKey, 'enabled')
      window.localStorage.setItem(authEmailKey, 'team@example.com')
      window.localStorage.setItem(recoveryKey, '1')
    },
    {
      storageKey: STORAGE_KEY,
      authModeKey: TEST_AUTH_MODE_KEY,
      authEmailKey: TEST_AUTH_EMAIL_KEY,
      recoveryKey: TEST_PASSWORD_RECOVERY_KEY,
      remoteStateKey: TEST_REMOTE_STATE_KEY,
    },
  )

  await page.goto('/')

  await expect(page.getByRole('heading', { name: 'Set a new password' })).toBeVisible()
  await expect(page.getByText('Choose a new password for team@example.com.')).toBeVisible()

  await page.getByLabel(/^New password$/).fill('secret12')
  await page.getByLabel(/^Confirm new password$/).fill('secret12')
  await page.getByRole('button', { name: 'Update password' }).click()

  await expect(page.getByRole('heading', { name: 'Creative Board' })).toBeVisible()
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
  await expect(page.getByRole('heading', { name: 'Sign in' })).toBeVisible()

  await page.getByLabel('Email').fill('team@example.com')
  await page.getByLabel('Password').fill('secret1')
  await page.getByRole('button', { name: 'Sign in' }).click()

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

test('opening People does not trigger a remote conflict when only local view state changed', async ({
  page,
}) => {
  await page.addInitScript(
    ({ storageKey, authModeKey, remoteStateKey, authEmailKey }) => {
      window.localStorage.setItem(authModeKey, 'enabled')
      window.localStorage.removeItem(storageKey)
      window.localStorage.removeItem(remoteStateKey)
      window.localStorage.removeItem(authEmailKey)
    },
    {
      storageKey: STORAGE_KEY,
      authModeKey: TEST_AUTH_MODE_KEY,
      remoteStateKey: TEST_REMOTE_STATE_KEY,
      authEmailKey: TEST_AUTH_EMAIL_KEY,
    },
  )

  await page.goto('/')
  await page.getByLabel('Email').fill('team@example.com')
  await page.getByLabel('Password').fill('secret1')
  await page.getByRole('button', { name: 'Sign in' }).click()

  await expect(page.getByRole('heading', { name: 'Creative Board' })).toBeVisible()

  await page.evaluate((remoteStateKey) => {
    const raw = window.localStorage.getItem(remoteStateKey)
    if (!raw) {
      return
    }

    const parsed = JSON.parse(raw) as { state: unknown; updatedAt: string }
    window.localStorage.setItem(
      remoteStateKey,
      JSON.stringify({
        ...parsed,
        updatedAt: '2099-01-01T00:00:00.000Z',
      }),
    )
  }, TEST_REMOTE_STATE_KEY)

  await page.locator('.sidebar-nav').getByRole('button', { name: 'Settings', exact: true }).click()
  await page.getByRole('button', { name: 'People', exact: true }).click()

  await expect(page.getByRole('heading', { name: 'People' })).toBeVisible()
  await page.waitForTimeout(1200)
  await expect(
    page.getByText(
      'Another session saved newer workspace changes. The latest shared version has been loaded.',
    ),
  ).toHaveCount(0)
})
