# Status Log

## March 11, 2026

### Phase 1: Baseline And Safety Net

Status: Complete

What I learned:

- This is a single-page React + TypeScript + Vite app with four primary surfaces: Board, Analytics, Workload, and Settings.
- The current repo ships as a demo-quality product: build and lint pass, but there was no automated test coverage before this phase.
- Core product logic lives in `src/board.ts`, while most workflow UI is concentrated in `src/App.tsx`.
- The app currently seeds one portfolio, multiple brands, multiple roles, and a fairly rich workflow model around editing, review, launch, and reporting.

What this phase is doing:

- Creating a durable roadmap in `PLAN.md`.
- Adding repeatable unit and browser tests.
- Capturing baseline screenshots.
- Fixing the first data-integrity gaps that would become dangerous in real use.

Known concerns discovered during audit:

- Card ownership is stored by team member name, so rename flows can silently break assignments unless the app repairs them.
- Card brand links are also stored by name, so brand rename flows can silently break board consistency unless handled carefully.
- Portfolio deletion needs to keep active and default portfolio settings valid.

What changed:

- Added `PLAN.md` and this running `STATUS.md` so the work can survive context compaction cleanly.
- Added a local verification stack with Vitest and Playwright, plus project scripts for `npm run test`, `npm run test:unit`, and `npm run test:e2e`.
- Added unit coverage for three high-risk integrity cases: brand rename propagation, team-member rename propagation, and safe portfolio removal.
- Added browser smoke coverage for manager card creation with persistence across reload and observer access to analytics with manager-only settings locked.
- Captured baseline screenshots in `artifacts/phase-1/manager-board.png` and `artifacts/phase-1/observer-analytics.png`.
- Fixed data drift in settings flows so renaming a brand updates linked cards, renaming a team member preserves card ownership, and deleting a portfolio keeps active/default portfolio ids valid.

What failed along the way:

- The first Playwright pass failed because the test imported `src/board.ts`, which pulled in the JSON seed file in a way Playwright's Node runtime did not like.
- The next browser pass failed because the smoke test targeted the wrong modal button label.
- The following pass exposed a false persistence failure caused by the test harness clearing local storage on every reload instead of only at test start.

How those failures were resolved:

- Replaced the heavy `board.ts` import in the e2e test with a stable storage-key constant.
- Corrected the button selector to the exact `Create` action.
- Changed the browser reset flow so storage is cleared only at the beginning of each test, making the reload-persistence assertion real.

Verification:

- `npm run lint` passed.
- `npm run test` passed.
- `npm run build` passed.

Next step:

- Start Phase 2 by auditing workflow logic in depth: drag and drop rules, backward moves, role permissions, blocked-card handling, due dates, and archival edge cases.

### Phase 2: Workflow Logic Hardening

Status: In progress

What I learned:

- Grouped stages on the board model assume an owner-backed lane.
- The detail panel previously allowed managers to clear the owner on cards that were already in grouped work stages.
- That combination could create a hidden-card state where the card still existed in data but no longer had a visible grouped lane to render into cleanly.

What changed so far:

- Added a UI guardrail so only Backlog cards can be explicitly set to `Unassigned` from the detail panel.
- Added a state-level safeguard in `applyCardUpdates` so grouped-stage cards keep their existing owner if a null owner update is attempted programmatically.
- Added a unit test that locks this workflow rule in place.

Verification:

- `npm run lint` passed.
- `npm run test` passed.
- `npm run build` passed.

Next step:

- Continue the phase by auditing drag-and-drop transitions, backward-move revision handling, blocked-card behavior, and auto-archive edge cases.

### Supabase Readiness Pass

Status: Foundation added, external credentials/network still blocking full activation

What changed:

- Added a secure Supabase data layer scaffold with [`.env.example`](/Users/iskanderzrouga/Desktop/Editors Board/.env.example), [`src/supabase.ts`](/Users/iskanderzrouga/Desktop/Editors Board/src/supabase.ts), and [`src/remoteAppState.ts`](/Users/iskanderzrouga/Desktop/Editors Board/src/remoteAppState.ts).
- Wired the app so remote sync is optional and only turns on when valid public client env vars are present. Local storage remains the safe fallback.
- Added a migration at [`supabase/migrations/20260311200500_create_workspace_state.sql`](/Users/iskanderzrouga/Desktop/Editors Board/supabase/migrations/20260311200500_create_workspace_state.sql) for a `workspace_state` table with row-level security restricted to authenticated users.
- Installed `@supabase/supabase-js` and kept the existing browser regression suite green after the integration scaffolding.

What I verified:

- `npm run lint` passed.
- `npm run test:unit` passed.
- `npm run test:e2e` passed.
- `npm run build` passed.

External blocker:

- A Supabase migration dry run against the provided `db.zytmxgtrpwlnogtrmmgt.supabase.co` host failed from this machine with `no route to host` on both ports `5432` and `6543`.
- The current Supabase docs say the shared pooler is the IPv4-friendly fallback when direct or dedicated connections require IPv6. Source: [Connect to your database](https://supabase.com/docs/reference/postgres/connection-strings).
- The browser-facing integration still needs the project’s publishable/anon key to switch from “backend-ready” to “live and authenticated” safely.

Next step:

- Get either the shared pooler connection string or a Supabase access token for the project, plus the publishable/anon key, then apply the migration remotely and turn on authenticated remote sync in the deployed app.
