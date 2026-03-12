import { createClient, type Session, type SupabaseClient } from '@supabase/supabase-js'
import type { RoleMode } from './board'

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL?.trim() ?? ''
const supabasePublishableKey =
  import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY?.trim() ??
  import.meta.env.VITE_SUPABASE_ANON_KEY?.trim() ??
  ''
const magicLinkRedirectUrl = import.meta.env.VITE_MAGIC_LINK_REDIRECT_URL?.trim() ?? ''

const E2E_AUTH_MODE_KEY = 'editors-board-e2e-auth-mode'
const E2E_AUTH_EMAIL_KEY = 'editors-board-e2e-auth-email'
export const E2E_REMOTE_STATE_KEY = 'editors-board-e2e-remote-state'

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

let client: SupabaseClient | null | undefined

function hasBrowser() {
  return typeof window !== 'undefined'
}

function hasRealSupabaseConfig() {
  return Boolean(supabaseUrl && supabasePublishableKey)
}

function isE2ESupabaseMode() {
  if (!hasBrowser()) {
    return false
  }

  return window.localStorage.getItem(E2E_AUTH_MODE_KEY) === 'enabled'
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
      storageKey: 'editors-board-auth',
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

  const { error } = await supabase.auth.signInWithOtp({
    email: normalizedEmail,
    options: {
      emailRedirectTo: getMagicLinkRedirectUrl(),
      shouldCreateUser: false,
    },
  })

  if (error) {
    throw error
  }

  return { deliveredInstantly: false }
}

export async function getWorkspaceAccess() {
  if (isE2ESupabaseMode()) {
    const session = getE2EAuthSession()
    if (!session) {
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

export async function signOutOfSupabase() {
  if (isE2ESupabaseMode()) {
    window.localStorage.removeItem(E2E_AUTH_EMAIL_KEY)
    return
  }

  const supabase = getSupabaseClient()
  if (!supabase) {
    return
  }

  const { error } = await supabase.auth.signOut()
  if (error) {
    throw error
  }
}
