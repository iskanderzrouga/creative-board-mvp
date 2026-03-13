import { expect, test, type Page } from '@playwright/test'
import { mkdirSync } from 'node:fs'

const STORAGE_KEY = 'creative-board-state'

function ensureArtifactsDir() {
  mkdirSync('artifacts/phase-1', { recursive: true })
}

async function openFreshApp(page: Page) {
  await page.goto('/')
  await page.evaluate((storageKey) => {
    window.localStorage.removeItem(storageKey)
  }, STORAGE_KEY)
  await page.reload()
}

async function setLocalRole(page: Page, mode: 'manager' | 'editor' | 'observer', editorName?: string) {
  await page.getByLabel('Local demo role').selectOption(mode)

  if (mode === 'editor' && editorName) {
    await page.getByLabel('Local demo editor lane').selectOption({ label: editorName })
  }
}

test('manager can create a card and the state survives reload', async ({ page }) => {
  ensureArtifactsDir()

  await openFreshApp(page)

  await expect(page.getByRole('heading', { name: 'Creative Board' })).toBeVisible()
  await expect(page.getByRole('heading', { name: /Backlog/ })).toBeVisible()

  await page.screenshot({
    path: 'artifacts/phase-1/manager-board.png',
    fullPage: true,
  })

  await page.getByRole('button', { name: '+ Add card' }).click()
  await page.getByLabel('Title').fill('Phase 1 smoke test card')
  await page.getByRole('button', { name: 'Create', exact: true }).click()

  await expect(page.getByText('Phase 1 smoke test card')).toBeVisible()

  await page.reload()

  await expect(page.getByText('Phase 1 smoke test card')).toBeVisible()
})

test('observer can access analytics while manager-only settings stay locked down', async ({
  page,
}) => {
  ensureArtifactsDir()

  await openFreshApp(page)
  await setLocalRole(page, 'observer')

  const settingsNav = page.getByRole('button', { name: 'Settings' })
  await expect(settingsNav).toBeDisabled()

  await page.getByRole('button', { name: 'Analytics' }).click()
  await expect(page.getByRole('heading', { name: 'Analytics' })).toBeVisible()

  await page.screenshot({
    path: 'artifacts/phase-1/observer-analytics.png',
    fullPage: true,
  })
})
