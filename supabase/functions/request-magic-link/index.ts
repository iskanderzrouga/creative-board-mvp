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
  workspaceId?: string
  action?: 'sign-in' | 'sign-up' | 'password-setup' | 'ensure-schema' | 'reload-schema'
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

function normalizeWorkspaceId(value: string | undefined) {
  const workspaceId = value?.trim()
  return workspaceId || 'primary'
}

function isAlreadyRegisteredError(message: string) {
  const normalized = message.trim().toLowerCase()
  return (
    normalized.includes('already registered') ||
    normalized.includes('already been registered') ||
    normalized.includes('user already registered') ||
    normalized.includes('already exists') ||
    normalized.includes('has already been registered')
  )
}

async function ensurePasswordUser(
  admin: {
    auth: {
      admin: {
        createUser: (attributes: {
          email: string
          password: string
          email_confirm: boolean
        }) => Promise<{ error: { message: string } | null }>
      }
    }
  },
  email: string,
) {
  const temporaryPassword = `Setup-${crypto.randomUUID()}-${crypto.randomUUID()}`
  const { error } = await admin.auth.admin.createUser({
    email,
    password: temporaryPassword,
    email_confirm: true,
  })

  if (!error) {
    return { createdUser: true }
  }

  if (isAlreadyRegisteredError(error.message)) {
    return { createdUser: false }
  }

  throw error
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
  const workspaceId = normalizeWorkspaceId(body.workspaceId)

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
          ADD COLUMN IF NOT EXISTS workspace_id text NOT NULL DEFAULT 'primary',
          ADD COLUMN IF NOT EXISTS scope_mode text NOT NULL DEFAULT 'all-portfolios',
          ADD COLUMN IF NOT EXISTS scope_assignments jsonb NOT NULL DEFAULT '[]'::jsonb
      `

      await sql`
        UPDATE public.workspace_access
        SET workspace_id = 'primary'
        WHERE workspace_id IS NULL OR length(trim(workspace_id)) = 0
      `

      // Drop old constraints FIRST so we can update role_mode values freely
      await sql`
        ALTER TABLE public.workspace_access
          DROP CONSTRAINT IF EXISTS workspace_access_workspace_id_not_blank,
          DROP CONSTRAINT IF EXISTS workspace_access_pkey,
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
          IF NOT EXISTS (
            SELECT 1 FROM public.workspace_access
            WHERE workspace_id = 'primary' AND role_mode = 'owner'
          ) THEN
            UPDATE public.workspace_access
            SET role_mode = 'owner',
                scope_mode = 'all-portfolios',
                scope_assignments = '[]'::jsonb,
                updated_at = timezone('utc', now())
            WHERE email = (
              SELECT email FROM public.workspace_access
              WHERE workspace_id = 'primary' AND role_mode = 'manager'
              ORDER BY created_at ASC, email ASC
              LIMIT 1
            );
          END IF;
        END; $$
      `

      // Recreate constraints with new values
      await sql`
        ALTER TABLE public.workspace_access
          ADD CONSTRAINT workspace_access_workspace_id_not_blank
            CHECK (length(trim(workspace_id)) > 0),
          ADD CONSTRAINT workspace_access_pkey
            PRIMARY KEY (workspace_id, email),
          ADD CONSTRAINT workspace_access_role_mode_check
            CHECK (role_mode IN ('owner', 'manager', 'contributor', 'viewer')),
          ADD CONSTRAINT workspace_access_scope_mode_check
            CHECK (scope_mode IN ('all-portfolios', 'selected-portfolios', 'selected-brands')),
          ADD CONSTRAINT workspace_access_scope_assignments_is_array
            CHECK (jsonb_typeof(scope_assignments) = 'array')
      `

      // Ensure all helper functions and RLS policies exist
      await sql`
        DO $$ BEGIN
          -- Workspace membership check function
          CREATE OR REPLACE FUNCTION public.current_user_can_read_workspace(target_workspace_id text)
          RETURNS boolean
          LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
          AS $fn$
            SELECT EXISTS (
              SELECT 1 FROM public.workspace_access access
              WHERE access.workspace_id = target_workspace_id
                AND access.email = public.current_request_email()
            );
          $fn$;

          -- Owner check function
          CREATE OR REPLACE FUNCTION public.current_user_is_workspace_owner(target_workspace_id text)
          RETURNS boolean
          LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
          AS $fn$
            SELECT EXISTS (
              SELECT 1 FROM public.workspace_access access
              WHERE access.workspace_id = target_workspace_id
                AND access.email = public.current_request_email()
                AND access.role_mode = 'owner'
            );
          $fn$;

          -- Write check function (owner or manager)
          CREATE OR REPLACE FUNCTION public.current_user_can_write_workspace_state(target_workspace_id text)
          RETURNS boolean
          LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
          AS $fn$
            SELECT EXISTS (
              SELECT 1 FROM public.workspace_access access
              WHERE access.workspace_id = target_workspace_id
                AND access.email = public.current_request_email()
                AND access.role_mode IN ('owner', 'manager')
            );
          $fn$;

          GRANT EXECUTE ON FUNCTION public.current_user_can_read_workspace(text) TO authenticated;
          GRANT EXECUTE ON FUNCTION public.current_user_is_workspace_owner(text) TO authenticated;
          GRANT EXECUTE ON FUNCTION public.current_user_can_write_workspace_state(text) TO authenticated;
        END; $$
      `

      // Ensure workspace_access RLS policies (drop old, create new — one statement each)
      await sql`DROP POLICY IF EXISTS "workspace_access_self_select" ON public.workspace_access`
      await sql`DROP POLICY IF EXISTS "workspace_access_manager_select" ON public.workspace_access`
      await sql`DROP POLICY IF EXISTS "workspace_access_manager_insert" ON public.workspace_access`
      await sql`DROP POLICY IF EXISTS "workspace_access_manager_update" ON public.workspace_access`
      await sql`DROP POLICY IF EXISTS "workspace_access_manager_delete" ON public.workspace_access`
      await sql`DROP POLICY IF EXISTS "workspace_access_owner_select" ON public.workspace_access`
      await sql`DROP POLICY IF EXISTS "workspace_access_owner_insert" ON public.workspace_access`
      await sql`DROP POLICY IF EXISTS "workspace_access_owner_update" ON public.workspace_access`
      await sql`DROP POLICY IF EXISTS "workspace_access_owner_delete" ON public.workspace_access`
      await sql`CREATE POLICY "workspace_access_self_select" ON public.workspace_access FOR SELECT TO authenticated USING (email = public.current_request_email())`
      await sql`CREATE POLICY "workspace_access_owner_select" ON public.workspace_access FOR SELECT TO authenticated USING (public.current_user_is_workspace_owner(workspace_id))`
      await sql`CREATE POLICY "workspace_access_owner_insert" ON public.workspace_access FOR INSERT TO authenticated WITH CHECK (public.current_user_is_workspace_owner(workspace_id))`
      await sql`CREATE POLICY "workspace_access_owner_update" ON public.workspace_access FOR UPDATE TO authenticated USING (public.current_user_is_workspace_owner(workspace_id)) WITH CHECK (public.current_user_is_workspace_owner(workspace_id))`
      await sql`CREATE POLICY "workspace_access_owner_delete" ON public.workspace_access FOR DELETE TO authenticated USING (public.current_user_is_workspace_owner(workspace_id))`

      // Ensure workspace_state write policies
      await sql`DROP POLICY IF EXISTS "workspace_state_member_select" ON public.workspace_state`
      await sql`DROP POLICY IF EXISTS "workspace_state_authenticated_insert" ON public.workspace_state`
      await sql`DROP POLICY IF EXISTS "workspace_state_authenticated_update" ON public.workspace_state`
      await sql`DROP POLICY IF EXISTS "workspace_state_manager_insert" ON public.workspace_state`
      await sql`DROP POLICY IF EXISTS "workspace_state_manager_update" ON public.workspace_state`
      await sql`DROP POLICY IF EXISTS "workspace_state_owner_manager_insert" ON public.workspace_state`
      await sql`DROP POLICY IF EXISTS "workspace_state_owner_manager_update" ON public.workspace_state`
      await sql`CREATE POLICY "workspace_state_member_select" ON public.workspace_state FOR SELECT TO authenticated USING (public.current_user_can_read_workspace(workspace_id))`
      await sql`CREATE POLICY "workspace_state_owner_manager_insert" ON public.workspace_state FOR INSERT TO authenticated WITH CHECK (public.current_user_can_write_workspace_state(workspace_id))`
      await sql`CREATE POLICY "workspace_state_owner_manager_update" ON public.workspace_state FOR UPDATE TO authenticated USING (public.current_user_can_write_workspace_state(workspace_id)) WITH CHECK (public.current_user_can_write_workspace_state(workspace_id))`

      // Reload PostgREST schema cache so new functions/policies take effect
      await sql`NOTIFY pgrst, 'reload schema'`

      await sql.end()
      return json({ migrated: true })
    } catch (err) {
      return json({ error: (err as Error).message, migrated: false }, 500)
    }
  }

  // ---------- Auth flows below require an approved email ----------
  const email = normalizeEmail(body.email)

  if (!email) {
    return json({ error: 'Email is required.' }, 400)
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
    .eq('workspace_id', workspaceId)
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
    return json(
      {
        error:
          'Self-serve sign up is disabled. Ask the workspace owner to add you, then use the password email to finish setup.',
      },
      403,
    )
  }

  if (action === 'password-setup') {
    try {
      const { createdUser } = await ensurePasswordUser(admin, email)
      const { error } = await client.auth.resetPasswordForEmail(email, {
        redirectTo: body.redirectTo?.trim() || undefined,
      })

      if (error) {
        return json({ error: error.message }, 400)
      }

      return json({
        emailSent: true,
        createdUser,
      })
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Could not prepare the account.'
      return json({ error: message }, 400)
    }
  }

  const password = body.password?.trim() ?? ''
  if (!password || password.length < 6) {
    return json({ error: 'Password must be at least 6 characters.' }, 400)
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
