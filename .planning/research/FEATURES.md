# Feature Research: Multi-Role Creative Production Management

## Research Context

**Question**: What features do creative production management tools have for multi-role teams? What's table stakes vs differentiating for task type-specific workflows?

**Milestone**: Cleanup + extend existing board for broader team (editors, designers, developers, launch ops).

**Competitors surveyed**: Monday.com, Asana, ClickUp, Air.inc, Frame.io, Productive, Teamwork.

**Current state**: The board already has a task type system with `requiredFields` / `optionalFields` per type, 10 seed task types across 6 categories, role-based access (owner/manager/contributor/viewer), contributor scoping, team member capacity, and estimated delivery dates. The core architecture supports multi-role teams; the gaps are in the UI honoring task type context and in cleaning up the monolithic codebase to make extension safe.

---

## Table Stakes (Must Have or Users Leave)

These are features every credible production management tool provides. If missing, the product feels broken or amateurish. The board already has most of these; the gaps are marked.

### TS-1: Task Type-Specific Card Fields

**Status**: Partially built (data model exists, UI does not honor it)
**Complexity**: Medium
**What competitors do**: ClickUp (launched "Custom Fields by Task Type" as a headline feature), Monday.com (custom field visibility per item type), Asana (custom fields scoped to project templates). All three hide irrelevant fields when a task type changes, so a video editor never sees "Landing Page URL" and a developer never sees "Frame.io Link."
**What the board has**: `TaskType.requiredFields` and `TaskType.optionalFields` already define which `CardFieldKey` values matter per type. The `Card` interface carries all fields (hook, angle, funnelStage, etc.) regardless of type.
**Gap**: `CardDetailPanel.tsx` renders every field for every card. It needs to read the card's `taskTypeId`, look up the `TaskType`, and conditionally show/hide fields based on `requiredFields` + `optionalFields`. Fields not in either list should be hidden entirely.
**Milestone relevance**: HIGH -- this is explicitly in the Active requirements.

### TS-2: Contributor "My Queue" View

**Status**: Built
**Complexity**: Already done
**What competitors do**: Asana ("My Tasks"), Monday ("My Work"), ClickUp ("My Tasks"), Productive (saved views per role). Every tool gives contributors a filtered view showing only their assigned work, ordered by priority.
**What the board has**: Contributor role mode already scopes the board to show only that contributor's assigned cards. The kanban columns filter accordingly.
**Gap**: None for this milestone. Works as designed.

### TS-3: Drag-and-Drop Priority Ordering

**Status**: Built
**Complexity**: Already done
**What competitors do**: Universal across kanban tools. Cards within a column can be reordered by dragging. The order represents priority (top = highest).
**What the board has**: `positionInSection` on each card, dnd-kit integration, full drag-drop between stages and within stages.
**Gap**: None.

### TS-4: Role-Based Access Control

**Status**: Built
**Complexity**: Already done
**What competitors do**: Every tool has at minimum admin/member/guest roles. Most have workspace-level and project-level permissions. Contributors typically cannot access settings, delete others' work, or see the full team directory.
**What the board has**: Four roles (owner, manager, contributor, viewer) with scope assignments (all portfolios, selected portfolios, selected brands). Contributors see only their cards. Viewers are read-only.
**Gap**: None for this milestone.

### TS-5: Card Detail Panel with Activity History

**Status**: Built
**Complexity**: Already done
**What competitors do**: Every tool has a side panel or modal for card/task details showing description, comments, attachments, activity log, and field editing.
**What the board has**: `CardDetailPanel.tsx` with comments, attachments, activity log, brief (rich text), all card fields, stage history, and revision tracking.
**Gap**: None, though the panel is 1,146 lines and needs cleanup (separate concern from features).

### TS-6: Workload / Capacity Visibility

**Status**: Built
**Complexity**: Already done
**What competitors do**: Monday ("Workload View"), Asana ("Workload"), ClickUp ("Workload View"), Productive ("Resource Planning"). All show per-person utilization as hours assigned vs. hours available, with color-coded overload indicators.
**What the board has**: Dedicated Workload page, per-team-member capacity (weekly hours, hours per day, working days, timezone), utilization percentages with green/yellow/red thresholds, WIP caps.
**Gap**: None.

### TS-7: Estimated Delivery Dates

**Status**: Built
**Complexity**: Already done
**What competitors do**: Most tools let you set a due date. Fewer automatically calculate delivery based on queue position. Monday and Teamwork offer timeline views with automatic scheduling based on task dependencies and resource availability.
**What the board has**: `getCardCompletionForecast()` calculates delivery based on queue position, team member schedule (working days, hours per day, timezone), and estimated hours.
**Gap**: None. This is actually a differentiator (see D-1).

### TS-8: Multiple Task Types with Visual Differentiation

**Status**: Built
**Complexity**: Already done
**What competitors do**: ClickUp (task types with icons and colors), Monday (item types), Asana (task templates). All use visual markers (color pills, icons) so users can scan the board and identify task types at a glance.
**What the board has**: 10 seed task types with per-type icon, color, and text color. Type pill displayed on cards. Task type library editor in Settings.
**Gap**: None.

### TS-9: Board Filters

**Status**: Built
**Complexity**: Already done
**What competitors do**: Every tool offers filtering by assignee, label/tag, priority, status, date range. Saved/named filters are common in mid-tier and up.
**What the board has**: Filters by brand, owner, search query, overdue-only, stuck-only, blocked-only, show-archived.
**Gap**: No saved/named filters -- but that's not a milestone concern.

---

## Differentiators (Competitive Advantage)

Features that set the board apart or represent opportunities to provide more value than generic project management tools for the specific use case of performance marketing creative production.

### D-1: Queue-Position-Based Delivery Forecasting

**Complexity**: Already built
**What it is**: Automatic delivery date calculation based on queue position, contributor schedule, and estimated hours. Not just "when is it due" but "when will it actually be done given everything ahead of it."
**Why it differentiates**: Most tools show due dates (what the manager wants). Few tools show forecast dates (what the queue says). Monday and Teamwork offer timeline views but require manual dependency setup. The board calculates this automatically from card order.
**Milestone relevance**: Already working. Protect during cleanup.

### D-2: Naming Convention Generator

**Complexity**: Already built
**What it is**: Auto-generates structured asset names (`generatedSheetName`, `generatedAdName`) from card metadata (brand, product, platform, hook, angle, funnel stage, owner).
**Why it differentiates**: Ad naming conventions are critical infrastructure for performance marketing teams running hundreds of ad variations. Dedicated tools exist for this (AdManage.ai, focal.inc) but none are integrated into the production board where the creative is tracked. Having naming auto-generated from card fields eliminates the handoff error where creatives name files inconsistently.
**Milestone relevance**: Already working for video types. Needs extension: image ads and dev tasks should either have different naming patterns or explicitly skip naming (dev tasks have no ad name). This is part of making fields truly type-specific.

### D-3: Revision Tracking with Reasons and Estimates

**Complexity**: Already built
**What it is**: When a card moves backward (e.g., Review to In Production), the system captures the revision reason (from a configurable library), estimated revision hours, and feedback. This is tracked in stage history.
**Why it differentiates**: Most tools track stage transitions but don't capture why something moved backward or how long the rework is expected to take. This data feeds into analytics (which task types have the most revisions, which revision reasons are most common).
**Milestone relevance**: Already working. Protect during cleanup.

### D-4: Performance Marketing Domain Model

**Complexity**: Already built
**What it is**: The card model includes performance marketing concepts baked in: funnel stage (Cold/Warm/Promo/Promo Evergreen), ad platforms (Meta/AppLovin/TikTok/Google), hook, angle, audience. These are not generic custom fields -- they are first-class domain concepts.
**Why it differentiates**: Generic tools (Asana, Monday, ClickUp) can model this with custom fields but require setup and don't enforce consistency. Having funnel stage and platform as typed fields means filtering, analytics, and naming conventions work out of the box.
**Milestone relevance**: Some of these fields (hook, angle, funnel stage) are video/creative-specific and should be hidden for dev tasks and landing pages. This is the type-specific fields work.

### D-5: Google Drive + Frame.io Integration on Cards

**Complexity**: Already built
**What it is**: Cards have `driveFolderUrl`, `driveFolderCreated` (webhook-based Drive folder creation), and `frameioLink` fields. Contributors can jump directly to assets from the card.
**Why it differentiates**: Air.inc and Frame.io are standalone tools. Having the link from production board card to external asset tool is a lightweight integration that avoids context switching without trying to replicate DAM functionality.
**Milestone relevance**: These integrations should be type-specific. Video cards need Frame.io. Image cards may need Drive but not Frame.io. Dev tasks need neither. This is part of TS-1.

---

## Anti-Features (Deliberately Do NOT Build)

Things that seem tempting but would add complexity, distract from the core value, or move the product away from its niche.

### AF-1: Built-In Asset Hosting / DAM

**Why not**: Air.inc, Frame.io, and Google Drive already handle asset storage, versioning, and preview. Replicating this is a massive engineering effort with no advantage. The board links to external tools; it does not store or preview creative assets.
**Risk if built**: Storage costs, video transcoding complexity, security surface area, feature creep.

### AF-2: Real-Time Collaborative Editing

**Why not**: The team is small (< 10 people). The current local-first + remote sync model with conflict detection works. Real-time collaboration (like Google Docs or Figma) adds enormous complexity (CRDTs or OT) for minimal benefit at this team size.
**Risk if built**: Architectural rewrite, latency sensitivity, sync bugs.

### AF-3: Task Dependencies / Gantt Charts

**Why not**: Creative production tasks are mostly independent -- a video ad does not block an image ad. The queue is ordered by priority, not by dependency chains. Adding dependency management adds UI complexity (draw arrows between cards, handle circular dependencies, recalculate critical path) without matching how the team actually works.
**Risk if built**: Users won't use it. The board becomes a generic PM tool rather than a focused production queue.

### AF-4: Time Tracking

**Why not**: The board has `estimatedHours` and `actualHoursLogged` but does not need a built-in timer or timesheet. The team cares about throughput and delivery dates, not hours worked. Time tracking shifts the culture from output to hours and adds friction for contributors.
**Risk if built**: Contributors resist logging time. Data quality degrades. Management gets a false sense of control.

### AF-5: In-App Chat / Messaging

**Why not**: The team uses Slack. Comments on cards are sufficient for task-specific communication. Building a chat system duplicates Slack with worse UX and splits conversations across two tools.
**Risk if built**: Nobody uses it. Notifications double. Context scatters.

### AF-6: AI-Powered Task Assignment / Prioritization

**Why not**: The team is small enough that the manager manually assigns and prioritizes. AI assignment (like Monday's capacity-based routing) makes sense at scale (50+ people, hundreds of tasks). At this team size, the manager knows each contributor's strengths and current context better than any algorithm.
**Risk if built**: Black-box decisions that the manager overrides anyway. Wasted engineering time.

### AF-7: Multiple Board Views (Timeline, Calendar, List, Table)

**Why not**: The kanban board is the primary interface and matches how creative production flows (stages from Backlog to Live). Adding timeline, calendar, list, and table views is a large UI investment. The Workload and Analytics pages already provide alternative perspectives. More views = more code to maintain with every feature change.
**Risk if built**: Each new feature must work across N views. Maintenance burden multiplies. Users default to kanban anyway.

### AF-8: Custom Workflow Stages Per Task Type

**Why not**: ClickUp and Monday allow different status workflows per task type (e.g., a bug has different stages than a feature). The board's 6-stage pipeline (Backlog, Briefed, In Production, Review, Ready, Live) is universal and works for all creative production. Different stages per type would fragment the board view and complicate drag-drop, analytics, and workload calculations.
**Risk if built**: Board becomes visually confusing. Cannot compare throughput across types.

---

## Milestone-Specific Feature Summary

For the current cleanup + extend milestone, here is what matters:

| Feature | Category | Status | Work Required | Priority |
|---------|----------|--------|---------------|----------|
| Type-specific card fields (hide irrelevant fields) | Table stakes | Data model built, UI not | Medium -- update `CardDetailPanel.tsx` to read `TaskType.requiredFields` / `optionalFields` and conditionally render | P0 |
| New task types (image ads, dev tasks, landing pages) | Table stakes | Seed types exist for some | Low -- add new entries to `createSeedTaskLibrary()` with appropriate field configs | P0 |
| Type-specific naming convention | Differentiator | Built for video | Low-Medium -- `generateSheetName` / `generateAdName` need type-aware logic (skip for dev tasks, different pattern for images) | P1 |
| Type-specific integrations (Frame.io, Drive) | Table stakes | Fields exist on all cards | Low -- hide Frame.io fields for non-video types, hide Drive folder for dev tasks | P1 |
| Break up monolithic components | Prerequisite | Not started | High -- App.tsx (1,823 lines), PeopleSection (1,301), SettingsPage (1,290), CardDetailPanel (1,146) | P0 |
| Reduce prop drilling | Prerequisite | Not started | High -- useAppEffects has 43 parameters; introduce context or state management | P0 |
| Fix remote sync fragility | Technical debt | Identified | Medium -- replace JSON signature with version-based conflict detection | P1 |
| Guard E2E test mode in production | Security | Not started | Low -- add environment variable check | P0 |
| Abstract localStorage access | Technical debt | Not started | Medium -- create storage service, centralize keys | P1 |

---

## Competitive Landscape Summary

| Capability | Monday | Asana | ClickUp | Air.inc | Frame.io | This Board |
|-----------|--------|-------|---------|---------|----------|------------|
| Task types with custom fields | Yes | Via templates | Yes (headline feature) | No (asset-focused) | No (review-focused) | Yes (data model built, UI needs work) |
| Contributor scoped view | Yes | Yes ("My Tasks") | Yes ("My Tasks") | N/A | N/A | Yes |
| Queue-based delivery forecast | Partial (timeline) | No | No | No | No | Yes (automatic) |
| Naming convention generator | No | No | No | No | No | Yes |
| Revision tracking with reasons | No | No | No | No | Yes (version compare) | Yes |
| Workload / capacity view | Yes | Yes (paid) | Yes | No | No | Yes |
| Domain-specific fields (funnel, hook, angle) | No (custom fields) | No (custom fields) | No (custom fields) | No | No | Yes (first-class) |
| Drag-drop kanban | Yes | Yes | Yes | Yes | No | Yes |
| Asset hosting / DAM | No | No | No | Yes (core) | Yes (core) | No (by design -- links to external) |

---

## Sources

- [Monday.com Creative Workflow](https://monday.com/blog/project-management/creative-workflow/)
- [Monday.com Features 2025 Overview](https://stackby.com/blog/monday-com-features/)
- [Monday.com Creative Agency PM Software](https://monday.com/blog/project-management/creative-agency-project-management-software/)
- [Asana Custom Fields](https://asana.com/features/project-management/custom-fields)
- [Asana Forum: Different Task Types and Custom Fields](https://forum.asana.com/t/different-types-of-tasks-and-custom-fields-in-one-project-board/1040822)
- [ClickUp Custom Task Types](https://help.clickup.com/hc/en-us/articles/17564381376919-Custom-task-types)
- [ClickUp Custom Fields by Task Type](https://help.clickup.com/hc/en-us/articles/30974227164311-Create-Custom-Fields-by-task-type)
- [ClickUp Intro to Custom Fields by Task Type](https://help.clickup.com/hc/en-us/articles/30976239926167-Intro-to-Custom-Fields-by-task-type)
- [Air.inc Platform](https://air.inc/)
- [Air.inc Guide to Creative Operations 2025](https://air.inc/resources/guide-to-creative-operations-2025)
- [Frame.io Workflow Management](https://frame.io/features/workflow-management)
- [Frame.io V4 Announcement](https://news.adobe.com/news/news-details/2024/adobe-introduces-next-generation-of-frame-io-to-accelerate-content-workflow-and-collaboration-for-every-creative-project)
- [Ad Creative Naming Conventions Guide](https://admanage.ai/blog/ad-creative-naming-conventions)
- [Performance Asset Naming Conventions](https://focal.inc/comparison/the-complete-guide-to-performance-asset-naming-conventions)
- [Teamwork Creative Project Management Guide 2026](https://www.teamwork.com/blog/creative-project-management/)
- [Kanban Best Practices for Production](https://productive.io/blog/kanban-project-management/)

---

*Research completed: 2026-03-16*
