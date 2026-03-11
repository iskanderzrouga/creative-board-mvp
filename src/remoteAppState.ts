import { coerceAppState, type AppState } from './board'
import { getSupabaseClient, REMOTE_WORKSPACE_ID } from './supabase'

const WORKSPACE_STATE_TABLE = 'workspace_state'

interface WorkspaceStateRow {
  state: unknown
}

export function isRemotePersistenceConfigured() {
  return getSupabaseClient() !== null
}

export async function loadRemoteAppState() {
  const supabase = getSupabaseClient()
  if (!supabase) {
    return null
  }

  const { data, error } = await supabase
    .from(WORKSPACE_STATE_TABLE)
    .select('state')
    .eq('workspace_id', REMOTE_WORKSPACE_ID)
    .maybeSingle<WorkspaceStateRow>()

  if (error) {
    throw error
  }

  return data ? coerceAppState(data.state) : null
}

export async function saveRemoteAppState(state: AppState) {
  const supabase = getSupabaseClient()
  if (!supabase) {
    return
  }

  const { error } = await supabase.from(WORKSPACE_STATE_TABLE).upsert(
    {
      workspace_id: REMOTE_WORKSPACE_ID,
      state,
      updated_at: new Date().toISOString(),
    },
    {
      onConflict: 'workspace_id',
    },
  )

  if (error) {
    throw error
  }
}
