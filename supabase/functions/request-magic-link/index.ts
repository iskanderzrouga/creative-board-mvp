import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

interface RequestBody {
  email?: string
  password?: string
  redirectTo?: string
  action?: 'sign-in' | 'sign-up'
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
    return json({ error: 'Supabase environment is not configured.' }, 500)
  }

  const body = (await request.json()) as RequestBody
  const email = normalizeEmail(body.email)
  const password = body.password?.trim() ?? ''
  const action = body.action ?? 'sign-in'

  if (!email) {
    return json({ error: 'Email is required.' }, 400)
  }

  if (!password || password.length < 6) {
    return json({ error: 'Password must be at least 6 characters.' }, 400)
  }

  const admin = createClient(supabaseUrl, serviceRoleKey, {
    auth: {
      persistSession: false,
      autoRefreshToken: false,
    },
  })

  // Check workspace_access table to verify this email is approved
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

  if (action === 'sign-up') {
    // Create the account with email + password
    const { data, error } = await client.auth.signUp({
      email,
      password,
    })

    if (error) {
      // If user already exists, tell them to sign in
      if (error.message.toLowerCase().includes('already registered') ||
          error.message.toLowerCase().includes('already been registered') ||
          error.message.toLowerCase().includes('user already registered')) {
        return json({ error: 'An account with this email already exists. Sign in instead.' }, 409)
      }
      return json({ error: error.message }, 400)
    }

    // Return session if auto-confirmed (no email verification required)
    if (data.session) {
      return json({
        session: {
          access_token: data.session.access_token,
          refresh_token: data.session.refresh_token,
          expires_in: data.session.expires_in,
        },
      })
    }

    return json({ needsEmailConfirmation: true })
  }

  // Default: sign in
  const { data, error } = await client.auth.signInWithPassword({
    email,
    password,
  })

  if (error) {
    if (error.message.toLowerCase().includes('invalid login credentials') ||
        error.message.toLowerCase().includes('invalid password')) {
      return json({ error: 'Incorrect email or password.' }, 401)
    }
    return json({ error: error.message }, 400)
  }

  if (!data.session) {
    return json({ error: 'Sign-in succeeded but no session was returned.' }, 500)
  }

  return json({
    session: {
      access_token: data.session.access_token,
      refresh_token: data.session.refresh_token,
      expires_in: data.session.expires_in,
    },
  })
})
