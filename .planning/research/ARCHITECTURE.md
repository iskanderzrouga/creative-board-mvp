# Architecture Research: Restructuring the Monolithic React App

## Summary

This document defines the component boundaries, state management refactoring strategy, restructuring order, and test preservation approach for breaking up the current monolithic architecture. The goal is to go from a single 1,823-line `App.tsx` orchestrating everything, to a set of focused modules with clear boundaries and minimal prop drilling.

---

## 1. Current Architecture Assessment

### What exists today

| File | Lines | Responsibility |
|------|-------|---------------|
| `App.tsx` | 1,824 | State (30+ useState calls), auth gates, drag-drop, modals, page routing, keyboard shortcuts, toast management, sidebar layout, all event handlers |
| `board.ts` | 4,002 | Data models, types, all business logic, 155 exports |
| `SettingsPage.tsx` | 1,290 | All four settings tabs (general, portfolios, people, workflow) |
| `PeopleSection.tsx` | 1,301 | Team member management, access control forms, person rows |
| `CardDetailPanel.tsx` | 1,146 | Card editing across 8 collapsible sections (details, naming, metadata, drive, brief, links, comments, activity) |
| `WorkspaceAccessManager.tsx` | 990 | Access directory, entry forms, scope assignment |
| `useAppEffects.ts` | 588 | 43-parameter interface, local persistence, remote sync, auto-archive, keyboard shortcuts, visibility refresh |
| `useWorkspaceSession.ts` | 728 | Auth state, access checking, login flow, workspace directory CRUD |
| `BoardPage.tsx` | 523 | Board rendering with drag-drop context (already reasonably scoped) |

### Root problems

1. **App.tsx is the god component.** It manages 30+ pieces of state, defines 25+ handler functions, computes 15+ derived values, renders auth gates, page routing, modals, and the sidebar. Every feature change touches this file.

2. **Prop drilling is extreme.** `useAppEffects` takes 43 parameters. `BoardPage` takes 30+ props. Each handler function in `App.tsx` closes over state from many sources, creating invisible coupling.

3. **Types are duplicated.** `ToastTone` is defined in 7 files. `SyncStatus` is defined in 3 files. `AuthStatus`, `AccessStatus`, `CopyState`, `SelectedCardState`, `PendingBackwardMove`, and `PendingDeleteCard` are defined in both `App.tsx` and `useAppEffects.ts`.

4. **State concerns are tangled.** Domain state (`AppState`), UI state (selected card, sidebar, modals), sync state (sync status, last synced), and auth state (session, access) all live in the same component with no separation.

5. **board.ts is a monolith.** 4,002 lines with 155 exports mixing type definitions, pure business logic, seed data, serialization, and card formatting. Any import from `board.ts` pulls the entire dependency.

---

## 2. Target Architecture

### Design principles

1. **Separate state domains.** Domain state (portfolios, cards, settings) lives apart from UI state (selected card, modals, sidebar) and sync state (sync status, remote session).
2. **Context for cross-cutting concerns.** Toast notifications, sync status, auth session, and viewer context should be available via React Context rather than prop drilling.
3. **Co-locate handlers with their state.** Card operations live with card state. Modal management lives with modal state. Drag-drop handling lives with the board.
4. **Components own their local UI state.** Sidebar manages its own hover/pin state. Modals manage their own form state. The board manages its own drag state.
5. **Shared types in one place.** All type aliases used across 2+ files come from a single `types.ts` module.

### Target component tree

```
<App>                               ← Thin shell: context providers + auth gates
  <AppProviders>                    ← Composes all context providers
    <AuthGateRouter>                ← Auth/access gate logic (early returns)
      <AppShell>                    ← Layout: sidebar + main + modals + toasts
        <Sidebar />                 ← Owns pin/hover/touch state internally
        <MainContent>               ← Page router (switch on activePage)
          <BoardPage />             ← Owns drag state, filter state
          <AnalyticsPage />
          <WorkloadPage />
          <SettingsPage>            ← Tab router
            <GeneralSettings />
            <PortfolioSettings />
            <PeopleSection />
            <WorkflowSettings />
          </SettingsPage>
        </MainContent>
        <CardDetailPanel />         ← Side panel, reads from context
        <ModalLayer />              ← All modals in one place
        <ToastStack />              ← Reads from toast context
      </AppShell>
    </AuthGateRouter>
  </AppProviders>
</App>
```

---

## 3. Component Boundaries: What to Extract and How

### 3.1 From App.tsx: Extract shared types (Phase 1 prerequisite)

**Create `src/types.ts`**

Move all type aliases that appear in 2+ files into a single shared types module:

```typescript
// src/types.ts
export type ToastTone = 'green' | 'amber' | 'red' | 'blue'
export type SyncStatus = 'local' | 'loading' | 'syncing' | 'synced' | 'error'
export type AuthStatus = 'disabled' | 'checking' | 'signed-out' | 'signed-in'
export type AccessStatus = 'disabled' | 'checking' | 'granted' | 'denied' | 'error'
export type WorkspaceDirectoryStatus = 'idle' | 'loading' | 'ready' | 'error'

export interface ToastState {
  id: number
  message: string
  tone: ToastTone
}

export interface CopyState {
  key: string
}

export interface SelectedCardState {
  portfolioId: string
  cardId: string
}

export interface PendingBackwardMove {
  portfolioId: string
  cardId: string
  destinationStage: StageId
  destinationOwner: string | null
  destinationIndex: number
  movedAt: string
}

export interface PendingDeleteCard {
  portfolioId: string
  cardId: string
}
```

**Why first**: Every subsequent extraction imports from this file. Doing it first means no circular dependency issues later.

**Test impact**: None. Types have no runtime behavior. All existing imports continue to work via search-and-replace.

---

### 3.2 From App.tsx: Extract contexts (Phase 2)

**Create four context modules**, each with a provider component and a `use*` hook:

#### 3.2a `src/contexts/ToastContext.tsx`

Extracts from App.tsx:
- `toasts` state (lines 144)
- `nextToastIdRef`, `toastTimerIdsRef` refs (lines 200-201)
- `showToast()` function (lines 663-679)
- `dismissToast()` function (lines 653-661)
- Timer cleanup effect (lines 631-641)

Provides: `{ showToast, toasts, dismissToast }`

**Why**: `showToast` is currently threaded through 7+ components via props. Every component that can display an error or success message needs it. A context eliminates this entirely.

#### 3.2b `src/contexts/AppStateContext.tsx`

Extracts from App.tsx:
- `state` and `setState` (line 139)
- `replaceState()`, `updateState()`, `updatePortfolio()` functions (lines 707-727)
- `syncStateControls()` function (lines 681-705)
- `localFallbackStateRef` (line 196)
- The `boardFilters` state and setter (lines 140-141) -- stays in BoardPage, NOT in this context

Provides: `{ state, setState, updateState, updatePortfolio, replaceState }`

**Why**: `state` and `setState` flow to virtually every component. This context makes the domain state available without prop drilling. The update helper functions (`updateState`, `updatePortfolio`) encapsulate the immutable update patterns that are currently duplicated.

**Important**: `boardFilters` does NOT go into this context. Filters are board-page-specific UI state and should live in BoardPage.

#### 3.2c `src/contexts/SyncContext.tsx`

Extracts from App.tsx:
- `syncStatus`, `setSyncStatus` (line 180)
- `lastSyncedAt`, `setLastSyncedAt` (line 181)
- `remoteSyncErrorShown`, `setRemoteSyncErrorShown` (line 182)
- `remoteHydratedRef`, `remoteSaveTimerRef` refs (lines 197-198)

Provides: `{ syncStatus, lastSyncedAt }`

**Why**: Sync status is only consumed by `SyncStatusPill` and `useAppEffects`. Separating it from AppState reduces unnecessary re-renders when sync status changes without domain state changing.

#### 3.2d `src/contexts/AuthContext.tsx`

Extracts from App.tsx:
- Everything returned by `useWorkspaceSession()` (lines 203-242)
- `authEnabled` (line 138)
- `lockedRole` computation (lines 369-382)
- `userDisplayName` and `userSecondaryLabel` computations (lines 383-388)

Provides: `{ authEnabled, authStatus, authSession, workspaceAccess, accessStatus, ... }`

**Why**: Auth state is consumed by auth gates, the sidebar, settings page, and workspace access manager. Currently it flows through App.tsx as intermediary. A context gives direct access.

---

### 3.3 From App.tsx: Extract AppShell (Phase 3)

**Create `src/components/AppShell.tsx`**

Extracts from App.tsx:
- The main `return` JSX block (lines 1547-1821)
- Sidebar rendering with hover zone (lines 1549-1576)
- Local mode banner rendering (lines 389-441)
- Header utility content rendering (lines 443-475)
- Main content area with page routing (lines 1578-1729)
- Modal rendering (quick create, backward move, delete, confirm, keyboard shortcuts) (lines 1733-1817)

The sidebar's own state (`sidebarPinned`, `sidebarHovered`, `touchSidebarOpen`, `touchSidebarEnabled`, `compactLayout`) moves into `Sidebar.tsx` itself. Currently these 5 state variables and the media query effect (lines 597-629) exist in App.tsx solely to control sidebar behavior. They should be internal to the Sidebar component.

**Resulting App.tsx**: After this extraction, App.tsx becomes a thin wrapper:

```typescript
function App() {
  return (
    <AppProviders>
      <AuthGateRouter>
        <AppShell />
      </AuthGateRouter>
    </AppProviders>
  )
}
```

This is approximately 30 lines instead of 1,824.

---

### 3.4 From App.tsx: Extract AuthGateRouter (Phase 3)

**Create `src/components/AuthGateRouter.tsx`**

Extracts from App.tsx:
- The four early-return auth gate blocks (lines 1460-1545)
- Each renders `AuthGate`, `RemoteLoadingShell`, `AccessVerificationGate`, or `AccessGate` based on auth/access status

This component reads from `AuthContext` and `ToastContext` and renders either its `children` (the main app) or an auth gate.

---

### 3.5 From App.tsx: Extract board drag-drop logic (Phase 4)

**Create `src/hooks/useBoardDragDrop.ts`**

Extracts from App.tsx:
- `dragCardId`, `dragOverLaneId`, `blockedLaneId` state (lines 170-172)
- `laneMap`, `itemToLaneMap` memos (lines 485-505)
- `sensors` configuration (lines 477-483)
- `getDragMidpoint()`, `getDropTarget()`, `validateBoardDrop()`, `clearBoardDragState()` (lines 1073-1154)
- `handleBoardDragStart()`, `handleBoardDragOver()`, `handleBoardDragEnd()` (lines 1156-1321)

This hook takes `columns`, `activePortfolioView`, `viewerContext`, and `applyMove` as parameters and returns the drag handlers and state that `BoardPage` needs.

This can then be called inside `BoardPage` itself, eliminating the need to pass drag state as props from App.tsx. The `applyMove` function comes from the `AppStateContext`.

---

### 3.6 From App.tsx: Extract card operations into a hook (Phase 4)

**Create `src/hooks/useCardOperations.ts`**

Extracts from App.tsx:
- `selectedCard`, `setSelectedCard` state (line 143)
- `isClosingCardPanel`, card panel close timer ref (lines 185, 199)
- `creatingDriveCardId` state (line 179)
- `openCard()`, `requestCloseSelectedCard()`, `saveOpenCard()`, `requestDeleteOpenCard()`, `addCommentToCard()`, `createDriveFolder()` functions (lines 885-1071)
- `pendingDeleteCard`, `setPendingDeleteCard` state (line 175)
- `handleDeleteCard()` function (lines 933-970)

This hook reads from `AppStateContext` and `AuthContext`, and returns all the card interaction functions. It can be consumed directly by `CardDetailPanel` and `BoardPage`.

---

### 3.7 From App.tsx: Extract modal management into a hook (Phase 4)

**Create `src/hooks/useModalManager.ts`**

Extracts from App.tsx:
- `quickCreateOpen` / `setQuickCreateOpen` (line 147)
- `quickCreateValue` / `setQuickCreateValue` (lines 148-151)
- `pendingBackwardMove` / `setPendingBackwardMove` (line 174)
- `backwardMoveForm` / `setBackwardMoveForm` (lines 176-178)
- `pendingAppConfirm` / `setPendingAppConfirm` (line 183)
- `keyboardShortcutsOpen` / `setKeyboardShortcutsOpen` (line 184)
- `handleQuickCreate()`, `handleConfirmBackwardMove()`, `resetToSeed()`, `confirmResetToSeed()`, `freshStartData()`, `confirmFreshStartData()` functions

Returns: all modal state and handlers, consumed by `AppShell` or a `ModalLayer` component.

---

### 3.8 From useAppEffects.ts: Decompose into focused hooks (Phase 5)

The 43-parameter `useAppEffects` hook currently mixes several unrelated concerns. Split it:

| New hook | Extracted from useAppEffects | Parameters after context |
|----------|------------------------------|--------------------------|
| `useLocalPersistence` | Local save debounce effect (lines 166-181), pagehide flush (lines 183-213), state fallback ref sync (lines 215-217) | `state` from context |
| `useRemoteSync` | Remote hydration effect (lines 219-287), remote save effect (lines 289-398), visibility refresh (lines 400-449), archive timer (lines 451-475) | `state` from context, sync from `SyncContext` |
| `useKeyboardShortcuts` | Keyboard shortcut effect (lines 477-570) | UI state from modal manager hook |
| `useDataImport` | Import file handler effect (lines 572-588) | `replaceState` from context |

After this split, `UseAppEffectsOptions` (43 parameters) is eliminated entirely. Each hook reads what it needs from context and receives only 2-5 specific parameters.

---

### 3.9 From SettingsPage.tsx: Split into tab components (Phase 6)

`SettingsPage.tsx` (1,290 lines) contains four tabs rendered as one large switch statement. Extract each tab into its own component:

| New component | Content |
|---------------|---------|
| `GeneralSettings.tsx` | App name, theme, auto-archive, capacity thresholds, integrations |
| `PortfolioSettings.tsx` | Portfolio CRUD, brand management, product management, webhook URLs |
| `PeopleSettings.tsx` | Thin wrapper that renders existing `PeopleSection` with portfolio update wiring |
| `WorkflowSettings.tsx` | Task library editor, revision reason editor, data management (export/import/reset) |

`SettingsPage.tsx` becomes a tab router (~100 lines) that renders the active tab component.

---

### 3.10 From CardDetailPanel.tsx: Split into section components (Phase 6)

`CardDetailPanel.tsx` (1,146 lines) renders 8 collapsible sections. Extract each:

| New component | Lines (approx) |
|---------------|----------------|
| `CardDetailsSection.tsx` | Fields: title, type, brand, product, platform, owner, stage, priority, blocked, due date, estimated hours |
| `CardNamingSection.tsx` | Naming convention display and copy |
| `CardMetadataSection.tsx` | Created, assigned, age, revision count, scheduled hours, forecast |
| `CardDriveSection.tsx` | Drive folder creation and link |
| `CardBriefSection.tsx` | Brief editor (rich text) |
| `CardLinksSection.tsx` | Frame.io link, attachments management |
| `CardCommentsSection.tsx` | Comment list and add form |
| `CardActivitySection.tsx` | Activity log display |

`CardDetailPanel.tsx` becomes a shell (~150 lines) that composes sections and manages panel open/close animation.

---

### 3.11 From board.ts: Split into domain modules (Phase 7)

`board.ts` (4,002 lines, 155 exports) should be split by domain:

| New module | Content | Approx lines |
|------------|---------|-------------|
| `src/models/types.ts` | All interfaces and type definitions (Card, Portfolio, AppState, etc.) | ~400 |
| `src/models/constants.ts` | STAGES, PLATFORMS, CARD_PRIORITIES, ROLE_MODES, etc. | ~80 |
| `src/models/card.ts` | Card creation, update, move, archive, formatting functions | ~800 |
| `src/models/portfolio.ts` | Portfolio creation, brand/team member management | ~500 |
| `src/models/board.ts` | Board model building (columns, lanes, filters, stats) | ~600 |
| `src/models/state.ts` | AppState creation, coercion, persistence (load/save), migration | ~500 |
| `src/models/settings.ts` | Settings defaults, task type management, revision reasons | ~300 |
| `src/models/formatting.ts` | Date formatting, duration formatting, label generation | ~300 |
| `src/models/seed.ts` | Seed state creation, imported cards processing | ~400 |
| `src/models/index.ts` | Re-exports everything for backward compatibility | ~30 |

The `index.ts` re-export barrel ensures that all existing `import { ... } from './board'` statements continue to work. Consumers can gradually switch to specific imports.

**Test impact**: `board.test.ts` continues to import from `'./board'` which re-exports from `./models/index.ts`. No test changes needed in this phase.

---

## 4. State Management Refactoring Strategy

### Step 1: Identify state categories

The 30+ useState calls in App.tsx fall into five categories:

| Category | State variables | Where they should live |
|----------|----------------|----------------------|
| **Domain state** | `state` (AppState) | `AppStateContext` |
| **Auth state** | `authStatus`, `authSession`, `workspaceAccess`, `accessStatus`, etc. | `AuthContext` (via `useWorkspaceSession`) |
| **Sync state** | `syncStatus`, `lastSyncedAt`, `remoteSyncErrorShown` | `SyncContext` |
| **UI toast state** | `toasts` | `ToastContext` |
| **Board UI state** | `boardFilters`, `expandedStages`, `dragCardId`, `dragOverLaneId`, `blockedLaneId` | `BoardPage` component (local state) |
| **Sidebar UI state** | `sidebarPinned`, `sidebarHovered`, `touchSidebarOpen`, `touchSidebarEnabled`, `compactLayout` | `Sidebar` component (local state) |
| **Modal UI state** | `quickCreateOpen`, `quickCreateValue`, `pendingBackwardMove`, `backwardMoveForm`, `pendingDeleteCard`, `pendingAppConfirm`, `keyboardShortcutsOpen` | `useModalManager` hook or `ModalLayer` component |
| **Card panel state** | `selectedCard`, `isClosingCardPanel`, `creatingDriveCardId` | `useCardOperations` hook |
| **Misc UI state** | `editorMenuOpen`, `settingsTab`, `timeframe`, `nowMs`, `onboardingDismissed`, `copyState` | Various (closest consumer) |

### Step 2: Context implementation order

1. **ToastContext** (no dependencies on other contexts, consumed everywhere)
2. **AuthContext** (wraps `useWorkspaceSession`, consumed by auth gates and settings)
3. **SyncContext** (depends on AuthContext for auth status checks)
4. **AppStateContext** (depends on nothing, provides domain state)

### Step 3: Provider composition

```typescript
// src/components/AppProviders.tsx
export function AppProviders({ children }: { children: ReactNode }) {
  return (
    <ToastProvider>
      <AuthProvider>
        <AppStateProvider>
          <SyncProvider>
            {children}
          </SyncProvider>
        </AppStateProvider>
      </AuthProvider>
    </ToastProvider>
  )
}
```

### Step 4: What NOT to put in context

- **Board filters** -- only used by BoardPage and its children. Keep as local state.
- **Drag-drop state** -- only used during board drag operations. Keep in `useBoardDragDrop` hook.
- **Modal form state** -- each modal's internal form state stays local to that modal.
- **Sidebar layout state** -- only used by Sidebar. Keep internal.

This is important: context should only be used for state that genuinely crosses component boundaries. Overusing context causes the same re-render problems as having everything in App.tsx.

---

## 5. Restructuring Order (Dependencies Between Changes)

### Phase 1: Shared types (no code changes to logic)

**Extract `src/types.ts`**

- Duration: Small
- Depends on: Nothing
- Blocks: Every subsequent phase (all new modules import from here)
- Test impact: Zero (type-only changes, all existing imports remain valid alongside new ones)

Steps:
1. Create `src/types.ts` with all shared type aliases
2. Add re-exports to the files that currently define them (so existing imports don't break)
3. Gradually update imports in subsequent phases

### Phase 2: Context providers (infrastructure)

**Create `ToastContext`, `AuthContext`, `SyncContext`, `AppStateContext`**

- Duration: Medium
- Depends on: Phase 1
- Blocks: Phase 3 (AppShell needs contexts to replace prop drilling)
- Test impact: Minimal. E2E tests don't test context internals. Unit tests for `board.ts` and `remoteAppState.ts` are unaffected.

Steps:
1. Create each context module with provider and hook
2. Move state and handlers from App.tsx into providers
3. App.tsx wraps its return in `<AppProviders>`
4. At this point, App.tsx still renders everything directly -- it just uses `useToast()`, `useAuth()`, etc. instead of local state
5. Run all tests. Nothing should break because the component tree is identical.

### Phase 3: Shell extraction (layout restructuring)

**Extract `AppShell.tsx`, `AuthGateRouter.tsx`**

- Duration: Medium
- Depends on: Phase 2
- Blocks: Phase 4
- Test impact: Minimal. E2E tests find elements by role/label, not component structure. The rendered HTML is unchanged.

Steps:
1. Move the sidebar hover zone + main shell + modal rendering into `AppShell.tsx`
2. Move auth gate early returns into `AuthGateRouter.tsx`
3. Move sidebar internal state (pin, hover, touch, compact) into `Sidebar.tsx`
4. App.tsx becomes ~30 lines
5. Run all tests

### Phase 4: Hook extraction (logic restructuring)

**Extract `useBoardDragDrop`, `useCardOperations`, `useModalManager`**

- Duration: Medium
- Depends on: Phase 2 (contexts must exist for hooks to read from)
- Blocks: Phase 5
- Test impact: Minimal. These hooks contain the same logic, just relocated. E2E tests exercise the same user flows.

Steps:
1. Extract each hook one at a time
2. After each extraction, run E2E tests to verify drag-drop, card operations, and modal flows still work
3. Update `BoardPage` to call `useBoardDragDrop` internally rather than receiving drag props
4. Update `AppShell` to call `useModalManager` for modal rendering

### Phase 5: Decompose useAppEffects (effect restructuring)

**Split into `useLocalPersistence`, `useRemoteSync`, `useKeyboardShortcuts`, `useDataImport`**

- Duration: Medium
- Depends on: Phase 2 (contexts), Phase 4 (hooks provide the UI state that effects reference)
- Blocks: Nothing (can proceed to Phase 6 in parallel)
- Test impact: Medium. The `remoteAppState.test.ts` tests are unaffected (they test the sync functions, not the hook). Keyboard shortcut E2E tests exercise the same behavior. Run full E2E suite.

Steps:
1. Extract `useLocalPersistence` first (simplest, handles debounced localStorage save)
2. Extract `useRemoteSync` (most complex, handles remote save/load/conflict)
3. Extract `useKeyboardShortcuts` (reads modal state from context/hooks)
4. Extract `useDataImport` (handles file input)
5. Delete `useAppEffects.ts` once empty
6. Run full test suite

### Phase 6: Large component splitting (UI restructuring)

**Split `SettingsPage`, `CardDetailPanel`**

- Duration: Medium
- Depends on: Phase 2 (contexts provide state without prop drilling)
- Blocks: Nothing
- Test impact: Minimal for SettingsPage (E2E tests interact via labels and form elements, not component structure). Minimal for CardDetailPanel (same reasoning).

Steps:
1. Extract settings tab components one at a time
2. Extract card detail sections one at a time
3. Run E2E tests after each extraction (`settings.spec.ts`, `card-crud.spec.ts`)

### Phase 7: board.ts splitting (domain restructuring)

**Split into `src/models/` modules**

- Duration: Large
- Depends on: Nothing (can start any time, but doing it last means less churn during earlier phases)
- Blocks: Nothing
- Test impact: `board.test.ts` imports from `'./board'`. The barrel re-export in `models/index.ts` ensures backward compatibility. No test changes needed.

Steps:
1. Create `src/models/` directory
2. Move types and constants first
3. Move business logic functions one domain at a time (card, portfolio, board, state)
4. Create `src/models/index.ts` barrel that re-exports everything
5. Update `src/board.ts` to be a thin re-export wrapper: `export * from './models'`
6. Run unit tests (`board.test.ts` must pass without changes)
7. Gradually update imports across codebase to use specific modules

---

## 6. How to Restructure Without Breaking Existing Tests

### Principles

1. **Re-export wrappers for backward compatibility.** When moving exports from `board.ts` to `models/*.ts`, keep `board.ts` as a barrel re-export. Tests importing from `'./board'` continue to work.

2. **Preserve rendered HTML structure.** E2E tests find elements by `getByRole`, `getByLabel`, `getByText`, and CSS class names. As long as the HTML output stays the same, component restructuring is invisible to Playwright.

3. **One extraction at a time, test after each.** Never do two extractions before running the test suite. If tests break, the cause is obvious.

4. **Context providers wrap the same tree.** Adding `<ToastProvider>` around the existing component tree does not change what renders. The provider just makes state available via a different mechanism (context instead of props).

5. **Keep function signatures identical during extraction.** When moving `handleBoardDragEnd` from App.tsx to `useBoardDragDrop`, the function's behavior must be byte-for-byte identical. Only the location changes.

### Test-specific safeguards

| Test file | What it relies on | Restructuring risk |
|-----------|-------------------|-------------------|
| `smoke.spec.ts` | Heading text "Creative Board", localStorage keys, role selectors by `aria-label` | Low. These are in rendered HTML, not component structure. |
| `card-crud.spec.ts` | Button labels, card title text, toast messages | Low. Card operations produce same output. |
| `drag-drop.spec.ts` | Draggable elements, lane drop zones, toast messages | Low. DnD context produces same DOM. |
| `settings.spec.ts` | Form labels, tab navigation, button text | Low. Settings tabs render same forms. |
| `people.spec.ts` | Form labels, table rows, button text | Low. PeopleSection renders same UI. |
| `auth-sync.spec.ts` | Auth gate text, localStorage E2E keys | Low. Auth gates render same content. |
| `board.test.ts` | Imports from `'./board'` | Zero risk with barrel re-export. |
| `remoteAppState.test.ts` | Imports from `'./remoteAppState'` | Zero risk. This file is not restructured. |

### Run order after each phase

```
npm run lint          # Catch import errors
npm run test:unit     # board.test.ts + remoteAppState.test.ts
npm run test:e2e      # Full Playwright suite
```

---

## 7. File Structure After Restructuring

```
src/
  types.ts                          # Shared types (ToastTone, SyncStatus, etc.)
  App.tsx                           # ~30 lines: providers + auth gate + shell
  board.ts                          # Re-export barrel: export * from './models'

  models/                           # Domain logic (split from board.ts)
    index.ts                        # Barrel re-export
    types.ts                        # Interfaces: Card, Portfolio, AppState, etc.
    constants.ts                    # STAGES, PLATFORMS, etc.
    card.ts                         # Card CRUD, move, archive
    portfolio.ts                    # Portfolio, brand, team member operations
    board.ts                        # Board model building, columns, lanes
    state.ts                        # AppState creation, coercion, persistence
    settings.ts                     # Settings, task types, revision reasons
    formatting.ts                   # Date, duration, label formatting
    seed.ts                         # Seed state, imported cards

  contexts/                         # React context providers
    ToastContext.tsx
    AuthContext.tsx
    SyncContext.tsx
    AppStateContext.tsx
    AppProviders.tsx                 # Composes all providers

  hooks/                            # Custom hooks
    useBoardDragDrop.ts             # Board drag-drop state and handlers
    useCardOperations.ts            # Card CRUD, comments, drive
    useModalManager.ts              # Modal open/close state
    useLocalPersistence.ts          # Debounced localStorage save
    useRemoteSync.ts                # Remote state sync with Supabase
    useKeyboardShortcuts.ts         # Global keyboard shortcuts
    useDataImport.ts                # JSON file import
    useWorkspaceSession.ts          # Auth + workspace access (existing, unchanged)
    useModalAccessibility.ts        # Modal keyboard accessibility (existing)

  components/                       # React components
    AppShell.tsx                    # Layout shell (sidebar + main + modals)
    AuthGateRouter.tsx              # Auth/access gate logic
    Sidebar.tsx                     # Navigation (owns layout state internally)
    BoardPage.tsx                   # Board view (owns filter + drag state)
    AnalyticsPage.tsx               # Analytics view (existing)
    WorkloadPage.tsx                # Workload view (existing)
    SettingsPage.tsx                # Settings tab router (~100 lines)
    settings/                       # Settings tab components
      GeneralSettings.tsx
      PortfolioSettings.tsx
      PeopleSettings.tsx
      WorkflowSettings.tsx
    CardDetailPanel.tsx             # Card panel shell (~150 lines)
    card-detail/                    # Card detail sections
      CardDetailsSection.tsx
      CardNamingSection.tsx
      CardMetadataSection.tsx
      CardDriveSection.tsx
      CardBriefSection.tsx
      CardLinksSection.tsx
      CardCommentsSection.tsx
      CardActivitySection.tsx
    PeopleSection.tsx               # People management (existing, already scoped)
    WorkspaceAccessManager.tsx      # Access directory (existing, already scoped)
    ... (other existing components unchanged)
```

---

## 8. Risks and Mitigations

| Risk | Mitigation |
|------|-----------|
| Context re-renders: Wrapping state in context could cause broad re-renders | Split contexts by update frequency. Domain state (changes rarely) is separate from sync state (changes on every save). Use `useMemo` for context values. |
| Stale closures in extracted hooks | Follow the existing pattern of using refs for latest values (`replaceStateRef`, `showToastRef`). The codebase already does this correctly. |
| Import cycle between contexts | Contexts only import from `types.ts` and `models/`. They never import from each other. `AppProviders.tsx` imports all contexts but only to compose them. |
| Barrel re-export performance | Vite's tree-shaking handles barrel files well. No bundle size impact. In development, barrel imports may slow HMR slightly for very large files, but splitting `board.ts` into smaller modules actually improves this. |
| Phase ordering violations | Each phase lists its dependencies. Do not start a phase until its dependencies are complete. |

---

## 9. What Not to Change

1. **`remoteAppState.ts`** -- 329 lines, well-scoped, has unit tests. Leave it alone.
2. **`supabase.ts`** -- 889 lines but focused on Supabase integration. Restructure separately if needed (not part of component architecture).
3. **`accessHelpers.ts`** and **`appHelpers.ts`** -- Small utility modules, already well-scoped.
4. **E2E test files** -- Do not modify E2E tests as part of restructuring. If a test breaks, the restructuring introduced a regression.
5. **`BoardCardSurface.tsx`**, **`SortableBoardCard.tsx`**, **`LaneDropZone.tsx`** -- Already small and focused.
6. **Modal components** (`DeleteCardModal`, `BackwardMoveModal`, `QuickCreateModal`, etc.) -- Already small and focused. Only their callers change.

---

## 10. Success Criteria

After restructuring is complete:

- [ ] `App.tsx` is under 50 lines
- [ ] No component file exceeds 500 lines
- [ ] No hook takes more than 10 parameters (most take 0-3 via context)
- [ ] `ToastTone`, `SyncStatus`, and other shared types are defined exactly once
- [ ] All 12 E2E test specs pass
- [ ] Both unit test files pass
- [ ] `npm run lint` passes
- [ ] `npm run build` succeeds
- [ ] No circular dependencies between modules

---

*Last updated: 2026-03-16*
