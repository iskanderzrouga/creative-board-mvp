# External Integrations Documentation

## Authentication and Identity Management

### Supabase Auth
- **Service**: Supabase Authentication
- **SDK**: `@supabase/supabase-js@^2.99.1`
- **Methods Supported**:
  - Magic link (passwordless email authentication)
  - Password-based sign up and sign in
  - Session persistence and auto-refresh
  - Session detection from URL (OAuth callback support)

- **Key Functions** (in `/Users/iskanderzrouga/Desktop/Editors\ Board/src/supabase.ts`):
  - `signInWithMagicLink(email)` - Send magic link to email
  - `signInWithPassword(email, password)` - Sign in with credentials
  - `signUpWithPassword(email, password)` - Register new account
  - `resetPasswordForEmail(email)` - Password reset flow
  - `getAuthSession()` - Retrieve current session
  - `onAuthStateChange(callback)` - Listen for auth state changes
  - `signOutOfSupabase()` - Sign out current user

- **Configuration**:
  - Client initialization: Persistent sessions, auto-refresh enabled
  - Storage key: `editors-board-auth`
  - OAuth code verifier storage: `editors-board-auth-code-verifier`

## Database Services

### Supabase Database (PostgreSQL)
- **URL**: Configured via `VITE_SUPABASE_URL` environment variable
- **Location**: `https://zytmxgtrpwlnogtrmmgt.supabase.co` (production)

**Tables and Access**:
- **workspace_access**: User access control records
  - Columns: `email`, `role_mode`, `editor_name`, `scope_mode`, `scope_assignments`, `created_at`, `updated_at`
  - Role modes: `owner`, `manager`, `contributor`, `viewer`
  - Scope modes: `all-portfolios`, `selected-portfolios`, `selected-brands`
  - Protected by Row-Level Security (RLS) policies

- **workspace_state**: Application state persistence
  - Columns: `workspace_id`, `state`, `updated_at`
  - Stores JSON snapshot of portfolio board state
  - Protected by RLS (owners/managers can write)

**Key Functions** (in `/Users/iskanderzrouga/Desktop/Editors\ Board/src/supabase.ts`):
- `getWorkspaceAccess()` - Fetch user's workspace access record
- `listWorkspaceAccessEntries()` - List all workspace members
- `upsertWorkspaceAccessEntry(entry)` - Add/update workspace member
- `deleteWorkspaceAccessEntry(email)` - Remove user from workspace
- `ensureWorkspaceAccessSchema()` - Auto-migrate legacy schema

**Remote State Management** (in `/Users/iskanderzrouga/Desktop/Editors\ Board/src/remoteAppState.ts`):
- `loadOrCreateRemoteAppState(fallbackState)` - Load workspace state from DB
- `saveRemoteAppState(state, expectedUpdatedAt)` - Save state with conflict detection
- Optimistic conflict resolution via `RemoteStateConflictError`

## Serverless Functions (Edge Functions)

### request-magic-link
- **Location**: `/Users/iskanderzrouga/Desktop/Editors\ Board/supabase/functions/request-magic-link/`
- **Runtime**: Deno (TypeScript)
- **Configuration**: JWT verification disabled (verify_jwt = false)
- **Entry Point**: `index.ts`

**Responsibilities**:
1. **Magic Link Generation** (`action: 'sign-in'` or default)
   - Accepts email and optional redirect URL
   - Returns `deliveredInstantly` flag

2. **Password-based Sign-up** (`action: 'sign-up'`)
   - Validates email in workspace_access table
   - Creates Supabase auth account
   - Returns session tokens if successful
   - Falls back to existing account sign-in

3. **Schema Auto-migration** (`action: 'ensure-schema'`)
   - Adds `scope_mode` and `scope_assignments` columns if missing
   - Normalizes legacy `role_mode` values:
     - `editor` → `contributor`
     - `observer` → `viewer`
   - Promotes first manager to owner if no owner exists
   - Recreates RLS constraint functions

4. **PostgREST Schema Reload** (`action: 'reload-schema'`)
   - Triggers PostgreSQL NOTIFY for schema cache refresh
   - Used after migrations to sync API layer

**Dependencies**:
- `@supabase/supabase-js` - Supabase client
- `postgresjs@v3.4.5` - Direct PostgreSQL connection
- Deno std library modules

**Environment Variables Used**:
- `SUPABASE_URL` - Database and API endpoint
- `SUPABASE_SERVICE_ROLE_KEY` - Server-side auth key (full access)
- `SUPABASE_ANON_KEY` or `SUPABASE_PUBLISHABLE_KEY` - Client-side key
- `SUPABASE_DB_URL` - Direct PostgreSQL connection string

**Invocation** (from client):
```javascript
supabase.functions.invoke('request-magic-link', {
  body: {
    email: string,
    redirectTo?: string,
    password?: string,
    action?: 'sign-in' | 'sign-up' | 'ensure-schema' | 'reload-schema'
  }
})
```

## Webhooks and External APIs

### Google Drive Integration
- **Type**: Outbound webhooks to user-provided URLs
- **Trigger**: Card creation or folder sync
- **Implementation**: `/Users/iskanderzrouga/Desktop/Editors\ Board/src/App.tsx`

**Configuration**:
- **Global webhook**: `state.settings.integrations.globalDriveWebhookUrl`
- **Portfolio-level webhook**: `portfolio.webhookUrl`
- Portfolio webhook takes precedence over global

**Payload Sent** (POST request):
```json
{
  "cardId": "string",
  "cardTitle": "string",
  "productName": "string",
  "brandName": "string",
  "parentFolderId": "string",
  "folderName": "string"
}
```

**Brand Configuration**:
- Brand-specific Drive folder ID: `brand.driveParentFolderId`
- Used as parent for Google Drive folder creation

**Error Handling**:
- Validation: Checks if webhook URL is configured and brand has Drive folder ID
- User notification via toast messages (red/error tone)
- Graceful fallback if webhook not configured

## Environment Variables

### Public Variables (exposed to client)
- **`VITE_SUPABASE_URL`**: Supabase project endpoint
  - Example: `https://zytmxgtrpwlnogtrmmgt.supabase.co`

- **`VITE_SUPABASE_ANON_KEY`** or **`VITE_SUPABASE_PUBLISHABLE_KEY`**: Public JWT for client auth
  - Used for unauthenticated Supabase API calls
  - Restricted by RLS policies

- **`VITE_MAGIC_LINK_REDIRECT_URL`**: OAuth callback URL for magic links
  - Example: `https://creative-board-lake.vercel.app`
  - Falls back to `window.location.origin` if not set

- **`VITE_REMOTE_WORKSPACE_ID`**: Workspace identifier for remote state
  - Default: `"primary"`
  - Used in workspace_state queries

### Server-only Variables (Edge Functions)
- **`SUPABASE_SERVICE_ROLE_KEY`**: Full database access (server-side only)
- **`SUPABASE_DB_URL`**: Direct PostgreSQL connection for migrations
- **`SUPABASE_ANON_KEY`**: Alternative to publishable key

### Storage Keys (Local Browser Storage)
Used for auth state and testing modes:
- `editors-board-auth` - Session token
- `editors-board-auth-code-verifier` - OAuth state
- `editors-board-e2e-auth-mode` - E2E test mode toggle
- `editors-board-e2e-auth-email` - E2E test email
- `editors-board-e2e-access-state` - E2E access verification state
- `editors-board-e2e-access-entries` - E2E workspace members
- `editors-board-e2e-access-delay-ms` - E2E network delay simulation
- `editors-board-e2e-access-timeout-ms` - E2E timeout simulation
- `editors-board-e2e-remote-state` - E2E remote persistence state
- `editors-board-e2e-remote-delay-ms` - E2E sync delay simulation

## Database Migrations

**Location**: `/Users/iskanderzrouga/Desktop/Editors\ Board/supabase/migrations/`

| Migration | Purpose |
|-----------|---------|
| `20260311200500_create_workspace_state.sql` | Initial workspace_state table |
| `20260312033000_add_workspace_access_controls.sql` | RLS policies for access control |
| `20260312070000_enable_manager_workspace_access_management.sql` | Manager permissions for access management |
| `20260312121500_restrict_workspace_state_writes.sql` | Restrict state writes to owners/managers |
| `20260312122000_revoke_anon_workspace_email_check.sql` | Security: revoke email check for anon role |
| `20260312122500_guard_last_manager_removal.sql` | Prevent removal of last manager |
| `20260312143000_server_owns_workspace_state_updated_at.sql` | Server-side updated_at timestamps |
| `20260313100500_adopt_owner_scope_access_model.sql` | Portfolio/brand scoped access model |

## Row-Level Security (RLS) Policies

**Helper Functions Created**:
- `current_request_email()` - Extract authenticated user email
- `current_user_is_workspace_owner()` - Check if user is owner
- `current_user_can_write_workspace_state()` - Check owner/manager status

**Policy Examples**:
- `workspace_access` table: Authenticated users can read own record
- `workspace_state` table: Only owners/managers can insert/update/delete

## Third-party SDKs

- **@supabase/supabase-js**: Full-featured Supabase client for auth, database, and function invocation

## Development and Testing Infrastructure

### Test Environment E2E Mode
- **Purpose**: Local testing without Supabase
- **Activation**: Set `editors-board-e2e-auth-mode` to `"enabled"` in localStorage
- **Features**:
  - Simulates auth state in localStorage
  - Simulates workspace access entries
  - Simulates remote state persistence
  - Can inject network delays and access denials for testing

### CI/CD
- **Platform**: Vercel
- **Deployment**: Automatic on push
- **Environment**: Development/hobby plan
- **Test Runs**: Pre-deployment E2E and unit tests

## Integration Security Patterns

1. **JWT-based Auth**: Supabase handles token lifecycle (creation, refresh, expiration)
2. **Row-Level Security**: Database enforces access control at row level
3. **Service Role Separation**: Edge functions use service role for admin operations
4. **CORS Support**: Edge functions handle CORS headers for cross-origin requests
5. **Email Normalization**: All email addresses normalized (trim, lowercase) before database operations
6. **Webhook Validation**: Configured URLs must be full HTTP(S) URLs
7. **Session Persistence**: Auth tokens stored securely in localStorage with configurable key

## Related Source Files

- `/Users/iskanderzrouga/Desktop/Editors\ Board/src/supabase.ts` - Supabase client wrapper and auth functions
- `/Users/iskanderzrouga/Desktop/Editors\ Board/src/remoteAppState.ts` - Remote state sync and conflict resolution
- `/Users/iskanderzrouga/Desktop/Editors\ Board/src/App.tsx` - Webhook invocation and integration UI
- `/Users/iskanderzrouga/Desktop/Editors\ Board/src/hooks/useWorkspaceSession.ts` - Session management and access refresh
- `/Users/iskanderzrouga/Desktop/Editors\ Board/src/components/SettingsPage.tsx` - Webhook URL configuration UI
- `/Users/iskanderzrouga/Desktop/Editors\ Board/src/components/WorkspaceAccessManager.tsx` - Access control management
