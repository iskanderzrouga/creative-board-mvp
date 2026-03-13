import { expect, test, type Page } from '@playwright/test'
import { writeFileSync } from 'node:fs'

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

  await page.getByRole('button', { name: 'Structure' }).click()
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

  await page.getByRole('button', { name: 'People' }).click()
  await expect(page.getByLabel('Naomi role')).toHaveValue('Manager')
  await expect(page.getByLabel('Naomi works Mon')).toBeChecked()
  await expect(page.getByLabel('Naomi timezone')).toHaveValue(/.+/)
})

test('workspace access new entries default to manager and contributors require Works as', async ({
  page,
}) => {
  await openFreshAuthenticatedApp(page)

  await page.locator('.sidebar-nav').getByRole('button', { name: 'Settings', exact: true }).click()
  await page.getByRole('button', { name: 'Access' }).click()

  const newWorkspaceAccessCard = page.locator('.workspace-access-card').last()
  const roleSelect = newWorkspaceAccessCard.getByLabel(/^Access level for /)
  const emailInput = newWorkspaceAccessCard.getByLabel('Work email')
  const addButton = newWorkspaceAccessCard.getByRole('button', { name: 'Add access' })

  await expect(roleSelect).toHaveValue('manager')
  await expect(addButton).toBeDisabled()

  await emailInput.fill('contributor@example.com')
  await expect(addButton).toBeDisabled()

  await roleSelect.selectOption('contributor')
  await expect(addButton).toBeDisabled()

  await newWorkspaceAccessCard.getByLabel('Works as for contributor@example.com').selectOption({
    label: 'Daniel T',
  })
  await expect(addButton).toBeEnabled()

  await addButton.click()
  await expect(page.locator('.workspace-access-card').filter({ hasText: 'contributor@example.com' })).toBeVisible()
})

test('settings can add and remove brands and team members', async ({ page }) => {
  await openFreshLocalApp(page)

  await page.locator('.sidebar-nav').getByRole('button', { name: 'Settings', exact: true }).click()
  await expect(page.getByRole('heading', { name: 'Settings' })).toBeVisible()

  await page.getByRole('button', { name: 'Structure' }).click()
  await page.getByRole('button', { name: '+ Add Brand' }).click()

  const newBrandRow = page.locator('.brand-row').last()
  await newBrandRow.locator('input').nth(0).fill('Plan Coverage Brand')
  await newBrandRow.locator('input').nth(1).fill('PC')
  await newBrandRow.locator('input').nth(2).fill('Coverage Product')

  await page.locator('.sidebar-nav').getByRole('button', { name: 'Board', exact: true }).click()
  await expect(page.getByRole('button', { name: 'Plan Coverage Brand', exact: true })).toBeVisible()

  await page.locator('.sidebar-nav').getByRole('button', { name: 'Settings', exact: true }).click()
  await page.getByRole('button', { name: 'Structure' }).click()
  const savedBrandRow = page.locator('.brand-row').filter({
    has: page.locator('input[value="Plan Coverage Brand"]'),
  })
  await savedBrandRow.getByRole('button', { name: 'Delete' }).click()
  await page.getByRole('button', { name: 'Delete brand' }).click()

  await page.locator('.sidebar-nav').getByRole('button', { name: 'Board', exact: true }).click()
  await expect(page.getByRole('button', { name: 'Plan Coverage Brand', exact: true })).toHaveCount(0)

  await page.locator('.sidebar-nav').getByRole('button', { name: 'Settings', exact: true }).click()
  await page.getByRole('button', { name: 'People' }).click()
  await page.getByRole('button', { name: '+ Add teammate profile' }).click()

  const newMemberRow = page.locator('.team-row').last()
  await newMemberRow.locator('input').nth(0).fill('Plan Coverage Editor')
  await expect(newMemberRow.locator('select').nth(0)).toHaveValue('Editor')

  await page.locator('.sidebar-nav').getByRole('button', { name: 'Board', exact: true }).click()
  await expect(page.getByRole('button', { name: 'Plan Coverage Editor', exact: true })).toBeVisible()

  await page.locator('.sidebar-nav').getByRole('button', { name: 'Settings', exact: true }).click()
  await page.getByRole('button', { name: 'People' }).click()
  const savedMemberRow = page.locator('.team-row').filter({
    has: page.locator('input[aria-label="Plan Coverage Editor team member name"]'),
  })
  await savedMemberRow.getByRole('button', { name: 'Delete' }).click()
  await page.getByRole('button', { name: 'Delete member' }).click()

  await page.locator('.sidebar-nav').getByRole('button', { name: 'Board', exact: true }).click()
  await expect(page.getByRole('button', { name: 'Plan Coverage Editor', exact: true })).toHaveCount(0)
})

test('data export and import round-trip restores saved board state', async ({ page }, testInfo) => {
  await openFreshLocalApp(page)

  await page.locator('.sidebar-nav').getByRole('button', { name: 'Settings', exact: true }).click()
  await page.getByRole('button', { name: 'Structure' }).click()
  await page.getByRole('button', { name: '+ Add Brand' }).click()

  const brandRow = page.locator('.brand-row').last()
  await brandRow.locator('input').nth(0).fill('Roundtrip Brand')
  await brandRow.locator('input').nth(1).fill('RT')

  await page.getByRole('button', { name: 'Data & Admin' }).click()
  const downloadPromise = page.waitForEvent('download')
  await page.getByRole('button', { name: 'Export board data' }).click()
  const download = await downloadPromise
  const exportPath = testInfo.outputPath('creative-board-data.json')
  await download.saveAs(exportPath)

  await page.getByRole('button', { name: 'Structure' }).click()
  const roundtripRow = page.locator('.brand-row').filter({
    has: page.locator('input[value="Roundtrip Brand"]'),
  })
  await roundtripRow.getByRole('button', { name: 'Delete' }).click()
  await page.getByRole('button', { name: 'Delete brand' }).click()

  await page.locator('.sidebar-nav').getByRole('button', { name: 'Board', exact: true }).click()
  await expect(page.getByRole('button', { name: 'Roundtrip Brand', exact: true })).toHaveCount(0)

  await page.locator('.sidebar-nav').getByRole('button', { name: 'Settings', exact: true }).click()
  await page.getByRole('button', { name: 'Data & Admin' }).click()
  await expect(page.locator('input[type="file"]')).toHaveCount(1)
  await page.waitForTimeout(100)
  await page.locator('input[type="file"]').setInputFiles(exportPath)

  await page.locator('.sidebar-nav').getByRole('button', { name: 'Board', exact: true }).click()
  await expect(page.getByRole('button', { name: 'Roundtrip Brand', exact: true })).toBeVisible()
})

test('importing corrupt JSON shows an error and keeps the current board state', async ({
  page,
}, testInfo) => {
  await openFreshLocalApp(page)

  await expect(page.getByRole('button', { name: /TC0022 LongLasting/ })).toBeVisible()

  const invalidImportPath = testInfo.outputPath('corrupt-board-export.json')
  writeFileSync(invalidImportPath, '{"portfolios": [', 'utf8')

  await page.locator('.sidebar-nav').getByRole('button', { name: 'Settings', exact: true }).click()
  await page.getByRole('button', { name: 'Data & Admin' }).click()
  await expect(page.locator('input[type="file"]')).toHaveCount(1)
  await page.waitForTimeout(100)
  await page.locator('input[type="file"]').setInputFiles(invalidImportPath)

  await expect(
    page.locator('.toast').filter({ hasText: 'Import failed. Please use a valid export file.' }),
  ).toHaveCount(1)

  await page.locator('.sidebar-nav').getByRole('button', { name: 'Board', exact: true }).click()
  await expect(page.getByRole('button', { name: /TC0022 LongLasting/ })).toBeVisible()
})
