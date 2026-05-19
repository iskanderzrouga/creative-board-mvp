type HandlerRequest = Request | {
  method?: string
  body?: unknown
  headers?: Record<string, string | string[] | undefined>
}

type HandlerResponse = {
  status?: (status: number) => HandlerResponse
  setHeader?: (name: string, value: string) => void
  json?: (payload: unknown) => void
  end?: (body?: string) => void
  statusCode?: number
}

interface WorkspaceAccessRow {
  role_mode: string
}

type SlackChannel = 'video' | 'dev' | 'dm'

function jsonResponse(payload: unknown, status = 200) {
  return new Response(JSON.stringify(payload), {
    status,
    headers: { 'Content-Type': 'application/json' },
  })
}

function sendJson(res: HandlerResponse | undefined, payload: unknown, status = 200) {
  if (!res) {
    return jsonResponse(payload, status)
  }

  res.setHeader?.('Content-Type', 'application/json')

  if (typeof res.status === 'function') {
    const statusResponse = res.status(status)
    if (typeof statusResponse.json === 'function') {
      statusResponse.json(payload)
      return undefined
    }
  }

  if (typeof res.json === 'function') {
    res.statusCode = status
    res.json(payload)
    return undefined
  }

  res.statusCode = status
  res.end?.(JSON.stringify(payload))
  return undefined
}

function isFetchRequest(req: HandlerRequest): req is Request {
  return typeof (req as Request).headers?.get === 'function'
}

function getHeader(req: HandlerRequest, name: string) {
  if (isFetchRequest(req)) {
    return req.headers.get(name)
  }

  const lowerName = name.toLowerCase()
  const value = req.headers?.[lowerName] ?? req.headers?.[name]

  if (Array.isArray(value)) {
    return value[0] ?? null
  }

  return value ?? null
}

function getMethod(req: HandlerRequest) {
  return (req.method || 'GET').toUpperCase()
}

async function readJsonBody(req: HandlerRequest) {
  if ('json' in req && typeof req.json === 'function') {
    return req.json().catch(() => null)
  }

  if ('body' in req) {
    if (typeof req.body === 'string') {
      try {
        return JSON.parse(req.body)
      } catch {
        return null
      }
    }

    return req.body ?? null
  }

  return null
}

function getServerEnv(name: string) {
  return process.env[name]
}

function getSupabaseUrl() {
  return getServerEnv('SUPABASE_URL') || getServerEnv('VITE_SUPABASE_URL')
}

function getSupabaseAnonKey() {
  return (
    getServerEnv('SUPABASE_ANON_KEY') ||
    getServerEnv('VITE_SUPABASE_ANON_KEY') ||
    getServerEnv('VITE_SUPABASE_PUBLISHABLE_KEY')
  )
}

function getSupabaseServiceKey() {
  return getServerEnv('SUPABASE_SERVICE_ROLE_KEY')
}

function encodeFilter(value: string) {
  return encodeURIComponent(value)
}

async function supabaseRest<T>(path: string, init: RequestInit = {}) {
  const supabaseUrl = getSupabaseUrl()
  const serviceKey = getSupabaseServiceKey()
  if (!supabaseUrl || !serviceKey) {
    throw new Error('supabase_service_role_key_missing')
  }

  const response = await fetch(`${supabaseUrl}/rest/v1/${path}`, {
    ...init,
    headers: {
      apikey: serviceKey,
      Authorization: `Bearer ${serviceKey}`,
      Accept: 'application/json',
      ...(init.body ? { 'Content-Type': 'application/json' } : {}),
      ...init.headers,
    },
  })

  const raw = await response.text()
  let data: unknown = null
  try {
    data = raw ? JSON.parse(raw) : null
  } catch {
    data = raw
  }

  return { ok: response.ok, data: data as T, raw }
}

async function requireUserEmail(req: HandlerRequest) {
  const supabaseUrl = getSupabaseUrl()
  const anonKey = getSupabaseAnonKey()
  const auth = getHeader(req, 'authorization')

  if (!supabaseUrl || !anonKey || !auth) {
    return { ok: false as const, status: 401, error: 'workspace_auth_required' }
  }

  const response = await fetch(`${supabaseUrl}/auth/v1/user`, {
    headers: {
      apikey: anonKey,
      Authorization: auth,
    },
  })

  if (!response.ok) {
    return { ok: false as const, status: 401, error: 'workspace_auth_invalid' }
  }

  const user = (await response.json()) as { email?: unknown }
  const email = typeof user.email === 'string' ? user.email.trim().toLowerCase() : ''
  if (!email) {
    return { ok: false as const, status: 401, error: 'workspace_auth_missing_email' }
  }

  return { ok: true as const, email, auth }
}

async function requireWorkspaceWriteAccess(email: string) {
  const response = await supabaseRest<WorkspaceAccessRow[]>(
    `workspace_access?select=role_mode&email=eq.${encodeFilter(email)}&limit=1`,
  )
  if (!response.ok) {
    throw new Error(`workspace_access_read_failed:${response.raw}`)
  }

  const roleMode = Array.isArray(response.data) ? response.data[0]?.role_mode : null
  if (roleMode === 'owner' || roleMode === 'manager' || roleMode === 'contributor') {
    return { ok: true as const }
  }

  return { ok: false as const, status: 403, error: 'workspace_access_denied' }
}

function getWebhookUrl(channel: SlackChannel) {
  if (channel === 'video') {
    return getServerEnv('SLACK_WEBHOOK_VIDEO')
  }
  if (channel === 'dev') {
    return getServerEnv('SLACK_WEBHOOK_DEV')
  }

  return getServerEnv('SLACK_DM_WEBHOOK')
}

function normalizeChannel(value: unknown): SlackChannel | null {
  return value === 'video' || value === 'dev' || value === 'dm' ? value : null
}

function normalizeText(value: unknown) {
  return typeof value === 'string' ? value.trim().slice(0, 2000) : ''
}

function buildSlackPayload(body: Record<string, unknown>, channel: SlackChannel) {
  if (channel === 'dm') {
    const scriptTitle = normalizeText(body.scriptTitle)
    const brand = normalizeText(body.brand)
    const boardUrl = normalizeText(body.boardUrl)
    if (!scriptTitle || !brand || !boardUrl) {
      return null
    }

    return {
      type: 'script-review',
      scriptTitle,
      brand,
      boardUrl,
    }
  }

  const text = normalizeText(body.text)
  return text ? { text } : null
}

export default async function handler(req: HandlerRequest, res?: HandlerResponse) {
  if (getMethod(req) !== 'POST') {
    return sendJson(res, { success: false, error: 'method_not_allowed' }, 405)
  }

  try {
    const user = await requireUserEmail(req)
    if (!user.ok) {
      return sendJson(res, { success: false, error: user.error }, user.status)
    }

    const access = await requireWorkspaceWriteAccess(user.email)
    if (!access.ok) {
      return sendJson(res, { success: false, error: access.error }, access.status)
    }

    const body = (await readJsonBody(req)) as Record<string, unknown> | null
    if (!body || typeof body !== 'object' || Array.isArray(body)) {
      return sendJson(res, { success: false, error: 'invalid_slack_notification' }, 400)
    }

    const channel = normalizeChannel(body.channel)
    if (!channel) {
      return sendJson(res, { success: false, error: 'invalid_slack_channel' }, 400)
    }

    const payload = buildSlackPayload(body, channel)
    if (!payload) {
      return sendJson(res, { success: false, error: 'invalid_slack_payload' }, 400)
    }

    const webhookUrl = getWebhookUrl(channel)
    if (!webhookUrl) {
      return sendJson(res, { success: true, skipped: true })
    }

    const slackResponse = await fetch(webhookUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(payload),
    })

    if (!slackResponse.ok) {
      return sendJson(res, { success: false, error: 'slack_webhook_failed' }, 502)
    }

    return sendJson(res, { success: true })
  } catch (error) {
    return sendJson(
      res,
      {
        success: false,
        error: error instanceof Error ? error.message : 'slack_notification_failed',
      },
      500,
    )
  }
}
