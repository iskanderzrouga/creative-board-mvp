# Requirements: Production Board

**Defined:** 2026-03-16
**Core Value:** The manager can see every team member's queue at a glance, drag-and-drop to prioritize, and know exactly when each deliverable will be ready.

## v1 Requirements

Requirements for this cleanup + extend milestone. Each maps to roadmap phases.

### Restructure

- [ ] **RSTRC-01**: App.tsx is under 50 lines — a thin composition shell with no business logic
- [ ] **RSTRC-02**: No component file exceeds 500 lines
- [ ] **RSTRC-03**: No hook accepts more than 10 parameters
- [ ] **RSTRC-04**: State management uses Zustand with 3 stores (board, settings, UI) replacing prop drilling
- [ ] **RSTRC-05**: useAppEffects (43 parameters) is decomposed into focused hooks that read from stores
- [ ] **RSTRC-06**: CardDetailPanel is split into section components (details, comments, links, activity, naming, metadata)
- [ ] **RSTRC-07**: SettingsPage is split into tab components (general, portfolios, people, workflow)
- [ ] **RSTRC-08**: PeopleSection is split into container + row + form components
- [ ] **RSTRC-09**: board.ts pure functions are preserved — stores call into them, never absorb them
- [ ] **RSTRC-10**: Shared types extracted to a dedicated types module

### Task Types

- [ ] **TYPE-01**: CardDetailPanel shows only fields relevant to the card's task type (requiredFields + optionalFields from TaskType)
- [ ] **TYPE-02**: Fields not in the task type's requiredFields or optionalFields are hidden, not just optional
- [ ] **TYPE-03**: Image ad task types work with designer-specific fields (no Frame.io, no video naming convention)
- [ ] **TYPE-04**: Dev task types work with developer-specific fields (no naming convention, no Frame.io, no funnel stage)
- [ ] **TYPE-05**: Landing page task types show design + dev fields (product, platform, landing page URL, due date)
- [ ] **TYPE-06**: Task type selection during card creation previews which fields will be required

### Rebrand

- [ ] **BRAND-01**: Product name changed from "Editors Board" to "Production Board" in all UI text
- [ ] **BRAND-02**: Page title, headers, and branding reflect "Production Board"
- [ ] **BRAND-03**: localStorage keys and storage references updated (with migration from old keys)

### Stability

- [ ] **STAB-01**: All existing E2E tests (12 Playwright specs) pass after all changes
- [ ] **STAB-02**: All existing unit tests pass after all changes
- [ ] **STAB-03**: E2E test mode cannot be activated in production (environment variable guard)
- [ ] **STAB-04**: Remote sync works correctly after state shape changes (STATE_VERSION bumped with migration)
- [ ] **STAB-05**: No regressions in drag-and-drop across stages and within stages
- [ ] **STAB-06**: No regressions in auth flow (magic link + password login)

### Infrastructure

- [ ] **INFRA-01**: localStorage access abstracted behind a storage service (replaces 29+ direct calls)
- [ ] **INFRA-02**: board.ts (4,000+ lines) split into focused modules under src/models/ with barrel re-export
- [ ] **INFRA-03**: STRUCTURE.md created documenting where to add new code (prevents AI god component regrowth)
- [ ] **INFRA-04**: DndContext and drag handlers remain co-located after component extraction

## v2 Requirements

Deferred to future milestones. Tracked but not in current roadmap.

### Auto-Launch

- **LAUNCH-01**: User can move a card from "Ready" to "Live" and it auto-launches on the assigned ad platform
- **LAUNCH-02**: Card stores Facebook page name, landing page URL, and other launch parameters
- **LAUNCH-03**: Integration with Meta Ads API for automated creative deployment

### Advanced Analytics

- **ANLYT-01**: Track average time per stage per task type
- **ANLYT-02**: Identify bottleneck stages with automated alerts
- **ANLYT-03**: Track revision rates and reasons with trend visualization

### Notifications

- **NOTIF-01**: In-app notifications when cards are assigned or moved
- **NOTIF-02**: Email digest of daily queue changes for contributors

## Out of Scope

| Feature | Reason |
|---------|--------|
| Asset hosting / DAM | Rely on Frame.io and Google Drive — dedicated tools do this better |
| Real-time collaborative editing | Current sync model sufficient for team size |
| Task dependencies / Gantt | Adds complexity without value for creative production workflow |
| Time tracking | Team uses external tools; board tracks estimated hours, not actuals |
| In-app chat | Slack is the communication tool; board tracks decisions via comments |
| AI-powered task assignment | Team is small enough for manual assignment by manager |
| Multiple board views (list, calendar, timeline) | Kanban is the primary view; additional views are v2+ |
| Custom stages per task type | All task types share the same pipeline stages — simpler architecture |
| Mobile app | Web-first; mobile is a future consideration |

## Traceability

Which phases cover which requirements. Updated during roadmap creation.

| Requirement | Phase | Status |
|-------------|-------|--------|
| RSTRC-01 | Phase 3 — App Shell Extraction | Pending |
| RSTRC-02 | Phase 4 — Component Decomposition | Pending |
| RSTRC-03 | Phase 3 — App Shell Extraction | Pending |
| RSTRC-04 | Phase 2 — State Infrastructure | Pending |
| RSTRC-05 | Phase 2 — State Infrastructure | Pending |
| RSTRC-06 | Phase 4 — Component Decomposition | Pending |
| RSTRC-07 | Phase 4 — Component Decomposition | Pending |
| RSTRC-08 | Phase 4 — Component Decomposition | Pending |
| RSTRC-09 | Phase 2 — State Infrastructure | Pending |
| RSTRC-10 | Phase 2 — State Infrastructure | Pending |
| TYPE-01 | Phase 5 — Task Type Features | Pending |
| TYPE-02 | Phase 5 — Task Type Features | Pending |
| TYPE-03 | Phase 5 — Task Type Features | Pending |
| TYPE-04 | Phase 5 — Task Type Features | Pending |
| TYPE-05 | Phase 5 — Task Type Features | Pending |
| TYPE-06 | Phase 5 — Task Type Features | Pending |
| BRAND-01 | Phase 1 — Rebrand | Pending |
| BRAND-02 | Phase 1 — Rebrand | Pending |
| BRAND-03 | Phase 1 — Rebrand | Pending |
| STAB-01 | Phase 7 — Stabilization & Verification | Pending |
| STAB-02 | Phase 7 — Stabilization & Verification | Pending |
| STAB-03 | Phase 7 — Stabilization & Verification | Pending |
| STAB-04 | Phase 7 — Stabilization & Verification | Pending |
| STAB-05 | Phase 3 — App Shell Extraction | Pending |
| STAB-06 | Phase 3 — App Shell Extraction | Pending |
| INFRA-01 | Phase 6 — Infrastructure Cleanup | Pending |
| INFRA-02 | Phase 6 — Infrastructure Cleanup | Pending |
| INFRA-03 | Phase 6 — Infrastructure Cleanup | Pending |
| INFRA-04 | Phase 3 — App Shell Extraction | Pending |

**Coverage:**
- v1 requirements: 29 total
- Mapped to phases: 29
- Unmapped: 0

---
*Requirements defined: 2026-03-16*
*Last updated: 2026-03-16 after roadmap creation — all 29 requirements mapped to phases*
