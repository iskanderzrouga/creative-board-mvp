import { createHash } from 'node:crypto'

type HandlerRequest = Request | {
  method?: string
  body?: unknown
  headers?: Record<string, string | string[] | undefined>
}

const COMMENT_IMAGE_BUCKET = 'editors-board-brief-images'
const DATA_IMAGE_URL_RE = /^data:image\/([a-z0-9.+-]+);base64,([\s\S]+)$/i
const MAX_COMMENT_IMAGES = 5
const MAX_COMMENT_IMAGE_BYTES = 8 * 1024 * 1024
const ALLOWED_COMMENT_IMAGE_MIME = new Set(['image/jpeg', 'image/jpg', 'image/png', 'image/gif', 'image/webp'])
const COMMENT_IMAGE_INPUT_ERRORS = new Set([
  'unsupported_comment_image_type',
  'unsupported_comment_image_url',
  'empty_comment_image',
  'comment_image_too_large',
  'too_many_comment_images',
])

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
  name?: unknown
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
  comments?: unknown
  [key: string]: unknown
}

interface CommentEntry {
  id?: string
  author: string
  text: string
  timestamp: string
  editedAt?: string
  imageUrls?: string[]
  imageDataUrl?: string
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

function getStoragePublicUrl(path: string) {
  const supabaseUrl = getSupabaseUrl()
  if (!supabaseUrl) {
    throw new Error('supabase_url_missing')
  }

  return `${supabaseUrl}/storage/v1/object/public/${COMMENT_IMAGE_BUCKET}/${path}`
}

function getStorageUploadUrl(path: string) {
  const supabaseUrl = getSupabaseUrl()
  if (!supabaseUrl) {
    throw new Error('supabase_url_missing')
  }

  return `${supabaseUrl}/storage/v1/object/${COMMENT_IMAGE_BUCKET}/${path}`
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

function getComments(card: CardState) {
  return Array.isArray(card.comments)
    ? card.comments.filter((comment): comment is CommentEntry => {
        if (!comment || typeof comment !== 'object') {
          return false
        }
        const entry = comment as Partial<CommentEntry>
        return (
          typeof entry.author === 'string' &&
          typeof entry.text === 'string' &&
          typeof entry.timestamp === 'string'
        )
      })
    : []
}

function contributorCanAccessCard(access: WorkspaceAccessRow, portfolio: PortfolioState, card: CardState) {
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

function canCommentOnCard(access: WorkspaceAccessRow, portfolio: PortfolioState, card: CardState) {
  if (access.role_mode === 'owner' || access.role_mode === 'manager') {
    return managerCanAccessCard(access, getString(portfolio.id), getString(card.brand))
  }

  if (access.role_mode === 'contributor') {
    return contributorCanAccessCard(access, portfolio, card)
  }

  return false
}

function getCommentMergeKey(comment: CommentEntry) {
  const id = comment.id?.trim()
  if (id) {
    return JSON.stringify(['id', id])
  }

  return JSON.stringify([
    comment.author.trim(),
    comment.text.trim(),
    comment.timestamp,
  ])
}

function getLegacyCommentMergeKey(comment: CommentEntry) {
  return JSON.stringify([
    comment.author.trim(),
    comment.text.trim(),
    comment.timestamp,
  ])
}

function getCommentTargetKey(commentId: string, commentKey: string, comment: CommentEntry | null) {
  if (commentId.trim()) {
    return JSON.stringify(['id', commentId.trim()])
  }

  if (commentKey.trim()) {
    return commentKey.trim()
  }

  return comment ? getCommentMergeKey(comment) : ''
}

function commentMatchesKey(comment: CommentEntry, targetKey: string) {
  if (!targetKey) {
    return false
  }

  return getCommentMergeKey(comment) === targetKey || getLegacyCommentMergeKey(comment) === targetKey
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
  if (!ALLOWED_COMMENT_IMAGE_MIME.has(mime)) {
    throw new Error('unsupported_comment_image_type')
  }

  const base64 = match[2].replace(/\s+/g, '')
  const buffer = Buffer.from(base64, 'base64')
  if (buffer.length <= 0) {
    throw new Error('empty_comment_image')
  }
  if (buffer.length > MAX_COMMENT_IMAGE_BYTES) {
    throw new Error('comment_image_too_large')
  }

  const sha256 = createHash('sha256').update(buffer).digest('hex')

  return {
    mime,
    buffer,
    sha256,
    extension: extensionForMime(mime),
  }
}

async function uploadCommentImage(portfolioId: string, cardId: string, dataUrl: string) {
  const parsed = parseDataImageUrl(dataUrl)
  if (!parsed) {
    return dataUrl
  }

  const serviceKey = getSupabaseServiceKey()
  if (!serviceKey) {
    throw new Error('supabase_service_role_key_missing')
  }

  const objectPath = [
    `workspace-${sanitizePathPart(getWorkspaceId())}`,
    sanitizePathPart(portfolioId),
    sanitizePathPart(cardId),
    `comment-image-${parsed.sha256.slice(0, 16)}.${parsed.extension}`,
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
    throw new Error(`comment_image_upload_failed:${await response.text()}`)
  }

  return getStoragePublicUrl(objectPath)
}

function isAllowedStoredImageUrl(value: string) {
  try {
    const url = new URL(value)
    return url.protocol === 'http:' || url.protocol === 'https:'
  } catch {
    return false
  }
}

async function normalizeCommentImages(portfolioId: string, cardId: string, comment: CommentEntry) {
  const hasImageUrls = Array.isArray(comment.imageUrls)
  const rawImageUrls = hasImageUrls ? comment.imageUrls ?? [] : []
  const sources = [
    ...rawImageUrls,
    ...(comment.imageDataUrl ? [comment.imageDataUrl] : []),
  ]
    .map((value) => value.trim())
    .filter(Boolean)

  if (sources.length > MAX_COMMENT_IMAGES) {
    throw new Error('too_many_comment_images')
  }

  const imageUrls: string[] = []
  for (const source of sources) {
    const nextUrl = DATA_IMAGE_URL_RE.test(source)
      ? await uploadCommentImage(portfolioId, cardId, source)
      : source
    if (!DATA_IMAGE_URL_RE.test(source) && !isAllowedStoredImageUrl(nextUrl)) {
      throw new Error('unsupported_comment_image_url')
    }
    if (!imageUrls.includes(nextUrl)) {
      imageUrls.push(nextUrl)
    }
  }

  const rest = { ...comment }
  delete rest.imageDataUrl
  delete rest.imageUrls
  return {
    ...rest,
    ...(hasImageUrls || imageUrls.length > 0 ? { imageUrls } : {}),
  }
}

function normalizeComment(value: unknown): CommentEntry | null {
  if (!value || typeof value !== 'object') {
    return null
  }

  const comment = value as Partial<CommentEntry>
  const id = typeof comment.id === 'string' ? comment.id.trim() : ''
  const author = typeof comment.author === 'string' ? comment.author.trim() : ''
  const text = typeof comment.text === 'string' ? comment.text.trim() : ''
  const timestamp = typeof comment.timestamp === 'string' ? comment.timestamp.trim() : ''
  const editedAt = typeof comment.editedAt === 'string' ? comment.editedAt.trim() : ''
  const hasImageUrls = Array.isArray(comment.imageUrls)
  const rawImageUrls = hasImageUrls ? comment.imageUrls ?? [] : []
  const imageUrls = rawImageUrls
    .filter((imageUrl): imageUrl is string => typeof imageUrl === 'string')
    .map((imageUrl) => imageUrl.trim())
    .filter(Boolean)
  const imageDataUrl = typeof comment.imageDataUrl === 'string' ? comment.imageDataUrl : undefined

  if (imageUrls.length > MAX_COMMENT_IMAGES) {
    return null
  }

  if (!author || !timestamp || (!text && imageUrls.length === 0 && !imageDataUrl)) {
    return null
  }

  return {
    ...(id ? { id } : {}),
    author,
    text,
    timestamp,
    ...(editedAt ? { editedAt } : {}),
    ...(hasImageUrls ? { imageUrls } : {}),
    ...(imageDataUrl ? { imageDataUrl } : {}),
  }
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

function addCommentToState(state: WorkspaceState, portfolioId: string, cardId: string, comment: CommentEntry) {
  const portfolios = getPortfolios(state)
  const portfolio = portfolios.find((item) => getString(item.id) === portfolioId) ?? null

  if (!portfolio) {
    return { nextState: state, portfolio: null, card: null, added: false }
  }

  const cards = getCards(portfolio)
  const card = cards.find((item) => getString(item.id) === cardId) ?? null

  if (!card) {
    return { nextState: state, portfolio, card: null, added: false }
  }

  const comments = getComments(card)
  const commentKey = getCommentMergeKey(comment)
  const nextComments = comments.some((entry) => getCommentMergeKey(entry) === commentKey)
    ? comments
    : [...comments, comment]
  const nextCard = {
    ...card,
    comments: nextComments,
    updatedAt: comment.timestamp,
  }
  const nextPortfolio = {
    ...portfolio,
    cards: cards.map((item) => (getString(item.id) === cardId ? nextCard : item)),
  }

  return {
    nextState: {
      ...state,
      portfolios: portfolios.map((item) => (getString(item.id) === portfolioId ? nextPortfolio : item)),
    },
    portfolio,
    card,
    added: nextComments.length > comments.length,
  }
}

function canMutateExistingComment(access: WorkspaceAccessRow, portfolio: PortfolioState, comment: CommentEntry) {
  if (access.role_mode === 'owner' || access.role_mode === 'manager') {
    return true
  }

  if (access.role_mode !== 'contributor') {
    return false
  }

  const author = normalizeIdentity(comment.author)
  const editorName = normalizeIdentity(access.editor_name)
  if (editorName && author === editorName) {
    return true
  }

  const accessEmail = normalizeIdentity(access.email)
  if (accessEmail && author === accessEmail) {
    return true
  }

  return getTeam(portfolio).some((member) => {
    const memberEmail = normalizeIdentity(getString(member.accessEmail))
    const memberName = normalizeIdentity(getString(member.name))
    return memberEmail === accessEmail && normalizeIdentity(memberName) === author
  })
}

function replaceCommentImages(comment: CommentEntry, imageUrls: string[] | undefined) {
  const nextComment = { ...comment }
  delete nextComment.imageDataUrl
  delete nextComment.imageUrls
  return {
    ...nextComment,
    ...(imageUrls ? { imageUrls } : {}),
  }
}

function editCommentInState(
  state: WorkspaceState,
  portfolioId: string,
  cardId: string,
  targetKey: string,
  incomingComment: CommentEntry,
  access: WorkspaceAccessRow,
) {
  const portfolios = getPortfolios(state)
  const portfolio = portfolios.find((item) => getString(item.id) === portfolioId) ?? null

  if (!portfolio) {
    return { nextState: state, portfolio: null, card: null, edited: false, forbidden: false }
  }

  const cards = getCards(portfolio)
  const card = cards.find((item) => getString(item.id) === cardId) ?? null

  if (!card) {
    return { nextState: state, portfolio, card: null, edited: false, forbidden: false }
  }

  const comments = getComments(card)
  const commentIndex = comments.findIndex((entry) => commentMatchesKey(entry, targetKey))
  if (commentIndex === -1) {
    return { nextState: state, portfolio, card, edited: false, forbidden: false }
  }

  const existingComment = comments[commentIndex]!
  if (!canMutateExistingComment(access, portfolio, existingComment)) {
    return { nextState: state, portfolio, card, edited: false, forbidden: true }
  }

  const editedAt = incomingComment.editedAt || new Date().toISOString()
  const baseEditedComment = {
    ...existingComment,
    id: existingComment.id ?? incomingComment.id,
    text: incomingComment.text.trim(),
    editedAt,
  }
  const editedComment = Array.isArray(incomingComment.imageUrls)
    ? replaceCommentImages(baseEditedComment, incomingComment.imageUrls)
    : baseEditedComment
  const nextComments = comments.map((entry, index) => (index === commentIndex ? editedComment : entry))
  const nextCard = {
    ...card,
    comments: nextComments,
    updatedAt: editedAt,
  }
  const nextPortfolio = {
    ...portfolio,
    cards: cards.map((item) => (getString(item.id) === cardId ? nextCard : item)),
  }

  return {
    nextState: {
      ...state,
      portfolios: portfolios.map((item) => (getString(item.id) === portfolioId ? nextPortfolio : item)),
    },
    portfolio,
    card,
    edited: true,
    forbidden: false,
  }
}

function deleteCommentFromState(
  state: WorkspaceState,
  portfolioId: string,
  cardId: string,
  targetKey: string,
  access: WorkspaceAccessRow,
) {
  const portfolios = getPortfolios(state)
  const portfolio = portfolios.find((item) => getString(item.id) === portfolioId) ?? null

  if (!portfolio) {
    return { nextState: state, portfolio: null, card: null, deleted: false, forbidden: false }
  }

  const cards = getCards(portfolio)
  const card = cards.find((item) => getString(item.id) === cardId) ?? null

  if (!card) {
    return { nextState: state, portfolio, card: null, deleted: false, forbidden: false }
  }

  const comments = getComments(card)
  const comment = comments.find((entry) => commentMatchesKey(entry, targetKey)) ?? null
  if (!comment) {
    return { nextState: state, portfolio, card, deleted: false, forbidden: false }
  }

  if (!canMutateExistingComment(access, portfolio, comment)) {
    return { nextState: state, portfolio, card, deleted: false, forbidden: true }
  }

  const updatedAt = new Date().toISOString()
  const nextCard = {
    ...card,
    comments: comments.filter((entry) => !commentMatchesKey(entry, targetKey)),
    updatedAt,
  }
  const nextPortfolio = {
    ...portfolio,
    cards: cards.map((item) => (getString(item.id) === cardId ? nextCard : item)),
  }

  return {
    nextState: {
      ...state,
      portfolios: portfolios.map((item) => (getString(item.id) === portfolioId ? nextPortfolio : item)),
    },
    portfolio,
    card,
    deleted: nextCard.comments.length < comments.length,
    forbidden: false,
  }
}

async function mutateCommentWithRetry(
  action: 'add' | 'edit' | 'delete',
  portfolioId: string,
  cardId: string,
  comment: CommentEntry | null,
  targetKey: string,
  access: WorkspaceAccessRow,
) {
  let latestConflict = false
  let commentForSave = comment

  for (let attempt = 0; attempt < 3; attempt += 1) {
    const row = await getWorkspaceStateRow()
    if (!row) {
      return { ok: false as const, status: 404, error: 'workspace_state_not_found' }
    }

    if (getDeletedCardIds(row.state).includes(cardId)) {
      return { ok: false as const, status: 404, error: 'card_deleted' }
    }

    const precheckComment =
      commentForSave ?? {
        author: '',
        text: '',
        timestamp: new Date().toISOString(),
      }
    const precheck = addCommentToState(row.state, portfolioId, cardId, precheckComment)
    if (!precheck.portfolio) {
      return { ok: false as const, status: 404, error: 'portfolio_not_found' }
    }
    if (!precheck.card) {
      return { ok: false as const, status: 404, error: 'card_not_found' }
    }
    if (!canCommentOnCard(access, precheck.portfolio, precheck.card)) {
      return { ok: false as const, status: 403, error: 'workspace_access_denied' }
    }

    if (action === 'add' && commentForSave) {
      commentForSave = await normalizeCommentImages(portfolioId, cardId, commentForSave)
    }
    if (action === 'edit' && commentForSave) {
      commentForSave = await normalizeCommentImages(portfolioId, cardId, commentForSave)
    }

    const next =
      action === 'add' && commentForSave
        ? addCommentToState(row.state, portfolioId, cardId, commentForSave)
        : action === 'edit' && commentForSave
          ? editCommentInState(row.state, portfolioId, cardId, targetKey, commentForSave, access)
          : deleteCommentFromState(row.state, portfolioId, cardId, targetKey, access)

    if ('forbidden' in next && next.forbidden) {
      return { ok: false as const, status: 403, error: 'comment_access_denied' }
    }

    if (action === 'edit' && 'edited' in next && !next.edited) {
      return { ok: false as const, status: 404, error: 'comment_not_found' }
    }

    if (action === 'delete' && 'deleted' in next && !next.deleted) {
      return { ok: false as const, status: 404, error: 'comment_not_found' }
    }

    const patched = await patchWorkspaceState(row.updated_at, next.nextState)
    if (patched?.updated_at) {
      return {
        ok: true as const,
        updatedAt: patched.updated_at,
        state: next.nextState,
        added: 'added' in next ? next.added : false,
        edited: 'edited' in next ? next.edited : false,
        deleted: 'deleted' in next ? next.deleted : false,
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

    const body = (await readJsonBody(req)) as {
      action?: unknown
      portfolioId?: unknown
      cardId?: unknown
      comment?: unknown
      commentId?: unknown
      commentKey?: unknown
    } | null
    const action = body?.action === 'edit' || body?.action === 'delete' ? body.action : 'add'
    const portfolioId = typeof body?.portfolioId === 'string' ? body.portfolioId.trim() : ''
    const cardId = typeof body?.cardId === 'string' ? body.cardId.trim() : ''
    const commentId = typeof body?.commentId === 'string' ? body.commentId.trim() : ''
    const commentKey = typeof body?.commentKey === 'string' ? body.commentKey.trim() : ''
    const comment = normalizeComment(body?.comment)

    if (!portfolioId || !cardId || (action !== 'delete' && !comment)) {
      return sendJson(res, { success: false, error: 'missing_comment_target' }, 400)
    }

    const targetKey = getCommentTargetKey(commentId, commentKey, comment)
    if ((action === 'edit' || action === 'delete') && !targetKey) {
      return sendJson(res, { success: false, error: 'missing_comment_target' }, 400)
    }

    const access = await getAccessRow(user.email)
    if (!access) {
      return sendJson(res, { success: false, error: 'workspace_access_missing' }, 403)
    }

    const result = await mutateCommentWithRetry(action, portfolioId, cardId, comment, targetKey, access)
    if (!result.ok) {
      return sendJson(res, { success: false, error: result.error }, result.status)
    }

    return sendJson(res, {
      success: true,
      portfolioId,
      cardId,
      updatedAt: result.updatedAt,
      state: result.state,
      added: result.added,
      edited: result.edited,
      deleted: result.deleted,
      retried: result.retried,
    })
  } catch (error) {
    const message = error instanceof Error ? error.message : 'workspace_comment_failed'
    return sendJson(
      res,
      {
        success: false,
        error: message,
      },
      COMMENT_IMAGE_INPUT_ERRORS.has(message) ? 400 : 500,
    )
  }
}
