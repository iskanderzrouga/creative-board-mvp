import { expect, test, type Page } from '@playwright/test'

const STORAGE_KEY = 'creative-board-state'
const TEST_AUTH_MODE_KEY = 'editors-board-e2e-auth-mode'
const TEST_AUTH_EMAIL_KEY = 'editors-board-e2e-auth-email'
const TEST_REMOTE_STATE_KEY = 'editors-board-e2e-remote-state'

async function openFreshAuthenticatedPeopleSettings(page: Page) {
  await page.goto('/')
  await page.evaluate(
    ({ storageKey, authModeKey, authEmailKey, remoteStateKey }) => {
      window.localStorage.removeItem(storageKey)
      window.localStorage.removeItem(remoteStateKey)
      window.localStorage.removeItem('creative-board-sync-metadata')
      window.localStorage.setItem(authModeKey, 'enabled')
      window.localStorage.setItem(authEmailKey, 'team@example.com')
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
  await page.locator('.sidebar-nav').getByRole('button', { name: 'Settings', exact: true }).click()
  await page.getByRole('button', { name: 'People', exact: true }).click()
  await expect(page.getByRole('heading', { name: 'People' })).toBeVisible()
}

async function openPersonDrawer(page: Page, personName: string) {
  const row = page.locator('.people-table-row').filter({ hasText: personName })
  await row.getByRole('button', { name: 'Edit' }).click()
  await expect(page.locator('.slide-panel.is-open').getByRole('heading', { name: 'Edit person' })).toBeVisible()
  return page.locator('.slide-panel.is-open')
}

test('team-only people can be edited without an email and are not stuck pending', async ({ page }) => {
  await openFreshAuthenticatedPeopleSettings(page)

  const drawer = await openPersonDrawer(page, 'Naomi')
  await expect(drawer.getByRole('button', { name: 'Remove person' })).toBeVisible()
  await expect(drawer.getByRole('button', { name: 'Save changes' })).toBeEnabled()

  await drawer.getByLabel('Name').fill('Naomi QA')
  await drawer.getByRole('button', { name: 'Save changes' }).click()

  await expect(page.locator('.people-table-row').filter({ hasText: 'Naomi QA' })).toBeVisible()
  await expect(page.locator('.people-table-row').filter({ hasText: 'Naomi QA' })).toContainText('—')
})

test('removing Naomi persists across reloads', async ({ page }) => {
  await openFreshAuthenticatedPeopleSettings(page)

  const drawer = await openPersonDrawer(page, 'Naomi')
  await drawer.getByRole('button', { name: 'Remove person' }).click()
  await drawer.getByRole('button', { name: 'Remove', exact: true }).click()

  await expect(page.locator('.people-table-row').filter({ hasText: 'Naomi' })).toHaveCount(0)

  await page.reload()
  await expect(page.getByRole('button', { name: 'General', exact: true })).toBeVisible()
  await page.locator('.sidebar-nav').getByRole('button', { name: 'Settings', exact: true }).click()
  await page.getByRole('button', { name: 'People', exact: true }).click()
  await expect(page.getByRole('heading', { name: 'People' })).toBeVisible()
  await expect(page.locator('.people-table-row').filter({ hasText: 'Naomi' })).toHaveCount(0)
})

test('clearing an existing email removes login access but keeps the team profile', async ({ page }) => {
  await openFreshAuthenticatedPeopleSettings(page)

  await page.getByRole('button', { name: 'Add person' }).click()

  let drawer = page.locator('.slide-panel.is-open')
  await drawer.getByLabel('Name').fill('Access Toggle Editor')
  await drawer.getByRole('button', { name: 'Add person' }).click()

  drawer = await openPersonDrawer(page, 'Access Toggle Editor')
  await drawer.getByLabel('Can sign in').check()
  await drawer.getByLabel('Access level').selectOption('contributor')
  await drawer.getByLabel('Email').fill('naomi@example.com')
  await drawer.getByRole('button', { name: 'Save changes' }).click()

  await expect(
    page.getByText('Added naomi@example.com to login access and sent a setup email'),
  ).toBeVisible()
  const accessToggleRow = page.locator('.people-table-row').filter({ hasText: 'Access Toggle Editor' })
  await expect(accessToggleRow).toContainText('naomi@example.com')

  drawer = await openPersonDrawer(page, 'Access Toggle Editor')
  await drawer.getByLabel('Email').fill('')
  await drawer.getByRole('button', { name: 'Save changes' }).click()

  await expect(accessToggleRow).not.toContainText('naomi@example.com')
  await expect(accessToggleRow).toContainText('Access Toggle Editor')
  await expect(accessToggleRow).toContainText('—')
})

test('people can be added without sign-in access', async ({ page }) => {
  await openFreshAuthenticatedPeopleSettings(page)

  await page.getByRole('button', { name: 'Add person' }).click()

  const drawer = page.locator('.slide-panel.is-open')
  await drawer.getByLabel('Name').fill('Board Only Editor')
  await expect(drawer.getByRole('button', { name: 'Add person' })).toBeEnabled()
  await drawer.getByRole('button', { name: 'Add person' }).click()

  const newRow = page.locator('.people-table-row').filter({ hasText: 'Board Only Editor' })
  await expect(newRow).toBeVisible()
  await expect(newRow).toContainText('Editor')
  await expect(newRow).toContainText('—')
})
