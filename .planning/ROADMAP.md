# Roadmap: Production Board

**Created:** 2026-03-16
**Milestone:** Cleanup + Extend
**Phases:** 7
**Requirements:** 29

## Phase 1: Rebrand

**Goal:** Rename the product from "Editors Board" to "Production Board" across all UI text, page titles, and storage keys. This is low-risk, has no dependencies, and establishes the product identity before deeper structural work begins.

**Requirements:**
- BRAND-01: Product name changed from "Editors Board" to "Production Board" in all UI text
- BRAND-02: Page title, headers, and branding reflect "Production Board"
- BRAND-03: localStorage keys and storage references updated (with migration from old keys)

**Success Criteria:**
1. No occurrence of "Editors Board" remains in any user-facing UI text
2. Browser tab title and all page headers display "Production Board"
3. Existing users' data migrates transparently from old localStorage keys to new keys with no data loss

**Plans:**
1. Find and replace all UI-facing "Editors Board" strings with "Production Board"
2. Update localStorage key names and add migration logic for existing stored data
3. Update page title, meta tags, and any branding assets

---

## Phase 2: State Infrastructure

**Goal:** Introduce Zustand stores to replace prop drilling and centralize state management. Extract shared types to a dedicated module. This phase creates the foundation that all subsequent component extraction depends on.

**Requirements:**
- RSTRC-04: State management uses Zustand with 3 stores (board, settings, UI) replacing prop drilling
- RSTRC-05: useAppEffects (43 parameters) is decomposed into focused hooks that read from stores
- RSTRC-09: board.ts pure functions are preserved — stores call into them, never absorb them
- RSTRC-10: Shared types extracted to a dedicated types module

**Success Criteria:**
1. Three Zustand stores (boardStore, settingsStore, uiStore) are operational and components consume state via selectors, not props
2. useAppEffects is eliminated or reduced to a thin orchestrator with no more than 10 parameters
3. board.ts pure functions remain unchanged and all existing unit tests for board.ts pass without modification
4. A `src/types/` module exists with all shared type definitions imported from a single barrel export

**Plans:**
1. Extract shared types to `src/types/` with barrel re-export
2. Create three Zustand stores with persist middleware, migrating one state slice at a time
3. Refactor useAppEffects into focused hooks that read from stores instead of accepting props
4. Verify board.ts pure functions are called by stores, not absorbed into them
5. Run full E2E and unit test suite after each migration step

---

## Phase 3: App Shell Extraction

**Goal:** Collapse App.tsx into a thin composition shell (~30-50 lines) by extracting auth gating, layout, and routing into dedicated components. Ensure drag-and-drop context and handlers remain co-located after extraction.

**Requirements:**
- RSTRC-01: App.tsx is under 50 lines — a thin composition shell with no business logic
- RSTRC-03: No hook accepts more than 10 parameters
- INFRA-04: DndContext and drag handlers remain co-located after component extraction
- STAB-05: No regressions in drag-and-drop across stages and within stages
- STAB-06: No regressions in auth flow (magic link + password login)

**Success Criteria:**
1. App.tsx is under 50 lines and contains only provider wrappers, routing, and component composition
2. All hooks in the codebase accept 10 or fewer parameters
3. DndContext and its drag event handlers live in the same component (e.g., BoardPage), not split across files
4. Drag-and-drop E2E tests pass: cards move between stages and reorder within stages correctly
5. Auth E2E tests pass: magic link flow and password login work end-to-end

**Plans:**
1. Extract AuthGateRouter component handling auth state and workspace access routing
2. Extract AppShell component with sidebar, header, and main content area
3. Extract BoardPage component co-locating DndContext with all drag handlers
4. Reduce App.tsx to provider composition only
5. Run drag-drop and auth E2E specs after each extraction step

---

## Phase 4: Component Decomposition

**Goal:** Split the three remaining oversized components (CardDetailPanel, SettingsPage, PeopleSection) into focused sub-components, each under 500 lines. This unblocks safe implementation of type-specific card fields in Phase 5.

**Requirements:**
- RSTRC-02: No component file exceeds 500 lines
- RSTRC-06: CardDetailPanel is split into section components (details, comments, links, activity, naming, metadata)
- RSTRC-07: SettingsPage is split into tab components (general, portfolios, people, workflow)
- RSTRC-08: PeopleSection is split into container + row + form components

**Success Criteria:**
1. Every component file in the codebase is 500 lines or fewer
2. CardDetailPanel is composed of at least 6 sub-components (details, comments, links, activity, naming, metadata)
3. SettingsPage renders tab content from separate tab components, each self-contained
4. PeopleSection uses a container/row/form pattern with clear data flow boundaries
5. All E2E tests pass after decomposition — no visual or functional regressions

**Plans:**
1. Split CardDetailPanel into section components with shared card context
2. Split SettingsPage into tab components with shared settings context
3. Split PeopleSection into container, row, and form components
4. Audit all remaining files for 500-line compliance and split any violations
5. Run full E2E and unit test suite after each component split

---

## Phase 5: Task Type Features

**Goal:** Make card fields truly type-specific so that each task type (video, image ad, dev task, landing page) shows only relevant fields. Add type preview during card creation. This is the milestone's primary user-facing feature work.

**Requirements:**
- TYPE-01: CardDetailPanel shows only fields relevant to the card's task type (requiredFields + optionalFields from TaskType)
- TYPE-02: Fields not in the task type's requiredFields or optionalFields are hidden, not just optional
- TYPE-03: Image ad task types work with designer-specific fields (no Frame.io, no video naming convention)
- TYPE-04: Dev task types work with developer-specific fields (no naming convention, no Frame.io, no funnel stage)
- TYPE-05: Landing page task types show design + dev fields (product, platform, landing page URL, due date)
- TYPE-06: Task type selection during card creation previews which fields will be required

**Success Criteria:**
1. Selecting a video task type shows Frame.io and naming convention fields; selecting a dev task type hides them
2. Image ad cards display designer-specific fields without video-specific fields
3. Landing page cards show both design fields and dev fields (URL, platform, product)
4. Card creation dialog shows a field preview when user selects a task type, before the card is created
5. No field data is lost for existing cards — fields are hidden but data is preserved in the card object

**Plans:**
1. Implement field visibility logic driven by TaskType.requiredFields and optionalFields in CardDetailPanel sections
2. Configure image ad task types with designer-specific field definitions
3. Configure dev task types with developer-specific field definitions
4. Configure landing page task types with combined design + dev field definitions
5. Add task type field preview to the card creation dialog

---

## Phase 6: Infrastructure Cleanup

**Goal:** Abstract localStorage behind a storage service, split board.ts into focused modules, and document the codebase structure to prevent AI god component regrowth. These changes reduce maintenance burden but do not block feature work.

**Requirements:**
- INFRA-01: localStorage access abstracted behind a storage service (replaces 29+ direct calls)
- INFRA-02: board.ts (4,000+ lines) split into focused modules under src/models/ with barrel re-export
- INFRA-03: STRUCTURE.md created documenting where to add new code (prevents AI god component regrowth)

**Success Criteria:**
1. Zero direct `localStorage.getItem` / `localStorage.setItem` calls outside the storage service module
2. board.ts is replaced by a `src/models/` directory with focused modules (e.g., card.ts, portfolio.ts, taskType.ts, delivery.ts) and a barrel index.ts
3. STRUCTURE.md exists at the project root and documents where new components, hooks, stores, types, and models belong
4. All existing unit tests for board.ts functions pass against the new module structure with no test changes

**Plans:**
1. Create a storage service abstracting all localStorage access with the same key interface
2. Replace all 29+ direct localStorage calls with storage service methods
3. Split board.ts into focused modules under src/models/ preserving all pure function signatures
4. Write STRUCTURE.md documenting the codebase organization and guidelines for adding new code

---

## Phase 7: Stabilization & Verification

**Goal:** Final verification that all tests pass, production safeguards are in place, and remote sync handles the new state shape correctly. This phase ensures the milestone ships with no regressions.

**Requirements:**
- STAB-01: All existing E2E tests (12 Playwright specs) pass after all changes
- STAB-02: All existing unit tests pass after all changes
- STAB-03: E2E test mode cannot be activated in production (environment variable guard)
- STAB-04: Remote sync works correctly after state shape changes (STATE_VERSION bumped with migration)

**Success Criteria:**
1. All 12 Playwright E2E specs pass in CI with zero failures
2. All Vitest unit tests pass with zero failures
3. E2E test mode activation is gated behind an environment variable that is only set in development/test environments
4. STATE_VERSION is bumped and coerceAppState includes a migration path from the pre-refactor state shape to the new shape
5. A manual smoke test confirms: create card, drag between stages, sync to Supabase, reload, verify state persists

**Plans:**
1. Run full E2E test suite and fix any failures from accumulated changes
2. Run full unit test suite and fix any failures from accumulated changes
3. Add environment variable guard for E2E test mode activation
4. Bump STATE_VERSION and implement state migration in coerceAppState
5. Perform manual smoke test of critical user flows

---

## Dependency Map

```
Phase 1 (Rebrand) ──────────────────────────────────────────┐
                                                             │
Phase 2 (State Infrastructure) ─────┬───────────────────────┤
                                    │                        │
                                    ▼                        │
Phase 3 (App Shell Extraction) ─────┤                        │
                                    │                        │
                                    ▼                        │
Phase 4 (Component Decomposition) ──┤                        ├──▶ Phase 7 (Stabilization)
                                    │                        │
                                    ▼                        │
Phase 5 (Task Type Features) ───────┤                        │
                                    │                        │
Phase 6 (Infrastructure Cleanup) ───┘────────────────────────┘
```

- **Phase 1** has no dependencies — can start immediately
- **Phase 2** has no dependencies — can run in parallel with Phase 1
- **Phase 3** depends on Phase 2 (needs Zustand stores to exist)
- **Phase 4** depends on Phase 3 (App shell must be extracted first so components can be split within the new structure)
- **Phase 5** depends on Phase 4 (CardDetailPanel must be split into sections before type-specific field logic is added)
- **Phase 6** depends on Phase 2 (needs stores in place) but does not depend on Phases 3-5 — can run after Phase 2
- **Phase 7** depends on all other phases (final verification gate)

## Coverage

| Category | Requirements | Phases |
|----------|-------------|--------|
| Restructure | RSTRC-01 through RSTRC-10 | Phases 2, 3, 4 |
| Task Types | TYPE-01 through TYPE-06 | Phase 5 |
| Rebrand | BRAND-01 through BRAND-03 | Phase 1 |
| Stability | STAB-01 through STAB-06 | Phases 3, 7 |
| Infrastructure | INFRA-01 through INFRA-04 | Phases 3, 6 |

**Total: 29 requirements -> 7 phases -> 100% mapped**

---
*Roadmap created: 2026-03-16*
