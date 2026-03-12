import { createClient, type Session, type SupabaseClient } from '@supabase/supabase-js'
import type { RoleMode } from './board'

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
}

export interface WorkspaceAccessEntry {
  email: string
  roleMode: RoleMode
  editorName: string | null
  updatedAt: string | null
}

let client: SupabaseClient | null | undefined

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

function mapWorkspaceAccessEntry(row: {
  email: string
  role_mode: RoleMode
  editor_name: string | null
  updated_at: string | null
}) {
  return {
    email: row.email,
    roleMode: row.role_mode,
    editorName: row.editor_name,
    updatedAt: row.updated_at,
  } satisfies WorkspaceAccessEntry
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
      roleMode: 'manager' as const,
      editorName: null,
    } satisfies WorkspaceAccessState
  }

  const supabase = getSupabaseClient()
  if (!supabase) {
    return null
  }

  const { data, error } = await supabase
    .from('workspace_access')
    .select('email, role_mode, editor_name')
    .maybeSingle()

  if (error) {
    throw error
  }

  if (!data) {
    return null
  }

  return {
    email: data.email,
    roleMode: data.role_mode as RoleMode,
    editorName: data.editor_name ?? null,
  } satisfies WorkspaceAccessState
}

export async function listWorkspaceAccessEntries() {
  if (isE2ESupabaseMode()) {
    const session = getE2EAuthSession()
    return session
      ? [
          {
            email: session.email,
            roleMode: 'manager' as const,
            editorName: null,
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
    .select('email, role_mode, editor_name, updated_at')
    .order('email', { ascending: true })

  if (error) {
    throw error
  }

  return (data ?? []).map(mapWorkspaceAccessEntry)
}

export async function upsertWorkspaceAccessEntry(entry: {
  email: string
  roleMode: RoleMode
  editorName: string | null
}) {
  const normalizedEmail = entry.email.trim().toLowerCase()
  if (!normalizedEmail) {
    throw new Error('Enter a valid work email.')
  }

  if (entry.roleMode === 'editor' && !entry.editorName?.trim()) {
    throw new Error('Editors need a linked team member name.')
  }

  if (isE2ESupabaseMode()) {
    return {
      email: normalizedEmail,
      roleMode: entry.roleMode,
      editorName: entry.roleMode === 'editor' ? entry.editorName?.trim() ?? null : null,
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
        editor_name: entry.roleMode === 'editor' ? entry.editorName?.trim() ?? null : null,
        updated_at: new Date().toISOString(),
      },
      {
        onConflict: 'email',
      },
    )
    .select('email, role_mode, editor_name, updated_at')
    .single()

  if (error) {
    throw error
  }

  return mapWorkspaceAccessEntry(data)
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
