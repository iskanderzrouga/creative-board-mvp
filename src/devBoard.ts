export const DEV_BOARD_STORAGE_KEY = 'dev-board-state'

export const DEV_BOARD_COLUMNS = [
  { id: 'to-brief', label: 'To Brief' },
  { id: 'up-next', label: 'Up Next' },
  { id: 'for-review', label: 'For Review' },
  { id: 'qa-testing', label: 'QA/Testing' },
  { id: 'live', label: 'Live' },
] as const

export type DevBoardColumnId = (typeof DEV_BOARD_COLUMNS)[number]['id']
export type DevPriority = 1 | 2 | 3 | null

export interface DevComment {
  id: string
  text: string
  createdAt: string
  author: string
}

export interface DevActivityEntry {
  id: string
  message: string
  createdAt: string
}

export interface DevBoardCard {
  id: string
  title: string
  brand: string
  taskDescription: string
  linkForTest: string
  linkForChanges: string
  assignedDeveloper: 'Daniel J' | 'Kevin Ma' | null
  priority: DevPriority
  column: DevBoardColumnId
  positionInColumn: number
  statusNotes: string
  comments: DevComment[]
  activity: DevActivityEntry[]
  createdAt: string
  p1AssignedAt: string | null
  p1Deadline: string | null
}

export interface DevBoardState {
  cards: DevBoardCard[]
  lastCardNumber: number
}

interface AddDevBoardCardInput {
  title: string
  brand: string
  taskDescription: string
  linkForTest: string
  linkForChanges: string
}

const DAY_MS = 24 * 60 * 60 * 1000
const WORKING_DAY_MINUTES = 8 * 60

const DEVELOPER_SCHEDULES: Record<'Daniel J' | 'Kevin Ma', { timezone: string; workStartHour: number; workEndHour: number }> = {
  'Daniel J': {
    timezone: 'Asia/Shanghai',
    workStartHour: 9,
    workEndHour: 17,
  },
  'Kevin Ma': {
    timezone: 'Asia/Shanghai',
    workStartHour: 9,
    workEndHour: 17,
  },
}

function hasBrowser() {
  return typeof window !== 'undefined'
}

function createId(prefix: string) {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return `${prefix}-${crypto.randomUUID()}`
  }

  return `${prefix}-${Math.random().toString(36).slice(2, 10)}`
}

function getZonedParts(valueMs: number, timezone: string) {
  const formatter = new Intl.DateTimeFormat('en-US', {
    timeZone: timezone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
    weekday: 'short',
  })

  const parts = formatter.formatToParts(new Date(valueMs))
  const get = (type: Intl.DateTimeFormatPartTypes) => parts.find((part) => part.type === type)?.value ?? ''

  return {
    year: Number(get('year')),
    month: Number(get('month')),
    day: Number(get('day')),
    hour: Number(get('hour')),
    minute: Number(get('minute')),
    weekday: get('weekday'),
  }
}

function getTimezoneOffsetMinutes(timezone: string, valueMs: number) {
  const formatter = new Intl.DateTimeFormat('en-US', {
    timeZone: timezone,
    timeZoneName: 'shortOffset',
    hour: '2-digit',
  })
  const offsetLabel = formatter.formatToParts(new Date(valueMs)).find((part) => part.type === 'timeZoneName')?.value ?? 'GMT+0'
  const match = offsetLabel.match(/GMT([+-])(\d{1,2})(?::?(\d{2}))?/)
  if (!match) {
    return 0
  }
  const sign = match[1] === '-' ? -1 : 1
  const hours = Number(match[2] ?? '0')
  const minutes = Number(match[3] ?? '0')
  return sign * (hours * 60 + minutes)
}

function zonedDateTimeToUtcMs(timezone: string, year: number, month: number, day: number, hour: number, minute: number) {
  const utcMs = Date.UTC(year, month - 1, day, hour, minute)
  const offsetMinutes = getTimezoneOffsetMinutes(timezone, utcMs)
  return utcMs - offsetMinutes * 60 * 1000
}

function getAlignedWorkingStartMs(owner: 'Daniel J' | 'Kevin Ma', referenceMs: number) {
  const schedule = DEVELOPER_SCHEDULES[owner]
  const local = getZonedParts(referenceMs, schedule.timezone)
  const weekday = (local.weekday ?? '').toLowerCase()
  const isWeekend = weekday.startsWith('sat') || weekday.startsWith('sun')

  if (isWeekend) {
    const probe = referenceMs + DAY_MS
    return getAlignedWorkingStartMs(owner, probe)
  }

  if (local.hour < schedule.workStartHour) {
    return zonedDateTimeToUtcMs(schedule.timezone, local.year, local.month, local.day, schedule.workStartHour, 0)
  }

  if (local.hour >= schedule.workEndHour) {
    const nextDay = referenceMs + DAY_MS
    return getAlignedWorkingStartMs(owner, nextDay)
  }

  return referenceMs
}

function addWorkingMinutes(owner: 'Daniel J' | 'Kevin Ma', startMs: number, minutesToAdd: number) {
  const schedule = DEVELOPER_SCHEDULES[owner]
  const dayMinutes = (schedule.workEndHour - schedule.workStartHour) * 60
  let remaining = minutesToAdd
  let cursor = startMs

  while (remaining > 0) {
    const local = getZonedParts(cursor, schedule.timezone)
    const weekday = (local.weekday ?? '').toLowerCase()
    const isWeekend = weekday.startsWith('sat') || weekday.startsWith('sun')
    if (isWeekend) {
      cursor = getAlignedWorkingStartMs(owner, cursor + DAY_MS)
      continue
    }

    const dayStart = zonedDateTimeToUtcMs(schedule.timezone, local.year, local.month, local.day, schedule.workStartHour, 0)
    const dayEnd = zonedDateTimeToUtcMs(schedule.timezone, local.year, local.month, local.day, schedule.workEndHour, 0)

    if (cursor < dayStart) {
      cursor = dayStart
      continue
    }

    if (cursor >= dayEnd) {
      cursor = getAlignedWorkingStartMs(owner, cursor + DAY_MS)
      continue
    }

    const available = Math.min(dayMinutes, Math.floor((dayEnd - cursor) / (60 * 1000)))
    const consumed = Math.min(available, remaining)
    cursor += consumed * 60 * 1000
    remaining -= consumed

    if (remaining > 0) {
      cursor = getAlignedWorkingStartMs(owner, cursor + DAY_MS)
    }
  }

  return cursor
}

function getP1Deadline(assignedDeveloper: 'Daniel J' | 'Kevin Ma', assignedAtIso: string) {
  const alignedStartMs = getAlignedWorkingStartMs(assignedDeveloper, new Date(assignedAtIso).getTime())
  const deadlineMs = addWorkingMinutes(assignedDeveloper, alignedStartMs, WORKING_DAY_MINUTES * 2)
  return new Date(deadlineMs).toISOString()
}

function normalizePriority(value: unknown): DevPriority {
  return value === 1 || value === 2 || value === 3 ? value : null
}

function normalizeColumn(value: unknown): DevBoardColumnId {
  if (typeof value !== 'string') {
    return 'to-brief'
  }

  const match = DEV_BOARD_COLUMNS.find((column) => column.id === value)
  return match?.id ?? 'to-brief'
}

function normalizeAssignedDeveloper(value: unknown): DevBoardCard['assignedDeveloper'] {
  if (value === 'Daniel J' || value === 'Kevin Ma') {
    return value
  }

  return null
}

function coerceCard(value: unknown): DevBoardCard | null {
  if (!value || typeof value !== 'object') {
    return null
  }

  const record = value as Record<string, unknown>
  if (typeof record.id !== 'string' || typeof record.title !== 'string' || typeof record.brand !== 'string') {
    return null
  }

  const comments = Array.isArray(record.comments)
    ? record.comments
        .map((comment) => {
          if (!comment || typeof comment !== 'object') {
            return null
          }
          const entry = comment as Record<string, unknown>
          if (
            typeof entry.id !== 'string' ||
            typeof entry.text !== 'string' ||
            typeof entry.createdAt !== 'string' ||
            typeof entry.author !== 'string'
          ) {
            return null
          }

          return {
            id: entry.id,
            text: entry.text,
            createdAt: entry.createdAt,
            author: entry.author,
          } satisfies DevComment
        })
        .filter((comment): comment is DevComment => comment !== null)
    : []

  const activity = Array.isArray(record.activity)
    ? record.activity
        .map((item) => {
          if (!item || typeof item !== 'object') {
            return null
          }
          const entry = item as Record<string, unknown>
          if (typeof entry.id !== 'string' || typeof entry.message !== 'string' || typeof entry.createdAt !== 'string') {
            return null
          }

          return {
            id: entry.id,
            message: entry.message,
            createdAt: entry.createdAt,
          } satisfies DevActivityEntry
        })
        .filter((entry): entry is DevActivityEntry => entry !== null)
    : []

  return {
    id: record.id,
    title: record.title,
    brand: record.brand,
    taskDescription: typeof record.taskDescription === 'string' ? record.taskDescription : '',
    linkForTest: typeof record.linkForTest === 'string' ? record.linkForTest : '',
    linkForChanges: typeof record.linkForChanges === 'string' ? record.linkForChanges : '',
    assignedDeveloper: normalizeAssignedDeveloper(record.assignedDeveloper),
    priority: normalizePriority(record.priority),
    column: normalizeColumn(record.column),
    positionInColumn: typeof record.positionInColumn === 'number' ? record.positionInColumn : Number.MAX_SAFE_INTEGER,
    statusNotes: typeof record.statusNotes === 'string' ? record.statusNotes : '',
    comments,
    activity,
    createdAt: typeof record.createdAt === 'string' ? record.createdAt : new Date().toISOString(),
    p1AssignedAt: typeof record.p1AssignedAt === 'string' ? record.p1AssignedAt : null,
    p1Deadline: typeof record.p1Deadline === 'string' ? record.p1Deadline : null,
  }
}

function coerceState(value: unknown): DevBoardState {
  if (!value || typeof value !== 'object') {
    return createDevBoardSeedState()
  }

  const record = value as Record<string, unknown>
  const cards = Array.isArray(record.cards)
    ? record.cards.map((item) => coerceCard(item)).filter((item): item is DevBoardCard => item !== null)
    : []

  const highestNumber = cards.reduce((maxValue, card) => {
    const numericPart = Number(card.id.replace('DV', ''))
    return Number.isFinite(numericPart) ? Math.max(maxValue, numericPart) : maxValue
  }, 0)

  const lastCardNumber =
    typeof record.lastCardNumber === 'number' && Number.isFinite(record.lastCardNumber)
      ? Math.max(record.lastCardNumber, highestNumber)
      : highestNumber

  return {
    cards,
    lastCardNumber,
  }
}

function getNextCardId(state: DevBoardState) {
  return `DV${String(state.lastCardNumber + 1).padStart(4, '0')}`
}

export function createDevBoardSeedState(): DevBoardState {
  return {
    cards: [],
    lastCardNumber: 0,
  }
}

export function loadDevBoardState() {
  if (!hasBrowser()) {
    return createDevBoardSeedState()
  }

  try {
    const raw = window.localStorage.getItem(DEV_BOARD_STORAGE_KEY)
    return raw ? coerceState(JSON.parse(raw)) : createDevBoardSeedState()
  } catch {
    return createDevBoardSeedState()
  }
}

export function persistDevBoardState(state: DevBoardState) {
  if (!hasBrowser()) {
    return
  }

  window.localStorage.setItem(DEV_BOARD_STORAGE_KEY, JSON.stringify(state))
}

export function addDevBoardCardFromBacklog(state: DevBoardState, input: AddDevBoardCardInput, actor: string): DevBoardState {
  const createdAt = new Date().toISOString()
  const nextCard: DevBoardCard = {
    id: getNextCardId(state),
    title: input.title.trim(),
    brand: input.brand,
    taskDescription: input.taskDescription.trim(),
    linkForTest: input.linkForTest.trim(),
    linkForChanges: input.linkForChanges.trim(),
    assignedDeveloper: null,
    priority: null,
    column: 'to-brief',
    positionInColumn: state.cards.filter((card) => card.column === 'to-brief').length,
    statusNotes: '',
    comments: [],
    activity: [
      {
        id: createId('activity'),
        message: `${actor} moved this card from Backlog to Development`,
        createdAt,
      },
    ],
    createdAt,
    p1AssignedAt: null,
    p1Deadline: null,
  }

  return {
    cards: [...state.cards, nextCard],
    lastCardNumber: state.lastCardNumber + 1,
  }
}

function sortCards(cards: DevBoardCard[]) {
  return cards
    .slice()
    .sort((left, right) => {
      if (left.column !== right.column) {
        return left.column.localeCompare(right.column)
      }

      if (left.column === 'up-next') {
        const leftPriority = left.priority ?? Number.MAX_SAFE_INTEGER
        const rightPriority = right.priority ?? Number.MAX_SAFE_INTEGER
        if (leftPriority !== rightPriority) {
          return leftPriority - rightPriority
        }
      }

      return left.positionInColumn - right.positionInColumn
    })
}

export function moveDevBoardCard(
  state: DevBoardState,
  cardId: string,
  destinationColumn: DevBoardColumnId,
  destinationIndex: number,
): DevBoardState {
  const existing = state.cards.find((card) => card.id === cardId)
  if (!existing) {
    return state
  }

  const otherCards = state.cards.filter((card) => card.id !== cardId)
  const targetCards = otherCards
    .filter((card) => card.column === destinationColumn)
    .sort((left, right) => left.positionInColumn - right.positionInColumn)

  const boundedIndex = Math.max(0, Math.min(destinationIndex, targetCards.length))

  if (destinationColumn === 'up-next' && existing.assignedDeveloper) {
    const currentCount = targetCards.filter((card) => card.assignedDeveloper === existing.assignedDeveloper).length
    const movingForward = existing.column !== 'up-next'
    if (movingForward && currentCount >= 3) {
      return state
    }
  }

  const movedCard: DevBoardCard = {
    ...existing,
    column: destinationColumn,
    positionInColumn: boundedIndex,
  }

  let cards = [...otherCards, movedCard]

  for (const column of DEV_BOARD_COLUMNS) {
    const cardsInColumn = cards
      .filter((card) => card.column === column.id)
      .sort((left, right) => left.positionInColumn - right.positionInColumn)
      .map((card, index) => ({ ...card, positionInColumn: index }))
    cards = cards.filter((card) => card.column !== column.id).concat(cardsInColumn)
  }

  cards = sortCards(cards)

  return {
    ...state,
    cards,
  }
}

export function updateDevBoardCard(state: DevBoardState, cardId: string, updates: Partial<DevBoardCard>, actor: string): DevBoardState {
  const nowIso = new Date().toISOString()
  const cards = state.cards.map((card) => {
    if (card.id !== cardId) {
      return card
    }

    const nextAssignedDeveloper =
      updates.assignedDeveloper === undefined ? card.assignedDeveloper : normalizeAssignedDeveloper(updates.assignedDeveloper)
    const nextPriority = updates.priority === undefined ? card.priority : normalizePriority(updates.priority)
    let nextCard: DevBoardCard = {
      ...card,
      ...updates,
      assignedDeveloper: nextAssignedDeveloper,
      priority: nextPriority,
      activity: card.activity,
    }

    if (
      nextCard.column === 'up-next' &&
      nextCard.priority === 1 &&
      nextCard.assignedDeveloper &&
      (!card.p1Deadline || card.priority !== 1 || card.assignedDeveloper !== nextCard.assignedDeveloper)
    ) {
      nextCard = {
        ...nextCard,
        p1AssignedAt: nowIso,
        p1Deadline: getP1Deadline(nextCard.assignedDeveloper, nowIso),
      }
    } else if (!(nextCard.column === 'up-next' && nextCard.priority === 1 && nextCard.assignedDeveloper)) {
      nextCard = {
        ...nextCard,
        p1AssignedAt: null,
        p1Deadline: null,
      }
    }

    return {
      ...nextCard,
      activity: [
        {
          id: createId('activity'),
          message: `${actor} updated ${nextCard.id}`,
          createdAt: nowIso,
        },
        ...nextCard.activity,
      ].slice(0, 50),
    }
  })

  return {
    ...state,
    cards,
  }
}

export function addDevBoardComment(state: DevBoardState, cardId: string, text: string, author: string): DevBoardState {
  const trimmed = text.trim()
  if (!trimmed) {
    return state
  }

  const nowIso = new Date().toISOString()
  return {
    ...state,
    cards: state.cards.map((card) =>
      card.id === cardId
        ? {
            ...card,
            comments: [
              {
                id: createId('comment'),
                text: trimmed,
                author,
                createdAt: nowIso,
              },
              ...card.comments,
            ],
            activity: [
              {
                id: createId('activity'),
                message: `${author} added a comment`,
                createdAt: nowIso,
              },
              ...card.activity,
            ],
          }
        : card,
    ),
  }
}
