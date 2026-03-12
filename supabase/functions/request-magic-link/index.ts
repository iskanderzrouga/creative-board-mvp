import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

interface RequestBody {
  email?: string
  redirectTo?: string
}

function json(body: Record<string, unknown>, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      ...corsHeaders,
      'Content-Type': 'application/json',
    },
  })
}

function normalizeEmail(value: string | undefined) {
  return value?.trim().toLowerCase() ?? ''
}

Deno.serve(async (request) => {
  if (request.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  if (request.method !== 'POST') {
    return json({ error: 'Method not allowed.' }, 405)
  }

  const supabaseUrl = Deno.env.get('SUPABASE_URL')
  const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')
  const publishableKey =
    Deno.env.get('SUPABASE_ANON_KEY') ?? Deno.env.get('SUPABASE_PUBLISHABLE_KEY')

  if (!supabaseUrl || !serviceRoleKey || !publishableKey) {
    return json({ error: 'Supabase environment is not configured for magic-link requests.' }, 500)
  }

  const body = (await request.json()) as RequestBody
  const email = normalizeEmail(body.email)
  const redirectTo = body.redirectTo?.trim()

  if (!email || !redirectTo) {
    return json({ error: 'Email and redirect URL are required.' }, 400)
  }

  const admin = createClient(supabaseUrl, serviceRoleKey, {
    auth: {
      persistSession: false,
      autoRefreshToken: false,
    },
  })

  const { data: accessRows, error: accessError } = await admin
    .from('workspace_access')
    .select('email')
    .eq('email', email)
    .limit(1)

  if (accessError) {
    return json({ error: accessError.message }, 500)
  }

  if (!accessRows?.length) {
    return json({ error: 'This email is not approved for the workspace yet.' }, 403)
  }

  const client = createClient(supabaseUrl, publishableKey, {
    auth: {
      persistSession: false,
      autoRefreshToken: false,
    },
  })

  const { error } = await client.auth.signInWithOtp({
    email,
    options: {
      emailRedirectTo: redirectTo,
      shouldCreateUser: true,
    },
  })

  if (error) {
    return json({ error: error.message }, 400)
  }

  return json({ deliveredInstantly: false })
})
