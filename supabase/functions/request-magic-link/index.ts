import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'
import postgres from 'https://deno.land/x/postgresjs@v3.4.5/mod.js'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

interface RequestBody {
  email?: string
  password?: string
  redirectTo?: string
  action?: 'sign-in' | 'sign-up' | 'ensure-schema'
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
  const action = body.action ?? 'sign-in'

  // ---------- Reload PostgREST schema cache ----------
  if (action === 'reload-schema') {
    const dbUrl = Deno.env.get('SUPABASE_DB_URL')
    if (!dbUrl) {
      return json({ error: 'SUPABASE_DB_URL not available.' }, 500)
    }
    try {
      const sql = postgres(dbUrl, { prepare: false })
      await sql`NOTIFY pgrst, 'reload schema'`
      await sql.end()
      return json({ reloaded: true })
    } catch (err) {
      return json({ error: (err as Error).message, reloaded: false }, 500)
    }
  }

  // ---------- Auto-migration: ensure scope columns exist ----------
  if (action === 'ensure-schema') {
    const dbUrl = Deno.env.get('SUPABASE_DB_URL')
    if (!dbUrl) {
      return json({ error: 'SUPABASE_DB_URL not available.' }, 500)
    }

    try {
      const sql = postgres(dbUrl, { prepare: false })

      // Add scope columns if missing (idempotent)
      await sql`
        ALTER TABLE public.workspace_access
          ADD COLUMN IF NOT EXISTS scope_mode text NOT NULL DEFAULT 'all-portfolios',
          ADD COLUMN IF NOT EXISTS scope_assignments jsonb NOT NULL DEFAULT '[]'::jsonb
      `

      // Drop old constraints FIRST so we can update role_mode values freely
      await sql`
        ALTER TABLE public.workspace_access
          DROP CONSTRAINT IF EXISTS workspace_access_role_mode_check,
          DROP CONSTRAINT IF EXISTS workspace_access_scope_mode_check,
          DROP CONSTRAINT IF EXISTS workspace_access_scope_assignments_is_array
      `

      // Normalize legacy role_mode values
      await sql`UPDATE public.workspace_access SET role_mode = 'contributor' WHERE role_mode = 'editor'`
      await sql`UPDATE public.workspace_access SET role_mode = 'viewer' WHERE role_mode = 'observer'`

      // Promote first manager to owner if no owner exists
      await sql`
        DO $$ BEGIN
          IF NOT EXISTS (SELECT 1 FROM public.workspace_access WHERE role_mode = 'owner') THEN
            UPDATE public.workspace_access
            SET role_mode = 'owner',
                scope_mode = 'all-portfolios',
                scope_assignments = '[]'::jsonb,
                updated_at = timezone('utc', now())
            WHERE email = (
              SELECT email FROM public.workspace_access
              WHERE role_mode = 'manager'
              ORDER BY created_at ASC, email ASC
              LIMIT 1
            );
          END IF;
        END; $$
      `

      // Recreate constraints with new values
      await sql`
        ALTER TABLE public.workspace_access
          ADD CONSTRAINT workspace_access_role_mode_check
            CHECK (role_mode IN ('owner', 'manager', 'contributor', 'viewer')),
          ADD CONSTRAINT workspace_access_scope_mode_check
            CHECK (scope_mode IN ('all-portfolios', 'selected-portfolios', 'selected-brands')),
          ADD CONSTRAINT workspace_access_scope_assignments_is_array
            CHECK (jsonb_typeof(scope_assignments) = 'array')
      `

      // Ensure RLS policies for owner access exist
      await sql`
        DO $$ BEGIN
          -- Create helper function if missing
          CREATE OR REPLACE FUNCTION public.current_user_is_workspace_owner()
          RETURNS boolean
          LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
          AS $fn$
            SELECT EXISTS (
              SELECT 1 FROM public.workspace_access access
              WHERE access.email = public.current_request_email()
                AND access.role_mode = 'owner'
            );
          $fn$;

          GRANT EXECUTE ON FUNCTION public.current_user_is_workspace_owner() TO authenticated;
        END; $$
      `

      // Reload PostgREST schema cache so new functions/policies take effect
      await sql`NOTIFY pgrst, 'reload schema'`

      await sql.end()
      return json({ migrated: true })
    } catch (err) {
      return json({ error: (err as Error).message, migrated: false }, 500)
    }
  }

  // ---------- Auth flows below require email + password ----------
  const email = normalizeEmail(body.email)
  const password = body.password?.trim() ?? ''

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
