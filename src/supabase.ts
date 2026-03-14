import { createClient, type Session, type SupabaseClient } from '@supabase/supabase-js'
import type { AccessScopeMode, PortfolioAccessScope, RoleMode } from './board'

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL?.trim() ?? ''
const supabasePublishableKey =
  import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY?.trim() ??
  import.meta.env.VITE_SUPABASE_ANON_KEY?.trim() ??
  ''
const magicLinkRedirectUrl = import.meta.env.VITE_MAGIC_LINK_REDIRECT_URL?.trim() ?? ''

export const AUTH_STORAGE_KEY = 'editors-board-auth'
const AUTH_CODE_VERIFIER_STORAGE_KEY = `${AUTH_STORAGE_KEY}-code-verifier`
const E2E_AUTH_MODE_KEY = 'editors-board-e2e-auth-mode'
const E2E_AUTH_EMAIL_KEY = 'editors-board-e2e-auth-email'
const E2E_ACCESS_STATE_KEY = 'editors-board-e2e-access-state'
const E2E_ACCESS_DELAY_KEY = 'editors-board-e2e-access-delay-ms'
const E2E_ACCESS_TIMEOUT_KEY = 'editors-board-e2e-access-timeout-ms'
export const E2E_REMOTE_STATE_KEY = 'editors-board-e2e-remote-state'
const MAGIC_LINK_FUNCTION_NAME = 'request-magic-link'

export const REMOTE_WORKSPACE_ID =
  import.meta.env.VITE_REMOTE_WORKSPACE_ID?.trim() || 'primary'

export interface AuthSessionState {
  email: string
}

export interface WorkspaceAccessState {
  email: string
  roleMode: RoleMode
  editorName: string | null
  scopeMode: AccessScopeMode
  scopeAssignments: PortfolioAccessScope[]
}

export interface WorkspaceAccessEntry {
  email: string
  roleMode: RoleMode
  editorName: string | null
  scopeMode: AccessScopeMode
  scopeAssignments: PortfolioAccessScope[]
  updatedAt: string | null
}

let client: SupabaseClient | null | undefined

interface LegacyWorkspaceAccessRow {
  email: string
  role_mode: 'manager' | 'editor' | 'observer'
  editor_name: string | null
  created_at: string | null
  updated_at: string | null
}

function hasBrowser() {
  return typeof window !== 'undefined'
}

function hasRealSupabaseConfig() {
  return Boolean(supabaseUrl && supabasePublishableKey)
}

function getPositiveStorageNumber(key: string) {
  if (!hasBrowser()) {
    return 0
  }

  const parsed = Number(window.localStorage.getItem(key))
  return Number.isFinite(parsed) && parsed > 0 ? parsed : 0
}

function isE2ESupabaseMode() {
  if (!hasBrowser()) {
    return false
  }

  return window.localStorage.getItem(E2E_AUTH_MODE_KEY) === 'enabled'
}

function getE2EAccessState() {
  if (!hasBrowser()) {
    return 'granted'
  }

  return window.localStorage.getItem(E2E_ACCESS_STATE_KEY) ?? 'granted'
}

function getE2EAccessDelayMs() {
  return getPositiveStorageNumber(E2E_ACCESS_DELAY_KEY)
}

function toAuthSession(session: Session | null): AuthSessionState | null {
  const email = session?.user.email?.trim()
  return email ? { email } : null
}

function getE2EAuthSession() {
  if (!hasBrowser()) {
    return null
  }

  const email = window.localStorage.getItem(E2E_AUTH_EMAIL_KEY)?.trim()
  return email ? { email } : null
}

function getMagicLinkRedirectUrl() {
  if (magicLinkRedirectUrl) {
    return magicLinkRedirectUrl
  }

  return hasBrowser() ? window.location.origin : undefined
}

function isLegacyWorkspaceAccessError(error: { message?: string } | null) {
  const message = error?.message?.toLowerCase() ?? ''
  return message.includes('scope_mode') || message.includes('scope_assignments')
}

function normalizeLegacyRoleMode(
  roleMode: LegacyWorkspaceAccessRow['role_mode'],
  isOwner: boolean,
): RoleMode {
  if (roleMode === 'manager') {
    return isOwner ? 'owner' : 'manager'
  }

  if (roleMode === 'editor') {
    return 'contributor'
  }

  return 'viewer'
}

export function isSupabaseConfigured() {
  return hasRealSupabaseConfig() || isE2ESupabaseMode()
}

export function getWorkspaceAccessCheckTimeoutMs() {
  if (!isE2ESupabaseMode()) {
    return 10_000
  }

  return getPositiveStorageNumber(E2E_ACCESS_TIMEOUT_KEY) || 10_000
}

export function clearStoredAuthSession() {
  if (!hasBrowser()) {
    return
  }

  window.localStorage.removeItem(AUTH_STORAGE_KEY)
  window.localStorage.removeItem(AUTH_CODE_VERIFIER_STORAGE_KEY)
  window.localStorage.removeItem(E2E_AUTH_EMAIL_KEY)
}

export function getSupabaseClient() {
  if (isE2ESupabaseMode()) {
    return null
  }

  if (client !== undefined) {
    return client
  }

  if (!hasRealSupabaseConfig()) {
    client = null
    return client
  }

  client = createClient(supabaseUrl, supabasePublishableKey, {
    auth: {
      persistSession: true,
      autoRefreshToken: true,
      detectSessionInUrl: true,
      storageKey: AUTH_STORAGE_KEY,
    },
  })

  return client
}

export async function getAuthSession() {
  if (isE2ESupabaseMode()) {
    return getE2EAuthSession()
  }

  const supabase = getSupabaseClient()
  if (!supabase) {
    return null
  }

  const { data, error } = await supabase.auth.getSession()
  if (error) {
    throw error
  }

  return toAuthSession(data.session)
}

export function onAuthStateChange(
  callback: (session: AuthSessionState | null) => void,
) {
  if (isE2ESupabaseMode()) {
    if (!hasBrowser()) {
      return () => undefined
    }

    const handleStorage = (event: StorageEvent) => {
      if (event.key === E2E_AUTH_MODE_KEY || event.key === E2E_AUTH_EMAIL_KEY) {
        callback(getE2EAuthSession())
      }
    }

    window.addEventListener('storage', handleStorage)
    return () => window.removeEventListener('storage', handleStorage)
  }

  const supabase = getSupabaseClient()
  if (!supabase) {
    return () => undefined
  }

  const {
    data: { subscription },
  } = supabase.auth.onAuthStateChange((_event, session) => {
    callback(toAuthSession(session))
  })

  return () => subscription.unsubscribe()
}

export async function signInWithMagicLink(email: string) {
  const normalizedEmail = email.trim().toLowerCase()
  if (!normalizedEmail) {
    throw new Error('Enter a valid work email.')
  }

  if (isE2ESupabaseMode()) {
    window.localStorage.setItem(E2E_AUTH_EMAIL_KEY, normalizedEmail)
    return { deliveredInstantly: true }
  }

  const supabase = getSupabaseClient()
  if (!supabase) {
    throw new Error('Supabase is not configured.')
  }

  const { data, error } = await supabase.functions.invoke<{
    deliveredInstantly?: boolean
  }>(MAGIC_LINK_FUNCTION_NAME, {
    body: {
      email: normalizedEmail,
      redirectTo: getMagicLinkRedirectUrl(),
    },
  })

  if (error) {
    throw error
  }

  return { deliveredInstantly: data?.deliveredInstantly ?? false }
}

export async function signInWithPassword(email: string, password: string) {
  const normalizedEmail = email.trim().toLowerCase()
  if (!normalizedEmail) {
    throw new Error('Enter your email.')
  }

  if (!password || password.length < 6) {
    throw new Error('Password must be at least 6 characters.')
  }

  if (isE2ESupabaseMode()) {
    window.localStorage.setItem(E2E_AUTH_EMAIL_KEY, normalizedEmail)
    return
  }

  const supabase = getSupabaseClient()
  if (!supabase) {
    throw new Error('Supabase is not configured.')
  }

  const { error } = await supabase.auth.signInWithPassword({
    email: normalizedEmail,
    password,
  })

  if (error) {
    const message = error.message.toLowerCase()
    if (message.includes('invalid login credentials') || message.includes('invalid password')) {
      throw new Error('Incorrect email or password.')
    }
    throw error
  }
}

export async function signUpWithPassword(email: string, password: string) {
  const normalizedEmail = email.trim().toLowerCase()
  if (!normalizedEmail) {
    throw new Error('Enter your email.')
  }

  if (!password || password.length < 6) {
    throw new Error('Password must be at least 6 characters.')
  }

  if (isE2ESupabaseMode()) {
    window.localStorage.setItem(E2E_AUTH_EMAIL_KEY, normalizedEmail)
    return
  }

  const supabase = getSupabaseClient()
  if (!supabase) {
    throw new Error('Supabase is not configured.')
  }

  // First check if email is in workspace_access via the edge function
  const { data, error: fnError } = await supabase.functions.invoke<{
    session?: { access_token: string; refresh_token: string; expires_in: number }
    needsEmailConfirmation?: boolean
    error?: string
  }>(MAGIC_LINK_FUNCTION_NAME, {
    body: {
      email: normalizedEmail,
      password,
      action: 'sign-up',
    },
  })

  if (fnError) {
    throw fnError
  }

  if (data?.error) {
    throw new Error(data.error)
  }

  // If edge function returned a session, set it
  if (data?.session) {
    await supabase.auth.setSession({
      access_token: data.session.access_token,
      refresh_token: data.session.refresh_token,
    })
    return
  }

  // If account already exists, try signing in instead
  const { error: signInError } = await supabase.auth.signInWithPassword({
    email: normalizedEmail,
    password,
  })

  if (signInError) {
    throw new Error('Account created. Check your email to confirm, then sign in.')
  }
}

function mapWorkspaceAccessEntry(row: {
  email: string
  role_mode: RoleMode
  editor_name: string | null
  scope_mode: AccessScopeMode | null
  scope_assignments: PortfolioAccessScope[] | null
  updated_at: string | null
}) {
  return {
    email: row.email,
    roleMode: row.role_mode,
    editorName: row.editor_name,
    scopeMode: row.scope_mode ?? 'all-portfolios',
    scopeAssignments: row.scope_assignments ?? [],
    updatedAt: row.updated_at,
  } satisfies WorkspaceAccessEntry
}

function mapLegacyWorkspaceAccessRows(rows: LegacyWorkspaceAccessRow[]) {
  const sortedManagerEmails = rows
    .filter((row) => row.role_mode === 'manager')
    .slice()
    .sort((left, right) => {
      const createdComparison = (left.created_at ?? '').localeCompare(right.created_at ?? '')
      return createdComparison !== 0 ? createdComparison : left.email.localeCompare(right.email)
    })
    .map((row) => row.email)
  const ownerEmail = sortedManagerEmails[0] ?? null

  return rows.map((row) => ({
    email: row.email,
    roleMode: normalizeLegacyRoleMode(row.role_mode, row.email === ownerEmail),
    editorName: row.role_mode === 'editor' ? row.editor_name ?? null : null,
    scopeMode: 'all-portfolios' as const,
    scopeAssignments: [],
    updatedAt: row.updated_at,
  }))
}

export async function getWorkspaceAccess() {
  if (isE2ESupabaseMode()) {
    const session = getE2EAuthSession()
    const delayMs = getE2EAccessDelayMs()
    const accessState = getE2EAccessState()

    if (delayMs > 0) {
      await new Promise((resolve) => window.setTimeout(resolve, delayMs))
    }

    if (accessState === 'error') {
      throw new Error('Workspace access could not be verified right now.')
    }

    if (!session) {
      return null
    }

    if (accessState === 'denied') {
      return null
    }

    return {
      email: session.email,
      roleMode: 'owner' as const,
      editorName: null,
      scopeMode: 'all-portfolios',
      scopeAssignments: [],
    } satisfies WorkspaceAccessState
  }

  const supabase = getSupabaseClient()
  if (!supabase) {
    return null
  }

  const session = await getAuthSession()
  const email = session?.email?.trim().toLowerCase()
  if (!email) {
    return null
  }

  const { data, error } = await supabase
    .from('workspace_access')
    .select('email, role_mode, editor_name, scope_mode, scope_assignments')
    .eq('email', email)
    .maybeSingle()

  if (error && !isLegacyWorkspaceAccessError(error)) {
    throw error
  }

  if (!error) {
    if (!data) {
      return null
    }

    return {
      email: data.email,
      roleMode: data.role_mode as RoleMode,
      editorName: data.editor_name ?? null,
      scopeMode: (data.scope_mode as AccessScopeMode | null) ?? 'all-portfolios',
      scopeAssignments: (data.scope_assignments as PortfolioAccessScope[] | null) ?? [],
    } satisfies WorkspaceAccessState
  }

  const legacyResponse = await supabase
    .from('workspace_access')
    .select('email, role_mode, editor_name, created_at, updated_at')
    .eq('email', email)
    .maybeSingle()

  if (legacyResponse.error) {
    throw legacyResponse.error
  }

  if (!legacyResponse.data) {
    return null
  }

  const rows = mapLegacyWorkspaceAccessRows([legacyResponse.data as LegacyWorkspaceAccessRow])
  const normalized = rows[0]
  if (!normalized) {
    return null
  }

  return {
    email: normalized.email,
    roleMode: normalized.roleMode,
    editorName: normalized.editorName,
    scopeMode: normalized.scopeMode,
    scopeAssignments: normalized.scopeAssignments,
  } satisfies WorkspaceAccessState
}

let schemaMigrationAttempted = false

export async function ensureWorkspaceAccessSchema() {
  if (schemaMigrationAttempted) return
  schemaMigrationAttempted = true

  if (isE2ESupabaseMode()) return

  const supabase = getSupabaseClient()
  if (!supabase) return

  try {
    const { error } = await supabase
      .from('workspace_access')
      .select('scope_mode')
      .limit(1)

    if (!error) return // columns exist

    // Columns are missing — call edge function to auto-migrate
    console.warn('workspace_access: scope columns missing, attempting auto-migration...')
    const { data, error: fnError } = await supabase.functions.invoke<{
      migrated?: boolean
      error?: string
    }>(MAGIC_LINK_FUNCTION_NAME, {
      body: { action: 'ensure-schema' },
    })

    if (fnError) {
      console.error('Auto-migration edge function call failed:', fnError)
      return
    }

    if (data?.migrated) {
      console.info('workspace_access: scope columns auto-migrated successfully.')
    } else {
      console.warn('Auto-migration returned:', data)
    }
  } catch (err) {
    console.error('Schema check failed:', err)
  }
}

export async function listWorkspaceAccessEntries() {
  if (isE2ESupabaseMode()) {
    const session = getE2EAuthSession()
    return session
      ? [
          {
            email: session.email,
            roleMode: 'owner' as const,
            editorName: null,
            scopeMode: 'all-portfolios',
            scopeAssignments: [],
            updatedAt: null,
          } satisfies WorkspaceAccessEntry,
        ]
      : []
  }

  const supabase = getSupabaseClient()
  if (!supabase) {
    return []
  }

  const { data, error } = await supabase
    .from('workspace_access')
    .select('email, role_mode, editor_name, scope_mode, scope_assignments, updated_at')
    .order('email', { ascending: true })

  if (error && !isLegacyWorkspaceAccessError(error)) {
    throw error
  }

  if (!error) {
    return (data ?? []).map(mapWorkspaceAccessEntry)
  }

  const legacyResponse = await supabase
    .from('workspace_access')
    .select('email, role_mode, editor_name, created_at, updated_at')
    .order('created_at', { ascending: true })
    .order('email', { ascending: true })

  if (legacyResponse.error) {
    throw legacyResponse.error
  }

  return mapLegacyWorkspaceAccessRows((legacyResponse.data ?? []) as LegacyWorkspaceAccessRow[])
}

export async function upsertWorkspaceAccessEntry(entry: {
  email: string
  roleMode: RoleMode
  editorName: string | null
  scopeMode: AccessScopeMode
  scopeAssignments: PortfolioAccessScope[]
}) {
  const normalizedEmail = entry.email.trim().toLowerCase()
  if (!normalizedEmail) {
    throw new Error('Enter a valid work email.')
  }

  if (entry.roleMode === 'contributor' && !entry.editorName?.trim()) {
    throw new Error('Contributors need a teammate profile.')
  }

  if (isE2ESupabaseMode()) {
    return {
      email: normalizedEmail,
      roleMode: entry.roleMode,
      editorName: entry.roleMode === 'contributor' ? entry.editorName?.trim() ?? null : null,
      scopeMode: entry.scopeMode,
      scopeAssignments: entry.scopeAssignments,
      updatedAt: new Date().toISOString(),
    } satisfies WorkspaceAccessEntry
  }

  const supabase = getSupabaseClient()
  if (!supabase) {
    throw new Error('Supabase is not configured.')
  }

  const { data, error } = await supabase
    .from('workspace_access')
    .upsert(
      {
        email: normalizedEmail,
        role_mode: entry.roleMode,
        editor_name: entry.roleMode === 'contributor' ? entry.editorName?.trim() ?? null : null,
        scope_mode: entry.scopeMode,
        scope_assignments: entry.scopeAssignments,
        updated_at: new Date().toISOString(),
      },
      {
        onConflict: 'email',
      },
    )
    .select('email, role_mode, editor_name, scope_mode, scope_assignments, updated_at')
    .single()

  if (error && !isLegacyWorkspaceAccessError(error)) {
    throw error
  }

  if (!error) {
    return mapWorkspaceAccessEntry(data)
  }

  const legacyRoleMode =
    entry.roleMode === 'owner' || entry.roleMode === 'manager'
      ? 'manager'
      : entry.roleMode === 'contributor'
        ? 'editor'
        : 'observer'
  const legacyResponse = await supabase
    .from('workspace_access')
    .upsert(
      {
        email: normalizedEmail,
        role_mode: legacyRoleMode,
        editor_name: legacyRoleMode === 'editor' ? entry.editorName?.trim() ?? null : null,
        updated_at: new Date().toISOString(),
      },
      {
        onConflict: 'email',
      },
    )
    .select('email, role_mode, editor_name, created_at, updated_at')
    .single()

  if (legacyResponse.error) {
    throw legacyResponse.error
  }

  console.warn(
    'workspace_access: scope_mode / scope_assignments columns are missing — scope changes are stored locally but not persisted to the database. Run the latest migration.',
  )

  const legacyEntry = mapLegacyWorkspaceAccessRows([legacyResponse.data as LegacyWorkspaceAccessRow])[0]!
  return {
    ...legacyEntry,
    scopeMode: entry.scopeMode,
    scopeAssignments: entry.scopeAssignments,
  }
}

export async function deleteWorkspaceAccessEntry(email: string) {
  const normalizedEmail = email.trim().toLowerCase()
  if (!normalizedEmail) {
    return
  }

  if (isE2ESupabaseMode()) {
    return
  }

  const supabase = getSupabaseClient()
  if (!supabase) {
    throw new Error('Supabase is not configured.')
  }

  const { error } = await supabase.from('workspace_access').delete().eq('email', normalizedEmail)
  if (error) {
    throw error
  }
}

export async function signOutOfSupabase() {
  if (isE2ESupabaseMode()) {
    clearStoredAuthSession()
    return
  }

  const supabase = getSupabaseClient()
  if (!supabase) {
    clearStoredAuthSession()
    return
  }

  const { error } = await supabase.auth.signOut()
  if (error) {
    throw error
  }

  clearStoredAuthSession()
}
