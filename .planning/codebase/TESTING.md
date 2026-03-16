# Testing Guide

## Overview

The project uses a two-tier testing strategy:

1. **Unit Tests**: Using Vitest for testing core business logic
2. **End-to-End (E2E) Tests**: Using Playwright for comprehensive user flow testing

## Test Frameworks & Dependencies

### Unit Testing: Vitest

**Configuration**: `vitest.config.ts`

```typescript
export default defineConfig({
  test: {
    environment: 'node',
    include: ['src/**/*.test.ts'],
    coverage: {
      provider: 'v8',
      reporter: ['text', 'lcov'],
      reportsDirectory: './coverage',
      include: ['src/board.ts'],
    },
  },
})
```

**Key settings**:
- **Environment**: Node.js (no DOM needed for unit tests)
- **File pattern**: `**/*.test.ts`
- **Coverage provider**: V8 (built into Node.js)
- **Coverage scope**: Focused on `src/board.ts` (core business logic)
- **Reporters**: Text output and LCOV format (for CI/CD integration)

### E2E Testing: Playwright

**Configuration**: `playwright.config.ts`

```typescript
const browserProjects = [
  { name: 'chromium', use: { ...devices['Desktop Chrome'] } },
  { name: 'firefox', use: { ...devices['Desktop Firefox'] } },
  { name: 'webkit', use: { ...devices['Desktop Safari'] } },
]

export default defineConfig({
  testDir: './e2e',
  fullyParallel: true,
  retries: process.env.CI ? 1 : 0,
  workers: process.env.CI ? 3 : 1,
  reporter: [['list'], ['html', { open: 'never' }]],
  use: {
    baseURL: 'http://127.0.0.1:4273',
    trace: 'retain-on-failure',
    video: 'retain-on-failure',
  },
  projects: process.env.CI ? [...browserProjects] : [browserProjects[0]],
  webServer: {
    command: 'npm run dev -- --host 127.0.0.1 --port 4273',
    url: 'http://127.0.0.1:4273',
    reuseExistingServer: true,
    timeout: 120_000,
  },
})
```

**Key settings**:
- **Test directory**: `e2e/`
- **Parallel execution**: Fully parallel in CI; serial locally
- **Retries**: 1 retry in CI, 0 locally
- **Workers**: 3 in CI (for faster execution), 1 locally
- **Browsers**: All 3 (Chromium, Firefox, WebKit) in CI; Chromium only locally
- **Tracing & Video**: Retained on failure for debugging
- **Dev server**: Auto-starts Vite on `127.0.0.1:4273` with port 4273

## Test File Structure & Organization

### Unit Test Files

Located in `src/` directory, adjacent to implementation:

- `src/board.test.ts` - Tests for board state management (33,680 bytes)
- `src/remoteAppState.test.ts` - Tests for remote sync logic (5,124 bytes)

**Total unit test lines**: ~450 lines across 2 files

### E2E Test Files

Located in `e2e/` directory with `.spec.ts` extension:

```
e2e/
├── smoke.spec.ts                  (Smoke tests - basic functionality)
├── card-crud.spec.ts              (Card CRUD operations)
├── drag-drop.spec.ts              (Drag-and-drop interactions)
├── access-recovery.spec.ts        (Access recovery flows)
├── auth-sync.spec.ts              (Authentication and sync)
├── roles-filters.spec.ts          (Role-based filtering)
├── loading-signout.spec.ts        (Loading and logout states)
├── responsive.spec.ts             (Responsive design testing)
├── settings.spec.ts               (Settings page functionality)
├── toasts.spec.ts                 (Toast notifications)
├── people.spec.ts                 (People/team management)
└── shortcuts.spec.ts              (Keyboard shortcuts)
```

**Total E2E test specs**: 12 files

## Unit Test Patterns

### Test Framework

File: `src/board.test.ts`

**Imports**:
```typescript
import { describe, expect, it } from 'vitest'

import {
  addCardToPortfolio,
  applyCardUpdates,
  // ... other test subjects
  type ViewerContext,
} from './board'
```

**Pattern**: Direct named imports from Vitest with no wrapper or configuration setup

### Test Structure

#### 1. Test Fixtures & Constants

Global test fixtures are defined at the top:

```typescript
const MANAGER_VIEWER: ViewerContext = {
  mode: 'manager',
  editorName: null,
  memberRole: 'Manager',
  visibleBrandNames: null,
}

const VIEWER_ACCESS: ViewerContext = {
  mode: 'viewer',
  editorName: null,
  memberRole: null,
  visibleBrandNames: null,
}
```

**Pattern**:
- Named constants for reusable test data
- Full type specification (not inline)
- Descriptive names indicating test role/context

#### 2. Test Organization with `describe`

Tests are organized by functionality:

```typescript
describe('board integrity helpers', () => {
  it('keeps cards linked when a brand name changes', () => {
    // test implementation
  })

  it('keeps card ownership linked when a team member name changes', () => {
    // test implementation
  })
})
```

**Pattern**:
- One `describe` block per logical feature area
- Test names are complete sentences describing behavior
- Multiple `it` blocks within each describe

#### 3. Test Execution Pattern

Standard AAA (Arrange-Act-Assert) pattern:

```typescript
it('blocks deleting a brand that is still linked to cards', () => {
  // Arrange
  const portfolio = createSeedState().portfolios[0]

  // Act & Assert
  expect(getBrandRemovalBlocker(portfolio, 0)).toContain('Reassign those cards first.')
  expect(removeBrandFromPortfolio(portfolio, 0)).toBe(portfolio)
})
```

**Key observations**:
- Tests use seed data generators (`createSeedState()`)
- Multiple assertions in single test allowed
- No test setup/teardown hooks in unit tests
- Assertions are chained inline

### Unit Test Examples

#### Example 1: Integrity Test
```typescript
it('keeps cards linked when a brand name changes', () => {
  const portfolio = createSeedState().portfolios[0]
  const targetCard = portfolio.cards.find((card) => card.brand === portfolio.brands[0]?.name)

  expect(targetCard).toBeTruthy()

  const renamedPortfolio = renameBrandInPortfolio(portfolio, 0, 'Pluxy Prime')

  expect(renamedPortfolio.brands[0]?.name).toBe('Pluxy Prime')
  expect(
    renamedPortfolio.cards.find((card) => card.id === targetCard?.id)?.brand,
  ).toBe('Pluxy Prime')
  expect(portfolio.brands[0]?.name).toBe('Pluxy')
})
```

**Pattern**:
- Creates seed data
- Finds specific test entity
- Applies transformation
- Verifies all related entities updated correctly
- Verifies original object not mutated (immutability test)

#### Example 2: Validation Test
```typescript
it('does not allow grouped-stage cards to become unassigned through direct updates', () => {
  const portfolio = createSeedState().portfolios[0]
  const targetCard = portfolio.cards.find(
    (card) =>
      card.owner !== null &&
      (card.stage === 'Briefed' ||
        card.stage === 'In Production' ||
        card.stage === 'Review'),
  )

  expect(targetCard).toBeTruthy()

  const updatedPortfolio = applyCardUpdates(
    portfolio,
    createSeedState().settings,
    targetCard!.id,
    { owner: null },
    'Naomi',
    '2026-03-11T12:00:00Z',
    MANAGER_VIEWER,
  )

  expect(
    updatedPortfolio.cards.find((card) => card.id === targetCard!.id)?.owner,
  ).toBe(targetCard!.owner)
})
```

**Pattern**:
- Tests business rule enforcement
- Attempts invalid operation
- Verifies operation was prevented

#### Example 3: Immutability Test
```typescript
it('reassigns active and default portfolio ids when a portfolio is removed', () => {
  const state = createSeedState()
  // ... create modified state ...

  const reducedState = removePortfolioFromAppState(nextState, secondPortfolio.id)

  expect(reducedState.portfolios).toHaveLength(1)
  expect(reducedState.activePortfolioId).toBe(state.portfolios[0]?.id)
  expect(reducedState.settings.general.defaultPortfolioId).toBe(state.portfolios[0]?.id)
})
```

**Pattern**:
- Verifies cascading updates when removing entities
- Tests state consistency after operations

### Seed Data & Fixtures

File: `src/board.ts` exports data generators

```typescript
// Example from board.ts
export function createSeedState(): AppState {
  // Returns a complete, pre-populated AppState
}

export function createEmptyPortfolio(name: string, index: number): Portfolio {
  // Returns empty portfolio with defaults
}

export function createFreshStartState(state: AppState): AppState {
  // Clears cards/team but keeps brands/products
}
```

**Pattern**:
- Factory functions for test data
- Seed data includes realistic board state
- Empty/fresh states available for specific test scenarios

### Mocking & LocalStorage

File: `src/remoteAppState.test.ts`

```typescript
function createLocalStorageMock() {
  const store = new Map<string, string>()

  return {
    get length() {
      return store.size
    },
    getItem(key: string) {
      return store.has(key) ? store.get(key)! : null
    },
    key(index: number) {
      return Array.from(store.keys())[index] ?? null
    },
    setItem(key: string, value: string) {
      store.set(key, value)
    },
    removeItem(key: string) {
      store.delete(key)
    },
    clear() {
      store.clear()
    },
  }
}
```

**Setup/Teardown pattern**:
```typescript
beforeEach(() => {
  Object.defineProperty(globalThis, 'window', {
    value: {
      localStorage: createLocalStorageMock(),
    },
    configurable: true,
    writable: true,
  })
  window.localStorage.setItem(E2E_AUTH_MODE_KEY, 'enabled')
})

afterEach(() => {
  Reflect.deleteProperty(globalThis, 'window')
})
```

**Pattern**:
- `beforeEach` sets up clean localStorage mock
- `afterEach` cleans up global window object
- Hooks are used only when needed (not universally)

### Remote State Testing

Testing conflict detection and sync behavior:

```typescript
it('throws a conflict error when the stored remote timestamp has moved on', async () => {
  const seed = createSeedState()
  const firstLoad = await loadOrCreateRemoteAppState(seed)
  const originalUpdatedAt = firstLoad.lastSyncedAt

  // Simulate other session update
  window.localStorage.setItem(
    E2E_REMOTE_STATE_KEY,
    JSON.stringify({
      state: otherSessionState,
      updatedAt: '2099-01-01T00:00:00.000Z',
    }),
  )

  try {
    await saveRemoteAppState(
      { ...seed, activePage: 'analytics' as const },
      originalUpdatedAt,
    )
  } catch (error) {
    expect(error).toBeInstanceOf(RemoteStateConflictError)
    expect((error as RemoteStateConflictError).latestState.settings.general.appName).toBe(
      'Other session change',
    )
    return
  }

  throw new Error('Expected a remote state conflict error.')
})
```

**Pattern**:
- Async test functions for promise-based code
- Error assertions using `expect(...).toBeInstanceOf()`
- Exception handling tested explicitly
- Manual throw if error not caught (fail-safe)

## E2E Test Patterns

### Test Structure

File: `e2e/smoke.spec.ts`

**Imports**:
```typescript
import { expect, test, type Page } from '@playwright/test'
import { mkdirSync } from 'node:fs'
```

**Pattern**:
- Named imports from `@playwright/test`
- Page type imported for function signatures

### Global Test Setup Helpers

Reusable functions for test initialization:

```typescript
const STORAGE_KEY = 'creative-board-state'
const TEST_AUTH_MODE_KEY = 'editors-board-e2e-auth-mode'
const TEST_AUTH_EMAIL_KEY = 'editors-board-e2e-auth-email'
const TEST_REMOTE_STATE_KEY = 'editors-board-e2e-remote-state'

function ensureArtifactsDir() {
  mkdirSync('artifacts/phase-1', { recursive: true })
}

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

async function setLocalRole(
  page: Page,
  mode: 'owner' | 'manager' | 'contributor' | 'viewer',
  editorName?: string,
) {
  await page.getByLabel('Local demo role').selectOption(mode)

  if (mode === 'contributor' && editorName) {
    await page.getByLabel('Local demo contributor identity').selectOption({ label: editorName })
  }
}
```

**Pattern**:
- Top-level helper functions for test setup
- Storage clearing for fresh state
- Role selection helpers for different test scenarios
- Artifact directory creation for screenshots

### Test Example 1: Basic Smoke Test

```typescript
test('owner can create a card and the state survives reload', async ({ page }) => {
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

  await expect(page.getByRole('button', { name: /Phase 1 smoke test card/ })).toBeVisible()

  await page.reload()

  await expect(page.getByRole('button', { name: /Phase 1 smoke test card/ })).toBeVisible()
})
```

**Pattern**:
- Setup with `openFreshApp()`
- Visual assertions with `getByRole()` or `getByLabel()`
- Screenshot capture for manual review
- User interactions: click, fill, reload
- Post-action assertions

### Test Example 2: Role-Based Access Test

```typescript
test('viewer can access analytics while owner-only settings stay locked down', async ({
  page,
}) => {
  ensureArtifactsDir()

  await openFreshApp(page)
  await setLocalRole(page, 'viewer')

  const settingsNav = page.getByRole('button', { name: 'Settings' })
  await expect(settingsNav).toBeDisabled()

  await page.getByRole('button', { name: 'Analytics' }).click()
  await expect(page.getByRole('heading', { name: 'Analytics' })).toBeVisible()

  await page.screenshot({
    path: 'artifacts/phase-1/viewer-analytics.png',
    fullPage: true,
  })
})
```

**Pattern**:
- Role setup before assertions
- Testing both disabled state and allowed access
- Screenshot for documentation

### Test Example 3: Complex Form Interaction

From `e2e/card-crud.spec.ts`:

```typescript
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
```

**Pattern**:
- Extracted helper function `createCardAndOpenDetail()`
- Sequential user interactions
- Form field updates with `fill()`
- Modal/dialog interaction
- Final state verification

### E2E Test: Comments & Pagination

Complex interaction test:

```typescript
test('card detail panel paginates older comments and exposes section navigation', async ({
  page,
}) => {
  await openFreshApp(page)

  await createCardAndOpenDetail(page, 'Phase 9 comments card')

  await expect(page.getByRole('button', { name: 'Details' })).toBeVisible()
  await page.getByRole('button', { name: 'Comments', exact: true }).click()

  const commentInput = page.locator('textarea[placeholder="Leave feedback or an update..."]')
  await expect(commentInput).toBeVisible()

  // Add multiple comments
  for (let index = 1; index <= 11; index += 1) {
    await commentInput.fill(`Coverage comment ${index}`)
    await page.getByRole('button', { name: 'Post' }).click()
  }

  // Test pagination
  await expect(page.getByText('Coverage comment 11')).toBeVisible()
  await expect(page.getByRole('button', { name: 'Show older (1)' })).toBeVisible()

  await page.getByRole('button', { name: 'Show older (1)' }).click()
  await expect(page.getByText('Coverage comment 1', { exact: true })).toBeVisible()

  // Tab navigation
  await page.getByRole('button', { name: 'Links' }).click()
  await expect(page.getByText('Frame.io')).toBeVisible()

  // Form validation
  const addLinkForm = page.locator('.add-link-form')
  await addLinkForm.getByPlaceholder('Link label').fill('Invalid coverage link')
  await addLinkForm.getByPlaceholder('https://').fill('javascript:alert(1)')
  await page.getByRole('button', { name: 'Add link' }).click()
  await expect(page.getByText('Enter a full http:// or https:// link before saving.')).toBeVisible()
  await expect(page.getByText('Invalid coverage link')).toHaveCount(0)
})
```

**Pattern**:
- Loop for repeated interactions
- Pagination testing with specific button names
- Tab/section navigation
- Form validation error messages
- XSS protection validation (javascript: URL rejection)

## Playwright Query Selectors Used

Consistent selectors across tests:

1. **`getByRole()`** - Preferred for accessibility
   ```typescript
   page.getByRole('button', { name: 'Create' })
   page.getByRole('heading', { name: 'Analytics' })
   page.getByRole('button', { name: /Phase 1 smoke test card/ })
   ```

2. **`getByLabel()`** - For form inputs
   ```typescript
   page.getByLabel('Title')
   page.getByLabel('Local demo role')
   ```

3. **`getByText()`** - For text content
   ```typescript
   page.getByText('Phase 9 CRUD card updated')
   ```

4. **`locator()`** - For CSS selectors when needed
   ```typescript
   page.locator('textarea[placeholder="Leave feedback..."]')
   page.locator('.add-link-form')
   ```

## Coverage Configuration

From `vitest.config.ts`:

```typescript
coverage: {
  provider: 'v8',
  reporter: ['text', 'lcov'],
  reportsDirectory: './coverage',
  include: ['src/board.ts'],
}
```

**Pattern**:
- Coverage limited to `src/board.ts` (core business logic)
- Text reporter for console output
- LCOV format for CI integration (coverage reports)
- Reports generated in `./coverage/` directory

## NPM Scripts for Testing

From `package.json`:

```json
{
  "test": "npm run test:unit && npm run test:e2e",
  "test:unit": "vitest run",
  "test:unit:coverage": "vitest run --coverage",
  "test:e2e": "playwright test"
}
```

**Usage**:
- `npm test` - Run all tests (unit + E2E)
- `npm run test:unit` - Run only unit tests
- `npm run test:unit:coverage` - Unit tests with coverage report
- `npm run test:e2e` - Run only E2E tests

## Test-Related Configuration Files

### Playwright Config Path
`/Users/iskanderzrouga/Desktop/Editors Board/playwright.config.ts`

### Vitest Config Path
`/Users/iskanderzrouga/Desktop/Editors Board/vitest.config.ts`

### Test Artifacts
- Screenshots: `artifacts/phase-1/` and `artifacts/phase-2/`
- HTML reports: Auto-generated by Playwright (not committed)
- Coverage reports: `coverage/` directory

## CI/CD Integration

Playwright CI behavior (from config):

```typescript
export default defineConfig({
  retries: process.env.CI ? 1 : 0,
  workers: process.env.CI ? 3 : 1,
  projects: process.env.CI ? [...browserProjects] : [browserProjects[0]],
})
```

**CI Mode**:
- Runs all 3 browsers
- Uses 3 parallel workers
- Auto-retries failed tests once
- Captures traces and videos on failure

**Local Mode**:
- Chromium only
- Single worker
- No retries
- Traces and videos retained on failure

## Testing Checklist

Key areas covered by tests:

### Unit Tests (`src/board.test.ts`)
- [ ] Brand rename preserves card links
- [ ] Team member rename preserves ownership
- [ ] Portfolio removal updates active/default IDs
- [ ] Fresh start clears cards/team but keeps brands
- [ ] Grouped-stage cards stay assigned
- [ ] Product stays valid when brand changes
- [ ] Brand removal blocked when linked to cards
- [ ] Team member removal blocked when owns cards
- [ ] Last manager removal blocked
- [ ] Visibility filtering by role

### E2E Tests (12 spec files)
- [ ] Smoke: Basic card creation and persistence
- [ ] Auth: Login/logout flows
- [ ] CRUD: Card creation, edit, delete
- [ ] Drag-drop: Board reorganization
- [ ] Roles: Access control by role
- [ ] Filtering: Search and filter operations
- [ ] Responsive: Mobile/tablet layouts
- [ ] Settings: Configuration updates
- [ ] Notifications: Toast messages
- [ ] People: Team management
- [ ] Shortcuts: Keyboard navigation
- [ ] Access Recovery: Permission restoration

## Key Testing Insights

1. **No global test runner config**: Tests use direct imports, minimal setup
2. **Seed data pattern**: Factories create consistent test data
3. **Immutability assertions**: Tests verify original state unchanged
4. **E2E accessibility focus**: Queries prefer semantic selectors (getByRole, getByLabel)
5. **Screenshot artifacts**: Manual review support for complex UI tests
6. **CI/CD aware**: Configuration adapts to CI environment automatically
7. **LocalStorage mocking**: Isolates tests from browser state
8. **Conflict detection**: Tests verify multi-session state consistency
