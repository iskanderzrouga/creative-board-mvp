# Codebase Conventions

## Code Style & Formatting

### General Formatting
- **Indentation**: 2 spaces (inferred from codebase files)
- **Line width**: No explicit limit enforced, but most lines stay under 100-120 characters
- **Trailing semicolons**: Required in TypeScript/JavaScript files
- **Trailing commas**: Used in multi-line objects, arrays, and imports
- **String quotes**: Single quotes for strings (standard in config files and code)

### ESLint Configuration
Configuration file: `eslint.config.js`
- Uses ES Lint with TypeScript support (`@eslint/js`, `typescript-eslint`)
- React hooks linting enabled (`eslint-plugin-react-hooks`)
- React refresh linting enabled (`eslint-plugin-react-refresh`)
- Global ignores: `dist`, `coverage`, `playwright-report`, `test-results`, `artifacts`
- ECMAScript version: 2020

## TypeScript Configuration

File: `tsconfig.app.json`

### Compiler Options
- **Target**: ES2022
- **Module**: ESNext
- **Module Resolution**: bundler
- **Strict Mode**: Fully enabled
  - `strict: true`
  - `noUnusedLocals: true` (enforced)
  - `noUnusedParameters: true` (enforced)
  - `noFallthroughCasesInSwitch: true`
  - `noUncheckedSideEffectImports: true`
  - `erasableSyntaxOnly: true`
- **JSX**: React 19 with `react-jsx` transform
- **Module Detection**: `force` (treats all files as modules)
- **Type Checking**: `skipLibCheck: true` (skips type checking of declaration files)

## Import Ordering Conventions

### Pattern Observed
1. **External dependencies** (first group, alphabetically ordered)
   - React imports
   - Third-party libraries (@dnd-kit, @supabase, etc.)
   - Node.js utilities (type imports)

2. **Relative imports** (second group)
   - Import from parent directories (`../`)
   - Type imports from same package

3. **CSS imports** (last)
   - Stylesheet imports appear after component/utility imports

### Example from codebase:
```typescript
// External dependencies
import { useEffect, useMemo, useRef, useState } from 'react'
import {
  DndContext,
  PointerSensor,
  closestCorners,
  useSensor,
  useSensors,
  type DragEndEvent,
  type DragOverEvent,
  type DragStartEvent,
} from '@dnd-kit/core'

// CSS imports
import './App.css'

// Relative imports - helpers
import {
  canEditorDragStage,
  copyToClipboard,
  // ...
} from './appHelpers'

// Relative imports - Supabase and board state
import { getScopedPortfolios } from './accessHelpers'
import { isSupabaseConfigured } from './supabase'
```

**Type imports** are bundled with regular imports, often using the `type` keyword for type-only imports.

## Naming Conventions

### Files & Directories

#### Component Files
- **Pattern**: PascalCase (e.g., `ErrorBoundary.tsx`, `CardDetailPanel.tsx`)
- **Location**: `src/components/` directory
- **One component per file** (some components may have 29+ implementations in separate files)

#### Utility/Helper Files
- **Pattern**: camelCase (e.g., `appHelpers.ts`, `accessHelpers.ts`, `supabase.ts`)
- **Location**: `src/` root or functional directories like `src/hooks/`

#### Test Files
- **Pattern**: `<module>.test.ts` (e.g., `board.test.ts`, `remoteAppState.test.ts`)
- **Location**: Same directory as code being tested

#### E2E Test Files
- **Pattern**: `<feature>.spec.ts` (e.g., `smoke.spec.ts`, `card-crud.spec.ts`)
- **Location**: `e2e/` directory
- Total of 12 test specs in project

#### Configuration Files
- **Pattern**: camelCase with `.config.ts` suffix (e.g., `vite.config.ts`, `playwright.config.ts`)
- **Location**: Project root

### Variable & Function Naming

#### Functions
- **Pattern**: camelCase
- **Getter functions**: Prefix with `get` (e.g., `getActivePortfolio`, `getBoardStats`, `getCardFolderName`)
- **Boolean predicates**: Prefix with `is` or `has` (e.g., `isLaunchOpsRole`, `hasError`, `hasBrowser`)
- **Factory/builder functions**: Prefix with `create` (e.g., `createCardFromQuickInput`, `createEmptyPortfolio`, `createFreshStartState`)
- **Event handlers**: Prefix with `on` (e.g., `onAccessSave`, `onPortfolioUpdate`)
- **Utility functions**: Direct camelCase (e.g., `copyToClipboard`, `normalizeBrandNames`)

#### Variables
- **Pattern**: camelCase
- **Constants**: UPPER_SNAKE_CASE (e.g., `STORAGE_KEY`, `DAY_MS`, `DEFAULT_WORKDAY_END_MINUTES`)
- **State variables**: camelCase (e.g., `selectedCard`, `boardFilters`, `syncStatus`)
- **Flags/booleans**: Often `isX`, `hasX`, or descriptive names (e.g., `isSupabaseConfigured`, `remoteHydratedRef`)

#### Types & Interfaces
- **Pattern**: PascalCase
- **Generic types**: Single letter (T, K, V) or descriptive (e.g., `AppState`, `Portfolio`, `CardPriority`)
- **Type unions**: Literal types often used (e.g., `type StageId = (typeof STAGES)[number]`)
- **Interface properties**: camelCase (e.g., `portfolioId`, `driveFolderUrl`)

### Enums & Constants

#### Constant Arrays (as const)
Defined as `const` arrays with `as const` assertion to create literal types:

```typescript
export const STAGES = [
  'Backlog',
  'Briefed',
  'In Production',
  'Review',
  'Ready',
  'Live',
] as const

export type StageId = (typeof STAGES)[number]
```

**Constants Pattern**:
- All-caps with underscores: `STORAGE_KEY`, `DAY_MS`, `HOUR_MS`
- Arrays of valid values use PascalCase naming
- Corresponding type extracted using `(typeof ARRAY)[number]` pattern

## Component Patterns

### Functional Components
- **Pattern**: Arrow function or named function (both used)
- **Props typing**: Interface with `Props` suffix (e.g., `PeopleSectionProps`)
- **Props structure**: Explicit prop interfaces, not `React.FC<Props>`

Example from `src/components/PeopleSection.tsx`:
```typescript
interface PeopleSectionProps {
  portfolios: Portfolio[]
  accessEntries: WorkspaceAccessEntry[]
  accessStatus: WorkspaceDirectoryStatus
  // ... more props
  onAccessSave: (entry: {...}) => Promise<void>
  onAccessDelete: (email: string) => Promise<void>
}

function buildPersonRows(
  portfolios: Portfolio[],
  accessEntries: WorkspaceAccessEntry[],
): PersonRow[] {
  // implementation
}
```

### Class Components
- **Pattern**: Extends `React.Component<Props, State>`
- **State typing**: Separate interface with `State` suffix
- **Props typing**: Separate interface with `Props` suffix
- **Static methods**: Used for derived state (`getDerivedStateFromError`)

Example from `src/components/ErrorBoundary.tsx`:
```typescript
interface ErrorBoundaryProps {
  children: ReactNode
}

interface ErrorBoundaryState {
  hasError: boolean
}

export class ErrorBoundary extends Component<ErrorBoundaryProps, ErrorBoundaryState> {
  state: ErrorBoundaryState = { hasError: false }

  static getDerivedStateFromError() {
    return { hasError: true }
  }

  componentDidCatch(error: Error, errorInfo: ErrorInfo) {
    console.error('Editors Board render error', error, errorInfo)
  }
  // ...
}
```

### React Hooks
- **Custom hooks**: Named with `use` prefix (e.g., `useAppEffects`, `useWorkspaceSession`)
- **Hook dependencies**: Explicitly listed in dependency arrays
- **Ref usage**: Both `useState` and `useRef` used for state management
- **Multiple state variables**: Separate `useState` calls for different pieces of state

## Type System Patterns

### Union Type Creation from Constants
The codebase extensively uses **literal type extraction**:

```typescript
export const ROLE_MODES = ['owner', 'manager', 'contributor', 'viewer'] as const
export type RoleMode = (typeof ROLE_MODES)[number]

export const ACCESS_SCOPE_MODES = [
  'all-portfolios',
  'selected-portfolios',
  'selected-brands',
] as const
export type AccessScopeMode = (typeof ACCESS_SCOPE_MODES)[number]
```

**Benefits**:
- Single source of truth for valid values
- Type-safe iteration and validation
- Constants and types stay synchronized

### Interface Composition
Interfaces are composed hierarchically:

```typescript
export interface AppState {
  portfolios: Portfolio[]
  settings: GlobalSettings
  activePortfolioId: string
  activeRole: ActiveRole
  activePage: AppPage
  // ...
}

export interface Portfolio {
  id: string
  name: string
  brands: Brand[]
  team: TeamMember[]
  cards: Card[]
  // ...
}
```

### Type-Only Imports
Used selectively with `type` keyword:

```typescript
import type {
  AccessScopeMode,
  Portfolio,
  PortfolioAccessScope,
  RoleMode,
} from './board'

import type { WorkspaceAccessEntry } from '../supabase'
```

## Error Handling Patterns

### Custom Error Classes
Domain-specific error classes are defined:

```typescript
export class RemoteStateConflictError extends Error {
  constructor(
    public readonly latestState: AppState,
    public readonly latestSyncedAt: string,
  ) {
    super('Remote state has been updated by another session')
  }
}
```

### Error Boundary Pattern
React Error Boundary is used for UI error handling:

```typescript
export class ErrorBoundary extends Component<ErrorBoundaryProps, ErrorBoundaryState> {
  componentDidCatch(error: Error, errorInfo: ErrorInfo) {
    console.error('Editors Board render error', error, errorInfo)
  }
}
```

### Validation Patterns
- **Guard clauses**: Used extensively for early returns
- **Null coalescing**: Optional chaining (`?.`) and nullish coalescing (`??`)
- **Type narrowing**: Explicit type checks within conditionals

Example:
```typescript
function getVisiblePortfolioIds(
  portfolios: Portfolio[],
  access: AccessRecordLike | null,
) {
  if (!access || access.roleMode === 'owner') {
    return portfolios.map((portfolio) => portfolio.id)
  }

  if (access.roleMode === 'contributor') {
    const identity = getContributorIdentity(access)
    if (!identity) {
      return []
    }
    return portfolios
      .filter((portfolio) => portfolio.cards.some((card) => card.owner === identity))
      .map((portfolio) => portfolio.id)
  }
  // ...
}
```

## Data Flow & State Management

### Local State Pattern
- **React hooks**: `useState` for component-level state
- **Refs**: `useRef` for mutable state that doesn't trigger re-renders
- **App-wide state**: Passed through props and context via custom hooks

### Immutability Convention
State updates follow immutable patterns:

```typescript
const updatedState = {
  ...state,
  activePortfolioId: newPortfolioId,
  settings: {
    ...state.settings,
    general: {
      ...state.settings.general,
      appName: 'New Name',
    },
  },
}
```

### Helper Functions for Updates
Functional updater patterns:

```typescript
onPortfolioUpdate: (portfolioId: string, updater: (portfolio: Portfolio) => Portfolio) => void
```

This allows calling code to define transformations without the component owning the logic.

## Module Organization

### `src/board.ts` (Core Domain Model)
- Type definitions (Card, Portfolio, AppState, etc.)
- Constants for valid values (STAGES, PLATFORMS, etc.)
- Pure utility functions for state manipulation
- Query functions (getters)

### `src/components/` (UI Layer)
- React components, organized by feature
- Component-specific types and interfaces
- CSS modules or inline styles

### `src/hooks/` (Custom Hooks)
- `useAppEffects.ts`: Central effects orchestration
- `useWorkspaceSession.ts`: Authentication and workspace logic

### `src/supabase.ts` (External API Layer)
- Supabase client initialization
- Auth/workspace access API calls
- Interface definitions for external data

### `e2e/` (End-to-End Tests)
- Playwright test specs
- Helper functions for common UI interactions

## Key Patterns & Idioms

### Constants Before Code
Files start with constants and type definitions before implementations:

```typescript
// Constants
const DAY_MS = 24 * 60 * 60 * 1000
const HOUR_MS = 60 * 60 * 1000
export const STORAGE_KEY = 'creative-board-state'

// Types
export type StageId = (typeof STAGES)[number]

// Interfaces
export interface Card { ... }

// Implementation
export function createCard(...) { ... }
```

### Nested Object Immutability
When updating deeply nested state, the pattern uses spread operators:

```typescript
const updatedPortfolio = applyCardUpdates(
  portfolio,
  state.settings,
  targetCard.id,
  { brand: nextBrand.name },
  'Naomi',
  '2026-03-12T09:00:00Z',
  MANAGER_VIEWER,
)
```

Helper functions handle the complex spread operations internally.

### LocalStorage Integration
App state persists to localStorage with versioning:

```typescript
export const STORAGE_KEY = 'creative-board-state'
export const STATE_VERSION = 3

function persistAppState(state: AppState) {
  window.localStorage.setItem(STORAGE_KEY, JSON.stringify(state))
}

function loadAppState(): AppState {
  const saved = window.localStorage.getItem(STORAGE_KEY)
  return saved ? JSON.parse(saved) : createSeedState()
}
```

## Summary of Key Conventions

| Aspect | Convention |
|--------|-----------|
| **Code Style** | 2-space indentation, single quotes, trailing commas |
| **TypeScript** | Strict mode enabled, target ES2022 |
| **Functions** | camelCase with descriptive prefixes (get, is, create, on) |
| **Components** | PascalCase files, separate Props/State interfaces |
| **Constants** | UPPER_SNAKE_CASE, array-based literal types |
| **Types** | PascalCase, extracted from const arrays, type-only imports |
| **Files** | Components in `src/components/`, utilities in `src/`, tests adjacent to code |
| **State** | Immutable updates, spread operators, custom hooks |
| **Errors** | Custom error classes, Error Boundary for UI errors |
