import { expect, test, type Page } from '@playwright/test'

const STORAGE_KEY = 'creative-board-state'

async function openFreshApp(page: Page) {
  await page.goto('/')
  await page.evaluate((storageKey) => {
    window.localStorage.removeItem(storageKey)
  }, STORAGE_KEY)
  await page.reload()
}

function getCardButton(page: Page, titlePattern: RegExp) {
  return page.getByRole('button', { name: titlePattern })
}

async function createCardAndOpenDetail(page: Page, title: string) {
  await page.getByRole('button', { name: '+ Add card' }).click()
  await page.getByLabel('Title').fill(title)
  await page.getByRole('button', { name: /Create & Open Detail/ }).click()
  await expect(page.getByLabel('Card title')).toHaveValue(title)
}

async function dragLocatorToTarget(page: Page, source: ReturnType<Page['locator']>, target: ReturnType<Page['locator']>) {
  await source.scrollIntoViewIfNeeded()
  await target.scrollIntoViewIfNeeded()

  const sourceBox = await source.boundingBox()
  const targetBox = await target.boundingBox()
  const viewport = page.viewportSize()

  if (!sourceBox || !targetBox || !viewport) {
    throw new Error('Missing drag source or target box')
  }

  const sourceX = Math.min(sourceBox.x + sourceBox.width / 2, viewport.width - 16)
  const sourceY = Math.min(sourceBox.y + Math.min(sourceBox.height / 2, 32), viewport.height - 16)
  const targetX = Math.min(targetBox.x + targetBox.width / 2, viewport.width - 16)
  const targetY = Math.min(targetBox.y + Math.min(targetBox.height / 2, 48), viewport.height - 16)

  await source.hover()
  await page.mouse.move(sourceX, sourceY)
  await page.mouse.down()
  await page.waitForTimeout(50)
  await page.mouse.move(sourceX + 16, sourceY + 16, { steps: 8 })
  await page.mouse.move(targetX, targetY, { steps: 24 })
  await page.mouse.up()
  await page.waitForTimeout(250)
}

test('role switching keeps manager-only actions locked to managers', async ({ page }) => {
  await openFreshApp(page)

  const sidebarNav = page.locator('.sidebar-nav')
  const settingsNav = sidebarNav.getByRole('button', { name: 'Settings', exact: true })
  const analyticsNav = sidebarNav.getByRole('button', { name: 'Analytics', exact: true })

  await expect(settingsNav).toBeEnabled()
  await expect(page.getByRole('button', { name: '+ Add card' })).toBeVisible()

  await settingsNav.click()
  await expect(page.getByRole('heading', { name: 'Settings' })).toBeVisible()

  await sidebarNav.getByRole('button', { name: 'Board', exact: true }).click()
  await expect(page.getByRole('heading', { name: 'Creative Board' })).toBeVisible()

  await page.getByRole('button', { name: 'Observer role' }).click()
  await expect(settingsNav).toBeDisabled()
  await expect(page.getByRole('button', { name: '+ Add card' })).toHaveCount(0)

  await analyticsNav.click()
  await expect(page.getByRole('heading', { name: 'Analytics' })).toBeVisible()

  await sidebarNav.getByRole('button', { name: 'Board', exact: true }).click()
  await page.getByRole('button', { name: 'Editor role' }).click()
  await page.locator('.sidebar-editor-menu').getByRole('button', { name: 'Daniel T', exact: true }).click()

  await expect(settingsNav).toBeDisabled()
  await expect(analyticsNav).toBeDisabled()
  await expect(page.getByRole('button', { name: '+ Add card' })).toHaveCount(0)
})

test('manager search and brand filters support multi-select and reset', async ({ page }) => {
  await openFreshApp(page)

  const searchInput = page.getByLabel('Search cards')
  const brandFilters = page.locator('.manager-filter-group')

  await searchInput.fill('TC0022')
  await expect(getCardButton(page, /TC0022 LongLasting/)).toBeVisible()
  await expect(getCardButton(page, /PX0009 BW DarkMarks \/ AIFormat/)).toHaveCount(0)

  await page.getByLabel('Clear card search').click()
  await expect(getCardButton(page, /PX0009 BW DarkMarks \/ AIFormat/)).toBeVisible()
  await expect(getCardButton(page, /TC0022 LongLasting/)).toBeVisible()

  await brandFilters.getByRole('button', { name: 'TrueClean', exact: true }).click()
  await expect(getCardButton(page, /TC0022 LongLasting/)).toHaveCount(0)
  await expect(getCardButton(page, /PX0009 BW DarkMarks \/ AIFormat/)).toBeVisible()

  await brandFilters.getByRole('button', { name: 'Pluxy', exact: true }).click()
  await expect(getCardButton(page, /PX0009 BW DarkMarks \/ AIFormat/)).toHaveCount(0)
  await expect(
    getCardButton(page, /VV0044 GLP-1\/MEDS \+ REFLUX \/ Headline\+bullets/),
  ).toBeVisible()

  await brandFilters.getByRole('button', { name: 'TrueClean', exact: true }).click()
  await expect(getCardButton(page, /TC0022 LongLasting/)).toBeVisible()
  await expect(
    getCardButton(page, /VV0044 GLP-1\/MEDS \+ REFLUX \/ Headline\+bullets/),
  ).toBeVisible()

  await page.getByRole('button', { name: 'Reset filters' }).click()
  await expect(getCardButton(page, /PX0009 BW DarkMarks \/ AIFormat/)).toBeVisible()
  await expect(getCardButton(page, /TC0022 LongLasting/)).toBeVisible()
})

test('blocked card filter isolates blocked work and can be reset', async ({ page }) => {
  await openFreshApp(page)

  await createCardAndOpenDetail(page, 'Phase 9 blocked filter card')

  await page.getByPlaceholder('Waiting for raw footage...').fill('Waiting on source footage')
  await page.getByRole('button', { name: 'Save Blocked' }).click()
  await page.getByRole('button', { name: 'Close card detail panel' }).click()

  await page
    .locator('.manager-flag-pills')
    .getByRole('button', { name: 'Blocked', exact: true })
    .click()

  await expect(getCardButton(page, /Phase 9 blocked filter card/)).toBeVisible()
  await expect(getCardButton(page, /TC0022 LongLasting/)).toHaveCount(0)

  await page.getByRole('button', { name: 'Reset filters' }).click()
  await expect(getCardButton(page, /TC0022 LongLasting/)).toBeVisible()
  await expect(getCardButton(page, /Phase 9 blocked filter card/)).toBeVisible()
})

test('editor can update owned card content and move it forward one stage', async ({ page }) => {
  await openFreshApp(page)

  await page.getByRole('button', { name: 'Expand sidebar' }).click()
  await page.locator('.sidebar-role-stack').getByRole('button', { name: 'Editor role' }).click()
  await page.locator('.sidebar-editor-menu').getByRole('button', { name: 'Daniel T', exact: true }).click()
  await expect(page.getByRole('button', { name: '+ Add card' })).toHaveCount(0)

  await page.getByRole('button', { name: /PX0020 PRICE \/ Color/ }).click()
  const titleInput = page.getByLabel('Card title')
  await expect(titleInput).toHaveValue('PX0020 PRICE / Color')
  await titleInput.fill('PX0020 Editor Updated')
  await page.getByRole('button', { name: 'Details' }).click()

  await page.getByPlaceholder('Link label').fill('Editor note')
  await page.getByPlaceholder('https://').fill('https://example.com/editor-note')
  await page.getByRole('button', { name: 'Add link' }).click()
  await expect(page.getByText('Editor note')).toBeVisible()

  await page.getByRole('button', { name: 'Close card detail panel' }).click()
  await expect(page.getByRole('button', { name: /PX0020 Editor Updated/ })).toBeVisible()

  const briefedLane = page.getByRole('group', { name: 'Briefed lane for Daniel T' })
  const inProductionLane = page.getByRole('group', { name: 'In Production lane for Daniel T' })
  await dragLocatorToTarget(
    page,
    briefedLane.getByRole('button', { name: /PX0020 Editor Updated/ }),
    inProductionLane.getByRole('button').first(),
  )

  await expect(page.locator('.toast').filter({ hasText: /→ In Production/ })).toHaveCount(1)
  await expect(inProductionLane.getByRole('button', { name: /PX0020 Editor Updated/ })).toBeVisible()
  await expect(page.getByRole('button', { name: '+ Add card' })).toHaveCount(0)
})

test('observer card detail stays read-only', async ({ page }) => {
  await openFreshApp(page)

  await page.getByRole('button', { name: 'Expand sidebar' }).click()
  await page.locator('.sidebar-role-stack').getByRole('button', { name: 'Observer role' }).click()
  await expect(page.getByRole('button', { name: '+ Add card' })).toHaveCount(0)
  await page.getByRole('button', { name: /PX0020 PRICE \/ Color/ }).click({ force: true })

  await expect(page.getByLabel('Card title')).toHaveCount(0)
  await expect(page.getByRole('button', { name: 'Delete' })).toHaveCount(0)
  await expect(page.getByRole('button', { name: 'Archive', exact: true })).toHaveCount(0)
  await expect(page.getByPlaceholder('Link label')).toHaveCount(0)
  await expect(page.getByPlaceholder('Leave feedback or an update...')).toHaveCount(0)
})
