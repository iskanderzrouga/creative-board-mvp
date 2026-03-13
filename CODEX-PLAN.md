# Codex UI/UX Deployment Readiness Plan (v2)

Generated from a 5-agent Opus 4.6 audit of the current codebase (post-phase-9). Focused on making this feel like a real, polished app ready for team use.

## Operating Rules

After each phase:
1. Run `npm run lint && npm run test && npm run build` -- all must pass.
2. Commit the phase with a descriptive message.
3. Do NOT break existing functionality. If a refactor changes behavior, update tests first.
4. Read this file and `STATUS.md` if context compacts.

---

## Phase 1: Kill the Role Switcher — Fix Per-Account Identity

Status: done

**Goal**: Each user logs in and gets their fixed role from `workspace_access`. No more switching. The sidebar shows WHO you are, not WHAT you could pretend to be.

### 1.1 Remove the role switcher from the sidebar

**File**: `src/components/Sidebar.tsx`, lines 146-217

Delete the entire role switcher block (the "Role" label, the three M/E/O buttons, and the editor sub-menu). Replace it with a read-only role badge:

```tsx
<div className="sidebar-user-info">
  <div className="sidebar-user-avatar">{userEmail?.charAt(0).toUpperCase()}</div>
  <div className="sidebar-user-details">
    <span className="sidebar-user-name">{userName || userEmail}</span>
    <span className="sidebar-user-role">{role.mode}</span>
  </div>
</div>
```

When collapsed, just show the avatar initial.

### 1.2 Add server-side role validation in setRole

**File**: `src/App.tsx`, line 601 (`setRole` function)

Add a guard at the top of `setRole`:
```typescript
if (lockedRole && nextRole.mode !== lockedRole.mode) {
  return // silently reject role changes that don't match workspace_access
}
```

### 1.3 Handle local-only mode (no auth)

When `authEnabled === false` (no Supabase configured), show a banner at the top:
"Running in local mode. Configure Supabase to enable team login."

In local mode, keep a simplified role selector (maybe just in Settings > General) for testing purposes, but make it clear this is a dev/demo feature.

### 1.4 Add user identity to the sidebar

**File**: `src/components/Sidebar.tsx`

Add a user section at the bottom of the sidebar:
- Avatar circle with first letter of email (or name initial)
- Email (truncated if long)
- Role badge (Manager / Editor / Observer)
- Sign out link

Move the sign-out button from `PageHeader` session toolbar into the sidebar user section.

### 1.5 Add a user display name from workspace_access

**File**: `src/hooks/useWorkspaceSession.ts`

When fetching workspace_access, also use `editor_name` as the display name. Pass it through to components. The sidebar and activity log should show names, not raw emails.

### 1.6 Fix the `getActorName` function

**File**: `src/App.tsx`, lines 332-339

Replace hardcoded names:
- Authenticated user: use `workspaceAccess.editorName || authSession.email`
- Local mode: use "Local User"

### Verification
- `npm run lint && npm run test && npm run build` pass.
- Login with an editor account — see only the editor role, no switcher.
- Login with a manager account — see only the manager role.
- Sign out button works from sidebar.

---

## Phase 2: Fix Settings Pages — Separate Concepts, Fix Inputs

Status: done

**Goal**: Settings should be intuitive. Team Members (board lanes) and Workspace Access (login accounts) are clearly separate. All inputs use proper controls.

### 2.1 Add section headings to Team & Roles tab

**File**: `src/components/SettingsPage.tsx`, around line 649

Add a clear heading before the team member table:
```tsx
<div className="settings-section-header">
  <h3>Board Team Members</h3>
  <p className="muted-copy">These are the editors and managers who appear as lanes on the board. This does NOT control login access.</p>
</div>
```

Add a divider and heading before WorkspaceAccessManager:
```tsx
<hr className="settings-divider" />
<div className="settings-section-header">
  <h3>Login Access</h3>
  <p className="muted-copy">Control who can sign in to this workspace. Each person needs an entry here to log in.</p>
</div>
```

### 2.2 Replace free-text timezone with a proper select

**File**: `src/components/SettingsPage.tsx`, lines 765-778

Replace the `<input list="timezone-options">` with a proper `<select>`:
```tsx
<select
  value={member.timezone}
  onChange={(event) => /* existing handler */}
  aria-label={`Timezone for ${member.name}`}
>
  {Intl.supportedValuesOf('timeZone').map(tz => (
    <option key={tz} value={tz}>{tz}</option>
  ))}
</select>
```

### 2.3 Replace free-text team role with a select

**File**: `src/components/SettingsPage.tsx`, around line 680

Replace the free-text role input with:
```tsx
<select value={member.role} onChange={/* existing handler */} aria-label={`Role for ${member.name}`}>
  <option value="Editor">Editor</option>
  <option value="Manager">Manager</option>
  <option value="LaunchOps">LaunchOps</option>
  <option value="Designer">Designer</option>
</select>
```

### 2.4 Add role descriptions to WorkspaceAccessManager

**File**: `src/components/WorkspaceAccessManager.tsx`, lines 99-103

Add help text or tooltips to the role select:
```tsx
<select ...>
  <option value="manager">Manager — Full access, settings, team management</option>
  <option value="editor">Editor — Own cards, drag forward, no settings</option>
  <option value="observer">Observer — Read-only, analytics access</option>
</select>
```

### 2.5 Fix the "add new user" row visibility

**File**: `src/components/WorkspaceAccessManager.tsx`, lines 153-221

Make the "add new entry" area visually distinct from existing rows:
- Add a section heading: "Add New User"
- Use a card-style container with a subtle background color
- Make the "Add" button more prominent

### 2.6 Add email validation to WorkspaceAccessManager

**File**: `src/components/WorkspaceAccessManager.tsx`, lines 39-41

Replace `Boolean(newEntry.email.trim())` with proper email validation:
```typescript
const isValidEmail = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(newEntry.email.trim())
const canAddNewEntry = isValidEmail && !entries.some(e => e.email === newEntry.email.trim())
```

Show an inline error if the email is invalid or duplicate.

### 2.7 Add dirty-state indicator to workspace access rows

When a field in an existing workspace access row changes, highlight the row and the Save button. Currently there's no visual indication that unsaved changes exist.

### 2.8 Add inline help text to all settings tabs

Add brief descriptions:

| Tab | Help text |
|-----|-----------|
| General | "Configure your workspace name, age thresholds, and auto-archive behavior." |
| Capacity | "Set utilization thresholds. Green/Yellow/Red bands appear in Analytics and Workload views." |
| Task Library | "Define card types with default estimates and required fields. These appear in the card creation form." |
| Data | "Export your board data as JSON for backup. Import to restore. Reset returns to sample data." |

### 2.9 Add danger styling to brand Delete button

**File**: `src/components/SettingsPage.tsx`, line 542

Change `className="clear-link"` to `className="clear-link danger-link"` to match team member delete buttons.

### 2.10 Add aria-labels to all unlabeled settings inputs

Add `aria-label` attributes to: brand name, brand prefix, brand products, drive folder ID, task type name, task type icon, task type hours, revision reason name, revision reason hours, workspace access email.

### Verification
- Settings page has clear section headings.
- Timezone is a dropdown, not free text.
- Role is a dropdown, not free text.
- New user form in workspace access is visually distinct.
- Email validation works.

---

## Phase 3: Board Visual Polish — Icons, Animations, Filters

Status: done

**Goal**: Replace emoji with proper icons, add animations, fix filter UX.

### 3.1 Replace all emoji with SVG icons

Create a small icon set in `src/components/icons/` (or inline SVG):

| Emoji | Replace with | Used in |
|-------|-------------|---------|
| 🚫 | Red circle-slash SVG | `BoardCardSurface.tsx` line 86 |
| ⏰ | Clock SVG (red for overdue, amber for soon) | `BoardCardSurface.tsx` lines 120-121 |
| 🟢🟡🔴 | Colored dot `<span>` with CSS | `AnalyticsPage.tsx` line 150 |
| × (multiply) | X SVG icon | All close buttons across app |

### 3.2 Add slide-in animation to CardDetailPanel

**File**: `src/App.css`

```css
.slide-panel {
  transform: translateX(100%);
  transition: transform 0.25s ease;
}
.slide-panel.is-open {
  transform: translateX(0);
}
.panel-overlay {
  opacity: 0;
  transition: opacity 0.2s ease;
}
.panel-overlay.is-visible {
  opacity: 1;
}
```

Update the component to add/remove `is-open` and `is-visible` classes instead of conditional rendering (or use a mount/unmount animation approach).

### 3.3 Fix the filter bar — add group labels

**File**: `src/components/BoardPage.tsx`, lines 182-306

Add small group labels before each filter section:
```tsx
<span className="filter-group-label">Brand</span>
{/* brand pills */}

<span className="filter-group-divider" />

<span className="filter-group-label">Editor</span>
{/* editor pills */}

<span className="filter-group-divider" />

<span className="filter-group-label">Flags</span>
{/* flag pills */}
```

### 3.4 Fix flag filter pill colors

**File**: `src/components/BoardPage.tsx`, lines 253-289

Stop reusing `is-all` class for flag pills. Instead:
- Overdue active → `is-active is-danger` (red tint)
- Stuck active → `is-active is-warning` (amber tint)
- Blocked active → `is-active is-danger` (red tint)
- Show Archived → separate toggle style, not a pill

### 3.5 Separate "Show archived" from filter pills

Change "Show archived" from a filter pill to a toggle switch or checkbox at the end of the filter bar with a clear visual distinction.

### 3.6 Add a persistent "+ Add card" button

**File**: `src/components/BoardPage.tsx` or `PageHeader.tsx`

Move the "+ Add card" button from the Backlog column header to the page header so it's always visible, even when Backlog is scrolled off-screen.

### 3.7 Center the board empty state

**File**: `src/components/BoardPage.tsx`, lines 339-369

When `!hasVisibleCards`, skip rendering `board-grid` and center the empty state:
```tsx
{!hasVisibleCards ? (
  <div className="board-empty-centered">
    <div className="board-empty-state">...</div>
  </div>
) : (
  <div className="board-grid">...</div>
)}
```

### 3.8 Add a search icon to the search bar

**File**: `src/components/PageHeader.tsx`, line 29

Add a magnifying glass SVG before the input inside `search-shell`.

### 3.9 Add card aria-labels

**File**: `src/components/BoardCardSurface.tsx`, line 73

Add `aria-label={`Open card ${card.id}: ${card.title}`}` to the card button.

### Verification
- No emoji anywhere on the board.
- Card detail panel slides in smoothly.
- Filter bar has labeled groups.
- Search bar has a search icon.
- Empty state is centered.

---

## Phase 4: Card Detail Panel Polish

Status: done

**Goal**: Make the detail panel organized, navigable, and professional.

### 4.1 Group metadata fields with subheadings

**File**: `src/components/CardDetailPanel.tsx`, lines 481-704

Break the flat 16-field grid into labeled groups:
- **Classification**: Brand, Product, Platform, Task Type, Funnel Stage
- **Schedule**: Due Date, Estimated Completion, Date Created, Date Assigned, Days Since Briefed
- **Estimates**: Original Estimate, Revision Estimate, Current Scheduling Estimate
- **Creative**: Hook, Angle, Audience
- **Assignment**: Assigned to, Revisions

Each group gets a small subheading using `<h4 className="metadata-group-title">`.

### 4.2 Move Archive button to the panel header

**File**: `src/components/CardDetailPanel.tsx`, lines 705-717

Move the Archive/Unarchive button from the bottom of metadata to the panel header actions area (near Delete). Give it a distinct style.

### 4.3 Add Drive Folder to section nav

**File**: `src/components/CardDetailPanel.tsx`, lines 58-66

Add `{ id: 'drive', label: 'Drive' }` to `CARD_DETAIL_SECTIONS` and add the corresponding ref to the Drive section.

### 4.4 Fix section title consistency

Choose ONE style for all section titles. Use `section-rule-title` (uppercase, small, with border) consistently for ALL sections: Details, Naming, Metadata, Brief, Links, Comments, Activity, Drive.

Remove the `panel-section-title` class usage.

### 4.5 Add activity list empty state

**File**: `src/components/CardDetailPanel.tsx`, around line 943-953

```tsx
{card.activityLog.length === 0 ? (
  <div className="muted-copy">No activity recorded.</div>
) : (/* existing list */)}
```

### 4.6 Add comment character limit

**File**: `src/components/CardDetailPanel.tsx`, around line 906

Add `maxLength={2000}` to the comment textarea and a character counter below it.

### 4.7 Fix Drive sub-item links

**File**: `src/components/CardDetailPanel.tsx`, lines 728-733

Either construct proper subfolder URLs or remove the sub-items and show just one folder link.

### 4.8 Add close button to BackwardMoveModal

**File**: `src/components/BackwardMoveModal.tsx`, line 64

Add a close X button in the modal header matching QuickCreateModal and DeleteCardModal.

### 4.9 Add card title to delete confirmation

**File**: `src/components/DeleteCardModal.tsx`, lines 40-42

Change to: `This will permanently remove "${card.title}" (${card.id}) from the board.`

### 4.10 Use `<h2>` for all modal titles

Replace `<strong id={titleId}>` with `<h2 id={titleId}>` in QuickCreateModal, BackwardMoveModal, and DeleteCardModal.

### 4.11 Add `name` attribute and fieldset to BackwardMoveModal radios

**File**: `src/components/BackwardMoveModal.tsx`, lines 69-87

Wrap radios in `<fieldset><legend>Why?</legend>...</fieldset>` and add `name="revision-reason"` to each radio.

### Verification
- Metadata is grouped with subheadings.
- Archive button is in the header.
- All section titles use the same style.
- Drive section is in the section nav.
- All modals have close buttons and h2 titles.

---

## Phase 5: Analytics & Workload — Make Data Useful

**Goal**: Add tooltips, legends, empty states, and make charts readable.

### 5.1 Add a brand color legend

**File**: `src/components/AnalyticsPage.tsx`

Add a shared legend component that maps brand name → color dot. Show it above the funnel and throughput sections.

### 5.2 Add tooltips to chart segments

**File**: `src/components/AnalyticsPage.tsx`

For funnel bar segments (lines 84-92) and throughput bar segments (lines 203-211):
- Add `title={`${segment.brandName}: ${segment.count} cards`}` to each segment span.
- Or implement a CSS tooltip on hover.

### 5.3 Add Y-axis and totals to throughput chart

**File**: `src/components/AnalyticsPage.tsx`, lines 192-218

- Add a total count label above each throughput column.
- Add Y-axis gridlines or at minimum a max-value label.

### 5.4 Fix progress bar color semantics

**File**: `src/components/AnalyticsPage.tsx`, lines 51-55

Change the overview progress bar fill color based on `onTrackRatio`:
- \>= 75% → green
- \>= 50% → amber
- < 50% → red

### 5.5 Replace emoji status dots with CSS-styled dots

**File**: `src/components/AnalyticsPage.tsx`, line 150

Replace 🟢🟡🔴 with `<span className="status-dot is-green/is-amber/is-red" />`.

### 5.6 Add missing empty states

Add empty state messages to:
- Portfolio overview (line 42): "No portfolios configured"
- Team capacity grid (line 134): "No team members found"
- Brand health summary (line 231): "No brand data available"

### 5.7 Add time-window context to column headers

**File**: `src/components/AnalyticsPage.tsx`

- Team Capacity Grid: change "Avg Cycle Time" to "Avg Cycle Time (all time)"
- Brand Health: change "Avg Cycle Time" to "Avg Cycle Time (30 days)"

### 5.8 Fix utilization bar overflow in WorkloadPage

**File**: `src/components/WorkloadPage.tsx`, around line 31

Allow the bar to extend beyond 100%:
```typescript
const barWidth = Math.min(utilizationPct, 150) // allow overflow up to 150%
```
At >100%, show the overflow portion in red.

### 5.9 Add due dates to unassigned queue cards

**File**: `src/components/WorkloadPage.tsx`, around line 67

Show the due date on queue cards when present. Add an "OVERDUE" badge if past due.

### 5.10 Fix stacked data grids on mobile

**File**: `src/App.css`

When tables collapse to 1-column at 768px, add inline labels to each cell since headers are hidden:
```css
@media (max-width: 768px) {
  .analytics-team-grid .dashboard-table-cell::before {
    content: attr(data-label);
    font-weight: 600;
    display: block;
    margin-bottom: 2px;
  }
}
```

Add `data-label="Active Cards"` etc. to each cell in the JSX.

### 5.11 Use CSS text-transform instead of JS toUpperCase

**File**: `src/components/AnalyticsPage.tsx`, line 49

Remove `.toUpperCase()` from portfolio name. Add `text-transform: uppercase` to the CSS class instead.

### Verification
- Charts have tooltips on hover.
- Throughput chart has totals.
- Progress bars change color based on health.
- No emoji in analytics.
- Empty states show in all sections.

---

## Phase 6: CSS Cleanup & Interaction States

**Goal**: Fix all missing hover/active/focus states, consolidate duplicates, add consistency.

### 6.1 Add hover state to `.primary-button`

**File**: `src/App.css`, after line 504

```css
.primary-button:hover:not(:disabled) {
  background-color: var(--blue-hover, #1d4ed8);
}
```

### 6.2 Add `:active` states to all buttons

```css
.primary-button:active { transform: scale(0.97); }
.ghost-button:active { transform: scale(0.97); }
.danger-solid:active { transform: scale(0.97); }
.sidebar-nav-item:active { transform: scale(0.96); }
```

### 6.3 Add hover states to all missing interactive elements

Add hover styles for: `.filter-pill`, `.copy-button`, `.toolbar-button`, `.clear-link`, `.table-link`, `.danger-outline`, `.working-day-toggle`, `.portfolio-collapse`, `.queue-card`, `.overview-card`, `.dashboard-card-row`, `.stuck-row`, `.radio-option`.

### 6.4 Standardize disabled opacity

Use `0.5` everywhere instead of the current mix of `0.55` and `0.42`.

### 6.5 Add `:focus-within` to search shell

**File**: `src/App.css`, after the `.search-input` definition

```css
.search-shell:focus-within {
  border-color: var(--blue);
  box-shadow: 0 0 0 2px rgba(59, 130, 246, 0.15);
}
```

### 6.6 Merge duplicate CSS blocks

Consolidate these selectors that are defined twice (first in the original section, then in the "v2 shell recovery overrides"):
- `.manager-filter-bar` (lines 269 + 2219)
- `.stats-bar` (lines 234 + 2231)
- `.editor-summary-bar` (lines 352 + 2235)
- `.board-scroll` (lines 372 + 2239)
- `.stage-column` (lines 426 + 2243)
- `.slide-panel` (lines 855 + 3047)
- `.board-card-top` (lines 673 + 2351)
- `.copy-field` (lines 1023 + 3087)
- `.link-row` (lines 1101 + 3096)

For each: merge the two definitions into one block in the logical location. Remove the "v2 shell recovery overrides" section.

### 6.7 Convert hardcoded colors to CSS variables

Replace:
- All 14 hardcoded hex colors in pill/funnel components (lines 717-750)
- The 16+ hardcoded box-shadow values → add `--shadow-sm`, `--shadow-md`, `--shadow-lg`, `--shadow-xl`
- `index.css` hardcoded `#f4f5f7` and `#172b4d` → use `var(--bg)` and `var(--text)`

### 6.8 Standardize border-radius

Reduce from 11 distinct values to 5:
- `4px` (tight/pills)
- `8px` (inputs, cards)
- `12px` (containers, buttons)
- `16px` (large containers)
- `999px` (full-round pills/badges)

Merge `10px→8px`, `14px→12px`, `18px→16px`, `20px→16px`, `24px→16px`.

### Verification
- All interactive elements have hover, active, and focus states.
- No duplicate CSS blocks.
- All colors use CSS variables.
- Consistent border-radius scale.

---

## Phase 7: Remaining UX Polish

**Goal**: Final touches to make everything feel complete.

### 7.1 Add a loading spinner for button actions

Create a small CSS spinner class for buttons that trigger async operations (Save in workspace access, sign-in button).

### 7.2 Add keyboard shortcut hints to action buttons

Show subtle hint text:
- Quick Create modal "Create" button: show "Enter" hint
- Comment textarea: show "Cmd+Enter to post"
- Search bar: show "Cmd+K" hint as placeholder

### 7.3 Add print stylesheet for analytics

```css
@media print {
  .analytics-page { break-inside: avoid; }
  .funnel-row { flex-wrap: wrap; }
  .throughput-chart { page-break-before: always; }
}
```

### 7.4 Add body scroll lock when modals are open

When any modal or slide panel opens, set `document.body.style.overflow = 'hidden'`. Restore on close.

### 7.5 Fix drag placeholder

**File**: `src/components/SortableBoardCard.tsx`

When `isDragging` is true, render a dashed outline placeholder instead of the semi-transparent card.

### 7.6 Add sidebar click/tap toggle for touch screens

The sidebar expand currently relies on hover (`sidebar-hover-zone`). Add a tap/click toggle for tablets that are wider than 768px but use touch input.

### 7.7 Prevent body scroll when modal is open

Add `useEffect` in modal components that sets `document.body.style.overflow = 'hidden'` on mount and restores on unmount.

### Verification
- All async buttons show loading state.
- Modals prevent background scrolling.
- Keyboard hints visible on action buttons.

---

## Phase 8: End-to-End Workflow Test Plan

**Goal**: Verify every workflow before team deployment.

### Automated Tests (run all)
```bash
npm run lint
npm run test:unit
npm run test:e2e
npm run build
```

### Manual Regression Checklist

**Authentication:**
- [ ] Login screen shows cleanly — no role switcher visible
- [ ] Magic link login works end to end
- [ ] After login: sidebar shows user identity (avatar, email, role badge)
- [ ] Sign out works from sidebar
- [ ] Unauthorized email shows clear error message
- [ ] Page refresh preserves session

**Role-Locked Behavior:**
- [ ] Manager: sees full board, settings, analytics, workload
- [ ] Editor: sees own cards only, no settings, no role switcher
- [ ] Observer: read-only board, analytics, no settings, no role switcher
- [ ] No user can switch roles in the UI

**Board:**
- [ ] Cards display with SVG icons (no emoji)
- [ ] Filter bar has labeled groups (Brand / Editor / Flags)
- [ ] "+ Add card" button always visible in header
- [ ] Card detail slides in with animation
- [ ] Empty board shows centered empty state
- [ ] Search has a magnifying glass icon
- [ ] Drag-and-drop works forward, backward (revision modal), blocked

**Card Detail:**
- [ ] Metadata grouped with subheadings
- [ ] Archive button in header
- [ ] Section nav works for all sections including Drive
- [ ] All section titles use same style
- [ ] Activity has empty state
- [ ] Comments have character limit

**Settings:**
- [ ] "Board Team Members" and "Login Access" have separate headings
- [ ] Timezone is a proper dropdown
- [ ] Role is a dropdown
- [ ] Workspace access "add new" is visually distinct
- [ ] Email validation works
- [ ] All tabs have help text

**Analytics:**
- [ ] Charts have tooltips
- [ ] Brand legend visible
- [ ] Throughput chart has totals
- [ ] Progress bars change color
- [ ] CSS dots instead of emoji
- [ ] Empty states in all sections

**Workload:**
- [ ] Utilization bars show overflow beyond 100%
- [ ] Queue cards show due dates
- [ ] Empty states work

**Visual Polish:**
- [ ] All buttons have hover + active states
- [ ] No duplicate CSS blocks
- [ ] All colors use CSS variables
- [ ] Focus indicators visible on keyboard navigation
- [ ] Modals prevent background scrolling
- [ ] Panel slides in/out with animation

**Responsive:**
- [ ] Tablet (768px): sidebar becomes horizontal, board goes single-column
- [ ] Data grids show inline labels at mobile widths
- [ ] Modals go full-width on mobile

---

## Phase Dependencies

```
Phase 1 (Kill Role Switcher)
    |
Phase 2 (Fix Settings)
    |
Phase 3 (Board Visual Polish) ── Phase 4 (Card Detail Polish)
    |                                |
Phase 5 (Analytics & Workload)       |
    |                                |
Phase 6 (CSS Cleanup) ──────────────┘
    |
Phase 7 (Final Polish)
    |
Phase 8 (Full Regression)
```

Phases 3-4 can be parallelized. All others are sequential.
