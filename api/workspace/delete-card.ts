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
  email: string
  role_mode: string
  scope_mode: string | null
  scope_assignments: unknown
}

interface WorkspaceStateRow {
  state: WorkspaceState
  updated_at: string
}

interface WorkspaceState {
  deletedCardIds?: unknown
  portfolios?: unknown
  [key: string]: unknown
}

interface PortfolioState {
  id?: unknown
  name?: unknown
  brands?: unknown
  cards?: unknown
  [key: string]: unknown
}

interface CardState {
  id?: unknown
  brand?: unknown
  title?: unknown
  [key: string]: unknown
}

interface ScopeAssignment {
  portfolioId: string
  brandNames: string[]
}

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

function getWorkspaceId() {
  return getServerEnv('REMOTE_WORKSPACE_ID') || getServerEnv('VITE_REMOTE_WORKSPACE_ID') || 'primary'
}

function encodeFilter(value: string) {
  return encodeURIComponent(value)
}

function getRestUrl(path: string) {
  const supabaseUrl = getSupabaseUrl()
  if (!supabaseUrl) {
    throw new Error('supabase_url_missing')
  }

  return `${supabaseUrl}/rest/v1/${path}`
}

async function supabaseRest<T>(path: string, init: RequestInit = {}) {
  const serviceKey = getSupabaseServiceKey()
  if (!serviceKey) {
    throw new Error('supabase_service_role_key_missing')
  }

  const response = await fetch(getRestUrl(path), {
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

  return { ok: response.ok, status: response.status, data: data as T, raw }
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

  return { ok: true as const, email }
}

function normalizeAssignments(value: unknown): ScopeAssignment[] {
  if (!Array.isArray(value)) {
    return []
  }

  return value
    .map((item) => {
      if (!item || typeof item !== 'object') {
        return null
      }

      const assignment = item as { portfolioId?: unknown; brandNames?: unknown }
      const portfolioId = typeof assignment.portfolioId === 'string' ? assignment.portfolioId.trim() : ''
      if (!portfolioId) {
        return null
      }

      const brandNames = Array.isArray(assignment.brandNames)
        ? assignment.brandNames.filter((brandName): brandName is string => typeof brandName === 'string')
        : []

      return {
        portfolioId,
        brandNames: Array.from(new Set(brandNames.map((brandName) => brandName.trim()).filter(Boolean))),
      }
    })
    .filter((item): item is ScopeAssignment => Boolean(item))
}

function canAccessCard(access: WorkspaceAccessRow, portfolioId: string, brandName: string | null) {
  if (access.role_mode !== 'owner' && access.role_mode !== 'manager') {
    return false
  }

  const scopeMode = access.scope_mode ?? 'all-portfolios'
  if (scopeMode === 'all-portfolios') {
    return true
  }

  const assignment = normalizeAssignments(access.scope_assignments).find((item) => item.portfolioId === portfolioId)
  if (!assignment) {
    return false
  }

  if (scopeMode === 'selected-portfolios') {
    return true
  }

  if (scopeMode === 'selected-brands') {
    if (assignment.brandNames.length === 0) {
      return true
    }

    return Boolean(brandName && assignment.brandNames.includes(brandName))
  }

  return false
}

function getString(value: unknown) {
  return typeof value === 'string' ? value : ''
}

function getDeletedCardIds(state: WorkspaceState) {
  return Array.isArray(state.deletedCardIds)
    ? state.deletedCardIds.filter((cardId): cardId is string => typeof cardId === 'string' && cardId.trim() !== '')
    : []
}

function getPortfolios(state: WorkspaceState) {
  return Array.isArray(state.portfolios) ? (state.portfolios as PortfolioState[]) : []
}

function getCards(portfolio: PortfolioState) {
  return Array.isArray(portfolio.cards) ? (portfolio.cards as CardState[]) : []
}

async function getAccessRow(email: string) {
  const response = await supabaseRest<WorkspaceAccessRow[]>(
    `workspace_access?select=email,role_mode,scope_mode,scope_assignments&email=eq.${encodeFilter(email)}&limit=1`,
  )

  if (!response.ok) {
    throw new Error(`workspace_access_read_failed:${response.raw}`)
  }

  return Array.isArray(response.data) ? response.data[0] ?? null : null
}

async function getWorkspaceStateRow() {
  const workspaceId = getWorkspaceId()
  const response = await supabaseRest<WorkspaceStateRow[]>(
    `workspace_state?select=state,updated_at&workspace_id=eq.${encodeFilter(workspaceId)}&limit=1`,
  )

  if (!response.ok) {
    throw new Error(`workspace_state_read_failed:${response.raw}`)
  }

  return Array.isArray(response.data) ? response.data[0] ?? null : null
}

async function patchWorkspaceState(expectedUpdatedAt: string, state: WorkspaceState) {
  const workspaceId = getWorkspaceId()
  const response = await supabaseRest<WorkspaceStateRow[]>(
    `workspace_state?workspace_id=eq.${encodeFilter(workspaceId)}&updated_at=eq.${encodeFilter(expectedUpdatedAt)}&select=updated_at`,
    {
      method: 'PATCH',
      headers: {
        Prefer: 'return=representation',
      },
      body: JSON.stringify({ state }),
    },
  )

  if (!response.ok) {
    throw new Error(`workspace_state_update_failed:${response.raw}`)
  }

  return Array.isArray(response.data) ? response.data[0] ?? null : null
}

function deleteCardFromState(state: WorkspaceState, portfolioId: string, cardId: string) {
  const portfolios = getPortfolios(state)
  const portfolio = portfolios.find((item) => getString(item.id) === portfolioId) ?? null
  const existingDeletedIds = getDeletedCardIds(state)
  const deletedCardIds = Array.from(new Set([...existingDeletedIds, cardId]))

  if (!portfolio) {
    return {
      nextState: { ...state, deletedCardIds },
      portfolio: null,
      card: null,
      removed: false,
    }
  }

  const cards = getCards(portfolio)
  const card = cards.find((item) => getString(item.id) === cardId) ?? null
  const nextPortfolio = {
    ...portfolio,
    cards: cards.filter((item) => getString(item.id) !== cardId),
  }

  return {
    nextState: {
      ...state,
      deletedCardIds,
      portfolios: portfolios.map((item) => (getString(item.id) === portfolioId ? nextPortfolio : item)),
    },
    portfolio,
    card,
    removed: Boolean(card),
  }
}

async function deleteCardWithRetry(portfolioId: string, cardId: string, access: WorkspaceAccessRow) {
  let latestConflict = false

  for (let attempt = 0; attempt < 3; attempt += 1) {
    const row = await getWorkspaceStateRow()
    if (!row) {
      return { ok: false as const, status: 404, error: 'workspace_state_not_found' }
    }

    const deletion = deleteCardFromState(row.state, portfolioId, cardId)
    const brandName = deletion.card ? getString(deletion.card.brand) : null

    if (!deletion.portfolio) {
      return { ok: false as const, status: 404, error: 'portfolio_not_found' }
    }

    const alreadyDeleted = getDeletedCardIds(row.state).includes(cardId)
    if (!deletion.card && !alreadyDeleted) {
      return { ok: false as const, status: 404, error: 'card_not_found' }
    }

    if (!canAccessCard(access, portfolioId, brandName)) {
      return { ok: false as const, status: 403, error: 'workspace_access_denied' }
    }

    const patched = await patchWorkspaceState(row.updated_at, deletion.nextState)
    if (patched?.updated_at) {
      return {
        ok: true as const,
        updatedAt: patched.updated_at,
        removed: deletion.removed,
        retried: latestConflict,
      }
    }

    latestConflict = true
  }

  return { ok: false as const, status: 409, error: 'workspace_state_conflict' }
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

    const body = (await readJsonBody(req)) as { portfolioId?: unknown; cardId?: unknown } | null
    const portfolioId = typeof body?.portfolioId === 'string' ? body.portfolioId.trim() : ''
    const cardId = typeof body?.cardId === 'string' ? body.cardId.trim() : ''

    if (!portfolioId || !cardId) {
      return sendJson(res, { success: false, error: 'missing_delete_target' }, 400)
    }

    const access = await getAccessRow(user.email)
    if (!access) {
      return sendJson(res, { success: false, error: 'workspace_access_missing' }, 403)
    }

    const result = await deleteCardWithRetry(portfolioId, cardId, access)
    if (!result.ok) {
      return sendJson(res, { success: false, error: result.error }, result.status)
    }

    return sendJson(res, {
      success: true,
      portfolioId,
      cardId,
      updatedAt: result.updatedAt,
      removed: result.removed,
      retried: result.retried,
    })
  } catch (error) {
    return sendJson(
      res,
      {
        success: false,
        error: error instanceof Error ? error.message : 'workspace_delete_failed',
      },
      500,
    )
  }
}
