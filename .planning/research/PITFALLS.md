# Pitfalls: React Refactoring of an AI-Maintained Codebase

Research into common mistakes when restructuring monolithic React applications, specifically calibrated for a vibe-coded, AI-maintained codebase with a non-developer owner.

---

## Pitfall 1: Breaking E2E Tests by Changing DOM Structure

**What goes wrong**: When you break a 1,824-line App.tsx into smaller components, the DOM tree changes. Elements move, nesting depth changes, and wrapper divs appear or disappear. E2E tests that rely on DOM structure, CSS selectors, or positional queries silently break or become flaky.

**Why this matters here**: This codebase has 12 Playwright spec files that are the primary safety net. The tests use `getByRole`, `getByLabel`, and `getByText` selectors (which is good), but they also reference specific UI text like `"Creative Board"` and button labels like `"+ Add card"`. If component extraction changes how elements are rendered (e.g., wrapping a section in a new component that adds a containing div), accessible names or label associations can break.

**Warning signs**:
- E2E tests pass locally but fail in CI after a component extraction
- Tests that worked before a split now time out waiting for elements
- `getByLabel` calls fail because the label-input association was broken by moving the input into a child component without forwarding the label relationship

**Prevention strategy**:
- Run the full E2E suite after every individual component extraction, not just at the end
- Before extracting a component, identify which E2E tests touch that area (search test files for relevant button/label text)
- Never change user-visible text, ARIA labels, or role attributes during a structural refactor
- If a test breaks, fix the component structure (not the test) unless the test was testing an implementation detail

**Phase**: Must be enforced throughout the entire component extraction phase. Every PR that moves JSX into a new component must pass all 12 E2E specs before merge.

---

## Pitfall 2: Context Re-render Cascades

**What goes wrong**: The most common mistake when replacing prop drilling with React Context is putting too much state into a single context provider. Every component consuming that context re-renders whenever any value in the context changes. With 30+ `useState` calls currently in App.tsx, wrapping them all in one `AppContext` would make performance worse than the current monolith.

**Why this matters here**: App.tsx currently holds state for drag-and-drop, modals, sync status, board filters, sidebar state, toasts, keyboard shortcuts, and core app state (the `AppState` object from board.ts). These update at vastly different frequencies: drag state changes many times per second during a drag, while sync status changes every few seconds, and board filters change on user action. Merging them into one context means a drag operation would re-render the settings page.

**Warning signs**:
- UI feels sluggish after introducing context, especially during drag-and-drop
- React DevTools Profiler shows components re-rendering that should not be affected by the current user action
- Board becomes janky when the remote sync status changes

**Prevention strategy**:
- Split state into multiple contexts by update frequency and domain:
  - `BoardContext` (core AppState, cards, portfolios) -- low frequency
  - `UIContext` (modals, sidebar, selected card) -- medium frequency
  - `DragContext` (dragCardId, dragOverLaneId, blockedLaneId) -- high frequency during drags
  - `SyncContext` (syncStatus, lastSyncedAt) -- independent lifecycle
- Alternatively, consider Zustand over Context for frequently-updating state. Zustand only re-renders components that subscribe to the specific slice that changed, avoiding the re-render cascade entirely
- Never put setter functions and state values in the same context object unless you memoize the object properly
- Profile before and after with React DevTools to verify re-render counts did not increase

**Phase**: State management architecture must be decided before component extraction begins. Extracting components first and adding context second leads to two rounds of refactoring.

---

## Pitfall 3: Extracting Components Without Extracting Logic

**What goes wrong**: The refactor moves JSX into new component files but leaves all the state, handlers, and effects in App.tsx. The result is the same monolith with extra files -- you now have a 1,500-line App.tsx that passes 25 props to each child. This is sometimes called the "prop waterfall" anti-pattern and it is the single most common mistake in React refactoring projects.

**Why this matters here**: `useAppEffects` already has a 43-parameter interface. If component extraction is done by just moving `<BoardPage>` or `<SettingsPage>` JSX into separate files without also moving the relevant state and handlers, the prop count will increase, not decrease. The AI-maintained context makes this especially dangerous because an AI will happily add parameter #44 and #45 without recognizing the pattern is getting worse.

**Warning signs**:
- New component files that receive more than 8-10 props
- App.tsx line count does not meaningfully decrease after extraction
- `useAppEffects` parameter interface grows instead of shrinking
- Child components receive props they immediately pass to their own children (second-level drilling)

**Prevention strategy**:
- For each component extraction, identify which state variables are used only within that subtree and co-locate them with the component
- Move related `useState` calls, handlers, and effects into the extracted component or into a co-located custom hook (e.g., `useBoardDrag` lives next to `BoardPage`)
- Set a hard rule: no component receives more than 10 props. If it needs more, state needs to move closer or into context
- After each extraction, verify that the `useAppEffects` interface parameter count decreased (or at minimum did not increase)

**Phase**: This is the core risk during the component extraction phase. Each extraction must move both UI and logic together.

---

## Pitfall 4: Breaking the Remote Sync Contract

**What goes wrong**: The remote state sync system (`remoteAppState.ts`) creates snapshots of `AppState` for Supabase persistence. It strips local-only fields (activePortfolioId, activeRole, activePage, notifications) to create a canonical remote representation. Refactoring the `AppState` shape -- renaming fields, changing nesting, splitting into multiple state objects -- breaks the snapshot logic and the JSON signature comparison used for conflict detection.

**Why this matters here**: The sync system uses `JSON.stringify(createRemoteStateSnapshot(state))` as a signature to detect changes. If the refactoring changes how state is structured (e.g., moving portfolios into their own context slice, or renaming `activePortfolioId`), the signature computation breaks. Existing remote state in Supabase will not match the new local format. The `STATE_VERSION` is currently 3, so there is a migration mechanism, but it requires explicit handling.

**Warning signs**:
- "Saving..." indicator never resolves after refactoring (the save loop bug that was already fixed once in commit `f169920`)
- State loads from remote but local changes are not persisted
- Conflict detection triggers on every load even when nothing changed
- `coerceAppState` throws or produces malformed state after loading old remote data

**Prevention strategy**:
- Treat `AppState` interface in `board.ts` as a public API: any shape changes require a `STATE_VERSION` bump and migration function
- If introducing a state management library, keep the serialization layer separate from the store layer: the store can use whatever internal shape it wants, but `createRemoteStateSnapshot` must produce the same JSON as before
- Write a unit test that verifies `getRemoteStateSignature` produces identical output for the same logical state before and after the refactor
- Test against a real Supabase instance (not just E2E mocks) after any state shape changes

**Phase**: Critical constraint throughout. Any state restructuring must include a sync compatibility check.

---

## Pitfall 5: Refactoring Scope Creep

**What goes wrong**: A refactoring project that starts as "break up App.tsx" expands into "fix the sync system," "migrate to Zustand," "add proper logging," "rewrite the rich text editor," and "redesign the settings page" -- all at once. The codebase enters an unstable state where nothing works fully. For AI-maintained codebases this is especially dangerous because the AI has no intuition for when it is taking on too much at once.

**Why this matters here**: CONCERNS.md lists 22 issues across 11 categories. PROJECT.md has 15+ active requirements. The temptation to fix everything during the restructuring is strong, and an AI assistant will comply with any request to "also fix X while you're in there." But each additional change multiplies the risk of regressions and makes it harder to isolate what broke.

**Warning signs**:
- Multiple unrelated changes in the same commit or PR
- The refactoring branch touches files that were not part of the original extraction plan
- Bug fixes are mixed with structural changes, making it impossible to revert one without the other
- The E2E suite goes from green to red and it is unclear which change caused it

**Prevention strategy**:
- Define an explicit ordering: (1) extract components with logic, (2) introduce state management, (3) fix bugs, (4) add features. Never combine phases
- Each PR should do exactly one thing: extract one component, or move one piece of state. Small, reviewable, revertible
- Maintain a "do not touch" list of files that should not change during structural refactoring (e.g., `remoteAppState.ts`, `supabase.ts`, `board.ts` type definitions)
- Keep a separate backlog for bugs discovered during refactoring. Document them but do not fix them in the same PR

**Phase**: Planning phase decision. The roadmap must enforce strict phase boundaries.

---

## Pitfall 6: Losing the localStorage Contract

**What goes wrong**: The app uses localStorage extensively (34 direct calls across 6 files) for persistence, E2E test mode, auth state, and sync metadata. Refactoring that changes storage keys, read/write timing, or introduces a storage abstraction layer can break: (a) existing user sessions (they lose their board state), (b) E2E test infrastructure (which injects state via specific localStorage keys), (c) auth flow (which stores tokens in localStorage).

**Why this matters here**: The E2E tests manipulate specific localStorage keys directly:
- `creative-board-state` (main app state)
- `editors-board-e2e-auth-mode` (test mode toggle)
- `editors-board-e2e-auth-email` (test user identity)
- `editors-board-e2e-remote-state` (remote state mock)

These keys are hardcoded in both the app and the test files. A storage abstraction is planned (PROJECT.md lists "Abstract localStorage access behind a storage service"), but if done during the component refactoring rather than as a separate, dedicated step, it will break all 12 E2E specs simultaneously.

**Warning signs**:
- E2E tests fail with "element not found" because the app did not initialize from the injected localStorage state
- Users report losing their board after an update (localStorage key was renamed or read timing changed)
- Auth flow breaks because the storage abstraction introduced async behavior where sync access was expected

**Prevention strategy**:
- Introduce the storage abstraction as an isolated change with its own PR and test pass, before or after component extraction, never during
- The abstraction must use the exact same keys initially -- rename keys only after the abstraction is stable
- Update E2E test helpers to use the abstraction if possible, or at minimum ensure the abstraction is transparent to tests
- Add a unit test that verifies all expected localStorage keys are read/written correctly

**Phase**: Should be its own dedicated phase, either before component extraction (to simplify later refactoring) or after (to avoid compounding changes).

---

## Pitfall 7: AI-Generated God Components Reassemble

**What goes wrong**: In an AI-maintained codebase, the same forces that created the 1,824-line App.tsx will recreate it after refactoring. When the owner asks the AI to "add a new modal" or "add a keyboard shortcut," the AI will add state and JSX wherever it finds existing patterns. If the refactored structure is not clearly documented and enforced, new features accumulate in whatever file the AI touches first -- usually the top-level component.

**Why this matters here**: This is a non-developer owner relying entirely on AI for code changes. The AI does not have persistent memory of architectural decisions. Without explicit structural guidelines (e.g., "modals go in /components/modals/, modal state goes in UIContext, new keyboard shortcuts go in useKeyboardShortcuts"), the AI will follow the path of least resistance, which is adding code to the existing file.

**Warning signs**:
- App.tsx (or its successor) starts growing again within weeks of the refactor
- New features are added as inline state in the top-level component instead of in the appropriate context or component
- The prop drilling count creeps back up
- Duplicated patterns emerge (same modal management logic in multiple places)

**Prevention strategy**:
- Create a STRUCTURE.md (or equivalent) that documents where each type of code belongs: component files, hook files, context providers, utility functions
- Include a "where to add new code" section that explicitly addresses common additions: new modals, new pages, new card fields, new settings tabs
- Add a pre-refactoring architectural decision record (ADR) so the AI can reference it in future sessions
- Consider adding ESLint rules that enforce file size limits (e.g., max 400 lines per component file) as an automated guardrail
- Periodically audit file sizes as a health check

**Phase**: Architecture documentation must be created during the planning phase and enforced throughout all subsequent phases.

---

## Pitfall 8: Unit Test Mocking Becomes Impossible

**What goes wrong**: The existing unit tests (`board.test.ts`, `remoteAppState.test.ts`) test pure functions that take `AppState` and return modified state. These are clean and easy to test. When state management is introduced (Context, Zustand, or similar), tests that previously called `addCardToPortfolio(state, card)` now need to render providers, mock contexts, or instantiate stores. The test surface area increases dramatically and existing tests may need rewriting.

**Why this matters here**: `board.ts` (4,002 lines) contains pure state transformation functions that are the backbone of the app. If the refactoring changes these to methods on a store, or wraps them in context-dependent hooks, the existing test strategy breaks. The clean separation between state logic (board.ts) and React rendering (App.tsx) is actually one of the best things about the current architecture.

**Warning signs**:
- Existing unit tests require React rendering context to run after refactoring
- Test files grow significantly in setup/boilerplate
- Previously fast unit tests become slow because they now mount components
- State transformation logic moves from pure functions into hooks that cannot be called outside React

**Prevention strategy**:
- Keep state transformation functions in `board.ts` as pure functions, regardless of what state management approach is used
- The state management layer should call into `board.ts` functions, not replace them
- If using Zustand, store actions should delegate to board.ts: `addCard: (card) => set((state) => addCardToPortfolio(state, card))`
- If using Context, the reducer should delegate to board.ts functions
- Measure: test execution time should not increase after refactoring

**Phase**: State management design phase. The architecture must preserve the pure-function testing strategy.

---

## Pitfall 9: Inconsistent Hydration After Component Splitting

**What goes wrong**: The app has a complex initialization sequence: load from localStorage, check auth, fetch remote state, merge remote with local, handle conflicts. When components are split, each component might try to initialize independently, leading to race conditions: the board renders with stale local state before remote state arrives, or a child component reads from context before the parent has hydrated it.

**Why this matters here**: The current flow is: App.tsx loads state from localStorage on mount, then `useAppEffects` handles remote hydration and merging. This works because it is all in one component with one `useState`. After splitting, if `BoardPage` has its own state and `SettingsPage` has its own state, they might hydrate at different times or from different sources. The `RemoteLoadingShell` component already exists to handle the loading state, but it currently gates the entire app. After splitting, the gating logic needs to work with the new component boundaries.

**Warning signs**:
- Flash of stale/default state before remote data loads
- Settings show different data than the board for a brief moment
- Race conditions where a save triggers before hydration completes, overwriting remote state with empty local state
- The "Saving..." indicator appears immediately on app load (the bug from commit `f169920` recurring)

**Prevention strategy**:
- Keep hydration centralized: one component or hook is responsible for loading state, regardless of how many components consume it
- State management initialization must complete before any child component renders (use a loading gate similar to the existing `RemoteLoadingShell`)
- Add a `hydrated` flag to the state store that child components check before attempting writes
- Write an integration test that verifies: load app -> remote fetch completes -> state is consistent across all pages

**Phase**: Must be designed during the state management architecture phase and verified during component extraction.

---

## Pitfall 10: Drag-and-Drop Breaks Across Component Boundaries

**What goes wrong**: `@dnd-kit` requires that `DndContext`, draggable items, and droppable zones share a common ancestor with specific context providers. When the board is extracted into its own component but the `DndContext` stays in App.tsx (or vice versa), drag-and-drop silently stops working or works inconsistently. Similarly, if the drag handlers reference state that moved to a different context, the handlers capture stale closures.

**Why this matters here**: Drag-and-drop is a core feature (drag cards between stages, reorder within stages). App.tsx currently wraps the entire board in `DndContext` and handles `onDragStart`, `onDragOver`, and `onDragEnd` events. These handlers need access to `state`, `setState`, and several other pieces of state (drag card ID, blocked lane, backward move pending state). If the board is extracted but the handlers stay in App.tsx, the props list grows. If the handlers move into the board component but reference state from a parent context, stale closures can cause dropped cards to disappear or land in the wrong column.

**Warning signs**:
- Cards can be picked up but not dropped
- Cards land in the wrong column after a drag
- The "blocked lane" visual indicator does not appear during drag
- Backward move modal does not trigger when dragging a card backward

**Prevention strategy**:
- Keep `DndContext`, its sensors, and all drag event handlers co-located in the same component (the board page component)
- Move all drag-related state (dragCardId, dragOverLaneId, blockedLaneId) into the board component, not a shared context
- Test drag-and-drop end-to-end after every structural change to the board component hierarchy
- Verify that the `closestCorners` collision detection still works after any DOM structure changes (wrapper divs can affect hit detection)

**Phase**: Component extraction phase, specifically when extracting BoardPage.

---

## Summary: Phase Assignment

| Pitfall | Planning | Component Extraction | State Management | Bug Fix | Feature Dev |
|---------|----------|---------------------|------------------|---------|-------------|
| 1. E2E Test Breakage | | Primary risk | | | |
| 2. Context Re-renders | Design here | | Primary risk | | |
| 3. Logic Without Extraction | Design here | Primary risk | | | |
| 4. Remote Sync Contract | Constraint | | Primary risk | | |
| 5. Scope Creep | Primary risk | Monitor | Monitor | | |
| 6. localStorage Contract | Design here | Monitor | | | |
| 7. AI God Component Regrowth | Document here | | | | Primary risk |
| 8. Unit Test Mocking | Design here | | Primary risk | | |
| 9. Hydration Race Conditions | | | Primary risk | | |
| 10. DnD Boundary Breaks | | Primary risk | | | |

---

## Sources

- [Breaking Up with Our Monolithic Table: A React Refactoring Journey](https://dev.to/aze3ma/breaking-up-with-our-monolithic-table-a-react-refactoring-journey-6k2)
- [Common Sense Refactoring of a Messy React Component](https://alexkondov.com/refactoring-a-messy-react-component/)
- [When to Break Up a Component into Multiple Components](https://kentcdodds.com/blog/when-to-break-up-a-component-into-multiple-components)
- [React State Management in 2025: What You Actually Need](https://www.developerway.com/posts/react-state-management-2025)
- [How to Write Performant React Apps with Context](https://www.developerway.com/posts/how-to-write-performant-react-apps-with-context)
- [React State Management in 2025: Context API vs Zustand](https://dev.to/cristiansifuentes/react-state-management-in-2025-context-api-vs-zustand-385m)
- [Prop Drilling](https://kentcdodds.com/blog/prop-drilling)
- [Why Your Vibe-Coded Project Needs a Developer](https://evilmartians.com/chronicles/why-your-vibe-coded-project-needs-a-developer)
- [We Audited 5 Vibe-Coded Startups](https://altersquare.io/vibe-coded-startups-audit-common-codebase-problems/)
- [Playwright Selector Best Practices](https://www.browserstack.com/guide/playwright-selectors-best-practices)
- [Refactoring AI Code: The Good, The Bad, and The Weird](https://www.infoworld.com/article/3610521/refactoring-ai-code-the-good-the-bad-and-the-weird.html)

---

*Generated: 2026-03-16 from codebase analysis and industry research*
