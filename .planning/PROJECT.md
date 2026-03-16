# Production Board

## What This Is

A creative production management platform for performance marketing teams. One dashboard to track all creative work — video ads, image ads, landing pages, dev tasks — across editors, designers, developers, and media buyers. The manager (creative strategist, owner, or media buyer) assigns and prioritizes work, while each contributor sees only their own queue.

Previously called "Editors Board" when it was scoped only to video editors. Now expanding to cover all production roles on the team.

## Core Value

The manager can see every team member's queue at a glance, drag-and-drop to prioritize, and know exactly when each deliverable will be ready — so nothing falls through the cracks and no context gets lost in Slack.

## Requirements

### Validated

<!-- Shipped and confirmed valuable. Inferred from existing codebase. -->

- ✓ Kanban board with 6 stages (Backlog → Briefed → In Production → Review → Ready → Live) — existing
- ✓ Card CRUD (create, edit, delete, archive/unarchive) — existing
- ✓ Drag-and-drop cards between stages and for priority ordering within a stage — existing
- ✓ Portfolio/workspace organization (multiple portfolios with brands) — existing
- ✓ Role-based access control (owner, manager, contributor, viewer) — existing
- ✓ Contributor scoping (contributor sees only their own cards) — existing
- ✓ Card detail panel with comments, links, activity history — existing
- ✓ Task type system with type-specific required/optional fields — existing
- ✓ Naming convention generator for creative assets — existing
- ✓ Team member management with capacity, working hours, and timezone — existing
- ✓ Estimated delivery date calculation based on queue position and contributor schedule — existing
- ✓ Supabase auth (magic links + password) with workspace access — existing
- ✓ Remote state sync with conflict detection — existing
- ✓ Analytics page — existing
- ✓ Workload page — existing
- ✓ Settings page (general, portfolios, people, workflow) — existing
- ✓ Card filters (by brand, platform, owner, stage, priority) — existing
- ✓ Revision tracking with configurable revision reasons — existing
- ✓ Auto-archive for old Live cards — existing
- ✓ Google Drive integration (folder creation webhook) — existing
- ✓ Frame.io link support on cards — existing
- ✓ XSS prevention via DOMPurify — existing
- ✓ E2E test suite (12 Playwright specs) and unit tests (Vitest) — existing

### Active

<!-- Current scope: cleanup, stabilize, and extend for broader team. -->

- [ ] Rename product from "Editors Board" to "Production Board" across codebase and UI
- [ ] Break up monolithic App.tsx (1,823 lines) into focused components
- [ ] Reduce prop drilling (useAppEffects has 43 parameters) — introduce context or state management
- [ ] Break up other oversized components (PeopleSection 1,301 lines, SettingsPage 1,290 lines, CardDetailPanel 1,146 lines)
- [ ] Add task type for image ads with designer-specific fields (no Frame.io, different naming convention)
- [ ] Add task type for dev tasks with developer-specific fields (no naming convention, no Frame.io)
- [ ] Add task type for landing pages with design+dev fields
- [ ] Make card fields truly type-specific (hide irrelevant fields based on task type)
- [ ] Fix all half-baked or buggy features identified in CONCERNS.md
- [ ] Guard E2E test mode so it cannot be activated in production
- [ ] Abstract localStorage access behind a storage service
- [ ] Fix remote sync conflict handling (currently uses fragile JSON signatures)
- [ ] Ensure all existing features work reliably end-to-end
- [ ] All tests pass (unit + E2E) after cleanup

### Out of Scope

- Auto-launch creatives to ad platforms (Facebook, etc.) from "Ready" stage — future milestone, needs API integrations
- Real-time collaborative editing — current sync model is sufficient for team size
- Mobile app — web-first
- Video/image asset hosting — rely on external tools (Frame.io, Google Drive)
- Billing or subscription management — internal team tool

## Context

- **Team size**: Small performance marketing team (owner, 1-2 managers, several contributors across editing/design/dev/media buying)
- **Codebase state**: ~18,300 lines of TypeScript/React, vibe-coded with AI over multiple vision changes. Code works but is messy — monolithic components, excessive prop drilling, scattered state management
- **Tech stack**: React 19, TypeScript 5.9, Vite 7, Supabase (auth + PostgreSQL + edge functions), dnd-kit, deployed on Vercel
- **Existing task types**: Video (UGC short/medium), Video (Relaunch), Static (Single/Set), Landing Page, Offer, Copy, and more — already defined in `src/board.ts` with per-type required/optional fields
- **The task type system already supports** `requiredFields` and `optionalFields` per type, making type-specific card fields an extension of existing architecture

## Constraints

- **Tech stack**: React + TypeScript + Supabase + Vite — already established, no migration
- **No breaking changes**: Existing data in Supabase must continue to work (state version migration if schema changes)
- **Solo developer context**: Owner is not a developer — all changes must be made by AI, code must be clean enough for AI to maintain
- **Tests must pass**: No regressions — all existing E2E and unit tests must pass after changes

## Key Decisions

| Decision | Rationale | Outcome |
|----------|-----------|---------|
| Rename to "Production Board" | Product scope expanded beyond editors to all production roles | — Pending |
| Task type-specific card fields | Different roles need different fields (editors need Frame.io, devs don't) | — Pending |
| Cleanup before new features | Codebase mess makes adding features risky and slow | — Pending |
| Keep Supabase for backend | Already integrated, works for current scale | ✓ Good |
| Local-first with remote sync | Enables offline use, reduces latency | ✓ Good |

---
*Last updated: 2026-03-16 after initialization*
