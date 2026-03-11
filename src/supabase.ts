import { createClient, type SupabaseClient } from '@supabase/supabase-js'

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL?.trim() ?? ''
const supabasePublishableKey =
  import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY?.trim() ??
  import.meta.env.VITE_SUPABASE_ANON_KEY?.trim() ??
  ''

export const REMOTE_WORKSPACE_ID =
  import.meta.env.VITE_REMOTE_WORKSPACE_ID?.trim() || 'primary'

let client: SupabaseClient | null | undefined

export function getSupabaseClient() {
  if (client !== undefined) {
    return client
  }

  if (!supabaseUrl || !supabasePublishableKey) {
    client = null
    return client
  }

  client = createClient(supabaseUrl, supabasePublishableKey, {
    auth: {
      persistSession: true,
      autoRefreshToken: true,
    },
  })

  return client
}
