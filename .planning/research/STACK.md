# Stack Research: Restructuring a React 19 Production Management App

## Context

This research addresses the restructuring needs of an ~18,300-line React 19 / TypeScript / Supabase application used for creative production management. The codebase has:

- A monolithic `App.tsx` (1,823 lines) managing 30+ state variables, drag-and-drop, modals, auth flows, keyboard shortcuts, and page routing
- `useAppEffects` hook with 43 parameters (extreme prop drilling)
- Four additional oversized components: `PeopleSection` (1,301), `SettingsPage` (1,290), `CardDetailPanel` (1,146), `WorkspaceAccessManager` (990)
- A single `useState<AppState>` holding the entire application domain model (portfolios, cards, settings, notifications, roles)
- Multiple competing state patterns: `useState`, custom hooks, localStorage, Supabase remote sync
- A local-first architecture with remote sync to Supabase (conflict detection via JSON signature comparison)

The app needs to remain on its current stack (React 19, TypeScript 5.9, Vite 7, Supabase) with no migration to a different framework.

---

## 1. State Management Recommendation: Zustand

### Decision: Use Zustand (not Context API, not Jotai, not Redux)

### Why Zustand

**Zustand is the right choice for this specific app** because of three factors that distinguish it from alternatives:

1. **Subscription-based re-renders solve the AppState problem.** The current app holds everything in a single `useState<AppState>`, so any change to any field re-renders the entire component tree. Zustand lets components subscribe to specific slices of state. When a card moves, only the board re-renders -- not the settings page, not the people section, not the sidebar. Context API cannot do this without splitting into dozens of separate contexts, which creates its own maintenance burden.

2. **Store-outside-React fits the local-first sync architecture.** The current remote sync logic in `useAppEffects` and `remoteAppState.ts` needs to read and write application state from outside the React render cycle (timers, debounced saves, conflict resolution). Zustand stores live outside React -- you can call `getState()` and `setState()` from any module, any timer, any callback, without needing hooks or refs. This eliminates the pattern of passing `setState` through 43 parameters just so an effect can update state.

3. **Persist middleware replaces the manual localStorage abstraction.** The codebase has 29 direct `window.localStorage` calls and duplicated storage keys across files. Zustand's `persist` middleware handles localStorage serialization, hydration, and migration in one place. Combined with the app's existing `STATE_VERSION` pattern, this gives a clean upgrade path for the storage layer identified in CONCERNS.md.

### Why NOT Context API

Context API re-renders every consumer when any value in the context changes. For this app, where `AppState` contains portfolios (with cards, brands, team members), settings, notifications, and roles, putting AppState in Context would cause the same re-render problem that exists today. Splitting into many focused contexts (BoardContext, SettingsContext, AuthContext, etc.) is viable for 3-4 contexts but becomes unwieldy at the scale this app requires. Context is the right tool for truly static or rarely-changing values (theme, auth session, workspace access) -- not for frequently-changing domain state like card positions and board filters.

### Why NOT Jotai

Jotai's atomic model is powerful for apps with complex inter-dependent state relationships (e.g., spreadsheet cells, collaborative editors). This app's state is a tree, not a graph: portfolios contain cards, settings contain task types, filters derive from portfolios. A tree-shaped state fits naturally into Zustand slices. Jotai's bottom-up mental model would be unfamiliar to AI maintainers and adds unnecessary conceptual overhead for this use case. Additionally, the local-first sync pattern (load full state snapshot, diff, save full state snapshot) maps cleanly to Zustand's top-level store approach, whereas Jotai would require coordinating dozens of atoms during sync.

### Why NOT Redux Toolkit

Redux Toolkit is excellent and well-proven. However, its boilerplate (slices, reducers, actions, selectors, store configuration) is heavier than Zustand for a team of this size (one non-developer owner, AI-maintained). Zustand provides the same benefits (predictable updates, middleware, devtools) with less ceremony. For an AI-maintained codebase, less boilerplate means fewer places for things to go wrong.

---

## 2. Zustand Store Architecture

### Store Design: Three Focused Stores, Not One God Store

Do NOT replicate the current monolithic `useState<AppState>` as a single Zustand store. Instead, split into stores aligned with update frequency and consumer scope:

```
boardStore        -- portfolios, cards, activePortfolioId, activeRole, notifications
                     (high frequency: drag-drop, card edits, stage moves)

settingsStore     -- globalSettings (general, capacity, taskLibrary, revisionReasons, integrations)
                     (low frequency: changed only on settings page)

uiStore           -- boardFilters, selectedCard, quickCreateOpen, sidebarState,
                     expandedStages, dragState, modals, toasts, syncStatus
                     (high frequency but only affects specific UI regions)
```

**Why three stores:**
- Card drag-and-drop should never trigger settings re-renders
- Settings changes should never cause the board to recompute columns
- UI state (modals, filters, toasts) is ephemeral and should not be persisted to Supabase

**What to persist:**
- `boardStore` -- persisted to both localStorage AND Supabase (this is the "source of truth" domain state)
- `settingsStore` -- persisted to both localStorage AND Supabase (bundled with boardStore during remote sync, but separate in-memory for performance)
- `uiStore` -- persisted to localStorage ONLY (board filters, sidebar state); never sent to Supabase

### Persist and Sync Pattern

```typescript
// boardStore.ts -- simplified example
import { create } from 'zustand'
import { persist, createJSONStorage } from 'zustand/middleware'

interface BoardState {
  portfolios: Portfolio[]
  activePortfolioId: string
  activeRole: ActiveRole
  notifications: AppNotification[]
  version: number
  // Actions co-located with state
  moveCard: (portfolioId: string, cardId: string, dest: StageId, index: number) => void
  addCard: (portfolioId: string, card: Card) => void
  setActivePortfolio: (id: string) => void
}

export const useBoardStore = create<BoardState>()(
  persist(
    (set, get) => ({
      portfolios: [],
      activePortfolioId: '',
      activeRole: { mode: 'owner', editorId: null },
      notifications: [],
      version: STATE_VERSION,
      moveCard: (portfolioId, cardId, dest, index) =>
        set((state) => moveCardInPortfolio(state, portfolioId, cardId, dest, index)),
      addCard: (portfolioId, card) =>
        set((state) => addCardToPortfolio(state, portfolioId, card)),
      setActivePortfolio: (id) => set({ activePortfolioId: id }),
    }),
    {
      name: 'production-board-state',
      version: STATE_VERSION,
      storage: createJSONStorage(() => localStorage),
      migrate: (persisted, version) => {
        // Existing coerceAppState logic goes here
        return coerceAppState(persisted, version)
      },
    }
  )
)
```

### Remote Sync Integration

The remote sync module (`remoteAppState.ts`) should import the stores directly rather than receiving state through parameters:

```typescript
// remoteSync.ts -- reads/writes store from outside React
import { useBoardStore } from './stores/boardStore'
import { useSettingsStore } from './stores/settingsStore'

export function buildRemoteSnapshot(): RemoteSnapshot {
  const board = useBoardStore.getState()
  const settings = useSettingsStore.getState()
  return { portfolios: board.portfolios, settings: settings, ... }
}

export function applyRemoteSnapshot(snapshot: RemoteSnapshot): void {
  useBoardStore.setState({ portfolios: snapshot.portfolios, ... })
  useSettingsStore.setState({ ...snapshot.settings })
}
```

This eliminates the 43-parameter `useAppEffects` interface. The sync module accesses what it needs directly from the stores.

---

## 3. Component Decomposition Strategy

### Principle: Composition Over Delegation

The current `App.tsx` is both a "component that implements various stuff" AND a "component that composes components together." These two roles must be separated. After restructuring, `App.tsx` should be purely a composition shell -- it renders child components and nothing else. All logic moves into stores, hooks, or child components.

### Decomposition Plan for App.tsx (1,823 lines)

Split into these focused components and hooks:

| Extracted Unit | Responsibility | Current Location in App.tsx |
|---|---|---|
| `AppShell` | Layout grid (sidebar + header + main content area) | Lines ~390-end (the JSX return) |
| `BoardDndProvider` | DndContext setup, sensors, drag handlers | Lines ~477-620 (drag event handlers) |
| `PageRouter` | Renders correct page based on `activePage` | Lines ~700+ (conditional rendering) |
| `LocalModeBanner` | Dev-mode role switcher | Lines ~389-441 |
| `HeaderToolbar` | Sync pill, notification bell, shortcuts button | Lines ~443-475 |
| `useRemoteSync` hook | All remote sync logic (load, save, conflict) | Currently in `useAppEffects` lines 261-355 |
| `useBoardKeyboardShortcuts` hook | Keyboard shortcut handling | Currently in `useAppEffects` keyboard section |
| `useAutoArchive` hook | Archive eligibility interval check | Currently in `useAppEffects` lines 422-430 |
| `useLocalPersist` hook | Debounced localStorage save | Currently in `useAppEffects` lines 163-178 |

**After decomposition, `App.tsx` should be ~100-150 lines** -- just composing the shell, providers, and pages.

### Decomposition Plan for Other Large Components

**PeopleSection (1,301 lines) --> Split into:**
- `PeopleSection` (container, ~100 lines) -- fetches data from stores, renders sub-components
- `PersonRow` (presentational, ~150 lines) -- single team member row
- `PersonEditForm` (form, ~200 lines) -- edit modal for a team member
- `AccessEntryManager` (feature, ~200 lines) -- workspace access CRUD for a person
- `usePeopleRows` hook (~150 lines) -- builds row data with index maps (fixes the O(n^2) `.find()` issue)

**SettingsPage (1,290 lines) --> Split into:**
- `SettingsPage` (router, ~80 lines) -- tab navigation, renders active tab
- `GeneralSettingsTab` (~200 lines)
- `PortfolioSettingsTab` (~250 lines)
- `PeopleSettingsTab` (~200 lines) -- thin wrapper around PeopleSection
- `WorkflowSettingsTab` (~200 lines) -- task library + revision reasons

**CardDetailPanel (1,146 lines) --> Split into:**
- `CardDetailPanel` (container, ~150 lines) -- layout, open/close animation
- `CardHeader` (~100 lines) -- title, type badge, stage, priority
- `CardFieldsSection` (~200 lines) -- type-specific field rendering (critical for new task types)
- `CardCommentsSection` (~150 lines) -- comment list + add comment form
- `CardActivityLog` (~100 lines) -- activity timeline
- `CardLinksSection` (~80 lines) -- Frame.io, Drive, attachments

### Extraction Rules

1. **A component should be either a "logic container" or a "composition shell", never both.** If it has `useState`/`useEffect` AND renders multiple sections of JSX, it needs splitting.
2. **Custom hooks should have 0-3 parameters.** If a hook needs more than 3 inputs, it should read from stores directly.
3. **No component file should exceed 400 lines.** This is a hard limit. If it exceeds 400, it's doing too much.
4. **Presentational components receive data via props; container components read from stores.** This boundary determines where Zustand `useStore` calls happen.

---

## 4. What NOT To Do (And Why)

### Do NOT use React Context for frequently-changing state

Context re-renders all consumers on every change. Using Context for `AppState` (which changes on every card drag, every filter toggle, every keystroke in search) will cause the same performance issues that exist today. Context is appropriate for auth session, theme, and locale -- values that change at most a few times per session.

### Do NOT create a single monolithic Zustand store

Replacing `useState<AppState>` with `create<AppState>()` in Zustand gains nothing. The re-render optimization only works when components subscribe to slices. If the entire state is one object and you subscribe to the whole thing, every update re-renders every subscriber. Split into 3 stores as described above.

### Do NOT use `useReducer` as the primary state management

`useReducer` is valuable for complex state transitions within a single component, but it does not solve prop drilling (the state still lives in the component that calls `useReducer`, and must be passed down). It also does not provide subscription-based re-renders. For this codebase, Zustand provides the reducer-like predictability (`set((state) => ...)`) with the additional benefits of subscription-based rendering and store-outside-React access.

### Do NOT adopt Feature Sliced Design (FSD) or micro-frontend architecture

The codebase is 18K lines with a single deployment target (Vercel). FSD and micro-frontends are designed for large organizations with multiple teams. They add organizational overhead (barrel files, cross-slice dependency rules, module federation) that will slow down AI-assisted development without providing benefits at this scale. A flat feature-folder structure (see below) is sufficient.

### Do NOT introduce TanStack Query / React Query

The app uses a local-first sync model, not a request-response API model. TanStack Query is designed for caching server responses and managing loading/error states for fetch calls. This app's data flow is: load full state from Supabase once -> merge with local state -> work locally -> debounce-sync back to Supabase. This is a sync problem, not a caching problem. Adding TanStack Query would create two competing data flow models. Keep the existing sync architecture and improve it with Zustand's `getState()`/`setState()`.

### Do NOT extract to a monorepo or npm packages

At 18K lines, the codebase is small enough to stay as a single package. Monorepo overhead (workspace configuration, cross-package types, build orchestration) is not justified.

### Do NOT refactor everything at once

Large-scale refactoring of a working app is high-risk. The restructuring should proceed incrementally:
1. First: introduce Zustand stores alongside existing `useState`, migrating one state slice at a time
2. Second: extract components from App.tsx one by one, verifying E2E tests pass after each extraction
3. Third: migrate remaining components (PeopleSection, SettingsPage, CardDetailPanel)
4. Fourth: remove old prop-drilling plumbing once all consumers read from stores

Each step should be a working commit that passes all tests.

---

## 5. Recommended Folder Structure

```
src/
  stores/
    boardStore.ts          -- portfolios, cards, activePortfolio, role, notifications
    settingsStore.ts       -- globalSettings (general, capacity, taskLibrary, etc.)
    uiStore.ts             -- filters, selectedCard, modals, toasts, sidebar, sync status
  hooks/
    useRemoteSync.ts       -- remote load/save/conflict (replaces sync logic in useAppEffects)
    useLocalPersist.ts     -- debounced localStorage save (uses Zustand persist)
    useAutoArchive.ts      -- archive eligibility interval
    useBoardKeyboard.ts    -- keyboard shortcuts
    useModalAccessibility.ts  -- (existing)
    useWorkspaceSession.ts    -- (existing, but simplified: reads auth state from store)
  components/
    App.tsx                -- composition shell only (~100-150 lines)
    AppShell.tsx           -- layout grid
    board/
      BoardPage.tsx
      BoardDndProvider.tsx
      BoardColumn.tsx      -- (extract from BoardPage if needed)
      SortableBoardCard.tsx
      BoardCardSurface.tsx
      LaneDropZone.tsx
      CardDetailPanel.tsx
      CardHeader.tsx
      CardFieldsSection.tsx
      CardCommentsSection.tsx
      CardActivityLog.tsx
      CardLinksSection.tsx
    settings/
      SettingsPage.tsx
      GeneralSettingsTab.tsx
      PortfolioSettingsTab.tsx
      PeopleSettingsTab.tsx
      WorkflowSettingsTab.tsx
      TaskLibraryEditor.tsx
      RevisionReasonLibraryEditor.tsx
    people/
      PeopleSection.tsx
      PersonRow.tsx
      PersonEditForm.tsx
      AccessEntryManager.tsx
    shared/
      AuthGate.tsx
      AccessGate.tsx
      AccessVerificationGate.tsx
      ConfirmDialog.tsx
      ErrorBoundary.tsx
      HeaderToolbar.tsx
      LocalModeBanner.tsx
      NotificationBell.tsx
      PageHeader.tsx
      QuickCreateModal.tsx
      RichTextEditor.tsx
      Sidebar.tsx
      SyncStatusPill.tsx
      ToastStack.tsx
  lib/
    board.ts               -- pure business logic (unchanged)
    appHelpers.ts          -- (unchanged)
    accessHelpers.ts       -- (unchanged)
    remoteAppState.ts      -- refactored to use store.getState()/setState()
    supabase.ts            -- (unchanged, but E2E mode extracted to lib/testing.ts)
    storage.ts             -- StorageManager abstraction (replaces raw localStorage calls)
    testing.ts             -- E2E mode detection, shared constants
```

---

## 6. Migration Path Summary

| Phase | Scope | Risk | Verification |
|---|---|---|---|
| 1 | Create Zustand stores, populate from existing `loadAppState()`. Components still use props. | Low -- additive only | All tests pass, stores hydrate correctly |
| 2 | Migrate App.tsx to read from stores instead of local state. Extract `AppShell`, `PageRouter`, `HeaderToolbar`. | Medium -- changes data flow | All E2E tests pass |
| 3 | Replace `useAppEffects` 43-param interface with focused hooks that read from stores directly. | Medium -- removes prop drilling backbone | All E2E tests pass, sync still works |
| 4 | Decompose `PeopleSection`, `SettingsPage`, `CardDetailPanel` into sub-components. | Low -- presentational extraction | All E2E tests pass |
| 5 | Remove localStorage raw access, replace with Zustand persist + `StorageManager`. Clean up duplicated types and utilities. | Low -- infrastructure cleanup | All tests pass, state persists correctly |

---

## Sources

- [React project structure for scale: decomposition, layers and hierarchy](https://www.developerway.com/posts/react-project-structure)
- [State Management in 2025: When to Use Context, Redux, Zustand, or Jotai](https://dev.to/hijazi313/state-management-in-2025-when-to-use-context-redux-zustand-or-jotai-2d2k)
- [Do You Need State Management in 2025? React Context vs Zustand vs Jotai vs Redux](https://dev.to/saswatapal/do-you-need-state-management-in-2025-react-context-vs-zustand-vs-jotai-vs-redux-1ho)
- [React State Management in 2025: Zustand vs. Redux vs. Jotai vs. Context](https://www.meerako.com/blogs/react-state-management-zustand-vs-redux-vs-context-2025)
- [State Management Trends in React 2025: When to Use Zustand, Jotai, XState, or Something Else](https://makersden.io/blog/react-state-management-in-2025)
- [React 19: State Management with Zustand](https://medium.com/@reactjsbd/react-19-state-management-with-zustand-a-developers-guide-to-modern-state-handling-8b6192c1e306)
- [Working with Zustand (TkDodo)](https://tkdodo.eu/blog/working-with-zustand)
- [Persisting store data - Zustand](https://zustand.docs.pmnd.rs/reference/integrations/persisting-store-data)
- [How to Eliminate Prop Drilling Completely: The 2025 State Architecture Guide](https://medium.com/@tejasvinavale1599/how-to-eliminate-prop-drilling-completely-the-2025-state-architecture-guide-for-react-developers-54460d9f3683)
- [React components composition: how to get it right](https://www.developerway.com/posts/components-composition-how-to-get-it-right)
- [React 19 Best Practices: Write Clean, Modern, and Efficient React Code](https://dev.to/jay_sarvaiya_reactjs/react-19-best-practices-write-clean-modern-and-efficient-react-code-1beb)
- [React 19 useReducer Deep Dive](https://dev.to/a1guy/react-19-usereducer-deep-dive-from-basics-to-complex-state-patterns-3fpi)
- [Modular Monolith: A disruptive guide to architecting your React app](https://dev.to/artiumws/modular-monolith-a-disruptive-guide-to-architecting-your-react-app-2gji)
- [State Management in 2025: Context vs Zustand vs Jotai](https://www.mikul.me/blog/state-management-2025-context-zustand-jotai)
- [Zustand and TanStack Query: The Dynamic Duo That Simplified My React State Management](https://javascript.plainenglish.io/zustand-and-tanstack-query-the-dynamic-duo-that-simplified-my-react-state-management-e71b924efb90)
