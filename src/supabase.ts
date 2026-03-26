import { createClient, type AuthChangeEvent, type Session, type SupabaseClient } from '@supabase/supabase-js'
import type { AccessScopeMode, PortfolioAccessScope, RoleMode } from './board'

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL?.trim() ?? ''
const supabasePublishableKey =
  import.meta.env.VITE_SUPABASE_ANON_KEY?.trim() ??
  import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY?.trim() ??
  ''
const magicLinkRedirectUrl = import.meta.env.VITE_MAGIC_LINK_REDIRECT_URL?.trim() ?? ''

export const AUTH_STORAGE_KEY = 'editors-board-auth'
const AUTH_CODE_VERIFIER_STORAGE_KEY = `${AUTH_STORAGE_KEY}-code-verifier`
const E2E_AUTH_MODE_KEY = 'editors-board-e2e-auth-mode'
const E2E_AUTH_EMAIL_KEY = 'editors-board-e2e-auth-email'
const E2E_PASSWORD_RECOVERY_KEY = 'editors-board-e2e-password-recovery'
const E2E_ACCESS_STATE_KEY = 'editors-board-e2e-access-state'
const E2E_ACCESS_ENTRIES_KEY = 'editors-board-e2e-access-entries'
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

const DEFAULT_LOCAL_WORKSPACE_ACCESS_ENTRIES: WorkspaceAccessEntry[] = [
  {
    email: 'nicolas@bluebrands.co',
    roleMode: 'owner',
    editorName: null,
    scopeMode: 'all-portfolios',
    scopeAssignments: [],
    updatedAt: null,
  },
  {
    email: 'naomi@bluebrands.co',
    roleMode: 'manager',
    editorName: 'Naomi',
    scopeMode: 'all-portfolios',
    scopeAssignments: [],
    updatedAt: null,
  },
  {
    email: 'iskander@bluebrands.co',
    roleMode: 'owner',
    editorName: null,
    scopeMode: 'all-portfolios',
    scopeAssignments: [],
    updatedAt: null,
  },
  {
    email: 'pjatoss@gmail.com',
    roleMode: 'contributor',
    editorName: 'Daniel T',
    scopeMode: 'all-portfolios',
    scopeAssignments: [],
    updatedAt: null,
  },
  {
    email: 'smnijomarie@gmail.com',
    roleMode: 'contributor',
    editorName: 'Jo',
    scopeMode: 'all-portfolios',
    scopeAssignments: [],
    updatedAt: null,
  },
  {
    email: 'ezequielpizarroac@gmail.com',
    roleMode: 'contributor',
    editorName: 'Ezequiel',
    scopeMode: 'all-portfolios',
    scopeAssignments: [],
    updatedAt: null,
  },
  {
    email: 'ayoubvisuals189@gmail.com',
    roleMode: 'contributor',
    editorName: 'Ayoub',
    scopeMode: 'all-portfolios',
    scopeAssignments: [],
    updatedAt: null,
  },
  {
    email: 'charit@csuccesstech.com',
    roleMode: 'contributor',
    editorName: 'Charit',
    scopeMode: 'all-portfolios',
    scopeAssignments: [],
    updatedAt: null,
  },
  {
    email: 'ivan@bluebrands.co',
    roleMode: 'contributor',
    editorName: 'Ivan',
    scopeMode: 'all-portfolios',
    scopeAssignments: [],
    updatedAt: null,
  },
  {
    email: 'thao.sinaptica40@gmail.com',
    roleMode: 'contributor',
    editorName: 'Daniel J',
    scopeMode: 'all-portfolios',
    scopeAssignments: [],
    updatedAt: null,
  },
  {
    email: 'smithgangyouji@gmail.com',
    roleMode: 'contributor',
    editorName: 'Kevin Ma',
    scopeMode: 'all-portfolios',
    scopeAssignments: [],
    updatedAt: null,
  },
]

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

function isE2ELocalMode() {
  if (!hasBrowser()) {
    return false
  }

  return window.localStorage.getItem(E2E_AUTH_MODE_KEY) === 'disabled'
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

function getE2EAuthChangeEvent(): AuthChangeEvent {
  if (!hasBrowser()) {
    return 'SIGNED_OUT'
  }

  if (window.localStorage.getItem(E2E_PASSWORD_RECOVERY_KEY) === '1') {
    return 'PASSWORD_RECOVERY'
  }

  return getE2EAuthSession() ? 'SIGNED_IN' : 'SIGNED_OUT'
}

function createDefaultE2EAccessEntry(email: string): WorkspaceAccessEntry {
  return {
    email,
    roleMode: 'owner',
    editorName: null,
    scopeMode: 'all-portfolios',
    scopeAssignments: [],
    updatedAt: null,
  }
}

function getStoredE2EAccessEntries() {
  if (!hasBrowser()) {
    return []
  }

  const raw = window.localStorage.getItem(E2E_ACCESS_ENTRIES_KEY)
  if (!raw) {
    return []
  }

  try {
    const parsed = JSON.parse(raw) as WorkspaceAccessEntry[]
    return Array.isArray(parsed)
      ? parsed.filter(
          (entry): entry is WorkspaceAccessEntry =>
            Boolean(entry) &&
            typeof entry.email === 'string' &&
            typeof entry.roleMode === 'string',
        )
      : []
  } catch {
    return []
  }
}

function setStoredE2EAccessEntries(entries: WorkspaceAccessEntry[]) {
  if (!hasBrowser()) {
    return
  }

  window.localStorage.setItem(E2E_ACCESS_ENTRIES_KEY, JSON.stringify(entries))
}

function getE2EWorkspaceAccessEntries() {
  const session = getE2EAuthSession()
  const stored = [
    ...DEFAULT_LOCAL_WORKSPACE_ACCESS_ENTRIES,
    ...getStoredE2EAccessEntries(),
  ]
    .slice()
    .reduce<WorkspaceAccessEntry[]>((entries, nextEntry) => {
      const normalizedEmail = nextEntry.email.trim().toLowerCase()
      if (!normalizedEmail) {
        return entries
      }
      const filtered = entries.filter((entry) => entry.email !== normalizedEmail)
      return [
        ...filtered,
        { ...nextEntry, email: normalizedEmail },
      ]
    }, [])
    .sort((left, right) => left.email.localeCompare(right.email))

  if (!session) {
    return stored
  }

  const normalizedSessionEmail = session.email.trim().toLowerCase()
  if (stored.some((entry) => entry.email === normalizedSessionEmail)) {
    return stored
  }

  const nextEntries = [
    createDefaultE2EAccessEntry(normalizedSessionEmail),
    ...stored,
  ].sort((left, right) => left.email.localeCompare(right.email))
  setStoredE2EAccessEntries(nextEntries)
  return nextEntries
}

function getMagicLinkRedirectUrl() {
  if (magicLinkRedirectUrl) {
    return magicLinkRedirectUrl
  }

  return hasBrowser() ? window.location.origin : undefined
}

export function isPasswordRecoveryFlowPending() {
  if (!hasBrowser()) {
    return false
  }

  if (isE2ESupabaseMode()) {
    return window.localStorage.getItem(E2E_PASSWORD_RECOVERY_KEY) === '1'
  }

  const searchParams = new URLSearchParams(window.location.search)
  const hashValue = window.location.hash.startsWith('#')
    ? window.location.hash.slice(1)
    : window.location.hash
  const hashParams = new URLSearchParams(hashValue)

  return searchParams.get('type') === 'recovery' || hashParams.get('type') === 'recovery'
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
  if (isE2ELocalMode()) {
    return false
  }

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
  window.localStorage.removeItem(E2E_ACCESS_ENTRIES_KEY)
}

export function getSupabaseClient() {
  if (isE2ESupabaseMode() || isE2ELocalMode()) {
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
  callback: (event: AuthChangeEvent, session: AuthSessionState | null) => void,
) {
  if (isE2ESupabaseMode()) {
    if (!hasBrowser()) {
      return () => undefined
    }

    const handleStorage = (event: StorageEvent) => {
      if (
        event.key === E2E_AUTH_MODE_KEY ||
        event.key === E2E_AUTH_EMAIL_KEY ||
        event.key === E2E_PASSWORD_RECOVERY_KEY
      ) {
        callback(getE2EAuthChangeEvent(), getE2EAuthSession())
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
  } = supabase.auth.onAuthStateChange((event, session) => {
    callback(event, toAuthSession(session))
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

export async function resetPasswordForEmail(email: string) {
  return sendPasswordSetupEmail(email)
}

export async function sendPasswordSetupEmail(email: string) {
  const normalizedEmail = email.trim().toLowerCase()
  if (!normalizedEmail) {
    throw new Error('Enter your email.')
  }

  if (isE2ESupabaseMode()) {
    return { emailSent: true, createdUser: true }
  }

  const supabase = getSupabaseClient()
  if (!supabase) {
    throw new Error('Supabase is not configured.')
  }

  const { data, error: fnError } = await supabase.functions.invoke<{
    emailSent?: boolean
    createdUser?: boolean
    error?: string
  }>(MAGIC_LINK_FUNCTION_NAME, {
    body: {
      email: normalizedEmail,
      redirectTo: getMagicLinkRedirectUrl(),
      action: 'password-setup',
    },
  })

  if (fnError) {
    throw fnError
  }

  if (data?.error) {
    throw new Error(data.error)
  }

  return {
    emailSent: data?.emailSent ?? false,
    createdUser: data?.createdUser ?? false,
  }
}

export async function updatePassword(nextPassword: string) {
  if (!nextPassword || nextPassword.length < 6) {
    throw new Error('Password must be at least 6 characters.')
  }

  if (isE2ESupabaseMode()) {
    if (hasBrowser()) {
      window.localStorage.removeItem(E2E_PASSWORD_RECOVERY_KEY)
    }
    return
  }

  const supabase = getSupabaseClient()
  if (!supabase) {
    throw new Error('Supabase is not configured.')
  }

  const { error } = await supabase.auth.updateUser({
    password: nextPassword,
  })

  if (error) {
    throw error
  }
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

    const normalizedEmail = session.email.trim().toLowerCase()
    const matchingEntry = getE2EWorkspaceAccessEntries().find(
      (entry) => entry.email === normalizedEmail,
    )

    const accessEntry = matchingEntry ?? createDefaultE2EAccessEntry(normalizedEmail)
    return {
      email: accessEntry.email,
      roleMode: accessEntry.roleMode,
      editorName: accessEntry.editorName,
      scopeMode: accessEntry.scopeMode,
      scopeAssignments: accessEntry.scopeAssignments,
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
    return getE2EWorkspaceAccessEntries()
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
    const savedEntry = {
      email: normalizedEmail,
      roleMode: entry.roleMode,
      editorName: entry.roleMode === 'contributor' ? entry.editorName?.trim() ?? null : null,
      scopeMode: entry.scopeMode,
      scopeAssignments: entry.scopeAssignments,
      updatedAt: new Date().toISOString(),
    } satisfies WorkspaceAccessEntry

    const nextEntries = [
      ...getE2EWorkspaceAccessEntries().filter((item) => item.email !== normalizedEmail),
      savedEntry,
    ].sort((left, right) => left.email.localeCompare(right.email))
    setStoredE2EAccessEntries(nextEntries)
    return savedEntry
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
    setStoredE2EAccessEntries(
      getE2EWorkspaceAccessEntries().filter((entry) => entry.email !== normalizedEmail),
    )
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
