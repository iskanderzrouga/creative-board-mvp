# Editors Board - Architecture Guide

## Overview

Editors Board is a React-based collaborative project management application built with TypeScript. It implements a **component-based UI architecture** with centralized state management, real-time synchronization capabilities, and multi-level access control.

**Total codebase: ~18,320 lines of TypeScript/TSX across 43 source files**

---

## Architectural Pattern

### Pattern Type: React Component + State Management

The application uses:
- **Component-based UI**: React functional components with hooks
- **Centralized state management**: Single `AppState` object managed at the root level
- **Immutable state updates**: State updates through setter functions passed down via props and hooks
- **Remote synchronization**: Supabase integration for cloud persistence and multi-user coordination

### State Management Philosophy

- **Single source of truth**: Entire application state lives in one `AppState` object
- **Local-first architecture**: State persists to localStorage immediately
- **Remote synchronization**: State syncs to Supabase with conflict detection via optimistic updates
- **Session isolation**: Auth/access state is kept separate from board state

---

## Application Layers

### Layer 1: Entry Points & Setup
**Files:**
- `src/main.tsx` - React root setup with ErrorBoundary
- `index.html` - HTML entry point

### Layer 2: Root Application Component
**Files:**
- `src/App.tsx` (1,823 lines) - Main orchestrator component

**Responsibilities:**
- Authentication and access verification
- State initialization and persistence
- Event handling (drag-drop, modal dialogs, keyboard shortcuts)
- Workspace session management
- Page routing (Board, Analytics, Workload, Settings)
- Modal/dialog lifecycle management

**Key child components rendered:**
- `AccessGate` / `AuthGate` / `AccessVerificationGate` - Security layers
- `BoardPage`, `AnalyticsPage`, `WorkloadPage`, `SettingsPage` - Main content pages
- `CardDetailPanel` - Side panel for card details
- `Sidebar` - Navigation and filters
- `ToastStack` - Notifications
- `SyncStatusPill` - Sync status indicator

### Layer 3: Core State & Data Structures
**Files:**
- `src/board.ts` (3,984 lines) - Data models and business logic
- `src/remoteAppState.ts` - Remote state management
- `src/supabase.ts` - Backend integration
- `src/accessHelpers.ts` - Access control utilities
- `src/appHelpers.ts` - UI helper functions

**Type System:**
```
AppState (root state)
├── portfolios: Portfolio[]
│   ├── id, name
│   ├── brands: Brand[] (with colors, products, drive folders)
│   ├── team: TeamMember[] (with capacity, hours, timezone)
│   └── cards: Card[] (with stage, history, attachments, comments)
├── settings: GlobalSettings
│   ├── general: GeneralSettings (theme, defaults, auto-archive)
│   ├── capacity: CapacitySettings (utilization thresholds)
│   ├── taskLibrary: TaskType[]
│   ├── revisionReasons: RevisionReason[]
│   └── integrations: IntegrationsSettings
├── activePortfolioId: string
├── activeRole: ActiveRole (mode: 'owner'|'manager'|'contributor'|'viewer', editorId)
├── activePage: AppPage ('board'|'analytics'|'workload'|'settings')
├── notifications: AppNotification[]
└── version: number
```

### Layer 4: Page Components
**Files:**
- `src/components/BoardPage.tsx` - Kanban board view with drag-drop
- `src/components/AnalyticsPage.tsx` - Analytics and metrics
- `src/components/WorkloadPage.tsx` - Workload and capacity planning
- `src/components/SettingsPage.tsx` - Configuration and team management

### Layer 5: Feature Components
**Modals & Dialogs:**
- `DeleteCardModal.tsx` - Delete confirmation
- `BackwardMoveModal.tsx` - Revision request form
- `QuickCreateModal.tsx` - Fast card creation
- `KeyboardShortcutsModal.tsx` - Keyboard help
- `ConfirmDialog.tsx` - Generic confirmation

**UI Components:**
- `CardDetailPanel.tsx` - Card editing and viewing
- `BoardCardSurface.tsx` - Card display element
- `SortableBoardCard.tsx` - Draggable card wrapper
- `LaneDropZone.tsx` - Drop target for card moves
- `PageHeader.tsx` - Top navigation and controls
- `Sidebar.tsx` - Left navigation and filters

**Utilities:**
- `RemoteLoadingShell.tsx` - Loading state wrapper
- `SyncStatusPill.tsx` - Sync indicator
- `NotificationBell.tsx` - Notification center
- `ToastStack.tsx` - Toast notification renderer
- `RichTextEditor.tsx` - Comment/brief editor
- `RevisionReasonLibraryEditor.tsx` - Settings editor
- `TaskLibraryEditor.tsx` - Settings editor
- `WorkspaceAccessManager.tsx` - Access control UI
- `PeopleSection.tsx` - Team member management
- `ErrorBoundary.tsx` - Error handling wrapper

**Icons:**
- `src/components/icons/AppIcons.tsx` - SVG icon library

### Layer 6: Hooks & Utilities
**Files:**
- `src/hooks/useAppEffects.ts` - Master effect hook (local save, remote sync, auto-archive)
- `src/hooks/useWorkspaceSession.ts` - Auth and workspace access
- `src/hooks/useModalAccessibility.ts` - Keyboard accessibility for modals

---

## Data Flow Architecture

### 1. State Initialization Flow
```
App mounts
  → useWorkspaceSession hook initializes auth
    → Checks browser storage for auth session
    → Verifies workspace access via Supabase
  → useAppEffects hook initializes board state
    → Attempts to load from Supabase (if configured)
    → Falls back to localStorage
    → Merges remote and local state
  → useState(appState) creates reactive state
  → Child components render with state + handlers
```

### 2. User Interaction → State Update Flow
```
User action (click, drag, input)
  → Component event handler
    → Immutable state update
    → setState(newState)
    → React re-render
    → Side effects trigger (via useEffect)
      → Local save (debounced 200ms)
      → Remote save (debounced 800ms with retry)
```

### 3. Remote Synchronization Flow
```
App state changes
  → Local save fires immediately (debounced 200ms)
  → Remote save queued (debounced 800ms)
    → Calculate state signature
    → POST to Supabase with conflict detection
    → If conflict: load latest, merge, retry
    → On success: setSyncStatus('synced')
    → On error: retry with exponential backoff [0ms, 1200ms, 3000ms]
    → Mark error state if all retries fail
```

### 4. Card Operations (Create/Update/Move)
```
User creates/edits/moves card
  → App.tsx handler functions:
    handleCreateCard() / handleUpdateCard() / handleMoveCard()
    → board.ts utility functions:
      - createCard() / updateCard() / moveCard()
      - Updates portfolio.cards array immutably
      - Maintains stage history and activity log
  → setState() triggers re-render
  → Child components update in cascade
```

### 5. Multi-User Access & Permissions
```
Workspace has multiple users
  → Each user signs in via magic link auth
  → Workspace access stored in Supabase
    → roleMode: 'owner' | 'manager' | 'contributor' | 'viewer'
    → scopeMode: 'all-portfolios' | 'selected-portfolios' | 'selected-brands'
    → scopeAssignments: { portfolioId, brandNames[] }[]
  → App filters visible content based on access:
    → getScopedPortfolios() returns accessible portfolios
    → Card detail panel shows/hides based on role
    → Settings page unavailable to viewers
```

---

## Key Abstractions & Interfaces

### Core State Type: `AppState`
Central immutable state object containing:
- All portfolios with cards, brands, team members
- Global settings and configuration
- Current active context (portfolio, role, page)
- User notifications

### Card Model: `Card`
```typescript
interface Card {
  id: string                              // Unique ID per portfolio
  title: string
  stage: StageId                          // Current board column
  stageHistory: StageHistoryEntry[]       // All stage transitions
  owner: string | null                    // Assigned team member
  // Content fields
  brand, product, platform, etc.
  hook, angle, audience, landingPage      // Brief details
  funnelStage, taskTypeId                 // Classification
  // Metadata
  dateCreated, dateAssigned, dueDate
  estimatedHours, actualHoursLogged
  positionInSection: number               // Sort order within lane
  // Collaboration
  comments: CommentEntry[]
  attachments: Attachment[]
  activityLog: ActivityEntry[]
  brief: string
  // Status
  blocked: BlockedState | null
  priority: CardPriority
  archivedAt: string | null
}
```

### Portfolio Model: `Portfolio`
```typescript
interface Portfolio {
  id: string
  name: string
  cards: Card[]                           // All cards in portfolio
  brands: Brand[]                         // Brand configuration
  team: TeamMember[]                      // Team capacity & roles
  webhookUrl: string                      // Drive integration
  lastIdPerPrefix: Record<string, number> // For card ID generation
}
```

### Board Visualization Models
```typescript
interface LaneModel {
  id: string                              // Generated from stage + owner
  stage: BoardColumnId
  owner: string | null                    // For grouped stages like "In Production"
  cards: Card[]                           // Filtered cards for this lane
  utilizationPct: number
  capacityUsed: number
  capacityTotal: number
  wipCount: number | null                 // Work-in-progress items
  wipCap: number | null                   // WIP limit
}

interface ColumnModel {
  id: BoardColumnId                       // 'Backlog', 'Briefed', etc.
  grouped: boolean                        // True for 'In Production', 'Review', etc.
  lanes: LaneModel[]                      // Owner sub-lanes if grouped
  count: number                           // Total cards in column
}
```

### Role-Based Access: `ActiveRole` & `WorkspaceAccessState`
```typescript
interface ActiveRole {
  mode: 'owner' | 'manager' | 'contributor' | 'viewer'
  editorId: string | null                 // If contributor, which team member
}

interface WorkspaceAccessState {
  email: string
  roleMode: RoleMode
  editorName: string | null
  scopeMode: AccessScopeMode              // What portfolios/brands visible
  scopeAssignments: PortfolioAccessScope[]
}
```

---

## Entry Points

### Application Entry
- `src/main.tsx` - Renders React app to DOM element with error boundary
- `index.html` - HTML root with `<div id="root">` and script src

### Component Entry
- `src/App.tsx` - Root component orchestrating everything

### State Entry
- `src/board.ts` - All state types and transformations
- `src/remoteAppState.ts` - Remote persistence layer
- `src/supabase.ts` - Backend connection

### Feature Entry Points (via App routing)
- Board page: Drag-drop kanban
- Analytics page: Metrics and insights
- Workload page: Capacity planning
- Settings page: Configuration

---

## State Management Approach

### Local State Pattern
**Where used:** App component top-level state

```typescript
const [appState, setAppState] = useState<AppState>(initialState)
const [syncStatus, setSyncStatus] = useState<SyncStatus>('local')
const [selectedCard, setSelectedCard] = useState<SelectedCardState | null>(null)
// ... many more UI state variables
```

**Characteristics:**
- Single `appState` holds all domain data
- State mutations are immutable (create new objects)
- Updates cascade through component tree via props
- Event handlers create new state and call `setState()`

### Side Effects Pattern
**Where used:** useAppEffects hook manages persistence

```typescript
useEffect(() => {
  // Debounce local save (200ms)
  // Debounce remote save (800ms with retry)
  // Auto-archive eligible cards
  // Sync status indicators
}, [appState, syncStatus, ...])
```

### Derived State Pattern
**Where used:** Computed properties in board.ts

```typescript
// Example: boardModel from appState
export function createBoardModel(
  portfolio: Portfolio,
  filters: BoardFilters
): ColumnModel[] {
  // Transforms Card[] into LaneModel[] into ColumnModel[]
  // Does NOT mutate state, returns new computed structure
}
```

### Remote Sync Pattern
**Where used:** remoteAppState.ts

```typescript
// Create deterministic signature for conflict detection
export function getRemoteStateSignature(state: AppState): string
  → JSON.stringify(createRemoteStateSnapshot(state))

// Merge remote + local on sync
export function mergeRemoteAppStateWithLocalState(
  remoteState: AppState,
  localState: AppState
): AppState
  → Takes user's active selections from local
  → Updates domain data from remote
  → Returns merged result

// Save with optimistic updates
export async function saveRemoteAppState(
  state: AppState,
  expectedUpdatedAt: string | null
): Promise<RemoteAppStateResult>
  → POST to Supabase with signature
  → If conflict detected: throw RemoteStateConflictError
  → Caller catches and reconciles
```

---

## Data Persistence

### Storage Hierarchy (Load Order)
1. **Browser Memory**: Active `appState` in React state
2. **localStorage**: Persisted locally under `creative-board-state` key
3. **Supabase Database**: Remote workspace state under `workspace_state` table

### Save Triggers
- **Immediate** (debounced 200ms): Any state change → localStorage
- **Delayed** (debounced 800ms): Any state change → Supabase with retry logic

### Conflict Resolution
- Remote state includes `updated_at` timestamp
- Client sends expected timestamp with save
- If timestamps don't match: Supabase rejects update
- Client catches conflict error, loads latest state, merges, retries

---

## Testing Architecture

**Test Files:**
- `src/board.test.ts` - Data transformation logic tests
- `src/remoteAppState.test.ts` - Sync and merge logic tests
- `e2e/` folder - End-to-end Playwright tests

**Test Types:**
- **Unit**: board transformations, helpers
- **E2E**: Full user workflows across pages

---

## Dependencies & External Integrations

### Core Dependencies
- `react@^19.2.0` - UI framework
- `react-dom@^19.2.0` - DOM rendering
- `@dnd-kit/*` - Drag-drop system
- `@supabase/supabase-js@^2.99.1` - Backend + auth + realtime
- `dompurify@^3.3.3` - HTML sanitization for rich text

### Build Tools
- `vite@^7.3.1` - Build and dev server
- `typescript@~5.9.3` - Type checking
- `@vitejs/plugin-react@^5.1.1` - JSX transform

### External Services
- **Supabase**: Authentication (magic links), database (workspace_state, workspace_access tables), edge functions
- **Google Drive**: Drive folder integration via webhooks
- **Frame.io**: Video review links support

---

## Error Handling

### Error Boundaries
- `src/components/ErrorBoundary.tsx` - Catches React errors globally

### Sync Error Recovery
- Remote save errors: Show toast, retry with exponential backoff
- State conflicts: Load latest, merge with local, retry
- Auth errors: Redirect to login

### User Feedback
- `ToastStack.tsx` - Toast notifications for errors, success, info
- `SyncStatusPill.tsx` - Visual indicator of sync state
- Modals/dialogs with inline validation

---

## Summary

**Pattern**: React component tree with centralized immutable state management
**State Flow**: Synchronous React updates + asynchronous persistence layers
**Key Innovation**: Optimistic updates with conflict detection for collaborative editing
**Scalability**: Portfolio-based organization allows handling multiple projects
**Security**: Role-based access control with Supabase RLS policies
