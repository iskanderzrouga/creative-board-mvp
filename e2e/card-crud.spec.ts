import { expect, test, type Page } from '@playwright/test'

const STORAGE_KEY = 'creative-board-state'

async function openFreshApp(page: Page) {
  await page.goto('/')
  await page.evaluate((storageKey) => {
    window.localStorage.removeItem(storageKey)
  }, STORAGE_KEY)
  await page.reload()
}

async function createCardAndOpenDetail(page: Page, title: string) {
  await page.getByRole('button', { name: '+ Add card' }).click()
  await page.getByLabel('Title').fill(title)
  await page.getByRole('button', { name: /Create & Open Detail/ }).click()
  await expect(page.getByLabel('Card title')).toHaveValue(title)
}

test('manager can edit and delete a card from the detail panel', async ({ page }) => {
  await openFreshApp(page)

  await createCardAndOpenDetail(page, 'Phase 9 CRUD card')

  await page.getByLabel('Card title').fill('Phase 9 CRUD card updated')
  await page.getByRole('button', { name: 'Close card detail panel' }).click()

  await expect(
    page.getByRole('button', { name: /Phase 9 CRUD card updated/ }),
  ).toBeVisible()

  await page.getByRole('button', { name: /Phase 9 CRUD card updated/ }).click()
  await page.getByRole('button', { name: 'Delete' }).click()
  await page.getByRole('button', { name: 'Delete card', exact: true }).click()

  await expect(page.getByText('Phase 9 CRUD card updated')).toHaveCount(0)
})

test('card detail panel paginates older comments and exposes section navigation', async ({
  page,
}) => {
  await openFreshApp(page)

  await createCardAndOpenDetail(page, 'Phase 9 comments card')

  await expect(page.getByRole('button', { name: 'Details' })).toBeVisible()
  await page.getByRole('button', { name: 'Comments', exact: true }).click()

  const commentInput = page.locator('textarea[placeholder="Leave feedback or an update..."]')
  await expect(commentInput).toBeVisible()
  for (let index = 1; index <= 11; index += 1) {
    await commentInput.fill(`Coverage comment ${index}`)
    await page.getByRole('button', { name: 'Post' }).click()
  }

  await expect(page.getByText('Coverage comment 11')).toBeVisible()
  await expect(page.getByRole('button', { name: 'Show older (1)' })).toBeVisible()

  await page.getByRole('button', { name: 'Show older (1)' }).click()
  await expect(page.getByText('Coverage comment 1', { exact: true })).toBeVisible()
  await expect(page.getByRole('button', { name: 'Show recent 10' })).toBeVisible()

  await page.getByRole('button', { name: 'Links' }).click()
  await expect(page.getByText('Frame.io')).toBeVisible()

  await page.getByPlaceholder('Link label').fill('Invalid coverage link')
  await page.getByPlaceholder('https://').fill('javascript:alert(1)')
  await page.getByRole('button', { name: 'Add link' }).click()
  await expect(page.getByText('Enter a full http:// or https:// link before saving.')).toBeVisible()
  await expect(page.getByText('Invalid coverage link')).toHaveCount(0)

  await page.getByPlaceholder('https://').fill('https://example.com/review')
  await page.getByRole('button', { name: 'Add link' }).click()
  await expect(page.getByText('Invalid coverage link')).toBeVisible()
})

test('manager can archive and unarchive a card from the detail panel', async ({ page }) => {
  await openFreshApp(page)

  await createCardAndOpenDetail(page, 'Phase 10 archive card')

  await page.getByRole('button', { name: 'Archive', exact: true }).click()
  await expect(page.getByText('Archived', { exact: true })).toBeVisible()
  await expect(page.getByRole('button', { name: 'Unarchive', exact: true })).toBeVisible()

  await page.getByRole('button', { name: 'Close card detail panel' }).click()
  await expect(page.getByText('Phase 10 archive card')).toHaveCount(0)

  await page.getByLabel('Show archived').check()
  await expect(page.getByRole('button', { name: /Phase 10 archive card/ })).toBeVisible()

  await page.getByRole('button', { name: /Phase 10 archive card/ }).click()
  await page.getByRole('button', { name: 'Unarchive', exact: true }).click()
  await page.getByRole('button', { name: 'Close card detail panel' }).click()

  await page.getByLabel('Show archived').uncheck()
  await page.getByLabel('Show archived').check()
  await expect(page.getByRole('button', { name: /Phase 10 archive card/ })).toBeVisible()
})
