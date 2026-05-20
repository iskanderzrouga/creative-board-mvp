import {
  STAGES,
  applyCardUpdates,
  coerceAppState,
  getCardMoveValidationMessage,
  isThaiEditingPortfolio,
  moveCardInPortfolio,
  setInProductionCardPriority,
  startEditorTimerForCard,
  type AppState,
  type Card,
  type CardPriority,
  type Portfolio,
  type StageId,
  type TeamMember,
  type ViewerContext,
} from '../../src/board.js'

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
  editor_name: string | null
  scope_mode: string | null
  scope_assignments: unknown
}

interface WorkspaceStateRow {
  state: unknown
  updated_at: string
}

interface ScopeAssignment {
  portfolioId: string
  brandNames: string[]
}

type CardMutationBody =
  | {
      action?: 'update'
      portfolioId?: unknown
      cardId?: unknown
      updates?: unknown
      actor?: unknown
      timestamp?: unknown
    }
  | {
      action: 'move'
      portfolioId?: unknown
      cardId?: unknown
      destinationStage?: unknown
      destinationOwner?: unknown
      destinationIndex?: unknown
      movedAt?: unknown
      actor?: unknown
      revisionReason?: unknown
      revisionEstimatedHours?: unknown
      revisionFeedback?: unknown
    }
  | {
      action: 'set-priority'
      portfolioId?: unknown
      cardId?: unknown
      priority?: unknown
    }
  | {
      action: 'start-timer'
      portfolioId?: unknown
      cardId?: unknown
      startedAt?: unknown
    }

type CardMutationFailure = { ok: false; status: number; error: string }
type AppliedCardMutation = { ok: true; state: AppState }
type PersistedCardMutation = AppliedCardMutation & {
  updatedAt: string
  retried: boolean
}
type CardMutationResult = PersistedCardMutation | CardMutationFailure

const ALLOWED_UPDATE_KEYS = new Set<keyof Card>([
  'title',
  'brand',
  'product',
  'platform',
  'taskTypeId',
  'hook',
  'angle',
  'audience',
  'landingPage',
  'funnelStage',
  'designType',
  'figmaUrl',
  'sourceCardId',
  'relatedLpDesignCardId',
  'owner',
  'brief',
  'keyMessage',
  'visualDirection',
  'cta',
  'referenceLinks',
  'adCopy',
  'notes',
  'launchLearning',
  'attachments',
  'links',
  'driveFolderUrl',
  'driveFolderCreated',
  'frameioLink',
  'estimatedHours',
  'revisionEstimatedHours',
  'dueDate',
  'blocked',
  'archivedAt',
  'actualHoursLogged',
])

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

function normalizeIdentity(value: string | null | undefined) {
  return value?.trim().toLowerCase() ?? ''
}

function getDeletedCardIds(state: AppState) {
  return Array.isArray(state.deletedCardIds)
    ? state.deletedCardIds.filter((cardId): cardId is string => typeof cardId === 'string' && cardId.trim() !== '')
    : []
}

function managerCanAccessCard(access: WorkspaceAccessRow, portfolioId: string, brandName: string | null) {
  if (access.role_mode === 'owner') {
    return true
  }

  if (access.role_mode !== 'manager') {
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

function getMemberByAccessEmail(portfolio: Portfolio, email: string) {
  const normalizedEmail = normalizeIdentity(email)
  return (
    portfolio.team.find((member) => normalizeIdentity(member.accessEmail) === normalizedEmail) ??
    null
  )
}

function getContributorMember(access: WorkspaceAccessRow, portfolio: Portfolio): TeamMember | null {
  const configuredName = normalizeIdentity(access.editor_name)
  if (configuredName) {
    const byName = portfolio.team.find((member) => normalizeIdentity(member.name) === configuredName)
    if (byName) {
      return byName
    }
  }

  const byEmail = getMemberByAccessEmail(portfolio, access.email)
  if (byEmail) {
    return byEmail
  }

  return null
}

function contributorCanAccessCard(access: WorkspaceAccessRow, portfolio: Portfolio, card: Card) {
  const owner = normalizeIdentity(card.owner)
  if (!owner) {
    return false
  }

  const member = getContributorMember(access, portfolio)
  return Boolean(member && normalizeIdentity(member.name) === owner)
}

function getViewerContext(access: WorkspaceAccessRow, portfolio: Portfolio): ViewerContext {
  if (access.role_mode === 'owner' || access.role_mode === 'manager') {
    return {
      mode: access.role_mode,
      editorName: null,
      memberRole: null,
      visibleBrandNames: null,
    }
  }

  if (access.role_mode === 'contributor') {
    const member = getContributorMember(access, portfolio)
    return {
      mode: 'contributor',
      editorName: member?.name ?? access.editor_name ?? null,
      memberRole: member?.role ?? null,
      visibleBrandNames: null,
    }
  }

  return {
    mode: 'viewer',
    editorName: null,
    memberRole: null,
    visibleBrandNames: null,
  }
}

function canMutateCard(access: WorkspaceAccessRow, portfolio: Portfolio, card: Card) {
  if (access.role_mode === 'owner' || access.role_mode === 'manager') {
    return managerCanAccessCard(access, portfolio.id, card.brand)
  }

  if (access.role_mode === 'contributor') {
    return contributorCanAccessCard(access, portfolio, card)
  }

  return false
}

function normalizeActor(value: unknown, access: WorkspaceAccessRow, portfolio: Portfolio) {
  if (typeof value === 'string' && value.trim()) {
    return value.trim().slice(0, 120)
  }

  if (access.role_mode === 'contributor') {
    return getContributorMember(access, portfolio)?.name ?? access.editor_name ?? access.email
  }

  return access.email
}

function normalizeTimestamp(value: unknown) {
  if (typeof value === 'string' && value.trim() && Number.isFinite(Date.parse(value))) {
    return value.trim()
  }

  return new Date().toISOString()
}

function normalizeUpdates(value: unknown) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    return null
  }

  const updates: Partial<Card> = {}
  for (const [key, rawValue] of Object.entries(value)) {
    if (!ALLOWED_UPDATE_KEYS.has(key as keyof Card)) {
      return null
    }
    ;(updates as Record<string, unknown>)[key] = rawValue
  }

  return updates
}

async function getAccessRow(email: string) {
  const response = await supabaseRest<WorkspaceAccessRow[]>(
    `workspace_access?select=email,role_mode,editor_name,scope_mode,scope_assignments&email=eq.${encodeFilter(email)}&limit=1`,
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

async function patchWorkspaceState(expectedUpdatedAt: string, state: AppState) {
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

function getMutationTarget(state: AppState, portfolioId: string, cardId: string) {
  const portfolio = state.portfolios.find((item) => item.id === portfolioId) ?? null
  const card = portfolio?.cards.find((item) => item.id === cardId) ?? null
  return { portfolio, card }
}

function replacePortfolio(state: AppState, nextPortfolio: Portfolio) {
  return {
    ...state,
    portfolios: state.portfolios.map((portfolio) =>
      portfolio.id === nextPortfolio.id ? nextPortfolio : portfolio,
    ),
  }
}

function applyCardMutation(
  state: AppState,
  body: CardMutationBody,
  access: WorkspaceAccessRow,
): AppliedCardMutation | CardMutationFailure {
  const portfolioId = typeof body.portfolioId === 'string' ? body.portfolioId.trim() : ''
  const cardId = typeof body.cardId === 'string' ? body.cardId.trim() : ''
  if (!portfolioId || !cardId) {
    return { ok: false, status: 400, error: 'missing_card_target' }
  }

  if (getDeletedCardIds(state).includes(cardId)) {
    return { ok: false, status: 404, error: 'card_deleted' }
  }

  const { portfolio, card } = getMutationTarget(state, portfolioId, cardId)
  if (!portfolio) {
    return { ok: false, status: 404, error: 'portfolio_not_found' }
  }
  if (!card) {
    return { ok: false, status: 404, error: 'card_not_found' }
  }
  if (!canMutateCard(access, portfolio, card)) {
    return { ok: false, status: 403, error: 'workspace_access_denied' }
  }

  const viewer = getViewerContext(access, portfolio)

  const action = body.action ?? 'update'

  if (action === 'update') {
    const updateBody = body as Extract<CardMutationBody, { action?: 'update' }>
    const updates = normalizeUpdates(updateBody.updates)
    if (!updates || Object.keys(updates).length === 0) {
      return { ok: false, status: 400, error: 'missing_card_updates' }
    }

    const nextPortfolio = applyCardUpdates(
      portfolio,
      state.settings,
      cardId,
      updates,
      normalizeActor(updateBody.actor, access, portfolio),
      normalizeTimestamp(updateBody.timestamp),
      viewer,
    )
    if (nextPortfolio === portfolio) {
      return { ok: false, status: 403, error: 'card_update_not_allowed' }
    }

    return { ok: true, state: replacePortfolio(state, nextPortfolio) }
  }

  if (action === 'move') {
    const moveBody = body as Extract<CardMutationBody, { action: 'move' }>
    const destinationStage =
      typeof moveBody.destinationStage === 'string' && (STAGES as readonly string[]).includes(moveBody.destinationStage)
        ? (moveBody.destinationStage as StageId)
        : null
    const destinationOwner =
      typeof moveBody.destinationOwner === 'string'
        ? moveBody.destinationOwner.trim() || null
        : moveBody.destinationOwner === null
          ? null
          : undefined
    const destinationIndex = Number(moveBody.destinationIndex)
    if (!destinationStage || destinationOwner === undefined || !Number.isFinite(destinationIndex)) {
      return { ok: false, status: 400, error: 'invalid_move_target' }
    }

    const validationMessage = getCardMoveValidationMessage(
      portfolio,
      viewer,
      cardId,
      destinationStage,
      destinationOwner,
    )
    if (validationMessage) {
      return { ok: false, status: 403, error: validationMessage }
    }

    const revisionEstimatedHours =
      typeof moveBody.revisionEstimatedHours === 'number' && Number.isFinite(moveBody.revisionEstimatedHours)
        ? moveBody.revisionEstimatedHours
        : moveBody.revisionEstimatedHours === null
          ? null
          : undefined
    const nextPortfolio = moveCardInPortfolio(
      portfolio,
      cardId,
      destinationStage,
      destinationOwner,
      Math.max(0, Math.floor(destinationIndex)),
      normalizeTimestamp(moveBody.movedAt),
      normalizeActor(moveBody.actor, access, portfolio),
      viewer,
      typeof moveBody.revisionReason === 'string' ? moveBody.revisionReason : undefined,
      revisionEstimatedHours,
      typeof moveBody.revisionFeedback === 'string' ? moveBody.revisionFeedback : undefined,
      state.settings,
    )
    if (nextPortfolio === portfolio) {
      return { ok: false, status: 403, error: 'card_move_not_allowed' }
    }

    return { ok: true, state: replacePortfolio(state, nextPortfolio) }
  }

  if (action === 'set-priority') {
    const priorityBody = body as Extract<CardMutationBody, { action: 'set-priority' }>
    const priority = Number(priorityBody.priority)
    if (priority !== 1 && priority !== 2 && priority !== 3) {
      return { ok: false, status: 400, error: 'invalid_priority' }
    }
    if (access.role_mode === 'contributor' && card.owner !== viewer.editorName) {
      return { ok: false, status: 403, error: 'workspace_access_denied' }
    }

    const nextPortfolio = setInProductionCardPriority(portfolio, cardId, priority as Exclude<CardPriority, null>)
    if (nextPortfolio === portfolio) {
      return { ok: false, status: 403, error: 'priority_update_not_allowed' }
    }

    return { ok: true, state: replacePortfolio(state, nextPortfolio) }
  }

  if (action === 'start-timer') {
    const timerBody = body as Extract<CardMutationBody, { action: 'start-timer' }>
    if (
      access.role_mode === 'contributor' &&
      (!viewer.editorName ||
        card.owner !== viewer.editorName ||
        card.stage !== 'In Production' ||
        card.editorTimer !== null ||
        isThaiEditingPortfolio(portfolio))
    ) {
      return { ok: false, status: 403, error: 'timer_start_not_allowed' }
    }

    const nextPortfolio = startEditorTimerForCard(portfolio, cardId, normalizeTimestamp(timerBody.startedAt))
    if (nextPortfolio === portfolio) {
      return { ok: false, status: 403, error: 'timer_start_not_allowed' }
    }

    return { ok: true, state: replacePortfolio(state, nextPortfolio) }
  }

  return { ok: false, status: 400, error: 'unknown_card_action' }
}

async function mutateCardWithRetry(body: CardMutationBody, access: WorkspaceAccessRow): Promise<CardMutationResult> {
  let latestConflict = false

  for (let attempt = 0; attempt < 3; attempt += 1) {
    const row = await getWorkspaceStateRow()
    if (!row) {
      return { ok: false as const, status: 404, error: 'workspace_state_not_found' }
    }

    const currentState = coerceAppState(row.state)
    const mutation = applyCardMutation(currentState, body, access)
    if (mutation.ok === false) {
      return {
        ok: false,
        status: mutation.status,
        error: mutation.error,
      }
    }

    const patched = await patchWorkspaceState(row.updated_at, mutation.state)
    if (patched?.updated_at) {
      return {
        ok: true as const,
        updatedAt: patched.updated_at,
        state: mutation.state,
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

    const body = (await readJsonBody(req)) as CardMutationBody | null
    if (!body || typeof body !== 'object') {
      return sendJson(res, { success: false, error: 'invalid_card_mutation' }, 400)
    }

    const access = await getAccessRow(user.email)
    if (!access) {
      return sendJson(res, { success: false, error: 'workspace_access_missing' }, 403)
    }

    const result = await mutateCardWithRetry(body, access)
    if (result.ok === false) {
      return sendJson(res, { success: false, error: result.error }, result.status)
    }

    return sendJson(res, {
      success: true,
      updatedAt: result.updatedAt,
      state: result.state,
      retried: result.retried,
    })
  } catch (error) {
    return sendJson(
      res,
      {
        success: false,
        error: error instanceof Error ? error.message : 'workspace_card_mutation_failed',
      },
      500,
    )
  }
}
