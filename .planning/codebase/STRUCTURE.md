# Editors Board - Directory Structure & Organization Guide

## Directory Tree Overview

```
/Users/iskanderzrouga/Desktop/Editors Board/
├── src/                                 # Application source code
│   ├── main.tsx                        # React entry point
│   ├── App.tsx                         # Root component (1,823 lines)
│   ├── App.css                         # Root styles
│   ├── index.css                       # Global styles
│   │
│   ├── board.ts                        # Data models & business logic (3,984 lines, 72 exports)
│   ├── board.test.ts                   # Unit tests for board.ts
│   │
│   ├── remoteAppState.ts               # Remote sync & persistence
│   ├── remoteAppState.test.ts          # Sync logic tests
│   │
│   ├── supabase.ts                     # Supabase integration (auth, DB, sessions)
│   ├── accessHelpers.ts                # Access control utilities
│   ├── appHelpers.ts                   # UI helper functions
│   │
│   ├── components/                     # React components (30 .tsx files)
│   │   ├── AccessGate.tsx              # Auth & workspace access verification
│   │   ├── AccessVerificationGate.tsx  # Secondary auth verification
│   │   ├── AuthGate.tsx                # Login gate
│   │   │
│   │   ├── BoardPage.tsx               # Main kanban board view
│   │   ├── BoardCardSurface.tsx        # Card display element
│   │   ├── SortableBoardCard.tsx       # Draggable card wrapper
│   │   ├── LaneDropZone.tsx            # Drop zone for card moves
│   │   │
│   │   ├── AnalyticsPage.tsx           # Analytics & insights page
│   │   ├── WorkloadPage.tsx            # Workload & capacity page
│   │   ├── SettingsPage.tsx            # Settings & config page
│   │   │
│   │   ├── CardDetailPanel.tsx         # Side panel for card editing
│   │   ├── PageHeader.tsx              # Top navigation bar
│   │   ├── Sidebar.tsx                 # Left sidebar with filters
│   │   │
│   │   ├── DeleteCardModal.tsx         # Delete confirmation
│   │   ├── BackwardMoveModal.tsx       # Revision request form
│   │   ├── QuickCreateModal.tsx        # Fast card creation
│   │   ├── KeyboardShortcutsModal.tsx  # Help dialog
│   │   ├── ConfirmDialog.tsx           # Generic confirmation
│   │   │
│   │   ├── RemoteLoadingShell.tsx      # Loading state wrapper
│   │   ├── SyncStatusPill.tsx          # Sync status indicator
│   │   ├── NotificationBell.tsx        # Notifications center
│   │   ├── ToastStack.tsx              # Toast notifications
│   │   ├── RichTextEditor.tsx          # Comment/brief editor
│   │   ├── ButtonSpinner.tsx           # Loading spinner button
│   │   │
│   │   ├── ErrorBoundary.tsx           # React error boundary
│   │   ├── RevisionReasonLibraryEditor.tsx  # Settings editor
│   │   ├── TaskLibraryEditor.tsx       # Settings editor
│   │   ├── WorkspaceAccessManager.tsx  # Access control UI
│   │   ├── PeopleSection.tsx           # Team member management
│   │   │
│   │   └── icons/
│   │       └── AppIcons.tsx            # SVG icon library (icons by purpose)
│   │
│   ├── hooks/                          # Custom React hooks
│   │   ├── useAppEffects.ts            # Master effects hook (local save, sync, auto-archive)
│   │   ├── useWorkspaceSession.ts      # Auth and workspace access
│   │   └── useModalAccessibility.ts    # Keyboard accessibility for modals
│   │
│   └── assets/                         # Static assets
│       └── react.svg                   # React logo
│
├── e2e/                                # Playwright end-to-end tests (14 files)
│   ├── smoke.spec.ts                   # Basic functionality
│   ├── auth-sync.spec.ts               # Auth and sync workflows
│   ├── card-crud.spec.ts               # Card operations
│   ├── drag-drop.spec.ts               # Drag-drop functionality
│   ├── loading-signout.spec.ts         # Loading and auth states
│   ├── responsive.spec.ts              # Responsive design
│   ├── roles-filters.spec.ts           # Role-based access and filters
│   ├── settings.spec.ts                # Settings workflows
│   ├── toasts.spec.ts                  # Toast notifications
│   ├── access-recovery.spec.ts         # Access management
│   └── people.spec.ts                  # People/team management
│
├── supabase/                           # Backend configuration
│   ├── migrations/                     # Database migrations
│   ├── functions/                      # Edge functions
│   │   └── request-magic-link/         # Magic link auth function
│   └── .temp/                          # Temporary files
│
├── public/                             # Static public assets
│   └── (favicons, logos, etc.)
│
├── dist/                               # Built output (generated)
│   └── assets/                         # Built JS, CSS
│
├── playwright-report/                  # E2E test reports (generated)
├── test-results/                       # E2E test results (generated)
├── coverage/                           # Code coverage reports (generated)
│
├── .planning/                          # Documentation (this folder)
│   └── codebase/
│       ├── ARCHITECTURE.md             # This architecture guide
│       └── STRUCTURE.md                # This structure guide
│
├── .claude/                            # Claude AI assistant config
│   ├── commands/
│   ├── hooks/
│   ├── agents/
│   └── get-shit-done/                  # GSD workflow templates
│
├── artifacts/                          # Historical artifacts
│   ├── phase-1/
│   └── phase-2/
│
├── .github/
│   └── workflows/                      # CI/CD workflows
│
├── .vercel/                            # Vercel deployment config
│
├── .git/                               # Git repository
│
├── vite.config.ts                      # Vite build configuration
├── tsconfig.json                       # TypeScript root config
├── tsconfig.app.json                   # TypeScript app config
├── tsconfig.node.json                  # TypeScript build config
│
├── package.json                        # Dependencies and scripts
├── package-lock.json                   # Locked versions
│
├── index.html                          # HTML entry point
├── eslint.config.js                    # ESLint rules
├── vitest.config.ts                    # Unit test config
├── playwright.config.ts                # E2E test config
│
├── .env.example                        # Environment variable template
├── .env.local                          # Local environment (git-ignored)
├── .gitignore                          # Git exclusions
│
├── README.md                           # Project overview
├── PLAN.md                             # Project plan
├── STATUS.md                           # Status and progress tracking
└── CODEX-PLAN.md                       # Detailed feature planning
```

---

## Key File Locations by Purpose

### Finding Specific Things

#### "I need to add a new page"
- Create component in: `src/components/MyPageName.tsx`
- Add page route in: `src/App.tsx` (switch on `activePage`)
- Add to `APP_PAGES` const in: `src/board.ts` line 22

#### "I need to modify the Card model"
- Define interface in: `src/board.ts` (Card interface around line 130)
- Add helpers/getters after definition
- Update board.test.ts with new tests
- Update all transformation functions that create/update cards

#### "I need to add a new setting"
- Define in `GlobalSettings` type in: `src/board.ts` (line 251)
- Add `SettingsPage.tsx` form inputs
- Update persist/coerce functions if needed

#### "I need to modify state structure"
- Update `AppState` interface in: `src/board.ts` (line 286)
- Update `remoteAppState.ts` snapshot creation if persistence needed
- Update merge logic in `remoteAppState.ts`

#### "I need to understand sync logic"
- Master logic in: `src/hooks/useAppEffects.ts`
- Remote operations in: `src/remoteAppState.ts`
- Conflict detection via state signatures

#### "I need to change authorization rules"
- Access helpers in: `src/accessHelpers.ts`
- Workspace access fetch in: `src/supabase.ts`
- Role-based rendering in: `src/components/AccessGate.tsx`
- Component-level checks in respective pages

#### "I need to add a new component type"
- Reusable UI components: `src/components/`
- Modals/dialogs: Named with `Modal` suffix
- Pages: Named with `Page` suffix
- Feature components: Use descriptive names

#### "I need to debug state/sync"
- See current state signature: `remoteAppState.ts` → `getRemoteStateSignature()`
- View sync attempts: `useAppEffects.ts` → `saveRemoteAppState()` calls
- Check conflicts: `RemoteStateConflictError` handling in App.tsx

---

## File Naming Conventions

### Components (src/components/)
- **Pages**: `*Page.tsx` (BoardPage, SettingsPage, AnalyticsPage)
- **Modals/Dialogs**: `*Modal.tsx` or `*Dialog.tsx` (DeleteCardModal, ConfirmDialog)
- **Sub-components**: Descriptive camelCase (BoardCardSurface, PageHeader, Sidebar)
- **Utilities**: Descriptive nouns (ToastStack, SyncStatusPill, ErrorBoundary)
- **Features**: Named by functionality (WorkspaceAccessManager, PeopleSection)

### Hooks (src/hooks/)
- Convention: `use*` prefix (useAppEffects, useWorkspaceSession)
- Filename matches export name: `useAppEffects.ts` exports `useAppEffects`

### Data/Logic (src/)
- Core models: `board.ts` (all type definitions and data transformations)
- Integration: `supabase.ts`, `remoteAppState.ts`
- Helpers: `appHelpers.ts` (UI), `accessHelpers.ts` (auth)

### Tests
- Suffix: `.test.ts` or `.spec.ts`
- E2E tests in: `e2e/` folder
- Unit tests co-located with source

---

## Module Organization & Imports

### Import Patterns

#### From board.ts (types and utilities)
```typescript
import {
  type AppState,
  type Card,
  type Portfolio,
  createCard,
  updateCard,
  formatDateShort,
} from '../board'
```

#### From hooks
```typescript
import { useAppEffects } from '../hooks/useAppEffects'
import { useWorkspaceSession } from '../hooks/useWorkspaceSession'
```

#### From components (sibling imports)
```typescript
import { PageHeader } from './PageHeader'
import { Sidebar } from './Sidebar'
import type { BoardPageProps } from './BoardPage'
```

#### From external libraries
```typescript
import { useState, useEffect } from 'react'
import { DndContext, DragOverlay } from '@dnd-kit/core'
import { createClient } from '@supabase/supabase-js'
```

### Export Patterns

#### Exporting types
```typescript
export interface Card { ... }
export type StageId = ...
export type AppPage = ...
```

#### Exporting utilities
```typescript
export function createCard(...)
export function formatDateShort(...)
export const STAGES = [...]
```

#### Exporting components
```typescript
export function BoardPage(props: BoardPageProps) { ... }
export const Sidebar = (props: SidebarProps) => { ... }
```

#### No default exports used
All exports are named exports for clarity and refactoring ease

---

## Dependencies & Import Hierarchy

### Dependency Graph (Top to Bottom)

```
App.tsx
├─ uses AppState from board.ts
├─ uses useAppEffects from hooks/useAppEffects.ts
├─ uses remoteAppState functions
├─ uses supabase integration
└─ renders all pages and components

Pages (BoardPage, SettingsPage, etc.)
├─ use AppState types from board.ts
├─ use portfolio/card transformation functions
└─ render feature components

Components (BoardCardSurface, CardDetailPanel, etc.)
├─ use Card, Portfolio types from board.ts
├─ use helper functions from appHelpers.ts
└─ may render child components

board.ts (NO DEPENDENCIES)
├─ Pure data models and transformations
├─ No imports from other src files
└─ Only standard library and type imports

remoteAppState.ts
├─ depends on board.ts types
├─ depends on supabase.ts
└─ provides sync functions to App

supabase.ts
└─ only depends on board.ts for types
```

### Circular Dependencies
**None - architecture is acyclic**

### Re-exports
Minimized to keep imports explicit and traceable

---

## Constants & Configuration

### Magic Strings & Constants Defined In

**board.ts:**
- `STORAGE_KEY = 'creative-board-state'`
- `STATE_VERSION = 3`
- `STAGES = ['Backlog', 'Briefed', 'In Production', 'Review', 'Ready', 'Live']`
- `GROUPED_STAGES = ['Briefed', 'In Production', 'Review']`
- `APP_PAGES = ['board', 'analytics', 'workload', 'settings']`
- `ROLE_MODES = ['owner', 'manager', 'contributor', 'viewer']`
- `TIMEFRAMES, WORKING_DAYS, PLATFORMS, CARD_PRIORITIES`, etc.

**supabase.ts:**
- `AUTH_STORAGE_KEY = 'editors-board-auth'`
- `E2E_AUTH_MODE_KEY`, `E2E_REMOTE_STATE_KEY`, etc. (E2E testing keys)
- `REMOTE_WORKSPACE_ID` (from env)

**remoteAppState.ts:**
- `WORKSPACE_STATE_TABLE = 'workspace_state'`
- `E2E_REMOTE_DELAY_KEY` (E2E testing)

**useAppEffects.ts:**
- `LOCAL_PERSIST_DEBOUNCE_MS = 200`
- `REMOTE_SAVE_DEBOUNCE_MS = 800`
- `REMOTE_SAVE_RETRY_DELAYS_MS = [0, 1200, 3000]`

---

## Testing Infrastructure

### Unit Tests
- **Location**: `src/*.test.ts`
- **Tool**: Vitest
- **Config**: `vitest.config.ts`
- **Run**: `npm run test:unit`
- **Coverage**: `npm run test:unit:coverage`

**Test Files:**
- `src/board.test.ts` - Data transformation logic
- `src/remoteAppState.test.ts` - Sync and merge behavior

### E2E Tests
- **Location**: `e2e/*.spec.ts`
- **Tool**: Playwright
- **Config**: `playwright.config.ts`
- **Run**: `npm run test:e2e`
- **Browser**: Chromium
- **Reports**: Generated in `playwright-report/`, `test-results/`

**Test Coverage:**
- Smoke tests (basic flows)
- Auth and sync workflows
- Card CRUD operations
- Drag-drop functionality
- Responsive design
- Role-based access
- Settings workflows
- Toast notifications
- Access recovery
- People/team management

---

## Build & Development Setup

### Build Tool: Vite
- **Config**: `vite.config.ts` (minimal, uses React plugin)
- **Build command**: `npm run build`
- **Dev command**: `npm run dev`
- **Output**: `dist/` folder

### Type Checking: TypeScript
- **Root config**: `tsconfig.json`
- **App config**: `tsconfig.app.json`
- **Build config**: `tsconfig.node.json`
- **Strict mode**: Enabled
- **Version**: ~5.9.3

### Linting: ESLint
- **Config**: `eslint.config.js`
- **Plugins**: React, React Hooks
- **Command**: `npm run lint`

### Environment Variables
- **Template**: `.env.example`
- **Local**: `.env.local` (git-ignored)
- **Variables used**:
  - `VITE_SUPABASE_URL`
  - `VITE_SUPABASE_ANON_KEY` / `VITE_SUPABASE_PUBLISHABLE_KEY`
  - `VITE_MAGIC_LINK_REDIRECT_URL`
  - `VITE_REMOTE_WORKSPACE_ID`

---

## Important Patterns & Conventions

### State Update Pattern
```typescript
// NEVER mutate directly
// state.activePortfolioId = 'new-id'  ❌

// ALWAYS create new state object
const newState = { ...appState, activePortfolioId: 'new-id' }
setState(newState)  ✅
```

### Array Updates in State
```typescript
// For portfolio arrays
const newPortfolios = appState.portfolios.map(p =>
  p.id === portfolioId ? { ...p, ...updates } : p
)
const newState = { ...appState, portfolios: newPortfolios }
setState(newState)
```

### Component Prop Pattern
```typescript
interface ComponentProps {
  // Data props
  state: AppState
  portfolio: Portfolio

  // Handler props
  onUpdate: (newState: AppState) => void
  onSelectCard: (cardId: string) => void

  // UI state props (optional)
  isLoading?: boolean
  selectedCardId?: string | null
}
```

### Hook Effect Pattern
```typescript
useEffect(() => {
  // Dependency array is critical for performance
}, [state, syncStatus, ...dependencies])
```

---

## Git & Version Control

- **Repository**: Git (`.git/`)
- **Main branch**: `main`
- **Current status**: Use `git status` to see uncommitted changes
- **Staging area**: Modified files need to be staged before commit

---

## Deployment

- **Platform**: Vercel (`.vercel/project.json`)
- **Build**: `npm run build` → TypeScript compile + Vite build
- **Entry**: `index.html` → loads `src/main.tsx`
- **Environment**: `.env.local` for local dev, Vercel dashboard for production

---

## Summary

**Total source files**: 43 TypeScript/TSX files
**Total lines**: ~18,320 LOC
**Core data model**: `src/board.ts` (3,984 lines)
**Root component**: `src/App.tsx` (1,823 lines)
**Components**: 30 React TSX files
**Hooks**: 3 custom hooks
**Tests**: Unit tests + 14 E2E test files
**Key pattern**: Immutable state management with centralized app state and async persistence
