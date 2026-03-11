# Deploy Readiness Plan

## Mission

Transform this app from a polished demo into a product that could realistically survive real-world use at much larger scale, while keeping the main board layout recognizable and easy to use.

## Operating Rules

After each phase:

1. Run verification.
2. Commit the phase.
3. Update `STATUS.md` with what changed, what broke, what was learned, and the next step.
4. Continue from the next phase instead of stopping at planning.

Default verification command set:

1. `npm run lint`
2. `npm run test`
3. `npm run build`

If context compacts, reread `PLAN.md` and `STATUS.md` first and continue from the next incomplete phase.

## Phase 1: Baseline And Safety Net

Goals:

- Understand the product surface and workflow model.
- Add repeatable unit and browser tests.
- Capture baseline screenshots.
- Fix the first data-integrity issues uncovered during audit.

Exit criteria:

- `PLAN.md` and `STATUS.md` exist.
- Test harness exists and runs locally.
- Browser smoke tests cover the main board and observer analytics access.
- Obvious rename and portfolio-deletion data drift issues are fixed.

## Phase 2: Workflow Logic Hardening

Goals:

- Audit drag-and-drop rules, backward moves, permissions, role-specific behavior, and data persistence.
- Tighten edge cases around blocked cards, due dates, archival, and assignment.
- Expand tests around the board state engine in `src/board.ts`.

Exit criteria:

- High-risk board mutations are covered by unit tests.
- Role restrictions behave consistently in both code and browser tests.
- Data mutations preserve referential consistency across settings and board views.

## Phase 3: Configuration And Admin Reliability

Goals:

- Harden settings workflows for brands, team, task library, revision reasons, capacity, integrations, and data import/export.
- Catch unsafe destructive actions earlier.
- Improve admin clarity so the app is hard to misconfigure.

Exit criteria:

- Critical settings flows have browser coverage.
- Import/export and reset flows are validated.
- Unsafe states are blocked or clearly explained in the UI.

## Phase 4: Scalability And Performance

Goals:

- Stress test board rendering and filtering with larger datasets.
- Identify state-shape bottlenecks and high-cost UI patterns.
- Reduce avoidable re-renders and performance hazards without changing the board’s core feel.

Exit criteria:

- Large-data scenarios are documented and measured.
- Major performance risks are either fixed or clearly logged in `STATUS.md`.
- The app remains usable with substantially more cards and teams than the seed data.

## Phase 5: Deployment Readiness

Goals:

- Add a release-ready README and operational notes.
- Define environment, hosting, monitoring, analytics, and backend integration assumptions.
- Close the gap between mocked integrations and production requirements.

Exit criteria:

- Deployment checklist exists.
- Known backend dependencies and integration gaps are documented.
- The repo has a practical path from local app to hosted product.

## Phase 6: UX Polish And Regression Loop

Goals:

- Refine rough edges discovered during testing.
- Keep the first-page layout direction intact while improving clarity and ease of use.
- Keep running regression passes until the remaining issues are low-risk and well understood.

Exit criteria:

- Main workflows feel coherent end to end.
- Regression suite is stable.
- Remaining gaps are explicit, prioritized, and actionable.
