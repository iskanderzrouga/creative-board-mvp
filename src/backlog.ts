export const BACKLOG_STORAGE_KEY = 'backlog-state'
export const BACKLOG_SYNC_METADATA_KEY = 'backlog-sync-metadata'

export interface BacklogSyncMetadata {
  lastSyncedAt: string | null
  pendingRemoteBaseUpdatedAt: string | null
  pendingRemoteSignature: string | null
}

export const BACKLOG_TASK_TYPES = ['creative', 'dev-cro', 'operations'] as const
export type BacklogTaskType = (typeof BACKLOG_TASK_TYPES)[number]

export const BACKLOG_COLUMN_DEFINITIONS = [
  { id: 'new-idea', label: 'New Idea' },
  { id: 'under-review', label: 'Under Review' },
  { id: 'prioritized', label: 'Prioritized' },
  { id: 'moved-to-production', label: 'Moved to Production' },
  { id: 'ops-priority', label: 'Ops Priority' },
] as const
export type BacklogColumnId = (typeof BACKLOG_COLUMN_DEFINITIONS)[number]['id']

export const OPS_PRIORITY_SUB_STAGES = [
  { id: 'todo', label: 'To Do' },
  { id: 'in-progress', label: 'In Progress' },
  { id: 'done', label: 'Done' },
] as const
export type OpsSubStage = (typeof OPS_PRIORITY_SUB_STAGES)[number]['id']

export interface BacklogCard {
  id: string
  name: string
  description: string
  hypothesis: string
  taskType: BacklogTaskType
  brand: string
  addedBy: string
  dateAdded: string
  updatedAt: string
  column: BacklogColumnId
  opsSubStage?: OpsSubStage
  productionTaskType?: string
  brief?: string
  targetAudience?: string
  keyMessage?: string
  visualDirection?: string
  platform?: string
  funnelStage?: string
  angleTheme?: string
  cta?: string
  referenceLinks?: string
  adCopy?: string
  notes?: string
  taskDescription?: string
  linkForTest?: string
  linkForChanges?: string
}

export interface BacklogDeletedCard {
  cardId: string
  deletedAt: string
}

export interface BacklogState {
  cards: BacklogCard[]
  lastCardNumber: number
  deletedCards: BacklogDeletedCard[]
}

const CREATIVE_PRODUCTION_REQUIRED_FIELDS: Array<{ key: keyof BacklogCard; label: string }> = [
  { key: 'productionTaskType', label: 'Production Task Type' },
  { key: 'brief', label: 'Brief' },
  { key: 'targetAudience', label: 'Target Audience' },
  { key: 'visualDirection', label: 'Visual Direction' },
  { key: 'platform', label: 'Platform' },
  { key: 'funnelStage', label: 'Funnel Stage' },
  { key: 'angleTheme', label: 'Angle / Theme' },
  { key: 'cta', label: 'CTA' },
  { key: 'referenceLinks', label: 'Reference Links' },
]

const DEV_CRO_PRODUCTION_REQUIRED_FIELDS: Array<{ key: keyof BacklogCard; label: string }> = [
  { key: 'productionTaskType', label: 'Production Task Type' },
  { key: 'taskDescription', label: 'Task Description' },
  { key: 'linkForTest', label: 'Link for Test' },
  { key: 'linkForChanges', label: 'Link for Changes' },
]

interface AddBacklogCardInput {
  name: string
  taskType: BacklogTaskType
  brand: string
  addedBy: string
  dateAdded?: string
}

function hasBrowser() {
  return typeof window !== 'undefined'
}

function isBacklogTaskType(value: unknown): value is BacklogTaskType {
  return typeof value === 'string' && BACKLOG_TASK_TYPES.includes(value as BacklogTaskType)
}

function isBacklogColumnId(value: unknown): value is BacklogColumnId {
  return (
    typeof value === 'string' &&
    BACKLOG_COLUMN_DEFINITIONS.some((column) => column.id === value)
  )
}

function isOpsSubStage(value: unknown): value is OpsSubStage {
  return typeof value === 'string' && OPS_PRIORITY_SUB_STAGES.some((stage) => stage.id === value)
}

function normalizeOptionalString(value: unknown) {
  return typeof value === 'string' ? value : undefined
}

function normalizeTimestamp(value: unknown, fallback: string) {
  if (typeof value !== 'string') {
    return fallback
  }

  return Number.isFinite(Date.parse(value)) ? value : fallback
}

function getBacklogCardFallbackUpdatedAt(record: Record<string, unknown>) {
  return normalizeTimestamp(record.updatedAt, normalizeTimestamp(record.dateAdded, new Date().toISOString()))
}

function hasNonEmptyValue(value: string | undefined) {
  return Boolean(value?.trim())
}

function coerceBacklogCard(candidate: unknown): BacklogCard | null {
  if (!candidate || typeof candidate !== 'object') {
    return null
  }

  const record = candidate as Record<string, unknown>
  if (
    typeof record.id !== 'string' ||
    typeof record.name !== 'string' ||
    typeof record.description !== 'string' ||
    typeof record.hypothesis !== 'string' ||
    !isBacklogTaskType(record.taskType) ||
    typeof record.brand !== 'string' ||
    typeof record.addedBy !== 'string' ||
    typeof record.dateAdded !== 'string' ||
    !isBacklogColumnId(record.column)
  ) {
    return null
  }

  const opsSubStage = isOpsSubStage(record.opsSubStage)
    ? record.opsSubStage
    : record.column === 'ops-priority'
      ? 'todo'
      : undefined

  return {
    id: record.id,
    name: record.name,
    description: record.description,
    hypothesis: record.hypothesis,
    taskType: record.taskType,
    brand: record.brand,
    addedBy: record.addedBy,
    dateAdded: record.dateAdded,
    updatedAt: getBacklogCardFallbackUpdatedAt(record),
    column: record.column,
    opsSubStage,
    productionTaskType: normalizeOptionalString(record.productionTaskType),
    brief: normalizeOptionalString(record.brief),
    targetAudience: normalizeOptionalString(record.targetAudience),
    keyMessage: normalizeOptionalString(record.keyMessage),
    visualDirection: normalizeOptionalString(record.visualDirection),
    platform: normalizeOptionalString(record.platform),
    funnelStage: normalizeOptionalString(record.funnelStage),
    angleTheme: normalizeOptionalString(record.angleTheme),
    cta: normalizeOptionalString(record.cta),
    referenceLinks: normalizeOptionalString(record.referenceLinks),
    adCopy: normalizeOptionalString(record.adCopy),
    notes: normalizeOptionalString(record.notes),
    taskDescription: normalizeOptionalString(record.taskDescription),
    linkForTest: normalizeOptionalString(record.linkForTest),
    linkForChanges: normalizeOptionalString(record.linkForChanges),
  }
}

function coerceBacklogDeletedCard(candidate: unknown): BacklogDeletedCard | null {
  if (!candidate || typeof candidate !== 'object') {
    return null
  }

  const record = candidate as Record<string, unknown>
  if (typeof record.cardId !== 'string' || typeof record.deletedAt !== 'string') {
    return null
  }

  if (!Number.isFinite(Date.parse(record.deletedAt))) {
    return null
  }

  return {
    cardId: record.cardId,
    deletedAt: record.deletedAt,
  }
}

function dedupeDeletedCards(deletedCards: BacklogDeletedCard[]) {
  const byCardId = new Map<string, BacklogDeletedCard>()

  for (const deletedCard of deletedCards) {
    const existing = byCardId.get(deletedCard.cardId)
    if (!existing || Date.parse(deletedCard.deletedAt) >= Date.parse(existing.deletedAt)) {
      byCardId.set(deletedCard.cardId, deletedCard)
    }
  }

  return Array.from(byCardId.values())
}

export function coerceBacklogState(candidate: unknown): BacklogState {
  if (!candidate || typeof candidate !== 'object') {
    return createBacklogSeedState()
  }

  const record = candidate as Record<string, unknown>
  const cards = Array.isArray(record.cards)
    ? record.cards.map((card) => coerceBacklogCard(card)).filter((card): card is BacklogCard => card !== null)
    : []
  const deletedCards = Array.isArray(record.deletedCards)
    ? dedupeDeletedCards(
        record.deletedCards
          .map((deletedCard) => coerceBacklogDeletedCard(deletedCard))
          .filter((deletedCard): deletedCard is BacklogDeletedCard => deletedCard !== null),
      )
    : []
  const highestCardNumber = cards.reduce((highest, card) => {
    const numericPart = Number(card.id.replace('BL', ''))
    return Number.isFinite(numericPart) ? Math.max(highest, numericPart) : highest
  }, 0)
  const lastCardNumber =
    typeof record.lastCardNumber === 'number' && Number.isFinite(record.lastCardNumber)
      ? Math.max(record.lastCardNumber, highestCardNumber)
      : highestCardNumber

  return {
    cards,
    lastCardNumber,
    deletedCards,
  }
}

export function getBacklogCardUpdatedAt(card: BacklogCard) {
  const updatedAt = Date.parse(card.updatedAt)
  if (Number.isFinite(updatedAt)) {
    return updatedAt
  }

  const dateAdded = Date.parse(card.dateAdded)
  return Number.isFinite(dateAdded) ? dateAdded : 0
}

function getNextBacklogCardId(state: BacklogState) {
  return `BL${String(state.lastCardNumber + 1).padStart(4, '0')}`
}

export function createBacklogSeedState(): BacklogState {
  return {
    cards: [],
    lastCardNumber: 0,
    deletedCards: [],
  }
}

export function loadBacklogState() {
  return createBacklogSeedState()
}

export function persistBacklogState(state: BacklogState) {
  void state
}

export function addBacklogCard(state: BacklogState, input: AddBacklogCardInput): BacklogState {
  const createdAt = input.dateAdded ?? new Date().toISOString()
  const nextCard: BacklogCard = {
    id: getNextBacklogCardId(state),
    name: input.name.trim(),
    description: '',
    hypothesis: '',
    taskType: input.taskType,
    brand: input.brand,
    addedBy: input.addedBy,
    dateAdded: createdAt,
    updatedAt: createdAt,
    column: 'new-idea',
    productionTaskType: undefined,
  }

  return {
    cards: [...state.cards, nextCard],
    lastCardNumber: state.lastCardNumber + 1,
    deletedCards: state.deletedCards,
  }
}

export function moveBacklogCard(
  state: BacklogState,
  cardId: string,
  column: BacklogColumnId,
  opsSubStage?: OpsSubStage,
) {
  const cardIndex = state.cards.findIndex((card) => card.id === cardId)
  if (cardIndex === -1) {
    return state
  }

  const card = state.cards[cardIndex]
  const remainingCards = state.cards.filter((existingCard) => existingCard.id !== cardId)
  const movedCard: BacklogCard = {
    ...card,
    column,
    opsSubStage: column === 'ops-priority' ? opsSubStage ?? card.opsSubStage ?? 'todo' : undefined,
    updatedAt: new Date().toISOString(),
  }

  return {
    ...state,
    cards: [...remainingCards, movedCard],
  }
}

export function updateBacklogCard(state: BacklogState, cardId: string, updates: Partial<BacklogCard>) {
  let changed = false

  const cards = state.cards.map((card) => {
    if (card.id !== cardId) {
      return card
    }

    changed = true
    const nextColumn = updates.column ?? card.column
    return {
      ...card,
      ...updates,
      opsSubStage:
        nextColumn === 'ops-priority'
          ? updates.opsSubStage ?? card.opsSubStage ?? 'todo'
          : undefined,
      updatedAt: updates.updatedAt ?? new Date().toISOString(),
    }
  })

  return changed
    ? {
        ...state,
        cards,
      }
    : state
}

export function deleteBacklogCard(state: BacklogState, cardId: string) {
  const deletedAt = new Date().toISOString()
  const cards = state.cards.filter((card) => card.id !== cardId)
  return cards.length === state.cards.length
    ? state
    : {
        ...state,
        cards,
        deletedCards: dedupeDeletedCards([...state.deletedCards, { cardId, deletedAt }]),
      }
}

export function getBacklogMissingProductionFields(card: BacklogCard) {
  if (card.taskType === 'creative') {
    return CREATIVE_PRODUCTION_REQUIRED_FIELDS.filter(({ key }) => !hasNonEmptyValue(card[key] as string | undefined)).map(
      ({ label }) => label,
    )
  }

  if (card.taskType === 'dev-cro') {
    return DEV_CRO_PRODUCTION_REQUIRED_FIELDS.filter(({ key }) => !hasNonEmptyValue(card[key] as string | undefined)).map(
      ({ label }) => label,
    )
  }

  return []
}

const EMPTY_BACKLOG_SYNC_METADATA: BacklogSyncMetadata = {
  lastSyncedAt: null,
  pendingRemoteBaseUpdatedAt: null,
  pendingRemoteSignature: null,
}

export function loadBacklogSyncMetadata(): BacklogSyncMetadata {
  if (!hasBrowser()) {
    return EMPTY_BACKLOG_SYNC_METADATA
  }

  try {
    const raw = window.localStorage.getItem(BACKLOG_SYNC_METADATA_KEY)
    if (!raw) {
      return EMPTY_BACKLOG_SYNC_METADATA
    }

    const parsed = JSON.parse(raw) as Partial<BacklogSyncMetadata>
    return {
      lastSyncedAt: typeof parsed.lastSyncedAt === 'string' ? parsed.lastSyncedAt : null,
      pendingRemoteBaseUpdatedAt:
        typeof parsed.pendingRemoteBaseUpdatedAt === 'string' ? parsed.pendingRemoteBaseUpdatedAt : null,
      pendingRemoteSignature:
        typeof parsed.pendingRemoteSignature === 'string' ? parsed.pendingRemoteSignature : null,
    }
  } catch {
    return EMPTY_BACKLOG_SYNC_METADATA
  }
}

export function persistBacklogSyncMetadata(metadata: BacklogSyncMetadata) {
  if (!hasBrowser()) {
    return
  }

  try {
    window.localStorage.setItem(BACKLOG_SYNC_METADATA_KEY, JSON.stringify(metadata))
  } catch {
    console.warn('[storage] Write failed, continuing:', BACKLOG_SYNC_METADATA_KEY)
  }
}
