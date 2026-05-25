import { createHash } from 'node:crypto'

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
  team?: unknown
  cards?: unknown
  [key: string]: unknown
}

interface TeamMemberState {
  name?: unknown
  accessEmail?: unknown
  [key: string]: unknown
}

interface CardState {
  id?: unknown
  brand?: unknown
  owner?: unknown
  [key: string]: unknown
}

interface ScopeAssignment {
  portfolioId: string
  brandNames: string[]
}

const CARD_IMAGE_BUCKET = 'editors-board-brief-images'
const DATA_IMAGE_URL_RE = /^data:image\/([a-z0-9.+-]+);base64,([\s\S]+)$/i
const MAX_CARD_IMAGE_BYTES = 8 * 1024 * 1024
const ALLOWED_IMAGE_MIME = new Set(['image/jpeg', 'image/jpg', 'image/png', 'image/gif', 'image/webp'])
const IMAGE_INPUT_ERRORS = new Set([
  'unsupported_image_type',
  'empty_image_upload',
  'image_too_large',
  'invalid_image_data',
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

function getStorageUploadUrl(path: string) {
  const supabaseUrl = getSupabaseUrl()
  if (!supabaseUrl) {
    throw new Error('supabase_url_missing')
  }

  return `${supabaseUrl}/storage/v1/object/${CARD_IMAGE_BUCKET}/${path}`
}

function getStoragePublicUrl(path: string) {
  const supabaseUrl = getSupabaseUrl()
  if (!supabaseUrl) {
    throw new Error('supabase_url_missing')
  }

  return `${supabaseUrl}/storage/v1/object/public/${CARD_IMAGE_BUCKET}/${path}`
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

function getTeam(portfolio: PortfolioState) {
  return Array.isArray(portfolio.team) ? (portfolio.team as TeamMemberState[]) : []
}

function contributorCanEditCard(access: WorkspaceAccessRow, portfolio: PortfolioState, card: CardState) {
  const owner = normalizeIdentity(getString(card.owner))
  if (!owner) {
    return false
  }

  const editorName = normalizeIdentity(access.editor_name)
  if (editorName && editorName === owner) {
    return true
  }

  const accessEmail = normalizeIdentity(access.email)
  if (!accessEmail) {
    return false
  }

  return getTeam(portfolio).some((member) => {
    const memberEmail = normalizeIdentity(getString(member.accessEmail))
    const memberName = normalizeIdentity(getString(member.name))
    return memberEmail === accessEmail && memberName === owner
  })
}

function managerCanAccessCard(access: WorkspaceAccessRow, portfolioId: string, brandName: string | null) {
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

function canEditCard(access: WorkspaceAccessRow, portfolio: PortfolioState, card: CardState) {
  if (access.role_mode === 'owner' || access.role_mode === 'manager') {
    return managerCanAccessCard(access, getString(portfolio.id), getString(card.brand))
  }

  if (access.role_mode === 'contributor') {
    return contributorCanEditCard(access, portfolio, card)
  }

  return false
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
  const response = await supabaseRest<WorkspaceStateRow[]>(
    `workspace_state?select=state,updated_at&workspace_id=eq.${encodeFilter(getWorkspaceId())}&limit=1`,
  )

  if (!response.ok) {
    throw new Error(`workspace_state_read_failed:${response.raw}`)
  }

  return Array.isArray(response.data) ? response.data[0] ?? null : null
}

function extensionForMime(mime: string) {
  switch (mime) {
    case 'image/jpeg':
    case 'image/jpg':
      return 'jpg'
    case 'image/png':
      return 'png'
    case 'image/gif':
      return 'gif'
    case 'image/webp':
      return 'webp'
    default:
      return 'bin'
  }
}

function sanitizePathPart(value: string) {
  return value.replace(/[^a-zA-Z0-9._-]+/g, '-').replace(/^-+|-+$/g, '') || 'unknown'
}

function parseDataImageUrl(dataUrl: string) {
  const match = dataUrl.match(DATA_IMAGE_URL_RE)
  if (!match) {
    return null
  }

  const mime = `image/${match[1].toLowerCase()}`
  if (!ALLOWED_IMAGE_MIME.has(mime)) {
    throw new Error('unsupported_image_type')
  }

  const base64 = match[2].replace(/\s+/g, '')
  const buffer = Buffer.from(base64, 'base64')
  if (buffer.length <= 0) {
    throw new Error('empty_image_upload')
  }
  if (buffer.length > MAX_CARD_IMAGE_BYTES) {
    throw new Error('image_too_large')
  }

  const sha256 = createHash('sha256').update(buffer).digest('hex')
  return {
    mime,
    buffer,
    sha256,
    extension: extensionForMime(mime),
  }
}

async function uploadImage(portfolioId: string, cardId: string, dataUrl: string, purpose: string) {
  const parsed = parseDataImageUrl(dataUrl)
  if (!parsed) {
    throw new Error('invalid_image_data')
  }

  const serviceKey = getSupabaseServiceKey()
  if (!serviceKey) {
    throw new Error('supabase_service_role_key_missing')
  }

  const objectPath = [
    `workspace-${sanitizePathPart(getWorkspaceId())}`,
    sanitizePathPart(portfolioId),
    sanitizePathPart(cardId),
    `${sanitizePathPart(purpose)}-${Date.now()}-${parsed.sha256.slice(0, 16)}.${parsed.extension}`,
  ].join('/')

  const response = await fetch(getStorageUploadUrl(objectPath), {
    method: 'POST',
    headers: {
      apikey: serviceKey,
      Authorization: `Bearer ${serviceKey}`,
      'Content-Type': parsed.mime,
      'Cache-Control': 'max-age=31536000',
      'x-upsert': 'false',
    },
    body: parsed.buffer,
  })

  if (!response.ok && response.status !== 409) {
    throw new Error(`image_upload_failed:${await response.text()}`)
  }

  return {
    imageUrl: getStoragePublicUrl(objectPath),
    bytes: parsed.buffer.length,
    mime: parsed.mime,
  }
}

async function findEditableCard(portfolioId: string, cardId: string, access: WorkspaceAccessRow) {
  const row = await getWorkspaceStateRow()
  if (!row) {
    return { ok: false as const, status: 404, error: 'workspace_state_not_found' }
  }

  if (getDeletedCardIds(row.state).includes(cardId)) {
    return { ok: false as const, status: 404, error: 'card_deleted' }
  }

  const portfolio = getPortfolios(row.state).find((item) => getString(item.id) === portfolioId) ?? null
  if (!portfolio) {
    return { ok: false as const, status: 404, error: 'portfolio_not_found' }
  }

  const card = getCards(portfolio).find((item) => getString(item.id) === cardId) ?? null
  if (!card) {
    return { ok: false as const, status: 404, error: 'card_not_found' }
  }

  if (!canEditCard(access, portfolio, card)) {
    return { ok: false as const, status: 403, error: 'workspace_access_denied' }
  }

  return { ok: true as const }
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

    const body = (await readJsonBody(req)) as {
      portfolioId?: unknown
      cardId?: unknown
      imageDataUrl?: unknown
      purpose?: unknown
    } | null
    const portfolioId = typeof body?.portfolioId === 'string' ? body.portfolioId.trim() : ''
    const cardId = typeof body?.cardId === 'string' ? body.cardId.trim() : ''
    const imageDataUrl = typeof body?.imageDataUrl === 'string' ? body.imageDataUrl : ''
    const purpose = typeof body?.purpose === 'string' ? body.purpose.trim() : 'brief-image'

    if (!portfolioId || !cardId || !imageDataUrl) {
      return sendJson(res, { success: false, error: 'missing_image_target' }, 400)
    }

    const access = await getAccessRow(user.email)
    if (!access) {
      return sendJson(res, { success: false, error: 'workspace_access_missing' }, 403)
    }

    const editable = await findEditableCard(portfolioId, cardId, access)
    if (!editable.ok) {
      return sendJson(res, { success: false, error: editable.error }, editable.status)
    }

    const uploaded = await uploadImage(portfolioId, cardId, imageDataUrl, purpose)
    return sendJson(res, {
      success: true,
      imageUrl: uploaded.imageUrl,
      bytes: uploaded.bytes,
      mime: uploaded.mime,
    })
  } catch (error) {
    const message = error instanceof Error ? error.message : 'workspace_image_upload_failed'
    return sendJson(
      res,
      {
        success: false,
        error: message,
      },
      IMAGE_INPUT_ERRORS.has(message) ? 400 : 500,
    )
  }
}
