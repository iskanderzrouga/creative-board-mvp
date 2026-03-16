# Phase 1: Rebrand - Context

**Gathered:** 2026-03-16
**Status:** Ready for planning

<domain>
## Phase Boundary

Rename the product from "Editors Board" to "Production Board" in all user-facing UI text (page titles, headers, branding, meta tags). Internal storage keys and code variable names stay as-is to minimize risk. No deployment/URL changes.

</domain>

<decisions>
## Implementation Decisions

### Naming Scope
- Only user-facing text changes to "Production Board" — what users see in the browser
- Internal localStorage key stays `creative-board-state` — no migration needed
- CSS class names, test fixture names, and internal variable names: Claude's discretion — rename only where it improves clarity without adding risk

### URL / Deployment
- In-app branding only — Vercel project name and subdomain stay unchanged
- No domain changes needed (currently on Vercel subdomain)

### Storage Migration
- Not needed — internal storage keys are kept as-is, so no data migration required
- BRAND-03 requirement (localStorage migration) is satisfied by keeping existing keys

### Claude's Discretion
- Whether to rename internal code references like CSS classes and variable names that say "editor" — judge based on risk vs. clarity. If a rename is low-risk and improves readability, do it. If it touches test infrastructure or shared state, leave it.

</decisions>

<canonical_refs>
## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### Project Context
- `.planning/PROJECT.md` — Product vision and core value
- `.planning/REQUIREMENTS.md` — BRAND-01, BRAND-02, BRAND-03 requirements

### Codebase References
- `.planning/codebase/STRUCTURE.md` — File locations for all branding references
- `.planning/codebase/CONVENTIONS.md` — Naming patterns to follow

</canonical_refs>

<code_context>
## Existing Code Insights

### Key Branding Locations
- `index.html` — Page title and meta tags
- `src/App.tsx` — App name rendering, header text
- `src/board.ts` — `GeneralSettings.appName` (configurable app name), `STORAGE_KEY` constant
- `src/components/` — Any component rendering the app name
- `e2e/` — Test fixtures referencing "Editors Board" or similar strings

### Established Patterns
- App name is partially configurable via `GeneralSettings.appName` — the default seed value needs to change
- `STORAGE_KEY = 'creative-board-state'` — keeping this unchanged per decision

### Integration Points
- `createSeedState()` in `board.ts` sets the initial `appName` — this is the primary place the default name is set
- Any hardcoded "Editors Board" strings in component JSX need search-and-replace

</code_context>

<specifics>
## Specific Ideas

No specific requirements — straightforward rename of user-facing strings.

</specifics>

<deferred>
## Deferred Ideas

- Task type naming conventions differ between video creatives, image ads, landing pages, and dev tasks — captured for Phase 5 discussion
- Full read of Card interface fields to understand which fields belong to which task type — Phase 5

</deferred>

---

*Phase: 01-rebrand*
*Context gathered: 2026-03-16*
