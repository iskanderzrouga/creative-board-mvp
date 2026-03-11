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

### Supabase Production Rollout

Status: Deployed to production, live login confirmation still needs a real inbox click-through

What I learned:

- The Supabase shared pooler is the workable connection path from this machine; the direct and dedicated endpoints were not reachable here, but the shared pooler accepted the migration push cleanly.
- The app needed a true auth boundary before switching remote sync on by default, otherwise browser state would still behave like a demo instead of a shared workspace.
- Vercel production deployment is also gated by git author identity. The CLI rejected the first production deploy attempt because the latest commit email did not match an account authorized on the linked Vercel project.

What changed:

- Promoted Supabase from optional scaffold to the intended production path when `VITE_SUPABASE_URL` and `VITE_SUPABASE_PUBLISHABLE_KEY` are present.
- Added a lightweight email magic-link login gate so unauthenticated visitors see sign-in first instead of the board.
- Added authenticated session bootstrap, sign-out support, and shared-workspace loading through [`src/supabase.ts`](/Users/iskanderzrouga/Desktop/Editors Board/src/supabase.ts) and [`src/remoteAppState.ts`](/Users/iskanderzrouga/Desktop/Editors Board/src/remoteAppState.ts).
- Added first-load remote seeding for workspace `primary`, local-cache fallback, last-write-wins save behavior, and a visible sync-status pill with last successful sync time.
- Extended the board, analytics, workload, and settings surfaces so the session toolbar stays visible across the product instead of only on the main board.
- Added an end-to-end authenticated sync regression in [`e2e/auth-sync.spec.ts`](/Users/iskanderzrouga/Desktop/Editors Board/e2e/auth-sync.spec.ts) and captured [`artifacts/phase-2/authenticated-sync.png`](/Users/iskanderzrouga/Desktop/Editors Board/artifacts/phase-2/authenticated-sync.png).
- Rewrote [`README.md`](/Users/iskanderzrouga/Desktop/Editors Board/README.md) into a deployment-focused guide covering environment variables, Supabase auth setup, migration commands, release checklist, recovery path, and architecture limits.
- Ignored Supabase CLI temp artifacts in [`.gitignore`](/Users/iskanderzrouga/Desktop/Editors Board/.gitignore).
- Applied the existing migration to the live Supabase project with the shared pooler, creating `public.workspace_state` with authenticated RLS policies.
- Added `VITE_SUPABASE_URL`, `VITE_SUPABASE_PUBLISHABLE_KEY`, and `VITE_REMOTE_WORKSPACE_ID` to the linked Vercel project for production and development environments.
- Deployed the app to Vercel production at [creative-board-lake.vercel.app](https://creative-board-lake.vercel.app).

What failed along the way:

- The first authenticated browser-sync test exposed a logic gap where the initial post-login state change could be skipped by the remote-save guard, preventing the first real edit from reaching the shared store.
- The first production deploy attempt on Vercel failed even after uploading the build because the latest git author email on this branch was not recognized as an authorized Vercel project user.

How those failures were resolved:

- Removed the over-aggressive post-hydration skip guard so the first authenticated edit now syncs correctly.
- Prepared a release commit with the Vercel-account email so the next production deployment could satisfy the author-access check without rewriting earlier history.
- Re-ran the production deployment from the newly authored commit, which cleared the Vercel access check and published successfully.

Verification:

- `npx supabase db push --db-url 'postgresql://postgres.zytmxgtrpwlnogtrmmgt:***@aws-1-us-east-1.pooler.supabase.com:5432/postgres?sslmode=require' --include-all --workdir .` finished successfully and applied `20260311200500_create_workspace_state.sql`.
- `npm run lint` passed.
- `npm run test` passed.
- `npm run build` passed.
- `npx vercel --prod --yes` passed and aliased the production site to [creative-board-lake.vercel.app](https://creative-board-lake.vercel.app).
- A live browser check against [creative-board-lake.vercel.app](https://creative-board-lake.vercel.app) loaded the production sign-in screen successfully and captured `artifacts/phase-2/production-login-gate.png`.

Next step:

- Perform one real magic-link login from a team inbox and confirm Supabase Auth redirect URLs include the final production origin, then continue the broader deploy-readiness roadmap with deeper workflow hardening and scale guardrails.
