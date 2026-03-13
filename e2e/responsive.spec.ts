import { expect, test, type Page } from '@playwright/test'

const STORAGE_KEY = 'creative-board-state'

test.use({
  viewport: { width: 760, height: 1024 },
})

async function openFreshApp(page: Page) {
  await page.goto('/')
  await page.evaluate((storageKey) => {
    window.localStorage.removeItem(storageKey)
  }, STORAGE_KEY)
  await page.reload()
}

test('tablet layout stacks board columns and keeps detail and settings usable', async ({
  page,
}) => {
  await openFreshApp(page)

  await expect(page.getByRole('heading', { name: 'Creative Board' })).toBeVisible()

  const distinctColumnOffsets = await page.locator('.stage-column').evaluateAll((nodes) =>
    Array.from(
      new Set(
        nodes.map((node) => Math.round((node as HTMLElement).getBoundingClientRect().left)),
      ),
    ).length,
  )
  expect(distinctColumnOffsets).toBe(1)

  await page.getByRole('button', { name: '+ Add card' }).click()
  await page.getByLabel('Title').fill('Tablet responsive card')
  await page.getByRole('button', { name: /Create & Open Detail/ }).click()

  const slidePanelBox = await page.locator('.slide-panel').boundingBox()
  expect(slidePanelBox?.width ?? 0).toBeGreaterThan(740)

  await page.getByRole('button', { name: 'Close card detail panel' }).click()

  await page.locator('.sidebar-nav').getByRole('button', { name: 'Settings', exact: true }).click()
  await expect(page.getByRole('heading', { name: 'Settings' })).toBeVisible()
  await expect(page.getByLabel('Amber warning at days')).toBeVisible()
  await expect(page.getByRole('button', { name: 'People' })).toBeVisible()
  await expect(page.getByRole('button', { name: 'Access' })).toBeVisible()
})
