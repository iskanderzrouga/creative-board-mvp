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

async function openFreshAuthenticatedApp(page: Page) {
  await page.addInitScript(
    ({ storageKey, authModeKey, authEmailKey, remoteStateKey }) => {
      window.localStorage.removeItem(storageKey)
      window.localStorage.removeItem(remoteStateKey)
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

  await page.goto('/')
  await expect(page.getByRole('heading', { name: 'Creative Board' })).toBeVisible()
}

test('settings removes fake webhook test buttons and keeps webhook fields editable', async ({
  page,
}) => {
  await openFreshLocalApp(page)

  await page.locator('.sidebar-nav').getByRole('button', { name: 'Settings', exact: true }).click()
  await expect(page.getByRole('heading', { name: 'Settings' })).toBeVisible()

  const amberWarningInput = page.getByLabel('Amber warning at days')
  await expect(amberWarningInput).toHaveValue('3')
  await amberWarningInput.fill('6')
  await expect(page.getByText('Amber warning must stay lower than the red warning threshold.')).toBeVisible()
  await expect(amberWarningInput).toHaveValue('3')

  await page.getByRole('button', { name: 'Capacity' }).click()
  const redMinInput = page.getByLabel('Red min %')
  await expect(redMinInput).toHaveValue('90')
  await redMinInput.fill('89')
  await expect(
    page.getByText('Utilization thresholds must stay in order: green max < yellow max < red min.'),
  ).toBeVisible()
  await expect(redMinInput).toHaveValue('90')

  await page.getByRole('button', { name: 'Portfolios' }).click()
  await expect(page.getByLabel('BrandLab Drive webhook URL')).toBeVisible()

  await page.getByLabel('BrandLab Drive webhook URL').fill('https://example.com/brandlab-webhook')
  await expect(page.getByLabel('BrandLab Drive webhook URL')).toHaveValue(
    'https://example.com/brandlab-webhook',
  )
  await expect(page.getByRole('button', { name: 'Test Connection' })).toHaveCount(0)

  await page.getByRole('button', { name: 'Integrations' }).click()
  await page.getByLabel('Global Google Drive webhook').fill('https://example.com/global-webhook')
  await expect(page.getByLabel('Global Google Drive webhook')).toHaveValue(
    'https://example.com/global-webhook',
  )
  await expect(page.getByRole('button', { name: 'Test', exact: true })).toHaveCount(0)

  await page.getByRole('button', { name: 'Team & Roles' }).click()
  await expect(page.getByLabel('Naomi role')).toHaveValue('Manager')
  await expect(page.getByLabel('Naomi works Mon')).toBeChecked()
  await expect(page.getByLabel('Naomi timezone')).toHaveValue(/.+/)
})

test('workspace access new entries default to editor and require a linked editor', async ({
  page,
}) => {
  await openFreshAuthenticatedApp(page)

  await page.locator('.sidebar-nav').getByRole('button', { name: 'Settings', exact: true }).click()
  await page.getByRole('button', { name: 'Team & Roles' }).click()

  const newWorkspaceAccessRow = page.locator('.workspace-access-row.is-new')
  const roleSelect = newWorkspaceAccessRow.locator('select').nth(0)
  const editorSelect = newWorkspaceAccessRow.locator('select').nth(1)
  const addButton = newWorkspaceAccessRow.getByRole('button', { name: 'Add' })

  await expect(roleSelect).toHaveValue('editor')

  await newWorkspaceAccessRow.getByPlaceholder('teammate@company.com').fill('editor@example.com')
  await expect(addButton).toBeDisabled()

  await editorSelect.selectOption({ label: 'Daniel T' })
  await expect(addButton).toBeEnabled()

  await addButton.click()
  await expect(page.locator('input[type="email"][value="editor@example.com"]')).toBeVisible()
})
