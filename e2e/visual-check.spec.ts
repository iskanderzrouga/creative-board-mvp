import { expect, test, type Page } from '@playwright/test'
import { mkdirSync } from 'node:fs'

const STORAGE_KEY = 'creative-board-state'
const TEST_AUTH_MODE_KEY = 'editors-board-e2e-auth-mode'
const TEST_AUTH_EMAIL_KEY = 'editors-board-e2e-auth-email'
const TEST_REMOTE_STATE_KEY = 'editors-board-e2e-remote-state'

async function openFreshApp(page: Page) {
  await page.goto('/')
  await page.evaluate(
    ({ storageKey, authModeKey, authEmailKey, remoteStateKey }) => {
      window.localStorage.removeItem(storageKey)
      window.localStorage.setItem(authModeKey, 'disabled')
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

test('visual check: rich editor, subtasks, due dates, card meta chips', async ({ page }) => {
  mkdirSync('artifacts/ui-refresh', { recursive: true })
  await openFreshApp(page)
  await expect(page.getByRole('heading', { name: 'Creative Board' })).toBeVisible()

  await page.getByRole('button', { name: /PX0020 PRICE \/ Color/ }).click()
  const panel = page.locator('.production-detail-panel.is-open')
  await expect(panel).toBeVisible()

  // Due date
  await page.getByRole('button', { name: 'Details' }).click()
  await panel.locator('input[type="date"]').fill('2026-06-12')
  await expect(panel.locator('.due-chip')).toBeVisible()

  // Rich text editor: toolbar + content blocks
  await page.getByRole('button', { name: 'Brief' }).click()
  const editor = panel.locator('.panel-section-brief [contenteditable="true"]').first()
  await editor.click()
  await editor.pressSequentially('Launch plan')
  await panel.getByRole('button', { name: 'Heading 2' }).click()
  await editor.press('End')
  await editor.press('Enter')
  await editor.pressSequentially('- ')
  await editor.pressSequentially('First cut by Friday')
  await expect(editor.locator('h2')).toContainText('Launch plan')
  await expect(editor.locator('ul li').first()).toHaveText('First cut by Friday')

  // To-do block via toolbar
  await editor.press('Enter')
  await editor.press('Enter')
  await panel.getByRole('button', { name: 'To-do list' }).click()
  await editor.pressSequentially('Review color grade')
  await expect(editor.locator('ul[data-checklist="true"] li').last()).toContainText('Review color grade')

  // Slash menu opens
  await editor.press('Enter')
  await editor.press('Enter')
  await panel.getByRole('button', { name: 'Bullet list' }).click()
  await panel.getByRole('button', { name: 'Bullet list' }).click()
  await editor.pressSequentially('/')
  await expect(page.locator('.slash-menu')).toBeVisible()
  await page.screenshot({ path: 'artifacts/ui-refresh/editor-slash-menu.png', fullPage: false })
  await editor.press('Escape')

  // Subtasks
  await page.getByRole('button', { name: 'Subtasks' }).click()
  const subtaskInput = panel.getByLabel('New subtask')
  await subtaskInput.fill('Cut 9:16 version')
  await subtaskInput.press('Enter')
  await subtaskInput.fill('Upload to Frame.io')
  await subtaskInput.press('Enter')
  await expect(panel.locator('.subtask-row')).toHaveCount(2)
  await panel.locator('.subtask-checkbox').first().click()
  await expect(panel.locator('.subtask-progress-count')).toHaveText('1/2 done')
  await panel.locator('.panel-section-subtasks').scrollIntoViewIfNeeded()
  await page.screenshot({ path: 'artifacts/ui-refresh/subtasks-section.png', fullPage: false })

  // Card surface meta chips on the board
  await page.getByRole('button', { name: 'Close card detail panel' }).click()
  const card = page.getByRole('button', { name: /PX0020 PRICE \/ Color/ }).first()
  await expect(card.locator('.card-meta-chip.is-checklist')).toHaveText('1/2')
  await expect(card.locator('.card-meta-chip.is-due')).toBeVisible()
  await card.scrollIntoViewIfNeeded()
  await page.screenshot({ path: 'artifacts/ui-refresh/board-card-chips.png', fullPage: false })

  // State survives reload
  await page.reload()
  await expect(page.getByRole('heading', { name: 'Creative Board' })).toBeVisible()
  const reloadedCard = page.getByRole('button', { name: /PX0020 PRICE \/ Color/ }).first()
  await expect(reloadedCard.locator('.card-meta-chip.is-checklist')).toHaveText('1/2')
})
