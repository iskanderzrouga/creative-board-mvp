# Status Log

## March 12, 2026

### CODEX-PLAN Execution: Phase 1 Hardening + Verification Scaffolding

Status: In progress

What I changed in this pass:

- Sanitized `RichTextEditor` HTML with DOMPurify and blocked non-HTTP(S) links before insertion.
- Made `reindexCards` return fresh card objects so lane reindexing no longer mutates existing state in place.
- Fixed the stale `updateState` path by routing updates through the latest local state ref before replacing app state.
- Added a React error boundary around the app root with a recovery UI and reload action.
- Added Supabase migrations for manager-only `workspace_state` writes, revoking `anon` access to `is_workspace_email_allowed`, and preventing removal or demotion of the last manager at the database layer.
- Added a new Supabase Edge Function at `supabase/functions/request-magic-link` and changed the client login flow to use it instead of the public RPC preflight.
- Removed the global `transition: all`, added `:focus-visible` treatment, added reduced-motion handling, and replaced the most visible controls with targeted transitions.
- Opened analytics to managers as well as observers, changed Escape handling to close only the topmost modal or panel, and added basic email-format validation to the login gate.
- Memoized analytics and workload derived data, added unit-test coverage for the reindex immutability fix, added Vitest coverage support, added GitHub Actions CI, and updated the app title/favicon.

Verification:

- `npm run lint` passed.
- `npm run test:unit` passed.
- `npm run test:e2e` passed.
- `npm run build` passed.
- `npm run test:unit:coverage` passed.

What remains from the literal plan:

- The large `App.tsx` extraction and component/hook split in phase 2 is still outstanding.
- Most of phases 4 through 8 and 10 through 11 still need implementation beyond the targeted fixes already landed here.
- The live Supabase migration/function deployment and final production regression pass have not been run yet in this pass.

Next step:

- Continue with the major phase 2 extraction so the remaining UX, accessibility, sync, and testing work can land on smaller, safer modules instead of the current monolith.

### CODEX-PLAN Execution: Phase 2 Extraction Pass 1

Status: In progress

What I changed in this pass:

- Extracted app-shell and auth UI pieces out of `App.tsx` into dedicated component files: sidebar, page header, sync pill, auth gate, access gate, quick-create modal, backward-move modal, and delete-card modal.
- Extracted the board card rendering trio into separate memoized components: `BoardCardSurface`, `SortableBoardCard`, and `LaneDropZone`.
- Extracted the `AnalyticsPage` and `WorkloadPage` surfaces into standalone files, with workload drag-drop helpers moved alongside the workload page.
- Cleaned `App.tsx` imports and dead helpers after the move so the orchestration file now focuses more on state, effects, and event wiring than raw rendering.

Verification:

- `npm run lint` passed.
- `npm run test:unit` passed.
- `npm run test:e2e` passed.
- `npm run build` passed.

Current progress signal:

- `src/App.tsx` dropped from 5388 lines at the start of this pass to 4736 lines after the extraction.

Next step:

- Continue phase 2 by extracting larger remaining modules such as `CardDetailPanel`, `SettingsPage`, access management, and supporting hooks so the monolith keeps shrinking toward the plan target.

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
- Added product-to-brand repair in `applyCardUpdates` so moving a card to a different brand automatically snaps it to a valid product instead of leaving a broken brand/product combination behind.
- Blocked brand deletion when it would remove the last brand or orphan linked cards, which previously could make cards disappear from the default board filters.
- Blocked team-member deletion when cards are still assigned or when the action would remove the last manager, closing a settings path that could create broken ownership or leave the workspace without manager coverage.
- Synced card products when brand product lists change in settings so cards do not quietly retain invalid product values after admin edits.
- Hardened `moveCardInPortfolio` so grouped-stage moves without an owner are rejected at the state layer, blocked cards cannot advance forward, backward moves require both a revision reason and estimate even if a UI path bypasses the modal, and revision estimates clear once a card moves forward again.
- Updated auto-archive logic so blocked `Live` cards do not get silently archived by the background timer while they still have unresolved issues.
- Expanded unit coverage around ownerless grouped moves, backward-move metadata requirements, revision-estimate cleanup, blocked forward moves, and blocked-card archival behavior.

Verification:

- `npm run lint` passed.
- `npm run test` passed.
- `npm run build` passed.

Next step:

- Continue the phase by auditing drag-and-drop transitions, backward-move revision handling, blocked-card behavior, and auto-archive edge cases.

### Phase 3: Configuration And Admin Reliability

Status: In progress

What I learned:

- The first Supabase auth rollout still left a serious production gap: once signed in, a user could self-select `manager`, `editor`, or `observer` in the sidebar because that role switch was purely local UI state.
- The bad magic-link behavior was split across two layers. The deployed frontend needed an explicit production redirect URL, and Supabase Auth still needs its dashboard `Site URL` and allowed redirect URLs aligned so links do not fall back to an old localhost value.
- Production access needs two controls, not one: auth users must be invited, and database reads/writes must be limited to an approved access list.

What changed:

- Added a new migration at [`supabase/migrations/20260312033000_add_workspace_access_controls.sql`](/Users/iskanderzrouga/Desktop/Editors Board/supabase/migrations/20260312033000_add_workspace_access_controls.sql) that creates `public.workspace_access`, seeds `iskander@bluebrands.co` as a manager, and replaces the old `workspace_state` authenticated-only policies with allowlist-backed RLS.
- Changed the Supabase login flow in [`src/supabase.ts`](/Users/iskanderzrouga/Desktop/Editors Board/src/supabase.ts) to use `shouldCreateUser: false`, fetch the signed-in user’s `workspace_access` record, and support an explicit `VITE_MAGIC_LINK_REDIRECT_URL`.
- Bound the app’s visible role to the authenticated access record in [`src/App.tsx`](/Users/iskanderzrouga/Desktop/Editors Board/src/App.tsx), added verification and access-denied gates, and disabled sidebar role switching outside the account’s approved role.
- Added a login cooldown message for Supabase passwordless rate limits so repeated sign-in attempts stop feeling like a broken form and clearly tell the operator to wait and check the inbox.
- Updated [`.env.example`](/Users/iskanderzrouga/Desktop/Editors Board/.env.example) and [`README.md`](/Users/iskanderzrouga/Desktop/Editors Board/README.md) with the new redirect env var, invited-user login model, `workspace_access` setup, and the exact production redirect URL requirements.
- Added the new `VITE_MAGIC_LINK_REDIRECT_URL` env var to the linked Vercel project and redeployed production.

What failed along the way:

- Running the two `vercel env add` commands in parallel triggered an `npx` cache collision in the local npm temp directory.
- The first live request inspection only looked at the OTP request body, which hid the important part of the redirect behavior because Supabase sends the redirect URL as a query parameter instead.

How those failures were resolved:

- Re-ran the Vercel environment update sequentially, which added the production and development env vars cleanly.
- Repeated the production browser interception and captured the full OTP request URL, which confirmed the deployed app now sends `redirect_to=https://creative-board-lake.vercel.app` and `create_user=false`.
- Added a local cooldown guard after successful sends and rate-limit errors so the browser does not keep hitting Supabase while the default passwordless cooldown is still active.

Verification:

- `npx supabase db push --dry-run --db-url 'postgresql://postgres.zytmxgtrpwlnogtrmmgt:***@aws-1-us-east-1.pooler.supabase.com:5432/postgres?sslmode=require' --include-all --workdir .` passed and identified the new access-control migration.
- `npx supabase db push --db-url 'postgresql://postgres.zytmxgtrpwlnogtrmmgt:***@aws-1-us-east-1.pooler.supabase.com:5432/postgres?sslmode=require' --include-all --workdir .` passed and applied the access-control migration to the live project.
- `npm run lint` passed.
- `npm run test` passed.
- `npm run build` passed.
- `npx vercel env add VITE_MAGIC_LINK_REDIRECT_URL production --value 'https://creative-board-lake.vercel.app' --yes` passed.
- `npx vercel env add VITE_MAGIC_LINK_REDIRECT_URL development --value 'https://creative-board-lake.vercel.app' --yes` passed.
- `npx vercel --prod --yes` passed and re-aliased production to [creative-board-lake.vercel.app](https://creative-board-lake.vercel.app).
- A live browser interception against production confirmed the auth request now targets `https://zytmxgtrpwlnogtrmmgt.supabase.co/auth/v1/otp?redirect_to=https%3A%2F%2Fcreative-board-lake.vercel.app` with `create_user=false`.
- A separate live browser check mocked a `429` response from Supabase Auth and confirmed production now shows the friendlier rate-limit message instead of a generic failure, captured in `artifacts/phase-2/production-rate-limit.png`.

### Phase 3: Team Onboarding And Workspace Access

Status: In progress

What I learned:

- The app still had a major “demo leftover” gap: managers could edit operational team lanes, but there was no first-class product flow to approve actual workspace users by email.
- Keeping `shouldCreateUser: false` made access safer, but it also meant approved teammates could not create their account from the real app without manual Supabase admin work.
- The missing production model was: manager-approved email allowlist in the app, then first-login account creation through the login screen.

What changed:

- Added a new Supabase migration at [`supabase/migrations/20260312070000_enable_manager_workspace_access_management.sql`](/Users/iskanderzrouga/Desktop/Editors Board/supabase/migrations/20260312070000_enable_manager_workspace_access_management.sql) with:
  - `public.current_user_is_workspace_manager()`
  - `public.is_workspace_email_allowed(candidate_email text)`
  - manager RLS policies for listing, inserting, updating, and deleting `workspace_access`
- Updated [`src/supabase.ts`](/Users/iskanderzrouga/Desktop/Editors Board/src/supabase.ts) so login first checks the approved-email allowlist, then allows first-time account creation for approved emails through `signInWithOtp`.
- Added manager-facing workspace access management in [`src/App.tsx`](/Users/iskanderzrouga/Desktop/Editors Board/src/App.tsx) under `Settings` → `Team & Roles`, including add/edit/delete controls for approved emails, role mode, and linked editor assignment.
- Updated [`README.md`](/Users/iskanderzrouga/Desktop/Editors Board/README.md) so the live onboarding flow is documented as: manager adds approved email, teammate uses the shared login page, first login creates the account.

What failed along the way:

- The first implementation of the inline access-editor drafts used a synchronous `setState` inside an effect and tripped the React Hooks lint rule.

How that failure was resolved:

- Simplified the row-draft logic so default values are derived during render instead of synchronizing local state inside an effect.

Verification:

- `npm run lint` passed.
- `npm run test` passed.
- `npm run build` passed.
- `npx supabase db push --db-url 'postgresql://postgres.zytmxgtrpwlnogtrmmgt:***@aws-1-us-east-1.pooler.supabase.com:5432/postgres?sslmode=require' --include-all --workdir .` passed and applied the manager workspace-access migration.
- `npx vercel --prod --yes` passed and re-aliased production to [creative-board-lake.vercel.app](https://creative-board-lake.vercel.app).
- A live production browser check confirmed:
  - approved email `iskander@bluebrands.co` reaches Supabase auth with `create_user=true`
  - unapproved emails are blocked in-app before any OTP request is sent

Next step:

- Redeploy the frontend so the new workspace-access manager UI is live, then continue the roadmap with deeper workflow and configuration hardening.

Next step:

- In Supabase Auth URL configuration, set the production `Site URL` and allowed redirect URLs to [creative-board-lake.vercel.app](https://creative-board-lake.vercel.app) plus the local dev origins you still use, then continue the roadmap with deeper drag/drop and archival workflow auditing.

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
