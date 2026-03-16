# Research Summary

## Stack

- **Zustand over Context API** for all frequently-changing domain state. Three focused stores: `boardStore` (portfolios, cards, roles), `settingsStore` (globalSettings), and `uiStore` (filters, modals, toasts, sync status). A single monolithic Zustand store gains nothing over the current `useState<AppState>`.
- **Persist middleware replaces raw localStorage.** Zustand's `persist` handles serialization, hydration, and migration in one place, eliminating 29+ direct `localStorage` calls and centralizing the `STATE_VERSION` migration pattern.
- **Store-outside-React eliminates prop drilling.** `remoteAppState.ts` and sync logic can call `getState()`/`setState()` directly, removing the 43-parameter `useAppEffects` interface entirely.
- **No new tools.** No TanStack Query (local-first is a sync problem, not a caching problem), no monorepo, no FSD, no Redux. The current stack (React 19, TypeScript 5.9, Vite 7, Supabase) stays.
- **Incremental migration only.** Introduce stores alongside existing `useState`, migrate one slice at a time, verify E2E tests pass after each step.

## Features

- **The core feature set is already built.** Table stakes (kanban, drag-drop, RBAC, workload, filters, card detail, delivery forecasting) are all implemented. The milestone is cleanup and extension, not new ground-up features.
- **Type-specific card fields is the primary UI gap (P0).** The data model (`TaskType.requiredFields` / `optionalFields`) exists; `CardDetailPanel.tsx` does not honor it. Every field renders for every card type. This is the highest-priority visible feature work.
- **Key differentiators must be protected during cleanup.** Queue-position delivery forecasting, naming convention generation, revision tracking with reasons, and performance marketing domain fields (funnel stage, hook, angle) are competitive advantages not found in Monday, Asana, or ClickUp. They must not regress.
- **Anti-features are explicitly off the table.** No asset hosting/DAM, no real-time collaboration, no Gantt/dependencies, no time tracking, no in-app chat, no AI assignment. These would add complexity without value at this team size and focus.
- **Component cleanup is a prerequisite for safe feature extension.** Adding new task types to a 1,146-line `CardDetailPanel.tsx` is unsafe. Decomposition must come before feature expansion.

## Architecture

- **App.tsx collapses to ~30 lines** after extraction. It becomes a thin wrapper: `<AppProviders> → <AuthGateRouter> → <AppShell>`. All logic moves to contexts, hooks, or child components.
- **State is separated into four domains via React Context:** `ToastContext` (cross-cutting, consumed everywhere), `AuthContext` (auth + workspace access), `SyncContext` (sync status, last synced), `AppStateContext` (domain state). Board UI state (filters, drag) stays local to `BoardPage`. Sidebar state stays internal to `Sidebar`.
- **Seven-phase extraction order with hard dependencies:** (1) shared types → (2) context providers → (3) AppShell/AuthGateRouter → (4) board/card/modal hooks → (5) decompose `useAppEffects` → (6) split SettingsPage and CardDetailPanel → (7) split `board.ts` into `src/models/`. Each phase must pass all tests before the next begins.
- **`board.ts` pure functions are preserved as-is.** State management layers call into `board.ts`, never replace it. This protects the existing unit test strategy (pure function tests require no React rendering context).
- **Success criteria are measurable:** App.tsx under 50 lines, no component over 500 lines, no hook over 10 parameters, shared types defined once, all 12 E2E specs pass, no circular dependencies.

## Pitfalls

- **Context re-render cascades are the most likely self-inflicted performance regression.** Merging all 30+ `useState` calls into one context would be worse than the current monolith. State must be split by update frequency. Zustand eliminates this risk entirely for frequently-updating state.
- **Remote sync contract must be treated as a public API.** Any `AppState` shape change requires a `STATE_VERSION` bump and migration in `coerceAppState`. The JSON signature conflict detection is fragile; changing state structure without updating the snapshot function reintroduces the perpetual-saving bug (fixed in commit `f169920`).
- **AI god component regrowth is the long-term structural risk.** Without documented guardrails (STRUCTURE.md, file size linting), the same forces that produced a 1,824-line App.tsx will rebuild it. The refactored structure is only durable if there is an explicit record of where new code belongs.
- **Scope creep during refactoring is a project-killer.** Bug fixes, storage abstraction, and feature additions must not be mixed into structural extraction PRs. Each PR should do exactly one thing. Bugs discovered during refactoring go to a backlog, not the current PR.
- **DnD context boundaries and localStorage contract are hidden breakage vectors.** `DndContext` and all drag handlers must stay co-located. The storage abstraction must use identical keys initially; key renaming is a separate, isolated step after the abstraction is stable.

## Cross-Cutting Themes

**Incremental, verifiable steps over big-bang rewrites.** All four documents converge on the same principle: small changes, one at a time, with E2E tests passing after each step. The architecture, stack, and pitfalls research all independently arrive at the same migration model.

**Pure business logic is an asset to protect.** `board.ts` pure functions are cited as a strength in both architecture and pitfalls research. The refactoring strategy is built around preserving them: stores call into `board.ts`, they do not absorb it.

**AI maintainability requires explicit structure.** The codebase is AI-maintained by a non-developer owner. This shapes every decision: Zustand over Redux (less boilerplate), documented structure over implicit convention, file size limits as automated guardrails, ADRs so future AI sessions have architectural context.

**Cleanup is a prerequisite, not a parallel track.** Features research, architecture, and stack all agree: the monolithic components must be decomposed before new task types and field logic can be safely added. The 1,146-line `CardDetailPanel` cannot safely implement type-specific fields without being split first.

**Separation of concerns is the root problem and the root solution.** Domain state, UI state, sync state, and auth state are currently tangled in one component. Every recommended change — contexts, stores, focused hooks, split components — is an application of the same fix: put things where they belong.

## Implications for Roadmap

**Phase structure should follow the dependency chain, not feature desirability:**

1. **Infrastructure first (shared types, contexts/stores).** No component extraction is safe until the state management layer exists. This is a prerequisite with no user-visible output, but skipping it means two refactoring rounds.

2. **Structural cleanup before feature work.** App.tsx shell extraction, `useAppEffects` decomposition, and large component splits (SettingsPage, CardDetailPanel) must complete before type-specific fields are implemented. This is the blocking constraint for the milestone's P0 feature.

3. **Type-specific fields unlock the extension path.** Once `CardDetailPanel` is split into sections, adding type-specific field visibility, new task types, and type-specific naming conventions becomes low-risk, localized changes. Doing this work before the split means touching 1,146 lines every time.

4. **Storage abstraction and board.ts splitting are independent.** These can slot in after structural cleanup without blocking feature work. They reduce maintenance burden but are not on the critical path.

5. **Document structure during planning, enforce it continuously.** STRUCTURE.md and any ESLint guardrails should be created at the start of the roadmap, not added at the end. AI god component regrowth begins the moment the refactor is "done."

The roadmap phases map roughly to: (P0) State infrastructure + shell extraction → (P0) Core component decomposition → (P0) Type-specific fields + new task types → (P1) Storage cleanup + board.ts split → (P1) Naming convention extension + integration field scoping.
