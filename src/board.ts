import importedCardsSeed from './imported-cards-seed.json'

const DAY_MS = 24 * 60 * 60 * 1000
const HOUR_MS = 60 * 60 * 1000
const REFERENCE_NOW_ISO = '2026-03-11T10:00:00Z'
const DEFAULT_WORKDAY_END_MINUTES = 18 * 60

export const STORAGE_KEY = 'creative-board-state'
export const STATE_VERSION = 3

export const STAGES = [
  'Backlog',
  'Briefed',
  'In Production',
  'Review',
  'Ready',
  'Live',
] as const

export const GROUPED_STAGES = ['Briefed', 'In Production', 'Review'] as const
export const BOARD_COLUMN_IDS = [...STAGES, 'Archived'] as const
export const APP_PAGES = ['board', 'analytics', 'workload', 'settings'] as const
export const ROLE_MODES = ['owner', 'manager', 'contributor', 'viewer'] as const
export const ACCESS_SCOPE_MODES = [
  'all-portfolios',
  'selected-portfolios',
  'selected-brands',
] as const
export const TIMEFRAMES = ['this-week', 'next-week', 'this-month'] as const
export const WORKING_DAYS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'] as const
export const FUNNEL_STAGES = [
  'Cold',
  'Warm',
  'Promo',
  'Promo Evergreen',
] as const
export const PLATFORMS = ['Meta', 'AppLovin', 'TikTok', 'Other'] as const
export const CARD_FIELDS = [
  'hook',
  'angle',
  'funnelStage',
  'audience',
  'landingPage',
  'product',
  'platform',
  'dueDate',
] as const
export const TASK_TYPE_CATEGORIES = [
  'Creative',
  'Page',
  'Strategy',
  'Copy',
  'Ops',
  'Other',
] as const
export const SETTING_TABS = [
  'general',
  'portfolios',
  'team',
  'access',
  'workflow',
] as const

export type StageId = (typeof STAGES)[number]
export type GroupedStageId = (typeof GROUPED_STAGES)[number]
export type BoardColumnId = (typeof BOARD_COLUMN_IDS)[number]
export type AppPage = (typeof APP_PAGES)[number]
export type RoleMode = (typeof ROLE_MODES)[number]
export type AccessScopeMode = (typeof ACCESS_SCOPE_MODES)[number]
export type Timeframe = (typeof TIMEFRAMES)[number]
export type WorkingDay = (typeof WORKING_DAYS)[number]
export type FunnelStage = (typeof FUNNEL_STAGES)[number]
export type Platform = (typeof PLATFORMS)[number]
export type CardFieldKey = (typeof CARD_FIELDS)[number]
export type TaskTypeCategory = (typeof TASK_TYPE_CATEGORIES)[number]
export type SettingTab = (typeof SETTING_TABS)[number]
export type AgeTone = 'fresh' | 'aging' | 'stuck'
export type UtilizationTone = 'green' | 'yellow' | 'red'

export interface Attachment {
  label: string
  url: string
}

export interface CommentEntry {
  author: string
  text: string
  timestamp: string
}

export interface ActivityEntry {
  id: string
  actor: string
  message: string
  timestamp: string
  type:
    | 'created'
    | 'assigned'
    | 'moved-forward'
    | 'moved-back'
    | 'blocked'
    | 'unblocked'
    | 'effort'
    | 'due-date'
    | 'frameio'
    | 'drive'
    | 'archive'
    | 'unarchive'
    | 'deleted'
}

export interface StageHistoryEntry {
  stage: StageId
  enteredAt: string
  exitedAt: string | null
  durationDays: number | null
  movedBack?: boolean
  revisionReason?: string
  revisionEstimatedHours?: number
}

export interface BlockedState {
  reason: string
  at: string
}

export interface Card {
  id: string
  title: string
  brand: string
  product: string
  platform: Platform
  taskTypeId: string
  hook: string
  angle: string
  audience: string
  awarenessLevel: string
  landingPage: string
  funnelStage: FunnelStage
  generatedSheetName: string
  generatedAdName: string
  owner: string | null
  stage: StageId
  stageEnteredAt: string
  stageHistory: StageHistoryEntry[]
  brief: string
  comments: CommentEntry[]
  attachments: Attachment[]
  driveFolderUrl: string
  driveFolderCreated: boolean
  frameioLink: string
  dateAssigned: string
  dateCreated: string
  positionInSection: number
  estimatedHours: number
  revisionEstimatedHours: number | null
  dueDate: string | null
  blocked: BlockedState | null
  archivedAt: string | null
  activityLog: ActivityEntry[]
  note?: string
  legacyNaming?: boolean
}

export interface Brand {
  name: string
  prefix: string
  products: string[]
  driveParentFolderId: string
  color: string
  surfaceColor: string
  textColor: string
}

export interface TeamMember {
  id: string
  name: string
  role: string
  weeklyHours: number | null
  hoursPerDay: number | null
  workingDays: WorkingDay[]
  timezone: string
  wipCap: number | null
  active: boolean
}

export interface Portfolio {
  id: string
  name: string
  brands: Brand[]
  team: TeamMember[]
  cards: Card[]
  webhookUrl: string
  lastIdPerPrefix: Record<string, number>
}

export interface TaskType {
  id: string
  name: string
  category: TaskTypeCategory
  icon: string
  color: string
  textColor: string
  estimatedHours: number
  requiredFields: CardFieldKey[]
  optionalFields: CardFieldKey[]
  isDefault: boolean
  locked?: boolean
  order: number
}

export interface RevisionReason {
  id: string
  name: string
  estimatedHours: number
  locked?: boolean
  order: number
}

export interface GeneralSettings {
  appName: string
  theme: 'light'
  defaultPortfolioId: string
  timeInStageThresholds: {
    amberStart: number
    redStart: number
  }
  autoArchiveEnabled: boolean
  autoArchiveDays: number
}

export interface CapacitySettings {
  defaultWeeklyHours: number
  utilizationThresholds: {
    greenMax: number
    yellowMax: number
    redMin: number
  }
}

export interface IntegrationsSettings {
  globalDriveWebhookUrl: string
}

export interface GlobalSettings {
  general: GeneralSettings
  capacity: CapacitySettings
  taskLibrary: TaskType[]
  revisionReasons: RevisionReason[]
  integrations: IntegrationsSettings
}

export interface ActiveRole {
  mode: RoleMode
  editorId: string | null
}

export interface PortfolioAccessScope {
  portfolioId: string
  brandNames: string[]
}

export interface AppState {
  portfolios: Portfolio[]
  settings: GlobalSettings
  activePortfolioId: string
  activeRole: ActiveRole
  activePage: AppPage
  version: number
}

export interface ViewerContext {
  mode: RoleMode
  editorName: string | null
  memberRole: string | null
  visibleBrandNames: string[] | null
}

export interface BoardFilters {
  brandNames: string[]
  ownerNames: string[]
  searchQuery: string
  overdueOnly: boolean
  stuckOnly: boolean
  blockedOnly: boolean
  showArchived: boolean
}

export interface LaneModel {
  id: string
  stage: BoardColumnId
  owner: string | null
  label: string
  grouped: boolean
  cards: Card[]
  allCardIds: string[]
  activeCount: number
  queuedHours: number
  totalWorkDays: number | null
  showTotalWorkload: boolean
  utilizationPct: number
  utilizationTone: UtilizationTone
  capacityUsed: number
  capacityTotal: number
  wipCount: number | null
  wipCap: number | null
}

export interface ColumnModel {
  id: BoardColumnId
  label: string
  grouped: boolean
  count: number
  lanes: LaneModel[]
  hiddenEditorCount: number
}

export interface BoardStats {
  total: number
  byStage: Record<StageId, number>
  stuck: number
  overdue: number
}

export interface UtilizationSummary {
  activeCards: Card[]
  activeCount: number
  usedHours: number
  totalHours: number
  utilizationPct: number
  utilizationTone: UtilizationTone
  availableHours: number
  wipCount: number
  wipCap: number | null
}

export interface EditorSummary {
  owner: string
  utilizationPct: number
  availableHours: number
  briefedCount: number
  briefedHours: number
  inProductionCount: number
  inProductionHours: number
  reviewCount: number
  reviewHours: number
  readyCount: number
  readyHours: number
  activeCount: number
}

export interface CardCompletionForecast {
  isScheduled: boolean
  queuedHours: number
  estimatedDays: number | null
  completionDate: string | null
}

export interface DashboardCardRow {
  portfolioId: string
  portfolioName: string
  cardId: string
  title: string
  brand: string
  stage: StageId
  owner: string | null
  daysInStage: number
  isBlocked: boolean
  blockedReason: string | null
  isOverdue: boolean
}

export interface PortfolioOverviewCard {
  portfolioId: string
  name: string
  activeCards: number
  onTrackRatio: number
  stuckCount: number
  atCapacityCount: number
  brandBreakdown: Array<{
    brand: string
    count: number
  }>
}

export interface FunnelStageBucket {
  stage: StageId
  total: number
  segments: Array<{
    brand: string
    color: string
    count: number
  }>
  cards: DashboardCardRow[]
}

export interface TeamCapacityRow {
  editorName: string
  editorId: string
  portfolioId: string
  portfolioName: string
  active: number
  utilizationPct: number
  utilizationTone: UtilizationTone
  usedHours: number
  totalHours: number
  workloadDays: number
  avgCycleTime: number | null
  avgRevisionsPerCard: number | null
}

export interface ThroughputWeek {
  label: string
  total: number
  segments: Array<{
    brand: string
    color: string
    count: number
  }>
}

export interface BrandHealthRow {
  portfolioId: string
  portfolioName: string
  brand: string
  color: string
  active: number
  stuck: number
  inProduction: number
  avgCycleTime: number | null
  lastShipped: string | null
}

export interface RevisionReasonStat {
  reason: string
  count: number
  percent: number
}

export interface EditorRevisionStat {
  editorName: string
  avgRevisionsPerCard: number
}

export interface DashboardData {
  overviewCards: PortfolioOverviewCard[]
  funnel: FunnelStageBucket[]
  teamGrid: TeamCapacityRow[]
  stuckCards: DashboardCardRow[]
  throughput: ThroughputWeek[]
  brandHealth: BrandHealthRow[]
  revisionReasons: RevisionReasonStat[]
  editorRevisionRates: EditorRevisionStat[]
}

export interface WorkloadBreakdownItem {
  cardId: string
  title: string
  taskTypeId: string
  taskTypeName: string
  icon: string
  hours: number
}

export interface WorkloadRow {
  member: TeamMember
  utilizationPct: number
  utilizationTone: UtilizationTone
  capacityUsed: number
  capacityTotal: number
  breakdown: WorkloadBreakdownItem[]
  activeCards: Card[]
  partTimeLabel: string | null
}

export interface WorkloadQueueRow {
  cardId: string
  title: string
  taskTypeId: string
  taskTypeName: string
  icon: string
  hours: number
  daysWaiting: number
}

export interface WorkloadData {
  rows: WorkloadRow[]
  queue: WorkloadQueueRow[]
  queueHours: number
}

export interface AttentionSummary {
  overdueCount: number
  stuckCount: number
  blockedCount: number
  hasAttention: boolean
}

export interface QuickCreateInput {
  title: string
  brand: string
  taskTypeId: string
}

export const DEFAULT_QUICK_CREATE_INPUT: QuickCreateInput = {
  title: '',
  brand: '',
  taskTypeId: 'video-ugc-short',
}

const BRAND_PALETTES = [
  {
    color: '#7c3aed',
    surfaceColor: '#f3e8ff',
    textColor: '#7c3aed',
  },
  {
    color: '#059669',
    surfaceColor: '#d1fae5',
    textColor: '#059669',
  },
  {
    color: '#0284c7',
    surfaceColor: '#e0f2fe',
    textColor: '#0284c7',
  },
  {
    color: '#db2777',
    surfaceColor: '#fce7f3',
    textColor: '#db2777',
  },
  {
    color: '#d97706',
    surfaceColor: '#fef3c7',
    textColor: '#d97706',
  },
  {
    color: '#4f46e5',
    surfaceColor: '#e0e7ff',
    textColor: '#4f46e5',
  },
] as const

export const ALL_PORTFOLIOS_ID = 'all-portfolios'
export const SETTINGS_TAB_LABELS: Record<SettingTab, string> = {
  general: 'General',
  portfolios: 'Portfolios',
  team: 'Team',
  access: 'Access',
  workflow: 'Workflow',
}

function roundToTenths(value: number) {
  return Math.round(value * 10) / 10
}

function slugify(value: string) {
  return value
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
}

function sanitizeSegment(value: string) {
  return value.replace(/\s+/g, '').trim()
}

function getReferenceNowMs() {
  return new Date(REFERENCE_NOW_ISO).getTime()
}

function createId(prefix: string) {
  if (typeof crypto !== 'undefined' && 'randomUUID' in crypto) {
    return `${prefix}-${crypto.randomUUID()}`
  }

  return `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`
}

function startOfDayMs(valueMs: number) {
  const date = new Date(valueMs)
  date.setHours(0, 0, 0, 0)
  return date.getTime()
}

function startOfWeekMs(valueMs: number) {
  const date = new Date(valueMs)
  const day = date.getDay()
  const offset = day === 0 ? -6 : 1 - day
  date.setDate(date.getDate() + offset)
  date.setHours(0, 0, 0, 0)
  return date.getTime()
}

function startOfMonthMs(valueMs: number) {
  const date = new Date(valueMs)
  date.setDate(1)
  date.setHours(0, 0, 0, 0)
  return date.getTime()
}

function getWorkingDayLabel(valueMs: number): WorkingDay {
  return WORKING_DAYS[(new Date(valueMs).getDay() + 6) % 7] ?? 'Mon'
}

function isGroupedStage(stage: StageId): stage is GroupedStageId {
  return (GROUPED_STAGES as readonly string[]).includes(stage)
}

export function isLaunchOpsRole(role: string | null | undefined) {
  return typeof role === 'string' && role.toLowerCase().includes('launch')
}

export function getNextStageForEditor(stage: StageId) {
  const index = STAGES.indexOf(stage)
  return index === -1 || stage === 'Ready' || index === STAGES.length - 1 ? null : STAGES[index + 1]
}

function canEditorMoveStage(stage: StageId) {
  return stage === 'Briefed' || stage === 'In Production' || stage === 'Review' || stage === 'Ready'
}

function isManagerRole(role: string) {
  return role.toLowerCase() === 'manager'
}

function isArchivedCard(card: Card) {
  return card.archivedAt !== null
}

function isActiveWorkStage(stage: StageId) {
  return stage === 'Briefed' || stage === 'In Production' || stage === 'Review'
}

function getLaneOwner(stage: BoardColumnId, owner: string | null) {
  if (stage === 'Archived') {
    return null
  }

  return isGroupedStage(stage) ? owner : null
}

function getLaneId(stage: BoardColumnId, owner: string | null) {
  return `${stage}::${getLaneOwner(stage, owner) ?? 'flat'}`
}

function getHistoryBaseDurations(stage: StageId) {
  switch (stage) {
    case 'Backlog':
      return [1]
    case 'Briefed':
      return [0.5, 1.5]
    case 'In Production':
      return [0.5, 1, 2]
    case 'Review':
      return [0.5, 1, 2, 1]
    case 'Ready':
      return [0.5, 1, 2, 1, 1]
    case 'Live':
      return [0.5, 1, 2, 1, 1, 1]
  }
}

function getDefaultWorkingDays() {
  return ['Mon', 'Tue', 'Wed', 'Thu', 'Fri'] as WorkingDay[]
}

function getDefaultTimezone() {
  try {
    return Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC'
  } catch {
    return 'UTC'
  }
}

const timeZoneValidityCache = new Map<string, boolean>()
const zonedDateTimeFormatterCache = new Map<string, Intl.DateTimeFormat>()

function getResolvedTimezone(timezone: string | null | undefined) {
  const candidate = timezone?.trim() || getDefaultTimezone()

  if (!timeZoneValidityCache.has(candidate)) {
    let isValid = true
    try {
      new Intl.DateTimeFormat('en-US', { timeZone: candidate }).format(new Date())
    } catch {
      isValid = false
    }
    timeZoneValidityCache.set(candidate, isValid)
  }

  return timeZoneValidityCache.get(candidate) ? candidate : getDefaultTimezone()
}

function getZonedDateTimeParts(valueMs: number, timezone: string) {
  const formatter =
    zonedDateTimeFormatterCache.get(timezone) ??
    new Intl.DateTimeFormat('en-US', {
      timeZone: timezone,
      weekday: 'short',
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      hour12: false,
    })

  zonedDateTimeFormatterCache.set(timezone, formatter)

  const parts = formatter.formatToParts(new Date(valueMs))
  const lookup = new Map(parts.map((part) => [part.type, part.value]))
  const weekday = lookup.get('weekday') as WorkingDay | undefined

  return {
    weekday: WORKING_DAYS.includes((weekday ?? 'Mon') as WorkingDay)
      ? (weekday ?? 'Mon')
      : 'Mon',
    year: Number(lookup.get('year') ?? '1970'),
    month: Number(lookup.get('month') ?? '1'),
    day: Number(lookup.get('day') ?? '1'),
    hour: Number(lookup.get('hour') ?? '0'),
    minute: Number(lookup.get('minute') ?? '0'),
  }
}

function getZonedDayKey(valueMs: number, timezone: string) {
  const parts = getZonedDateTimeParts(valueMs, timezone)

  return `${String(parts.year).padStart(4, '0')}-${String(parts.month).padStart(2, '0')}-${String(parts.day).padStart(2, '0')}`
}

function createDefaultTeamMember(
  id: string,
  name: string,
  role: string,
  weeklyHours: number | null,
  hoursPerDay: number | null,
  wipCap: number | null,
): TeamMember {
  return {
    id,
    name,
    role,
    weeklyHours,
    hoursPerDay,
    workingDays: getDefaultWorkingDays(),
    timezone: getDefaultTimezone(),
    wipCap,
    active: true,
  }
}

function createActivityEntry(
  actor: string,
  message: string,
  type: ActivityEntry['type'],
  timestamp: string,
): ActivityEntry {
  return {
    id: createId('activity'),
    actor,
    message,
    type,
    timestamp,
  }
}

function appendActivity(card: Card, entry: ActivityEntry) {
  return {
    ...card,
    activityLog: [entry, ...card.activityLog],
  }
}

export function formatDateShort(isoString: string) {
  return new Intl.DateTimeFormat('en-US', {
    month: 'short',
    day: 'numeric',
  }).format(new Date(isoString))
}

export function formatDateLong(isoString: string) {
  return new Intl.DateTimeFormat('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  }).format(new Date(isoString))
}

export function formatDateTime(isoString: string) {
  return new Intl.DateTimeFormat('en-US', {
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  }).format(new Date(isoString))
}

export function formatDurationShort(durationMs: number) {
  if (durationMs < DAY_MS) {
    return `${Math.max(1, Math.floor(durationMs / HOUR_MS) || 1)}h`
  }

  return `${Math.max(1, Math.round(durationMs / DAY_MS))}d`
}

export function getCardScheduledHours(card: Card) {
  return Math.max(1, card.revisionEstimatedHours ?? card.estimatedHours)
}

export function getCardAgeMs(card: Card, nowMs = Date.now()) {
  return nowMs - new Date(card.stageEnteredAt).getTime()
}

export function getDaysSinceBriefed(card: Card, nowMs = Date.now()) {
  if (card.stage === 'Backlog' || !card.owner) {
    return null
  }

  const briefedAtMs = startOfDayMs(new Date(card.dateAssigned).getTime())
  const todayMs = startOfDayMs(nowMs)

  return Math.max(0, Math.floor((todayMs - briefedAtMs) / DAY_MS))
}

function getRemainingWorkHoursToday(
  hoursPerDay: number,
  workingDays: WorkingDay[],
  timezone: string,
  nowMs: number,
) {
  if (hoursPerDay <= 0 || workingDays.length === 0) {
    return 0
  }

  const localNow = getZonedDateTimeParts(nowMs, timezone)
  if (!workingDays.includes(localNow.weekday)) {
    return 0
  }

  const currentMinute = localNow.hour * 60 + localNow.minute
  const startMinute = Math.max(0, DEFAULT_WORKDAY_END_MINUTES - Math.round(hoursPerDay * 60))

  if (currentMinute >= DEFAULT_WORKDAY_END_MINUTES) {
    return 0
  }

  if (currentMinute <= startMinute) {
    return hoursPerDay
  }

  return roundToTenths((DEFAULT_WORKDAY_END_MINUTES - currentMinute) / 60)
}

function getCompletionForecastFromQueueHours(
  queuedHours: number,
  hoursPerDay: number,
  workingDays: WorkingDay[],
  timezone: string,
  nowMs: number,
) {
  if (queuedHours <= 0 || hoursPerDay <= 0 || workingDays.length === 0) {
    return {
      estimatedDays: null,
      completionDate: null,
    }
  }

  let remainingHours = queuedHours
  let dayOffset = 0
  let estimatedDays = 0
  let completionDate: string | null = null
  const visitedDayKeys = new Set<string>()
  const availableToday = getRemainingWorkHoursToday(hoursPerDay, workingDays, timezone, nowMs)

  while (remainingHours > 0 && visitedDayKeys.size < 400) {
    const probeMs = nowMs + dayOffset * DAY_MS
    const localProbe = getZonedDateTimeParts(probeMs, timezone)
    const dayKey = getZonedDayKey(probeMs, timezone)

    if (visitedDayKeys.has(dayKey)) {
      dayOffset += 1
      continue
    }

    visitedDayKeys.add(dayKey)

    if (workingDays.includes(localProbe.weekday)) {
      const availableHours = dayOffset === 0 ? availableToday : hoursPerDay

      if (availableHours > 0) {
        remainingHours -= Math.min(remainingHours, availableHours)
        completionDate = dayKey

        if (dayOffset > 0) {
          estimatedDays += 1
        }
      }
    }

    dayOffset += 1
  }

  return {
    estimatedDays: completionDate ? estimatedDays : null,
    completionDate,
  }
}

export function getCardCompletionForecast(
  portfolio: Portfolio,
  card: Card,
  nowMs = Date.now(),
): CardCompletionForecast {
  if (card.archivedAt || !card.owner || card.stage === 'Backlog') {
    return {
      isScheduled: false,
      queuedHours: 0,
      estimatedDays: null,
      completionDate: null,
    }
  }

  const member = getTeamMemberByName(portfolio, card.owner)
  const hoursPerDay = Math.max(1, member?.hoursPerDay ?? 8)
  const workingDays = member?.workingDays?.length
    ? member.workingDays
    : (['Mon', 'Tue', 'Wed', 'Thu', 'Fri'] as WorkingDay[])
  const timezone = getResolvedTimezone(member?.timezone)
  const queueCards = isGroupedStage(card.stage)
    ? getOrderedLaneCards(portfolio.cards, card.stage, card.owner)
    : [card]
  const cardIndex = queueCards.findIndex((queueCard) => queueCard.id === card.id)

  if (cardIndex === -1) {
    return {
      isScheduled: false,
      queuedHours: 0,
      estimatedDays: null,
      completionDate: null,
    }
  }

  const queuedHours = roundToTenths(
    queueCards
      .slice(0, cardIndex + 1)
      .reduce((sum, queueCard) => sum + getCardScheduledHours(queueCard), 0),
  )

  return {
    isScheduled: true,
    queuedHours,
    ...getCompletionForecastFromQueueHours(
      queuedHours,
      hoursPerDay,
      workingDays,
      timezone,
      nowMs,
    ),
  }
}

export function getAgeToneFromMs(
  durationMs: number,
  settings?: GlobalSettings,
): AgeTone {
  const days = durationMs / DAY_MS
  const amberStart = settings?.general.timeInStageThresholds.amberStart ?? 3
  const redStart = settings?.general.timeInStageThresholds.redStart ?? 5

  if (days >= redStart) {
    return 'stuck'
  }
  if (days >= amberStart) {
    return 'aging'
  }
  return 'fresh'
}

export function getDueStatus(card: Card, nowMs = Date.now()) {
  if (!card.dueDate) {
    return 'none' as const
  }

  const diff = startOfDayMs(new Date(card.dueDate).getTime()) - startOfDayMs(nowMs)
  if (diff < 0) {
    return 'overdue' as const
  }
  if (diff <= 2 * DAY_MS) {
    return 'soon' as const
  }
  return 'none' as const
}

export function getRevisionCount(card: Card) {
  return card.stageHistory.filter((entry) => entry.movedBack).length
}

export function getBrandByName(portfolio: Portfolio, brandName: string) {
  return portfolio.brands.find((brand) => brand.name === brandName) ?? null
}

function getPrimaryProductForBrand(brand: Brand | null) {
  return brand?.products[0] ?? ''
}

export function syncCardProductWithBrand(portfolio: Portfolio, card: Card) {
  const brand = getBrandByName(portfolio, card.brand)
  if (!brand) {
    return card
  }

  if (brand.products.length === 0) {
    return card.product === '' ? card : syncGeneratedNames({ ...card, product: '' })
  }

  if (brand.products.includes(card.product)) {
    return card
  }

  return syncGeneratedNames({
    ...card,
    product: getPrimaryProductForBrand(brand),
  })
}

export function syncPortfolioCardProducts(portfolio: Portfolio) {
  return {
    ...portfolio,
    cards: portfolio.cards.map((card) => syncCardProductWithBrand(portfolio, card)),
  }
}

export function getBrandColor(portfolio: Portfolio, brandName: string) {
  return getBrandByName(portfolio, brandName)?.color ?? '#94a3b8'
}

export function getBrandSurface(portfolio: Portfolio, brandName: string) {
  return getBrandByName(portfolio, brandName)?.surfaceColor ?? '#f3f4f6'
}

export function getBrandTextColor(portfolio: Portfolio, brandName: string) {
  return getBrandByName(portfolio, brandName)?.textColor ?? '#475569'
}

export function getTaskTypeById(settings: GlobalSettings, taskTypeId: string) {
  return (
    settings.taskLibrary.find((taskType) => taskType.id === taskTypeId) ??
    settings.taskLibrary.find((taskType) => taskType.id === 'custom') ??
    settings.taskLibrary[0]
  )
}

export function getRevisionReasonById(settings: GlobalSettings, revisionReasonId: string | null) {
  if (!revisionReasonId) {
    return (
      settings.revisionReasons.slice().sort((left, right) => left.order - right.order)[0] ?? null
    )
  }

  return (
    settings.revisionReasons.find((reason) => reason.id === revisionReasonId) ??
    settings.revisionReasons.find((reason) => reason.id === 'revision-other') ??
    settings.revisionReasons[0] ??
    null
  )
}

export function getTaskTypeGroups(settings: GlobalSettings) {
  const grouped = new Map<TaskTypeCategory, TaskType[]>()
  settings.taskLibrary
    .slice()
    .sort((left, right) => left.order - right.order)
    .forEach((taskType) => {
      const bucket = grouped.get(taskType.category) ?? []
      bucket.push(taskType)
      grouped.set(taskType.category, bucket)
    })

  return TASK_TYPE_CATEGORIES.map((category) => ({
    category,
    items: grouped.get(category) ?? [],
  })).filter((group) => group.items.length > 0)
}

export function getTeamMemberById(portfolio: Portfolio, memberId: string | null) {
  if (!memberId) {
    return null
  }
  return portfolio.team.find((member) => member.id === memberId) ?? null
}

export function getTeamMemberByName(portfolio: Portfolio, name: string | null) {
  if (!name) {
    return null
  }
  return portfolio.team.find((member) => member.name === name) ?? null
}

export function getAssignableMembers(portfolio: Portfolio) {
  return portfolio.team.filter((member) => member.active && !isManagerRole(member.role))
}

export function getEditorOptions(portfolio: Portfolio) {
  return getAssignableMembers(portfolio)
}

export function getCardFolderName(card: Card) {
  return `${card.id}_${sanitizeSegment(card.product)}`
}

export function generateSheetName(
  card: Pick<Card, 'id' | 'product' | 'platform' | 'hook' | 'angle' | 'funnelStage'>,
) {
  const left = [card.id, sanitizeSegment(card.product), sanitizeSegment(card.platform)]
    .filter(Boolean)
    .join('_')
  const right = [card.hook, card.angle, card.funnelStage]
    .map((value) => sanitizeSegment(value))
    .filter(Boolean)
    .join('_')

  return right ? `${left}__${right}` : left
}

export function generateAdName(
  card: Pick<Card, 'id' | 'title' | 'hook' | 'angle' | 'audience' | 'owner' | 'brand' | 'funnelStage'>,
) {
  return [
    card.funnelStage,
    card.hook || card.title,
    card.angle || card.title,
    card.audience || card.owner || card.brand,
    card.id,
  ]
    .filter((value) => value && value.trim().length > 0)
    .join(' | ')
}

export function syncGeneratedNames(card: Card) {
  if (card.legacyNaming) {
    return card
  }

  return {
    ...card,
    generatedSheetName: generateSheetName(card),
    generatedAdName: generateAdName(card),
  }
}

function createStageHistoryEntry(
  stage: StageId,
  enteredAtMs: number,
  exitedAtMs: number | null,
  movedBack = false,
  revisionReason?: string,
  revisionEstimatedHours?: number,
): StageHistoryEntry {
  return {
    stage,
    enteredAt: new Date(enteredAtMs).toISOString(),
    exitedAt: exitedAtMs === null ? null : new Date(exitedAtMs).toISOString(),
    durationDays:
      exitedAtMs === null ? null : roundToTenths((exitedAtMs - enteredAtMs) / DAY_MS),
    movedBack,
    revisionReason,
    revisionEstimatedHours,
  }
}

function buildDefaultStageHistory(stage: StageId, dateCreated: string) {
  const createdAtMs = new Date(dateCreated).getTime()
  const totalDays = Math.max(0.2, (getReferenceNowMs() - createdAtMs) / DAY_MS)
  const stages = STAGES.slice(0, STAGES.indexOf(stage) + 1)
  const baseDurations = getHistoryBaseDurations(stage)
  const totalBase = baseDurations.reduce((sum, duration) => sum + duration, 0)
  const durations =
    totalDays >= totalBase
      ? baseDurations.map((duration, index) =>
          index === baseDurations.length - 1
            ? duration + (totalDays - totalBase)
            : duration,
        )
      : baseDurations.map((duration) => (duration / totalBase) * totalDays)

  let cursorMs = createdAtMs
  return stages.map((entryStage, index) => {
    const durationMs = durations[index] * DAY_MS
    const isLast = index === stages.length - 1
    const enteredAtMs = cursorMs
    const exitedAtMs = isLast ? null : cursorMs + durationMs
    cursorMs += durationMs
    return createStageHistoryEntry(entryStage, enteredAtMs, exitedAtMs)
  })
}

function inferTaskTypeId(
  taskLibrary: TaskType[],
  legacyType: string,
  legacyTitle: string,
  legacyVideoType: string,
) {
  if (legacyType === 'Landing Page') {
    return 'landing-page'
  }
  if (legacyType === 'Offer') {
    return 'offer'
  }
  if (legacyType === 'Video') {
    if (legacyVideoType.includes('1-2 min')) {
      return 'video-ugc-medium'
    }
    if (legacyVideoType.toLowerCase().includes('relaunch')) {
      return 'video-relaunch'
    }
    return 'video-ugc-short'
  }
  if (legacyType === 'Static') {
    return legacyTitle.toLowerCase().includes('statics') ? 'static-set' : 'static-single'
  }

  return taskLibrary.find((taskType) => taskType.id === 'custom')?.id ?? taskLibrary[0].id
}

function createSeedTaskLibrary(): TaskType[] {
  const definitions: Array<Omit<TaskType, 'order'>> = [
    {
      id: 'video-ugc-short',
      name: 'Video (UGC < 1 min)',
      category: 'Creative',
      icon: '🎬',
      color: '#e0f2fe',
      textColor: '#0284c7',
      estimatedHours: 8,
      requiredFields: ['hook', 'angle', 'funnelStage'],
      optionalFields: ['audience', 'landingPage'],
      isDefault: true,
    },
    {
      id: 'video-ugc-medium',
      name: 'Video (UGC 1-2 min)',
      category: 'Creative',
      icon: '🎬',
      color: '#bfdbfe',
      textColor: '#1d4ed8',
      estimatedHours: 16,
      requiredFields: ['hook', 'angle', 'funnelStage'],
      optionalFields: ['audience', 'landingPage'],
      isDefault: true,
    },
    {
      id: 'video-relaunch',
      name: 'Video (Relaunch)',
      category: 'Creative',
      icon: '🔄',
      color: '#dbeafe',
      textColor: '#2563eb',
      estimatedHours: 4,
      requiredFields: ['hook', 'funnelStage'],
      optionalFields: ['angle', 'audience'],
      isDefault: true,
    },
    {
      id: 'static-single',
      name: 'Static (Single)',
      category: 'Creative',
      icon: '🖼',
      color: '#fef3c7',
      textColor: '#d97706',
      estimatedHours: 4,
      requiredFields: ['hook'],
      optionalFields: ['angle', 'audience', 'funnelStage'],
      isDefault: true,
    },
    {
      id: 'static-set',
      name: 'Static (Set)',
      category: 'Creative',
      icon: '🖼',
      color: '#fde68a',
      textColor: '#b45309',
      estimatedHours: 8,
      requiredFields: ['hook'],
      optionalFields: ['angle', 'audience', 'funnelStage'],
      isDefault: true,
    },
    {
      id: 'landing-page',
      name: 'Landing Page',
      category: 'Page',
      icon: '📄',
      color: '#fce7f3',
      textColor: '#db2777',
      estimatedHours: 20,
      requiredFields: ['product', 'platform'],
      optionalFields: ['landingPage', 'dueDate'],
      isDefault: true,
    },
    {
      id: 'offer',
      name: 'Offer',
      category: 'Strategy',
      icon: '🏷',
      color: '#f3f4f6',
      textColor: '#6b7280',
      estimatedHours: 12,
      requiredFields: ['funnelStage'],
      optionalFields: ['audience', 'dueDate'],
      isDefault: true,
    },
    {
      id: 'ad-copy',
      name: 'Ad Copy',
      category: 'Copy',
      icon: '✍️',
      color: '#dcfce7',
      textColor: '#15803d',
      estimatedHours: 3,
      requiredFields: ['funnelStage'],
      optionalFields: ['hook', 'angle', 'audience'],
      isDefault: true,
    },
    {
      id: 'launch-prep',
      name: 'Launch Prep',
      category: 'Ops',
      icon: '🚀',
      color: '#ede9fe',
      textColor: '#7c3aed',
      estimatedHours: 2,
      requiredFields: ['dueDate'],
      optionalFields: ['platform'],
      isDefault: true,
    },
    {
      id: 'custom',
      name: 'Custom',
      category: 'Other',
      icon: '⚡',
      color: '#e5e7eb',
      textColor: '#4b5563',
      estimatedHours: 5,
      requiredFields: [],
      optionalFields: ['hook', 'angle', 'funnelStage', 'audience', 'landingPage'],
      isDefault: true,
      locked: true,
    },
  ]

  return definitions.map((definition, index) => ({
    ...definition,
    order: index,
  }))
}

function createSeedRevisionReasons(): RevisionReason[] {
  const definitions: Array<Omit<RevisionReason, 'order'>> = [
    {
      id: 'revision-needs-creative-fixes',
      name: 'Needs creative fixes',
      estimatedHours: 4,
    },
    {
      id: 'revision-brief-unclear',
      name: 'Brief was unclear',
      estimatedHours: 8,
    },
    {
      id: 'revision-wrong-format',
      name: 'Wrong format/specs',
      estimatedHours: 6,
    },
    {
      id: 'revision-assets-missing',
      name: 'Assets missing',
      estimatedHours: 2,
    },
    {
      id: 'revision-client-feedback',
      name: 'Client/stakeholder feedback',
      estimatedHours: 4,
    },
    {
      id: 'revision-other',
      name: 'Other',
      estimatedHours: 4,
      locked: true,
    },
  ]

  return definitions.map((definition, index) => ({
    ...definition,
    order: index,
  }))
}

function createBrand(
  name: string,
  prefix: string,
  products: string[],
  index: number,
  driveParentFolderId = '',
): Brand {
  const palette = BRAND_PALETTES[index % BRAND_PALETTES.length]
  return {
    name,
    prefix,
    products,
    driveParentFolderId,
    color: palette.color,
    surfaceColor: palette.surfaceColor,
    textColor: palette.textColor,
  }
}

function createSeedActivity(
  actor: string,
  message: string,
  type: ActivityEntry['type'],
  timestamp: string,
) {
  return createActivityEntry(actor, message, type, timestamp)
}

function inflateSeedCard(
  taskLibrary: TaskType[],
  seed: {
    id: string
    title: string
    brand: string
    product: string
    platform: Platform
    type: string
    videoType?: string
    hook?: string
    angle?: string
    audience?: string
    awarenessLevel?: string
    funnelStage: FunnelStage
    owner: string | null
    stage: StageId
    dateAssigned: string
    dateCreated?: string
    brief?: string
    comments?: CommentEntry[]
    attachments?: Attachment[]
    frameioLink?: string
    driveFolderUrl?: string
    note?: string
    generatedSheetName?: string
    generatedAdName?: string
    customStageHistory?: StageHistoryEntry[]
    dueDate?: string
  },
): Card {
  const dateCreated = seed.dateCreated ?? seed.dateAssigned
  const taskTypeId = inferTaskTypeId(taskLibrary, seed.type, seed.title, seed.videoType ?? '')
  const taskType = taskLibrary.find((item) => item.id === taskTypeId) ?? taskLibrary[0]
  const stageHistory = seed.customStageHistory ?? buildDefaultStageHistory(seed.stage, dateCreated)
  const stageEnteredAt = stageHistory[stageHistory.length - 1]?.enteredAt ?? `${dateCreated}T00:00:00Z`
  const activityLog = [
    createSeedActivity('Naomi', 'created this card', 'created', `${dateCreated}T00:00:00Z`),
  ]

  if (seed.owner) {
    activityLog.unshift(
      createSeedActivity(
        'Naomi',
        `assigned to ${seed.owner}`,
        'assigned',
        `${seed.dateAssigned}T09:00:00Z`,
      ),
    )
  }

  if (seed.frameioLink) {
    activityLog.unshift(
      createSeedActivity(
        seed.owner ?? 'Editor',
        'added Frame.io review link',
        'frameio',
        `${seed.dateAssigned}T12:00:00Z`,
      ),
    )
  }

  const card: Card = {
    id: seed.id,
    title: seed.title,
    brand: seed.brand,
    product: seed.product,
    platform: seed.platform,
    taskTypeId,
    hook: seed.hook ?? '',
    angle: seed.angle ?? '',
    audience: seed.audience ?? '',
    awarenessLevel: seed.awarenessLevel ?? '',
    landingPage: '',
    funnelStage: seed.funnelStage,
    generatedSheetName: seed.generatedSheetName ?? seed.title,
    generatedAdName:
      seed.generatedAdName ??
      generateAdName({
        id: seed.id,
        title: seed.title,
        hook: seed.hook ?? '',
        angle: seed.angle ?? '',
        audience: seed.audience ?? '',
        owner: seed.owner,
        brand: seed.brand,
        funnelStage: seed.funnelStage,
      }),
    owner: seed.stage === 'Backlog' ? null : seed.owner,
    stage: seed.stage,
    stageEnteredAt,
    stageHistory,
    brief: seed.brief ?? '',
    comments: seed.comments ?? [],
    attachments: seed.attachments ?? [],
    driveFolderUrl: seed.driveFolderUrl ?? '',
    driveFolderCreated: Boolean(seed.driveFolderUrl),
    frameioLink: seed.frameioLink ?? '',
    dateAssigned: seed.dateAssigned,
    dateCreated,
    positionInSection: 0,
    estimatedHours: taskType.estimatedHours,
    revisionEstimatedHours: null,
    dueDate: seed.dueDate ?? null,
    blocked: null,
    archivedAt: null,
    activityLog,
    note: seed.note,
    legacyNaming: true,
  }

  return card
}

interface ImportedCardSeed {
  id: string
  generatedSheetName: string
  title: string
  brand: string
  product: string
  platform: string
  type: string
  videoType?: string
  hook?: string
  audience?: string
  angle?: string
  funnelStage?: string
  owner: string | null
  stage: StageId
  dateAssigned: string
  driveFolderUrl?: string
  driveFolderCreated?: boolean
  reviewLink?: string
  frameioLink?: string
  briefDoc?: string
  comments?: CommentEntry[]
  attachments?: Attachment[]
}

function toImportedPlatform(value: string): Platform {
  if (PLATFORMS.includes(value as Platform)) {
    return value as Platform
  }

  return 'Other'
}

function createImportedSeedCard(
  taskLibrary: TaskType[],
  seed: ImportedCardSeed,
): Card {
  const attachments = [...(seed.attachments ?? [])]
  const stageEnteredAt = `${seed.dateAssigned}T00:00:00.000Z`

  if (seed.reviewLink && !seed.frameioLink) {
    attachments.unshift({
      label: seed.reviewLink.includes('figma.com')
        ? 'Design Review'
        : seed.reviewLink.includes('drive.google.com')
          ? 'Review Folder'
          : 'Review Link',
      url: seed.reviewLink,
    })
  }

  if (seed.briefDoc?.startsWith('http')) {
    attachments.unshift({
      label: 'Brief Doc',
      url: seed.briefDoc,
    })
  }

  return inflateSeedCard(taskLibrary, {
    id: seed.id,
    title: seed.title,
    brand: seed.brand,
    product: seed.product,
    platform: toImportedPlatform(seed.platform),
    type: seed.type,
    videoType: seed.videoType ?? '',
    hook: seed.hook ?? '',
    angle: seed.angle ?? '',
    audience: '',
    funnelStage: 'Cold',
    owner: seed.owner ?? null,
    stage: seed.stage,
    dateAssigned: seed.dateAssigned,
    dateCreated: seed.dateAssigned,
    brief: seed.briefDoc && !seed.briefDoc.startsWith('http') ? seed.briefDoc : '',
    comments: seed.comments ?? [],
    attachments,
    frameioLink: seed.frameioLink ?? '',
    driveFolderUrl: seed.driveFolderUrl ?? '',
    note: seed.briefDoc,
    generatedSheetName: seed.generatedSheetName,
    customStageHistory: buildCustomHistory([
      {
        stage: seed.stage,
        enteredAt: stageEnteredAt,
        exitedAt: null,
      },
    ]),
  })
}

function reindexCards(cards: Card[]) {
  const grouped = new Map<string, Card[]>()

  for (const card of cards) {
    const laneId = card.archivedAt
      ? getLaneId('Archived', null)
      : getLaneId(card.stage, card.owner)
    const laneCards = grouped.get(laneId) ?? []
    laneCards.push(card)
    grouped.set(laneId, laneCards)
  }

  const nextPositions = new Map<string, number>()

  for (const laneCards of grouped.values()) {
    laneCards
      .sort((left, right) => {
        if (left.positionInSection !== right.positionInSection) {
          return left.positionInSection - right.positionInSection
        }
        if (left.dateCreated !== right.dateCreated) {
          return left.dateCreated.localeCompare(right.dateCreated)
        }
        return left.id.localeCompare(right.id)
      })
      .forEach((card, index) => {
        nextPositions.set(card.id, index)
      })
  }

  return cards.map((card) => ({
    ...card,
    positionInSection: nextPositions.get(card.id) ?? card.positionInSection,
  }))
}

function getLastIdPerPrefix(brands: Brand[], cards: Card[]) {
  const lastIdPerPrefix: Record<string, number> = {}

  for (const brand of brands) {
    lastIdPerPrefix[brand.prefix] = 0
  }

  for (const card of cards) {
    const brand = brands.find((item) => item.name === card.brand)
    if (!brand) {
      continue
    }

    const numericPart = Number(card.id.replace(brand.prefix, ''))
    if (!Number.isNaN(numericPart)) {
      lastIdPerPrefix[brand.prefix] = Math.max(lastIdPerPrefix[brand.prefix] ?? 0, numericPart)
    }
  }

  return lastIdPerPrefix
}

function buildCustomHistory(entries: Array<{
  stage: StageId
  enteredAt: string
  exitedAt: string | null
  movedBack?: boolean
  revisionReason?: string
  revisionEstimatedHours?: number
}>) {
  return entries.map((entry) =>
    createStageHistoryEntry(
      entry.stage,
      new Date(entry.enteredAt).getTime(),
      entry.exitedAt ? new Date(entry.exitedAt).getTime() : null,
      entry.movedBack ?? false,
      entry.revisionReason,
      entry.revisionEstimatedHours,
    ),
  )
}

function createSeedPortfolios(taskLibrary: TaskType[]): Portfolio[] {
  const brandLabBrands = [
    createBrand('Pluxy', 'PX', ['Epil Pro 3.0'], 0),
    createBrand('ViVi', 'VV', ['UltraGut'], 1),
    createBrand('TrueClean', 'TC', ['Toilet Cleaner'], 2),
  ]
  const importedCards = importedCardsSeed as ImportedCardSeed[]
  const brandLabCards = reindexCards(
    importedCards.map((card) => createImportedSeedCard(taskLibrary, card)),
  )

  const brandLab: Portfolio = {
    id: 'portfolio-brandlab',
    name: 'BrandLab',
    brands: brandLabBrands,
    team: [
      createDefaultTeamMember('naomi', 'Naomi', 'Manager', null, null, null),
      createDefaultTeamMember('daniel-t', 'Daniel T', 'Editor', 40, 8, 3),
      createDefaultTeamMember('jo', 'Jo', 'Editor', 40, 8, 3),
      createDefaultTeamMember('ezequiel', 'Ezequiel', 'Editor', 40, 8, 3),
      createDefaultTeamMember('bryan', 'Bryan', 'Editor', 40, 8, 3),
      createDefaultTeamMember('charit', 'Charit', 'Designer', 40, 8, 3),
      createDefaultTeamMember('shita', 'Shita', 'Designer', 40, 8, 3),
      createDefaultTeamMember('ivan', 'Ivan', 'Launch Ops', 10, 3, 2),
    ],
    cards: brandLabCards,
    webhookUrl: '',
    lastIdPerPrefix: getLastIdPerPrefix(brandLabBrands, brandLabCards),
  }

  return [brandLab]
}

export function createSeedState(): AppState {
  const taskLibrary = createSeedTaskLibrary()
  const revisionReasons = createSeedRevisionReasons()
  const portfolios = createSeedPortfolios(taskLibrary)

  return {
    portfolios,
    settings: {
      general: {
        appName: 'Creative Board',
        theme: 'light',
        defaultPortfolioId: portfolios[0]?.id ?? '',
        timeInStageThresholds: {
          amberStart: 3,
          redStart: 5,
        },
        autoArchiveEnabled: true,
        autoArchiveDays: 14,
      },
      capacity: {
        defaultWeeklyHours: 40,
        utilizationThresholds: {
          greenMax: 70,
          yellowMax: 90,
          redMin: 90,
        },
      },
      taskLibrary,
      revisionReasons,
      integrations: {
        globalDriveWebhookUrl: '',
      },
    },
    activePortfolioId: portfolios[0]?.id ?? '',
    activeRole: {
      mode: 'owner',
      editorId: null,
    },
    activePage: 'board',
    version: STATE_VERSION,
  }
}

function ensureManagerMember(portfolio: Portfolio) {
  if (portfolio.team.some((member) => isManagerRole(member.role))) {
    return portfolio
  }

  return {
    ...portfolio,
    team: [createDefaultTeamMember('naomi', 'Naomi', 'Manager', null, null, null), ...portfolio.team],
  }
}

function normalizeTaskLibrary(raw: TaskType[] | undefined) {
  const seed = createSeedTaskLibrary()
  const source = Array.isArray(raw) && raw.length > 0 ? raw : seed

  const taskLibrary = source.map((taskType, index) => ({
    ...taskType,
    requiredFields: taskType.requiredFields ?? [],
    optionalFields: taskType.optionalFields ?? [],
    order: typeof taskType.order === 'number' ? taskType.order : index,
  }))

  if (!taskLibrary.some((taskType) => taskType.id === 'custom')) {
    taskLibrary.push({
      ...seed.find((taskType) => taskType.id === 'custom')!,
      order: taskLibrary.length,
    })
  }

  return taskLibrary
}

function normalizeRevisionReasons(raw: RevisionReason[] | undefined) {
  const seed = createSeedRevisionReasons()
  const source = Array.isArray(raw) && raw.length > 0 ? raw : seed

  const revisionReasons = source.map((reason, index) => ({
    ...reason,
    estimatedHours:
      typeof reason.estimatedHours === 'number' && reason.estimatedHours > 0
        ? reason.estimatedHours
        : 4,
    order: typeof reason.order === 'number' ? reason.order : index,
  }))

  if (!revisionReasons.some((reason) => reason.id === 'revision-other')) {
    revisionReasons.push({
      ...seed.find((reason) => reason.id === 'revision-other')!,
      order: revisionReasons.length,
    })
  }

  return revisionReasons
}

function normalizePortfolio(
  portfolio: Portfolio,
  taskLibrary: TaskType[],
  settings: GlobalSettings,
  portfolioIndex: number,
): Portfolio {
  const normalizedBrands = portfolio.brands.map((brand, index) => {
    const fallback = BRAND_PALETTES[(portfolioIndex + index) % BRAND_PALETTES.length]
    return {
      ...brand,
      products: [...brand.products],
      driveParentFolderId: brand.driveParentFolderId ?? '',
      color: brand.color ?? fallback.color,
      surfaceColor: brand.surfaceColor ?? fallback.surfaceColor,
      textColor: brand.textColor ?? fallback.textColor,
    }
  })

  const normalizedTeam = ensureManagerMember({
    ...portfolio,
    team: portfolio.team.map((member) => ({
      ...member,
      weeklyHours:
        typeof member.weeklyHours === 'number'
          ? member.weeklyHours
          : isManagerRole(member.role)
            ? null
            : settings.capacity.defaultWeeklyHours,
      hoursPerDay:
        typeof member.hoursPerDay === 'number'
          ? member.hoursPerDay
          : isManagerRole(member.role)
            ? null
            : 8,
      workingDays:
        Array.isArray(member.workingDays) && member.workingDays.length > 0
          ? member.workingDays
          : getDefaultWorkingDays(),
      timezone: getResolvedTimezone((member as TeamMember & { timezone?: string | null }).timezone),
      wipCap:
        member.wipCap === undefined
          ? (member as unknown as { wipLimit?: number | null }).wipLimit ?? null
          : member.wipCap,
      active: member.active ?? true,
    })),
  }).team

  const normalizedCards = reindexCards(
    portfolio.cards.map((rawCard) => {
      const taskTypeId =
        rawCard.taskTypeId ?? inferTaskTypeId(taskLibrary, 'Video', rawCard.title, '')
      const taskType = getTaskTypeById({ ...settings, taskLibrary }, taskTypeId)
      const activityLog =
        rawCard.activityLog && rawCard.activityLog.length > 0
          ? rawCard.activityLog
          : [
              createSeedActivity(
                'Naomi',
                'created this card',
                'created',
                `${rawCard.dateCreated}T00:00:00Z`,
              ),
            ]

      return {
        ...rawCard,
        taskTypeId,
        estimatedHours:
          typeof rawCard.estimatedHours === 'number'
            ? rawCard.estimatedHours
            : typeof (rawCard as unknown as { effortPoints?: number }).effortPoints === 'number'
              ? (rawCard as unknown as { effortPoints: number }).effortPoints
              : taskType.estimatedHours,
        revisionEstimatedHours:
          typeof (rawCard as Card).revisionEstimatedHours === 'number'
            ? (rawCard as Card).revisionEstimatedHours
            : null,
        dueDate: rawCard.dueDate ?? null,
        blocked: rawCard.blocked ?? null,
        archivedAt: rawCard.archivedAt ?? null,
        activityLog,
        stageEnteredAt:
          rawCard.stageHistory[rawCard.stageHistory.length - 1]?.enteredAt ?? rawCard.stageEnteredAt,
      }
    }),
  )

  return {
    ...portfolio,
    brands: normalizedBrands,
    team: normalizedTeam,
    cards: normalizedCards,
    webhookUrl: portfolio.webhookUrl ?? '',
    lastIdPerPrefix: {
      ...getLastIdPerPrefix(normalizedBrands, normalizedCards),
      ...(portfolio.lastIdPerPrefix ?? {}),
    },
  }
}

function normalizeSettings(raw: Partial<GlobalSettings> | undefined, fallbackPortfolioId: string) {
  const seed = createSeedState().settings
  const taskLibrary = normalizeTaskLibrary(raw?.taskLibrary)
  const revisionReasons = normalizeRevisionReasons(raw?.revisionReasons)

  return {
    general: {
      ...seed.general,
      ...(raw?.general ?? {}),
      defaultPortfolioId:
        raw?.general?.defaultPortfolioId ?? fallbackPortfolioId ?? seed.general.defaultPortfolioId,
      timeInStageThresholds: {
        ...seed.general.timeInStageThresholds,
        ...(raw?.general?.timeInStageThresholds ?? {}),
      },
    },
    capacity: {
      ...seed.capacity,
      ...(raw?.capacity ?? {}),
      utilizationThresholds: {
        ...seed.capacity.utilizationThresholds,
        ...(raw?.capacity?.utilizationThresholds ?? {}),
      },
    },
    taskLibrary,
    revisionReasons,
    integrations: {
      ...seed.integrations,
      ...(raw?.integrations ?? {}),
    },
  } satisfies GlobalSettings
}

export function coerceAppState(raw: unknown): AppState {
  const seed = createSeedState()
  if (!raw || typeof raw !== 'object') {
    return seed
  }

  const candidate = raw as Partial<AppState>
  const fallbackPortfolioId =
    Array.isArray(candidate.portfolios) && candidate.portfolios[0]
      ? candidate.portfolios[0].id
      : seed.activePortfolioId
  const candidateActiveRole =
    candidate.activeRole && typeof candidate.activeRole === 'object'
      ? (candidate.activeRole as { mode?: unknown; editorId?: unknown })
      : null
  const settings = normalizeSettings(candidate.settings, fallbackPortfolioId)
  const portfolios = Array.isArray(candidate.portfolios)
    ? candidate.portfolios.map((portfolio, index) =>
        normalizePortfolio(portfolio, settings.taskLibrary, settings, index),
      )
    : seed.portfolios
  const candidateRoleMode =
    candidateActiveRole && typeof candidateActiveRole.mode === 'string'
      ? candidateActiveRole.mode
      : null
  const normalizedRoleMode =
    candidateRoleMode
      ? candidateRoleMode === 'editor'
        ? 'contributor'
        : candidateRoleMode === 'observer'
          ? 'viewer'
          : candidateRoleMode === 'owner' || candidateRoleMode === 'manager'
            ? candidateRoleMode
            : null
      : null

  return {
    portfolios,
    settings,
    activePortfolioId:
      typeof candidate.activePortfolioId === 'string'
        ? candidate.activePortfolioId
        : settings.general.defaultPortfolioId,
    activeRole:
      normalizedRoleMode && ROLE_MODES.includes(normalizedRoleMode as RoleMode)
        ? {
            mode: normalizedRoleMode as RoleMode,
            editorId:
              typeof candidateActiveRole?.editorId === 'string'
                ? candidateActiveRole.editorId
                : seed.activeRole.editorId,
          }
        : seed.activeRole,
    activePage:
      typeof candidate.activePage === 'string' && APP_PAGES.includes(candidate.activePage as AppPage)
        ? (candidate.activePage as AppPage)
        : seed.activePage,
    version: STATE_VERSION,
  }
}

export function loadAppState() {
  if (typeof window === 'undefined') {
    return createSeedState()
  }

  try {
    const raw = window.localStorage.getItem(STORAGE_KEY)
    if (!raw) {
      return createSeedState()
    }
    return coerceAppState(JSON.parse(raw))
  } catch {
    return createSeedState()
  }
}

export function persistAppState(state: AppState) {
  if (typeof window === 'undefined') {
    return
  }

  window.localStorage.setItem(STORAGE_KEY, JSON.stringify(state))
}

export function createEmptyPortfolio(name: string, existingCount: number): Portfolio {
  return {
    id: `portfolio-${slugify(name || `portfolio-${existingCount + 1}`)}-${Date.now()}`,
    name: name || `Portfolio ${existingCount + 1}`,
    brands: [],
    team: [createDefaultTeamMember('naomi', 'Naomi', 'Manager', null, null, null)],
    cards: [],
    webhookUrl: '',
    lastIdPerPrefix: {},
  }
}

export function createFreshStartState(state: AppState): AppState {
  const portfolios = state.portfolios.map((portfolio) => ({
    ...portfolio,
    team: [],
    cards: [],
    lastIdPerPrefix: Object.fromEntries(portfolio.brands.map((brand) => [brand.prefix, 0])),
  }))

  const nextActivePortfolioId =
    portfolios.find((portfolio) => portfolio.id === state.activePortfolioId)?.id ??
    portfolios[0]?.id ??
    ''
  const nextDefaultPortfolioId =
    portfolios.find((portfolio) => portfolio.id === state.settings.general.defaultPortfolioId)?.id ??
    portfolios[0]?.id ??
    ''

  return {
    ...state,
    portfolios,
    activePortfolioId: nextActivePortfolioId,
    settings: {
      ...state.settings,
      general: {
        ...state.settings.general,
        defaultPortfolioId: nextDefaultPortfolioId,
      },
    },
  }
}

export function renameBrandInPortfolio(
  portfolio: Portfolio,
  brandIndex: number,
  nextName: string,
) {
  const previousBrand = portfolio.brands[brandIndex]
  if (!previousBrand || previousBrand.name === nextName) {
    return portfolio
  }

  return {
    ...portfolio,
    brands: portfolio.brands.map((brand, index) =>
      index === brandIndex ? { ...brand, name: nextName } : brand,
    ),
    cards: portfolio.cards.map((card) =>
      card.brand === previousBrand.name ? { ...card, brand: nextName } : card,
    ),
  }
}

export function getBrandRemovalBlocker(portfolio: Portfolio, brandIndex: number) {
  const brand = portfolio.brands[brandIndex]
  if (!brand) {
    return 'That brand no longer exists.'
  }

  if (portfolio.brands.length <= 1) {
    return 'At least one brand is required.'
  }

  const linkedCards = portfolio.cards.filter((card) => card.brand === brand.name).length
  if (linkedCards > 0) {
    return `${brand.name} is still linked to ${linkedCards} ${linkedCards === 1 ? 'card' : 'cards'}. Reassign those cards first.`
  }

  return null
}

export function removeBrandFromPortfolio(portfolio: Portfolio, brandIndex: number) {
  const brand = portfolio.brands[brandIndex]
  if (!brand || getBrandRemovalBlocker(portfolio, brandIndex)) {
    return portfolio
  }

  const remainingLastIdPerPrefix = Object.fromEntries(
    Object.entries(portfolio.lastIdPerPrefix).filter(([prefix]) => prefix !== brand.prefix),
  )

  return {
    ...portfolio,
    brands: portfolio.brands.filter((_, index) => index !== brandIndex),
    lastIdPerPrefix: remainingLastIdPerPrefix,
  }
}

export function renameTeamMemberInPortfolio(
  portfolio: Portfolio,
  memberIndex: number,
  nextName: string,
) {
  const previousMember = portfolio.team[memberIndex]
  if (!previousMember || previousMember.name === nextName) {
    return portfolio
  }

  return {
    ...portfolio,
    team: portfolio.team.map((member, index) =>
      index === memberIndex ? { ...member, name: nextName } : member,
    ),
    cards: portfolio.cards.map((card) =>
      card.owner === previousMember.name ? { ...card, owner: nextName } : card,
    ),
  }
}

export function getTeamMemberRemovalBlocker(portfolio: Portfolio, memberIndex: number) {
  const member = portfolio.team[memberIndex]
  if (!member) {
    return 'That teammate profile no longer exists.'
  }

  if (
    isManagerRole(member.role) &&
    portfolio.team.filter((item, index) => index !== memberIndex && isManagerRole(item.role)).length === 0
  ) {
    return 'Each portfolio needs at least one manager.'
  }

  const assignedCards = portfolio.cards.filter((card) => card.owner === member.name).length
  if (assignedCards > 0) {
    return `${member.name} still owns ${assignedCards} ${assignedCards === 1 ? 'card' : 'cards'}. Reassign those cards first.`
  }

  return null
}

export function removeTeamMemberFromPortfolio(portfolio: Portfolio, memberIndex: number) {
  if (getTeamMemberRemovalBlocker(portfolio, memberIndex)) {
    return portfolio
  }

  return {
    ...portfolio,
    team: portfolio.team.filter((_, index) => index !== memberIndex),
  }
}

export function removePortfolioFromAppState(state: AppState, portfolioId: string) {
  const portfolios = state.portfolios.filter((portfolio) => portfolio.id !== portfolioId)
  const fallbackPortfolioId = portfolios[0]?.id ?? ''
  const activePortfolioId = portfolios.some((portfolio) => portfolio.id === state.activePortfolioId)
    ? state.activePortfolioId
    : fallbackPortfolioId
  const defaultPortfolioId = portfolios.some(
    (portfolio) => portfolio.id === state.settings.general.defaultPortfolioId,
  )
    ? state.settings.general.defaultPortfolioId
    : fallbackPortfolioId

  return {
    ...state,
    portfolios,
    activePortfolioId,
    settings: {
      ...state.settings,
      general: {
        ...state.settings.general,
        defaultPortfolioId,
      },
    },
  }
}

export function getActivePortfolio(state: AppState) {
  if (state.activePortfolioId === ALL_PORTFOLIOS_ID) {
    return null
  }

  return (
    state.portfolios.find((portfolio) => portfolio.id === state.activePortfolioId) ??
    state.portfolios[0] ??
    null
  )
}

export function getDefaultBoardFilters(portfolio: Portfolio | null): BoardFilters {
  return {
    brandNames: portfolio ? portfolio.brands.map((brand) => brand.name) : [],
    ownerNames: [],
    searchQuery: '',
    overdueOnly: false,
    stuckOnly: false,
    blockedOnly: false,
    showArchived: false,
  }
}

export function getNextCardId(portfolio: Portfolio, brandName: string) {
  const brand = getBrandByName(portfolio, brandName)
  if (!brand) {
    return 'XX0001'
  }

  const nextNumber = (portfolio.lastIdPerPrefix[brand.prefix] ?? 0) + 1
  return `${brand.prefix}${String(nextNumber).padStart(4, '0')}`
}

export function getQuickCreateDefaults(portfolio: Portfolio, settings: GlobalSettings): QuickCreateInput {
  return {
    title: '',
    brand: portfolio.brands[0]?.name ?? '',
    taskTypeId: settings.taskLibrary[0]?.id ?? 'custom',
  }
}

function getQuickCreateValidationMessage(
  portfolio: Portfolio,
  input: QuickCreateInput,
) {
  if (!input.title.trim()) {
    return 'Enter a card title before creating it.'
  }

  if (!getBrandByName(portfolio, input.brand)) {
    return 'Pick a valid brand before creating a card.'
  }

  return null
}

function getQuickCreateTaskType(settings: GlobalSettings, taskTypeId: string) {
  return (
    settings.taskLibrary.find((taskType) => taskType.id === taskTypeId) ??
    settings.taskLibrary.find((taskType) => taskType.id === 'custom') ??
    settings.taskLibrary[0]
  )
}

export function createCardFromQuickInput(
  portfolio: Portfolio,
  settings: GlobalSettings,
  input: QuickCreateInput,
  actor: string,
  createdAt = new Date().toISOString(),
) {
  const validationMessage = getQuickCreateValidationMessage(portfolio, input)
  if (validationMessage) {
    throw new Error(validationMessage)
  }

  const taskType = getQuickCreateTaskType(settings, input.taskTypeId)
  const brand = getBrandByName(portfolio, input.brand)
  const cardId = getNextCardId(portfolio, brand?.name ?? input.brand)
  const dateOnly = createdAt.slice(0, 10)

  const baseCard: Card = {
    id: cardId,
    title: input.title.trim(),
    brand: brand?.name ?? input.brand,
    product: brand?.products[0] ?? '',
    platform: 'Meta',
    taskTypeId: taskType.id,
    hook: '',
    angle: '',
    audience: '',
    awarenessLevel: '',
    landingPage: '',
    funnelStage: 'Cold',
    generatedSheetName: '',
    generatedAdName: '',
    owner: null,
    stage: 'Backlog',
    stageEnteredAt: createdAt,
    stageHistory: [
      {
        stage: 'Backlog',
        enteredAt: createdAt,
        exitedAt: null,
        durationDays: null,
      },
    ],
    brief: '',
    comments: [],
    attachments: [],
    driveFolderUrl: '',
    driveFolderCreated: false,
    frameioLink: '',
    dateAssigned: dateOnly,
    dateCreated: dateOnly,
    positionInSection: 0,
    estimatedHours: taskType.estimatedHours,
    revisionEstimatedHours: null,
    dueDate: null,
    blocked: null,
    archivedAt: null,
    activityLog: [
      createActivityEntry(actor, 'created this card', 'created', createdAt),
    ],
    legacyNaming: false,
  }

  return syncGeneratedNames(baseCard)
}

function canManageCards(viewer: ViewerContext) {
  return viewer.mode === 'owner' || viewer.mode === 'manager'
}

function canUpdateCard(viewer: ViewerContext, card: Card, updates: Partial<Card>) {
  if (viewer.mode === 'owner' || viewer.mode === 'manager') {
    return true
  }

  const updateKeys = Object.keys(updates) as Array<keyof Card>
  if (updateKeys.length === 0) {
    return true
  }

  if (viewer.mode === 'viewer') {
    return false
  }

  const allowedKeys = new Set<keyof Card>()
  if (viewer.editorName === card.owner) {
    allowedKeys.add('title')
    allowedKeys.add('hook')
    allowedKeys.add('angle')
    allowedKeys.add('audience')
    allowedKeys.add('brief')
    allowedKeys.add('attachments')
    allowedKeys.add('frameioLink')
  }
  if (isLaunchOpsRole(viewer.memberRole)) {
    allowedKeys.add('blocked')
  }

  return updateKeys.every((key) => allowedKeys.has(key))
}

function getOrderedLaneCards(
  cards: Card[],
  stage: BoardColumnId,
  owner: string | null,
) {
  return cards
    .filter((card) => {
      if (stage === 'Archived') {
        return card.archivedAt !== null
      }

      return card.archivedAt === null && card.stage === stage && getLaneOwner(stage, owner) === getLaneOwner(stage, card.owner)
    })
    .slice()
    .sort((left, right) => {
      if (left.positionInSection !== right.positionInSection) {
        return left.positionInSection - right.positionInSection
      }
      if (stage === 'Archived' && left.archivedAt && right.archivedAt && left.archivedAt !== right.archivedAt) {
        return right.archivedAt.localeCompare(left.archivedAt)
      }
      if (left.dateCreated !== right.dateCreated) {
        return left.dateCreated.localeCompare(right.dateCreated)
      }
      return left.id.localeCompare(right.id)
    })
}

function matchesSearch(card: Card, query: string) {
  if (!query.trim()) {
    return true
  }

  const normalized = query.toLowerCase()
  const haystack = [
    card.id,
    card.title,
    card.owner ?? '',
    card.hook,
    card.angle,
    card.brief.replace(/<[^>]+>/g, ' '),
  ]
    .join(' ')
    .toLowerCase()

  return haystack.includes(normalized)
}

export function getVisibleCards(
  portfolio: Portfolio,
  viewer: ViewerContext,
  filters: BoardFilters,
  settings: GlobalSettings,
  nowMs = Date.now(),
) {
  const visibleBrandNames =
    filters.brandNames.length > 0
      ? new Set(filters.brandNames)
      : new Set(viewer.visibleBrandNames ?? portfolio.brands.map((brand) => brand.name))
  const visibleOwnerNames = new Set(filters.ownerNames)

  return portfolio.cards.filter((card) => {
    const archived = isArchivedCard(card)
    const isBacklogCard = card.stage === 'Backlog'
    if (archived && !filters.showArchived) {
      return false
    }
    if (!visibleBrandNames.has(card.brand)) {
      return false
    }
    if (
      viewer.mode === 'contributor' &&
      !isLaunchOpsRole(viewer.memberRole) &&
      viewer.editorName !== card.owner
    ) {
      return false
    }
    if (viewer.mode !== 'contributor' && visibleOwnerNames.size > 0 && !isBacklogCard) {
      if (!card.owner || !visibleOwnerNames.has(card.owner)) {
        return false
      }
    }
    if (!matchesSearch(card, filters.searchQuery)) {
      return false
    }
    if (filters.overdueOnly && getDueStatus(card, nowMs) !== 'overdue') {
      return false
    }
    if (filters.stuckOnly && getAgeToneFromMs(getCardAgeMs(card, nowMs), settings) !== 'stuck') {
      return false
    }
    if (filters.blockedOnly && card.blocked === null) {
      return false
    }

    return true
  })
}

function getUtilizationTone(utilizationPct: number, settings: GlobalSettings): UtilizationTone {
  if (utilizationPct >= settings.capacity.utilizationThresholds.redMin) {
    return 'red'
  }
  if (utilizationPct >= settings.capacity.utilizationThresholds.greenMax) {
    return 'yellow'
  }
  return 'green'
}

export function getCurrentUtilization(
  portfolio: Portfolio,
  ownerName: string,
  settings: GlobalSettings,
) {
  const member = getTeamMemberByName(portfolio, ownerName)
  const activeCards = portfolio.cards.filter(
    (card) => !isArchivedCard(card) && card.owner === ownerName && isActiveWorkStage(card.stage),
  )
  const usedHours = roundToTenths(
    activeCards.reduce((sum, card) => sum + getCardScheduledHours(card), 0),
  )
  const totalHours = member ? getWeeklyCapacityHours(member) : 0
  const utilizationPct =
    totalHours > 0 ? Math.round((usedHours / totalHours) * 100) : 0

  return {
    activeCards,
    activeCount: activeCards.length,
    usedHours,
    totalHours,
    utilizationPct,
    utilizationTone: getUtilizationTone(utilizationPct, settings),
    availableHours: Math.max(0, roundToTenths(totalHours - usedHours)),
    wipCount: portfolio.cards.filter(
      (card) => !isArchivedCard(card) && card.owner === ownerName && card.stage === 'In Production',
    ).length,
    wipCap: member?.wipCap ?? null,
  } satisfies UtilizationSummary
}

function getBoardOwners(portfolio: Portfolio) {
  const orderedActiveNames = getAssignableMembers(portfolio).map((member) => member.name)
  const extraNames = Array.from(
    new Set(
      portfolio.cards
        .map((card) => card.owner)
        .filter(
          (owner): owner is string =>
            owner !== null && owner.length > 0 && !orderedActiveNames.includes(owner),
        ),
    ),
  ).sort((left, right) => left.localeCompare(right))

  return [...orderedActiveNames, ...extraNames]
}

export function getVisibleColumns(
  portfolio: Portfolio,
  viewer: ViewerContext,
  filters: BoardFilters,
  settings: GlobalSettings,
  nowMs = Date.now(),
  options?: {
    showEmptyGroupedSections?: boolean
    manuallyExpandedStages?: StageId[]
  },
) {
  const visibleCards = getVisibleCards(portfolio, viewer, filters, settings, nowMs)
  const ownerNames = getBoardOwners(portfolio)
  const isLaunchOpsViewer = viewer.mode === 'contributor' && isLaunchOpsRole(viewer.memberRole)
  const activeOwner =
    viewer.mode === 'contributor' && !isLaunchOpsViewer
      ? viewer.editorName
      : filters.ownerNames.length === 1
        ? filters.ownerNames[0]
        : null
  const visibleAssignedCards = visibleCards.filter(
    (card) =>
      card.owner !== null &&
      (card.stage === 'Briefed' ||
        card.stage === 'In Production' ||
        card.stage === 'Review' ||
        card.stage === 'Ready'),
  )
  const workloadByOwner = new Map(
    ownerNames.map((owner) => {
      const cards = visibleAssignedCards.filter((card) => card.owner === owner)
      const member = getTeamMemberByName(portfolio, owner)
      const hoursPerDay = member?.hoursPerDay ?? 8
      const preferredStage =
        cards.some((card) => card.stage === 'In Production')
          ? 'In Production'
          : cards.some((card) => card.stage === 'Briefed')
            ? 'Briefed'
            : cards.some((card) => card.stage === 'Review')
              ? 'Review'
              : cards.some((card) => card.stage === 'Ready')
                ? 'Ready'
                : null

      return [
        owner,
        {
          totalHours: roundToTenths(
            cards.reduce((sum, card) => sum + getCardScheduledHours(card), 0),
          ),
          totalDays:
            hoursPerDay > 0
              ? roundToTenths(
                  cards.reduce((sum, card) => sum + getCardScheduledHours(card), 0) / hoursPerDay,
                )
              : 0,
          preferredStage,
        },
      ] as const
    }),
  )

  const columns: ColumnModel[] = STAGES.map((stage) => {
    if (!isGroupedStage(stage)) {
      const cards = getOrderedLaneCards(visibleCards, stage, null)
      return {
        id: stage,
        label: stage,
        grouped: false,
        count: cards.length,
        lanes: [
          {
            id: getLaneId(stage, null),
            stage,
            owner: null,
            label: stage,
            grouped: false,
            cards,
            allCardIds: getOrderedLaneCards(portfolio.cards, stage, null).map((card) => card.id),
            activeCount: cards.length,
            queuedHours: roundToTenths(
              cards.reduce((sum, card) => sum + getCardScheduledHours(card), 0),
            ),
            totalWorkDays: null,
            showTotalWorkload: false,
            utilizationPct: 0,
            utilizationTone: 'green',
            capacityUsed: 0,
            capacityTotal: 0,
            wipCount: null,
            wipCap: null,
          },
        ],
        hiddenEditorCount: 0,
      } satisfies ColumnModel
    }

    const showSingle = Boolean(activeOwner)
    const showAllGrouped =
      showSingle ||
      options?.showEmptyGroupedSections ||
      options?.manuallyExpandedStages?.includes(stage) ||
      false
    const owners = showSingle ? [activeOwner!] : ownerNames
    const visibleLanes = owners
      .map((owner) => {
        const cards = getOrderedLaneCards(visibleCards, stage, owner)
        const utilization = getCurrentUtilization(portfolio, owner, settings)
        const member = getTeamMemberByName(portfolio, owner)
        const workload = workloadByOwner.get(owner) ?? {
          totalHours: 0,
          totalDays: 0,
          preferredStage: null,
        }

        return {
          id: getLaneId(stage, owner),
          stage,
          owner,
          label: owner,
          grouped: !showSingle,
          cards,
          allCardIds: getOrderedLaneCards(portfolio.cards, stage, owner).map((card) => card.id),
          activeCount: cards.length,
          queuedHours: roundToTenths(
            cards.reduce((sum, card) => sum + getCardScheduledHours(card), 0),
          ),
          totalWorkDays:
            workload.preferredStage === stage ? workload.totalDays : null,
          showTotalWorkload: workload.preferredStage === stage,
          utilizationPct: utilization.utilizationPct,
          utilizationTone: utilization.utilizationTone,
          capacityUsed: utilization.usedHours,
          capacityTotal: utilization.totalHours,
          wipCount: utilization.wipCount,
          wipCap: member?.wipCap ?? null,
        } satisfies LaneModel
      })
      .filter((lane) => showAllGrouped || lane.cards.length > 0)

    return {
      id: stage,
      label: stage,
      grouped: !showSingle,
      count: visibleLanes.reduce((sum, lane) => sum + lane.cards.length, 0),
      lanes: visibleLanes,
      hiddenEditorCount: showSingle || showAllGrouped ? 0 : ownerNames.length - visibleLanes.length,
    } satisfies ColumnModel
  })

  if (filters.showArchived) {
    const archivedCards = getOrderedLaneCards(visibleCards, 'Archived', null)
    columns.push({
      id: 'Archived',
      label: 'Archived',
      grouped: false,
      count: archivedCards.length,
      lanes: [
        {
          id: getLaneId('Archived', null),
          stage: 'Archived',
          owner: null,
          label: 'Archived',
          grouped: false,
          cards: archivedCards,
          allCardIds: archivedCards.map((card) => card.id),
          activeCount: archivedCards.length,
          queuedHours: roundToTenths(
            archivedCards.reduce((sum, card) => sum + getCardScheduledHours(card), 0),
          ),
          totalWorkDays: null,
          showTotalWorkload: false,
          utilizationPct: 0,
          utilizationTone: 'green',
          capacityUsed: 0,
          capacityTotal: 0,
          wipCount: null,
          wipCap: null,
        },
      ],
      hiddenEditorCount: 0,
    })
  }

  return columns
}

export function getBoardStats(
  portfolio: Portfolio,
  viewer: ViewerContext,
  filters: BoardFilters,
  settings: GlobalSettings,
  nowMs = Date.now(),
) {
  const cards = getVisibleCards(
    portfolio,
    viewer,
    {
      ...filters,
      showArchived: false,
    },
    settings,
    nowMs,
  )

  const byStage = Object.fromEntries(STAGES.map((stage) => [stage, 0])) as Record<StageId, number>
  let stuck = 0
  let overdue = 0
  for (const card of cards) {
    byStage[card.stage] += 1
    if (getAgeToneFromMs(getCardAgeMs(card, nowMs), settings) === 'stuck') {
      stuck += 1
    }
    if (getDueStatus(card, nowMs) === 'overdue') {
      overdue += 1
    }
  }

  return {
    total: cards.length,
    byStage,
    stuck,
    overdue,
  } satisfies BoardStats
}

export function getEditorSummary(
  portfolio: Portfolio,
  owner: string,
  visibleBrandNames: string[],
  settings: GlobalSettings,
) {
  const cards = portfolio.cards.filter(
    (card) => !isArchivedCard(card) && card.owner === owner && visibleBrandNames.includes(card.brand),
  )
  const utilization = getCurrentUtilization(portfolio, owner, settings)
  const sumHours = (stage: StageId) =>
    roundToTenths(
      cards
        .filter((card) => card.stage === stage)
        .reduce((sum, card) => sum + getCardScheduledHours(card), 0),
    )

  return {
    owner,
    utilizationPct: utilization.utilizationPct,
    availableHours: utilization.availableHours,
    briefedCount: cards.filter((card) => card.stage === 'Briefed').length,
    briefedHours: sumHours('Briefed'),
    inProductionCount: cards.filter((card) => card.stage === 'In Production').length,
    inProductionHours: sumHours('In Production'),
    reviewCount: cards.filter((card) => card.stage === 'Review').length,
    reviewHours: sumHours('Review'),
    readyCount: cards.filter((card) => card.stage === 'Ready').length,
    readyHours: sumHours('Ready'),
    activeCount: utilization.activeCount,
  } satisfies EditorSummary
}

function getCardsSortedForScheduling(cards: Card[]) {
  const stageOrder: Record<StageId, number> = {
    Backlog: 5,
    Briefed: 0,
    'In Production': 1,
    Review: 2,
    Ready: 3,
    Live: 4,
  }

  return cards.slice().sort((left, right) => {
    if (stageOrder[left.stage] !== stageOrder[right.stage]) {
      return stageOrder[left.stage] - stageOrder[right.stage]
    }
    if (left.positionInSection !== right.positionInSection) {
      return left.positionInSection - right.positionInSection
    }
    return left.dateAssigned.localeCompare(right.dateAssigned)
  })
}

function getTimeframeRange(timeframe: Timeframe, nowMs: number) {
  if (timeframe === 'this-week') {
    const start = startOfWeekMs(nowMs)
    return {
      startMs: start,
      endMs: start + 7 * DAY_MS,
    }
  }

  if (timeframe === 'next-week') {
    const start = startOfWeekMs(nowMs) + 7 * DAY_MS
    return {
      startMs: start,
      endMs: start + 7 * DAY_MS,
    }
  }

  const start = startOfMonthMs(nowMs)
  const date = new Date(start)
  date.setMonth(date.getMonth() + 1)
  return {
    startMs: start,
    endMs: date.getTime(),
  }
}

function countWorkingDays(member: TeamMember, rangeStartMs: number, rangeEndMs: number) {
  let count = 0
  for (let cursor = rangeStartMs; cursor < rangeEndMs; cursor += DAY_MS) {
    if (member.workingDays.includes(getWorkingDayLabel(cursor))) {
      count += 1
    }
  }
  return count
}

function getWeeklyCapacityHours(member: TeamMember) {
  return member.weeklyHours ?? ((member.hoursPerDay ?? 0) * member.workingDays.length)
}

function getPeriodCapacity(member: TeamMember, timeframe: Timeframe, nowMs: number) {
  const range = getTimeframeRange(timeframe, nowMs)
  const workingDaysCount = countWorkingDays(member, range.startMs, range.endMs)
  const capacityHours = roundToTenths((member.hoursPerDay ?? 0) * workingDaysCount)

  return {
    ...range,
    capacityHours,
  }
}

function scheduleMemberLoad(
  portfolio: Portfolio,
  member: TeamMember,
  settings: GlobalSettings,
  timeframe: Timeframe,
  nowMs: number,
) {
  const activeCards = getCardsSortedForScheduling(
    portfolio.cards.filter(
      (card) => !isArchivedCard(card) && card.owner === member.name && isActiveWorkStage(card.stage),
    ),
  )
  const period = getPeriodCapacity(member, timeframe, nowMs)
  const breakdownMap = new Map<string, WorkloadBreakdownItem>()
  let capacityUsedHours = 0
  let cursorDayMs = startOfDayMs(nowMs)
  let hoursUsedInCurrentDay = 0

  function advanceToNextWorkingSlot() {
    while (!member.workingDays.includes(getWorkingDayLabel(cursorDayMs))) {
      cursorDayMs += DAY_MS
      hoursUsedInCurrentDay = 0
    }
    if ((member.hoursPerDay ?? 0) === 0) {
      return
    }
    if (hoursUsedInCurrentDay >= (member.hoursPerDay ?? 0)) {
      cursorDayMs += DAY_MS
      hoursUsedInCurrentDay = 0
      advanceToNextWorkingSlot()
    }
  }

  for (const card of activeCards) {
    let remainingHours = getCardScheduledHours(card)
    while (remainingHours > 0) {
      advanceToNextWorkingSlot()
      if ((member.hoursPerDay ?? 0) === 0) {
        break
      }

      const availableHours = Math.max(0, (member.hoursPerDay ?? 0) - hoursUsedInCurrentDay)
      if (availableHours <= 0) {
        cursorDayMs += DAY_MS
        hoursUsedInCurrentDay = 0
        continue
      }

      const allocation = Math.min(remainingHours, availableHours)

      if (cursorDayMs >= period.startMs && cursorDayMs < period.endMs) {
        capacityUsedHours += allocation
        const taskType = getTaskTypeById(settings, card.taskTypeId)
        const existing = breakdownMap.get(card.id)
        breakdownMap.set(card.id, {
          cardId: card.id,
          title: card.title,
          taskTypeId: card.taskTypeId,
          taskTypeName: taskType.name,
          icon: taskType.icon,
          hours: roundToTenths((existing?.hours ?? 0) + allocation),
        })
      }

      remainingHours -= allocation
      hoursUsedInCurrentDay += allocation
    }
  }

  const capacityTotal = period.capacityHours
  const capacityUsed = roundToTenths(capacityUsedHours)
  const utilizationPct =
    capacityTotal > 0 ? Math.round((capacityUsed / capacityTotal) * 100) : 0

  return {
    breakdown: Array.from(breakdownMap.values()),
    activeCards,
    capacityUsed,
    capacityTotal,
    utilizationPct,
    utilizationTone: getUtilizationTone(utilizationPct, settings),
  }
}

export function getWorkloadData(
  portfolio: Portfolio,
  settings: GlobalSettings,
  timeframe: Timeframe,
  nowMs = Date.now(),
) {
  const rows = getAssignableMembers(portfolio).map((member) => {
    const scheduled = scheduleMemberLoad(portfolio, member, settings, timeframe, nowMs)
    const weeklyHours = getWeeklyCapacityHours(member)
    const partTimeLabel =
      member.weeklyHours !== null &&
      member.weeklyHours < settings.capacity.defaultWeeklyHours
        ? `part-time: ${member.weeklyHours}h/wk`
        : weeklyHours > 0 && weeklyHours < settings.capacity.defaultWeeklyHours
          ? `part-time: ${weeklyHours}h/wk`
          : null

    return {
      member,
      utilizationPct: scheduled.utilizationPct,
      utilizationTone: scheduled.utilizationTone,
      capacityUsed: scheduled.capacityUsed,
      capacityTotal: scheduled.capacityTotal,
      breakdown: scheduled.breakdown,
      activeCards: scheduled.activeCards,
      partTimeLabel,
    } satisfies WorkloadRow
  })

  const queue = portfolio.cards
    .filter((card) => !isArchivedCard(card) && card.stage === 'Backlog')
    .map((card) => {
      const taskType = getTaskTypeById(settings, card.taskTypeId)
      return {
        cardId: card.id,
        title: card.title,
        taskTypeId: card.taskTypeId,
        taskTypeName: taskType.name,
        icon: taskType.icon,
        hours: getCardScheduledHours(card),
        daysWaiting: Math.max(0, Math.round(getCardAgeMs(card, nowMs) / DAY_MS)),
      } satisfies WorkloadQueueRow
    })

  return {
    rows,
    queue,
    queueHours: roundToTenths(queue.reduce((sum, item) => sum + item.hours, 0)),
  } satisfies WorkloadData
}

export function getCardMoveValidationMessage(
  portfolio: Portfolio,
  viewer: ViewerContext,
  cardId: string,
  destinationStage: StageId,
  destinationOwner: string | null,
) {
  const card = portfolio.cards.find((item) => item.id === cardId)
  if (!card) {
    return 'That card could not be moved.'
  }

  const nextOwner = destinationStage === 'Backlog' ? null : destinationOwner ?? card.owner
  const isBackwardMove = STAGES.indexOf(destinationStage) < STAGES.indexOf(card.stage)
  const isLaunchOpsViewer = viewer.mode === 'contributor' && isLaunchOpsRole(viewer.memberRole)
  const movingWithinSameSection = destinationStage === card.stage && nextOwner === card.owner

  if (viewer.mode === 'viewer') {
    return 'Viewer access is read-only.'
  }

  if (isLaunchOpsViewer) {
    if (card.stage !== 'Ready') {
      return 'Launch Ops can only act on cards in Ready.'
    }

    if (destinationStage !== 'Live') {
      return 'Launch Ops can only move cards from Ready to Live.'
    }

    return null
  }

  if (viewer.mode === 'contributor') {
    if (!viewer.editorName || card.owner !== viewer.editorName) {
      return 'Contributors can only move their own cards.'
    }

    if (destinationOwner && destinationOwner !== viewer.editorName) {
      return 'Contributors can only move cards within their own lane.'
    }

    if (!canEditorMoveStage(card.stage)) {
      return 'Contributors can only move cards between Briefed, In Production, Review, and Ready.'
    }

    if (destinationStage === 'Live') {
      return 'Only owners and managers can move cards to Live.'
    }

    if (destinationStage === 'Backlog') {
      return 'Contributors cannot move cards back to Backlog.'
    }

    if (movingWithinSameSection) {
      return 'Only owners and managers can reorder priority within a section.'
    }

    if (!isBackwardMove) {
      const nextStage = getNextStageForEditor(card.stage)
      if (!nextStage || destinationStage !== nextStage) {
        return 'Contributors can only move cards forward one stage at a time, up to Ready.'
      }
    }
  }

  if (isGroupedStage(destinationStage) && !nextOwner) {
    return 'Choose a teammate lane to assign this card.'
  }

  if (card.stage === 'Review' && destinationStage === 'Briefed') {
    return 'Revisions from Review return to In Production.'
  }

  if (destinationStage === 'In Production' && nextOwner) {
    const member = getTeamMemberByName(portfolio, nextOwner)
    const projectedWip = portfolio.cards.filter(
      (currentCard) =>
        currentCard.id !== card.id &&
        currentCard.owner === nextOwner &&
        currentCard.stage === 'In Production' &&
        !currentCard.archivedAt,
    ).length
    if (
      !isBackwardMove &&
      member?.wipCap !== null &&
      member?.wipCap !== undefined &&
      projectedWip >= member.wipCap
    ) {
      return `${nextOwner} is at capacity (${member.wipCap}/${member.wipCap})`
    }
  }

  return null
}

export function addCardToPortfolio(portfolio: Portfolio, card: Card, viewer: ViewerContext) {
  if (!canManageCards(viewer) || portfolio.cards.some((existingCard) => existingCard.id === card.id)) {
    return portfolio
  }

  const brand = getBrandByName(portfolio, card.brand)
  const prefix = brand?.prefix ?? ''
  const backlogCards = getOrderedLaneCards(portfolio.cards, 'Backlog', null)
  const otherCards = portfolio.cards.filter((existingCard) => existingCard.stage !== 'Backlog' || isArchivedCard(existingCard))

  return {
    ...portfolio,
    cards: reindexCards([
      ...backlogCards,
      { ...card, positionInSection: backlogCards.length },
      ...otherCards,
    ]),
    lastIdPerPrefix: {
      ...portfolio.lastIdPerPrefix,
      [prefix]: Math.max(
        portfolio.lastIdPerPrefix[prefix] ?? 0,
        Number(card.id.replace(prefix, '')) || 0,
      ),
    },
  }
}

export function removeCardFromPortfolio(
  portfolio: Portfolio,
  cardId: string,
  viewer: ViewerContext,
) {
  if (!canManageCards(viewer) || !portfolio.cards.some((card) => card.id === cardId)) {
    return portfolio
  }

  const remainingCards = portfolio.cards.filter((card) => card.id !== cardId)

  return {
    ...portfolio,
    cards: reindexCards(remainingCards),
  }
}

function closeCurrentStageEntry(entries: StageHistoryEntry[], movedAt: string) {
  if (entries.length === 0) {
    return entries
  }

  const nextEntries = [...entries]
  const lastEntry = nextEntries[nextEntries.length - 1]
  nextEntries[nextEntries.length - 1] = {
    ...lastEntry,
    exitedAt: movedAt,
    durationDays: roundToTenths(
      (new Date(movedAt).getTime() - new Date(lastEntry.enteredAt).getTime()) / DAY_MS,
    ),
  }

  return nextEntries
}

export function moveCardInPortfolio(
  portfolio: Portfolio,
  cardId: string,
  destinationStage: StageId,
  destinationOwner: string | null,
  destinationIndex: number,
  movedAt: string,
  actor: string,
  viewer: ViewerContext,
  revisionReason?: string,
  revisionEstimatedHours?: number | null,
) {
  const existingCard = portfolio.cards.find((card) => card.id === cardId)
  if (!existingCard) {
    return portfolio
  }

  if (getCardMoveValidationMessage(portfolio, viewer, cardId, destinationStage, destinationOwner)) {
    return portfolio
  }

  const nextOwner = destinationStage === 'Backlog' ? null : destinationOwner ?? existingCard.owner
  const normalizedRevisionReason = revisionReason?.trim()
  const stageChanged = existingCard.stage !== destinationStage
  const isBackwardMove = STAGES.indexOf(destinationStage) < STAGES.indexOf(existingCard.stage)
  const isForwardMove = STAGES.indexOf(destinationStage) > STAGES.indexOf(existingCard.stage)

  if (
    stageChanged &&
    isBackwardMove &&
    (!normalizedRevisionReason || typeof revisionEstimatedHours !== 'number' || revisionEstimatedHours <= 0)
  ) {
    return portfolio
  }

  if (stageChanged && isForwardMove && existingCard.blocked) {
    return portfolio
  }

  const otherCards = portfolio.cards.filter((card) => card.id !== cardId)
  const sourceLaneCards = getOrderedLaneCards(
    otherCards,
    existingCard.archivedAt ? 'Archived' : existingCard.stage,
    existingCard.owner,
  ).map((card) => card.id)
  const targetLaneCards = getOrderedLaneCards(
    otherCards,
    destinationStage,
    nextOwner,
  ).map((card) => card.id)
  const boundedIndex = Math.max(0, Math.min(destinationIndex, targetLaneCards.length))
  const nextTargetLane = [...targetLaneCards]
  nextTargetLane.splice(boundedIndex, 0, cardId)
  const positionMap = new Map<string, number>()
  sourceLaneCards.forEach((id, index) => positionMap.set(id, index))
  nextTargetLane.forEach((id, index) => positionMap.set(id, index))

  const ownerChanged = existingCard.owner !== nextOwner
  const nextHistory = stageChanged
    ? [
        ...closeCurrentStageEntry(existingCard.stageHistory, movedAt),
        {
          stage: destinationStage,
          enteredAt: movedAt,
          exitedAt: null,
          durationDays: null,
          movedBack: isBackwardMove || undefined,
          revisionReason: isBackwardMove ? normalizedRevisionReason : undefined,
          revisionEstimatedHours: isBackwardMove ? revisionEstimatedHours ?? undefined : undefined,
        },
      ]
    : [...existingCard.stageHistory]

  let updatedCard: Card = {
    ...existingCard,
    owner: nextOwner,
    stage: destinationStage,
    stageEnteredAt: stageChanged ? movedAt : existingCard.stageEnteredAt,
    stageHistory: nextHistory,
    dateAssigned:
      existingCard.stage === 'Backlog' && destinationStage !== 'Backlog'
        ? movedAt.slice(0, 10)
        : existingCard.dateAssigned,
    positionInSection: positionMap.get(cardId) ?? existingCard.positionInSection,
    revisionEstimatedHours: isBackwardMove
      ? revisionEstimatedHours ?? existingCard.revisionEstimatedHours
      : isForwardMove
        ? null
        : existingCard.revisionEstimatedHours,
  }

  if (ownerChanged && nextOwner) {
    updatedCard = appendActivity(
      updatedCard,
      createActivityEntry(actor, `assigned to ${nextOwner}`, 'assigned', movedAt),
    )
  }

  if (stageChanged) {
    updatedCard = appendActivity(
      updatedCard,
      createActivityEntry(
        actor,
        isBackwardMove
          ? `moved back to ${destinationStage}${normalizedRevisionReason ? ` — Reason: ${normalizedRevisionReason}` : ''}${
              revisionEstimatedHours ? ` — Revision estimate: ${formatHours(revisionEstimatedHours)}` : ''
            }`
          : `moved to ${destinationStage}`,
        isBackwardMove ? 'moved-back' : 'moved-forward',
        movedAt,
      ),
    )
  }

  const updatedCards = otherCards.map((card) =>
    positionMap.has(card.id)
      ? { ...card, positionInSection: positionMap.get(card.id) ?? card.positionInSection }
      : card,
  )

  return {
    ...portfolio,
    cards: reindexCards([...updatedCards, syncGeneratedNames(updatedCard)]),
  }
}

export function applyCardUpdates(
  portfolio: Portfolio,
  _settings: GlobalSettings,
  cardId: string,
  updates: Partial<Card>,
  actor: string,
  timestamp: string,
  viewer: ViewerContext,
) {
  const targetCard = portfolio.cards.find((card) => card.id === cardId)
  if (!targetCard || !canUpdateCard(viewer, targetCard, updates)) {
    return portfolio
  }

  return {
    ...portfolio,
    cards: portfolio.cards.map((card) => {
      if (card.id !== cardId) {
        return card
      }

      const previous = card
      const normalizedOwner =
        updates.owner === undefined
          ? undefined
          : isGroupedStage(card.stage) && updates.owner === null
            ? previous.owner
            : updates.owner
      const normalizedUpdates =
        normalizedOwner === undefined ? updates : { ...updates, owner: normalizedOwner }
      let nextCard = syncGeneratedNames({
        ...card,
        ...normalizedUpdates,
      })
      nextCard = syncCardProductWithBrand(portfolio, nextCard)

      if (
        normalizedOwner !== undefined &&
        normalizedOwner !== previous.owner &&
        normalizedOwner
      ) {
        nextCard = appendActivity(
          nextCard,
          createActivityEntry(actor, `assigned to ${normalizedOwner}`, 'assigned', timestamp),
        )
      }

      if (
        updates.estimatedHours !== undefined &&
        updates.estimatedHours !== previous.estimatedHours
      ) {
        nextCard = appendActivity(
          nextCard,
          createActivityEntry(
            actor,
            `changed estimate from ${previous.estimatedHours}h to ${updates.estimatedHours}h`,
            'effort',
            timestamp,
          ),
        )
      }

      if (
        updates.revisionEstimatedHours !== undefined &&
        updates.revisionEstimatedHours !== previous.revisionEstimatedHours
      ) {
        const message =
          updates.revisionEstimatedHours === null
            ? 'cleared the revision estimate'
            : previous.revisionEstimatedHours === null
              ? `set revision estimate to ${updates.revisionEstimatedHours}h`
              : `changed revision estimate from ${previous.revisionEstimatedHours}h to ${updates.revisionEstimatedHours}h`
        nextCard = appendActivity(
          nextCard,
          createActivityEntry(actor, message, 'effort', timestamp),
        )
      }

      if (updates.dueDate !== undefined && updates.dueDate !== previous.dueDate) {
        nextCard = appendActivity(
          nextCard,
          createActivityEntry(
            actor,
            updates.dueDate
              ? `set due date to ${formatDateShort(updates.dueDate)}`
              : 'cleared the due date',
            'due-date',
            timestamp,
          ),
        )
      }

      if (updates.frameioLink !== undefined && updates.frameioLink !== previous.frameioLink && updates.frameioLink) {
        nextCard = appendActivity(
          nextCard,
          createActivityEntry(actor, 'added Frame.io review link', 'frameio', timestamp),
        )
      }

      if (updates.blocked !== undefined && updates.blocked !== previous.blocked) {
        nextCard = appendActivity(
          nextCard,
          createActivityEntry(
            actor,
            updates.blocked
              ? `marked as blocked — ${updates.blocked.reason}`
              : 'removed blocked status',
            updates.blocked ? 'blocked' : 'unblocked',
            timestamp,
          ),
        )
      }

      if (
        updates.driveFolderCreated !== undefined &&
        updates.driveFolderCreated &&
        !previous.driveFolderCreated
      ) {
        nextCard = appendActivity(
          nextCard,
          createActivityEntry(actor, 'created Drive folder', 'drive', timestamp),
        )
      }

      if (updates.archivedAt !== undefined && updates.archivedAt !== previous.archivedAt) {
        nextCard = appendActivity(
          nextCard,
          createActivityEntry(
            actor,
            updates.archivedAt ? 'archived this card' : 'unarchived this card',
            updates.archivedAt ? 'archive' : 'unarchive',
            timestamp,
          ),
        )
      }

      return nextCard
    }),
  }
}

export function archiveEligibleCards(state: AppState, nowMs = Date.now()) {
  if (!state.settings.general.autoArchiveEnabled) {
    return state
  }

  let changed = false
  const nextPortfolios = state.portfolios.map((portfolio) => ({
    ...portfolio,
    cards: portfolio.cards.map((card) => {
      if (
        card.archivedAt === null &&
        card.stage === 'Live' &&
        card.blocked === null &&
        getCardAgeMs(card, nowMs) >= state.settings.general.autoArchiveDays * DAY_MS
      ) {
        changed = true
        return appendActivity(
          {
            ...card,
            archivedAt: new Date(nowMs).toISOString(),
          },
          createActivityEntry('System', 'archived this card', 'archive', new Date(nowMs).toISOString()),
        )
      }
      return card
    }),
  }))

  return changed ? { ...state, portfolios: nextPortfolios } : state
}

function getFirstStageEntry(card: Card, stage: StageId) {
  return card.stageHistory.find((entry) => entry.stage === stage) ?? null
}

function getLastStageEntry(card: Card, stage: StageId) {
  return [...card.stageHistory].reverse().find((entry) => entry.stage === stage) ?? null
}

export function getCycleTimeDays(card: Card) {
  const firstBriefed = getFirstStageEntry(card, 'Briefed')
  const firstReady = getFirstStageEntry(card, 'Ready') ?? getFirstStageEntry(card, 'Live')
  if (!firstBriefed || !firstReady) {
    return null
  }

  return roundToTenths(
    (new Date(firstReady.enteredAt).getTime() -
      new Date(firstBriefed.enteredAt).getTime()) /
      DAY_MS,
  )
}

function getCurrentWorkloadDays(portfolio: Portfolio, card: Card) {
  const hoursPerDay = Math.max(1, getTeamMemberByName(portfolio, card.owner)?.hoursPerDay ?? 8)
  return roundToTenths(getCardScheduledHours(card) / hoursPerDay)
}

function getCardsEnteredLiveWithin(portfolio: Portfolio, startMs: number, endMs: number) {
  return portfolio.cards.filter((card) => {
    const liveEntry = getLastStageEntry(card, 'Live')
    if (!liveEntry) {
      return false
    }
    const enteredAtMs = new Date(liveEntry.enteredAt).getTime()
    return enteredAtMs >= startMs && enteredAtMs < endMs
  })
}

function buildDashboardCardRow(portfolio: Portfolio, card: Card, nowMs: number): DashboardCardRow {
  return {
    portfolioId: portfolio.id,
    portfolioName: portfolio.name,
    cardId: card.id,
    title: card.title,
    brand: card.brand,
    stage: card.stage,
    owner: card.owner,
    daysInStage: Math.max(0, Math.round(getCardAgeMs(card, nowMs) / DAY_MS)),
    isBlocked: Boolean(card.blocked),
    blockedReason: card.blocked?.reason ?? null,
    isOverdue: getDueStatus(card, nowMs) === 'overdue',
  }
}

function buildOverviewCards(
  portfolios: Portfolio[],
  settings: GlobalSettings,
  nowMs: number,
) {
  return portfolios.map((portfolio) => {
    const activeCards = portfolio.cards.filter((card) => !isArchivedCard(card) && card.stage !== 'Live')
    const freshCount = activeCards.filter(
      (card) => getAgeToneFromMs(getCardAgeMs(card, nowMs), settings) === 'fresh',
    ).length
    const stuckCount = activeCards.filter(
      (card) => getAgeToneFromMs(getCardAgeMs(card, nowMs), settings) === 'stuck',
    ).length
    const atCapacityCount = getAssignableMembers(portfolio).filter((member) => {
      const utilization = getCurrentUtilization(portfolio, member.name, settings)
      return (
        utilization.utilizationPct >= settings.capacity.utilizationThresholds.redMin ||
        (member.wipCap !== null && utilization.wipCount >= member.wipCap)
      )
    }).length

    return {
      portfolioId: portfolio.id,
      name: portfolio.name,
      activeCards: activeCards.length,
      onTrackRatio: activeCards.length === 0 ? 0 : freshCount / activeCards.length,
      stuckCount,
      atCapacityCount,
      brandBreakdown: portfolio.brands.map((brand) => ({
        brand: brand.name,
        count: activeCards.filter((card) => card.brand === brand.name).length,
      })),
    } satisfies PortfolioOverviewCard
  })
}

function buildPipelineFunnel(portfolios: Portfolio[], nowMs: number) {
  return STAGES.map((stage) => {
    const cards = portfolios.flatMap((portfolio) =>
      portfolio.cards
        .filter((card) => !isArchivedCard(card) && card.stage === stage)
        .map((card) => buildDashboardCardRow(portfolio, card, nowMs)),
    )
    const segments = portfolios.flatMap((portfolio) =>
      portfolio.brands
        .map((brand) => ({
          brand: brand.name,
          color: brand.color,
          count: portfolio.cards.filter(
            (card) => !isArchivedCard(card) && card.stage === stage && card.brand === brand.name,
          ).length,
        }))
        .filter((segment) => segment.count > 0),
    )

    return {
      stage,
      total: cards.length,
      segments,
      cards,
    } satisfies FunnelStageBucket
  })
}

function buildTeamCapacityGrid(portfolios: Portfolio[], settings: GlobalSettings) {
  return portfolios.flatMap((portfolio) =>
    getAssignableMembers(portfolio).map((member) => {
      const utilization = getCurrentUtilization(portfolio, member.name, settings)
      const avgCycleTimeValues = portfolio.cards
        .filter((card) => card.owner === member.name)
        .map((card) => getCycleTimeDays(card))
        .filter((value): value is number => value !== null)
      const avgRevisionsValues = portfolio.cards
        .filter((card) => card.owner === member.name)
        .map((card) => getRevisionCount(card))

      return {
        editorName: member.name,
        editorId: member.id,
        portfolioId: portfolio.id,
        portfolioName: portfolio.name,
        active: utilization.activeCount,
        utilizationPct: utilization.utilizationPct,
        utilizationTone: utilization.utilizationTone,
        usedHours: utilization.usedHours,
        totalHours: utilization.totalHours,
        workloadDays: roundToTenths(
          utilization.activeCards.reduce(
            (sum, card) => sum + getCurrentWorkloadDays(portfolio, card),
            0,
          ),
        ),
        avgCycleTime:
          avgCycleTimeValues.length > 0
            ? roundToTenths(
                avgCycleTimeValues.reduce((sum, value) => sum + value, 0) /
                  avgCycleTimeValues.length,
              )
            : null,
        avgRevisionsPerCard:
          avgRevisionsValues.length > 0
            ? roundToTenths(
                avgRevisionsValues.reduce((sum, value) => sum + value, 0) /
                  avgRevisionsValues.length,
              )
            : null,
      } satisfies TeamCapacityRow
    }),
  )
}

function buildStuckCardsList(
  portfolios: Portfolio[],
  settings: GlobalSettings,
  nowMs: number,
) {
  return portfolios
    .flatMap((portfolio) =>
      portfolio.cards
        .filter(
          (card) =>
            !isArchivedCard(card) &&
            (getAgeToneFromMs(getCardAgeMs(card, nowMs), settings) === 'stuck' ||
              getDueStatus(card, nowMs) === 'overdue'),
        )
        .map((card) => buildDashboardCardRow(portfolio, card, nowMs)),
    )
    .sort((left, right) => right.daysInStage - left.daysInStage)
}

function buildThroughputData(portfolios: Portfolio[], nowMs: number) {
  const currentWeekStart = startOfWeekMs(nowMs)

  return Array.from({ length: 8 }, (_, index) => {
    const startMs = currentWeekStart - (7 - index) * 7 * DAY_MS
    const endMs = startMs + 7 * DAY_MS
    const label = formatDateShort(new Date(startMs).toISOString())
    const segments = portfolios.flatMap((portfolio) =>
      portfolio.brands
        .map((brand) => ({
          brand: brand.name,
          color: brand.color,
          count: getCardsEnteredLiveWithin(portfolio, startMs, endMs).filter(
            (card) => card.brand === brand.name,
          ).length,
        }))
        .filter((segment) => segment.count > 0),
    )

    return {
      label,
      total: segments.reduce((sum, segment) => sum + segment.count, 0),
      segments,
    } satisfies ThroughputWeek
  })
}

function buildBrandHealthSummary(
  portfolios: Portfolio[],
  settings: GlobalSettings,
  nowMs: number,
  thirtyDaysAgo: number,
) {
  return portfolios.flatMap((portfolio) =>
    portfolio.brands.map((brand) => {
      const brandCards = portfolio.cards.filter((card) => card.brand === brand.name)
      const recentCycleTimes = brandCards
        .filter((card) => {
          const readyEntry = getLastStageEntry(card, 'Ready') ?? getLastStageEntry(card, 'Live')
          return readyEntry !== null && new Date(readyEntry.enteredAt).getTime() >= thirtyDaysAgo
        })
        .map((card) => getCycleTimeDays(card))
        .filter((value): value is number => value !== null)
      const lastShipped = brandCards
        .map((card) => getLastStageEntry(card, 'Live'))
        .filter((entry): entry is StageHistoryEntry => entry !== null)
        .sort((left, right) => right.enteredAt.localeCompare(left.enteredAt))[0]

      return {
        portfolioId: portfolio.id,
        portfolioName: portfolio.name,
        brand: brand.name,
        color: brand.color,
        active: brandCards.filter((card) => !isArchivedCard(card) && card.stage !== 'Live').length,
        stuck: brandCards.filter(
          (card) =>
            !isArchivedCard(card) &&
            card.stage !== 'Live' &&
            getAgeToneFromMs(getCardAgeMs(card, nowMs), settings) === 'stuck',
        ).length,
        inProduction: brandCards.filter(
          (card) => !isArchivedCard(card) && card.stage === 'In Production',
        ).length,
        avgCycleTime:
          recentCycleTimes.length > 0
            ? roundToTenths(
                recentCycleTimes.reduce((sum, value) => sum + value, 0) /
                  recentCycleTimes.length,
              )
            : null,
        lastShipped: lastShipped?.enteredAt ?? null,
      } satisfies BrandHealthRow
    }),
  )
}

function buildRevisionPatterns(portfolios: Portfolio[], thirtyDaysAgo: number) {
  const revisionReasonCounts = new Map<string, number>()
  const editorRevisionAccumulator = new Map<string, number[]>()

  portfolios.forEach((portfolio) => {
    portfolio.cards.forEach((card) => {
      const recentEntries = card.stageHistory.filter(
        (entry) => new Date(entry.enteredAt).getTime() >= thirtyDaysAgo,
      )
      const recentRevisionCount = recentEntries.filter(
        (entry) => entry.movedBack && Boolean(entry.revisionReason),
      ).length

      recentEntries.forEach((entry) => {
        if (entry.movedBack && entry.revisionReason) {
          revisionReasonCounts.set(
            entry.revisionReason,
            (revisionReasonCounts.get(entry.revisionReason) ?? 0) + 1,
          )
        }
      })

      const hasRecentCardActivity =
        new Date(card.dateCreated).getTime() >= thirtyDaysAgo || recentEntries.length > 0
      if (card.owner && hasRecentCardActivity) {
        const values = editorRevisionAccumulator.get(card.owner) ?? []
        values.push(recentRevisionCount)
        editorRevisionAccumulator.set(card.owner, values)
      }
    })
  })

  const totalRevisionEvents = Array.from(revisionReasonCounts.values()).reduce(
    (sum, value) => sum + value,
    0,
  )
  const revisionReasons = Array.from(revisionReasonCounts.entries())
    .map(([reason, count]) => ({
      reason,
      count,
      percent: totalRevisionEvents > 0 ? Math.round((count / totalRevisionEvents) * 100) : 0,
    }))
    .sort((left, right) => right.count - left.count)

  const editorRevisionRates = Array.from(editorRevisionAccumulator.entries())
    .map(([editorName, values]) => ({
      editorName,
      avgRevisionsPerCard:
        values.length > 0
          ? roundToTenths(values.reduce((sum, value) => sum + value, 0) / values.length)
          : 0,
    }))
    .sort((left, right) => right.avgRevisionsPerCard - left.avgRevisionsPerCard)

  return {
    revisionReasons,
    editorRevisionRates,
  }
}

export function buildDashboardData(
  portfolios: Portfolio[],
  settings: GlobalSettings,
  nowMs = Date.now(),
) {
  const thirtyDaysAgo = nowMs - 30 * DAY_MS
  const revisionPatterns = buildRevisionPatterns(portfolios, thirtyDaysAgo)

  return {
    overviewCards: buildOverviewCards(portfolios, settings, nowMs),
    funnel: buildPipelineFunnel(portfolios, nowMs),
    teamGrid: buildTeamCapacityGrid(portfolios, settings),
    stuckCards: buildStuckCardsList(portfolios, settings, nowMs),
    throughput: buildThroughputData(portfolios, nowMs),
    brandHealth: buildBrandHealthSummary(portfolios, settings, nowMs, thirtyDaysAgo),
    revisionReasons: revisionPatterns.revisionReasons,
    editorRevisionRates: revisionPatterns.editorRevisionRates,
  } satisfies DashboardData
}

export function getAttentionSummary(
  portfolio: Portfolio | null,
  settings: GlobalSettings,
  nowMs = Date.now(),
) {
  if (!portfolio) {
    return {
      overdueCount: 0,
      stuckCount: 0,
      blockedCount: 0,
      hasAttention: false,
    } satisfies AttentionSummary
  }

  const cards = portfolio.cards.filter((card) => !isArchivedCard(card))
  const overdueCount = cards.filter((card) => getDueStatus(card, nowMs) === 'overdue').length
  const stuckCount = cards.filter(
    (card) => getAgeToneFromMs(getCardAgeMs(card, nowMs), settings) === 'stuck',
  ).length
  const blockedCount = cards.filter((card) => card.blocked !== null).length

  return {
    overdueCount,
    stuckCount,
    blockedCount,
    hasAttention: overdueCount > 0 || stuckCount > 0 || blockedCount > 0,
  } satisfies AttentionSummary
}

export function formatHours(hours: number) {
  return `${roundToTenths(hours)}h`
}

export function getBackwardMoveReasonsInLast30Days(
  portfolios: Portfolio[],
  nowMs = Date.now(),
) {
  const threshold = nowMs - 30 * DAY_MS
  return portfolios.flatMap((portfolio) =>
    portfolio.cards.flatMap((card) =>
      card.stageHistory.filter(
        (entry) =>
          entry.movedBack &&
          entry.revisionReason &&
          new Date(entry.enteredAt).getTime() >= threshold,
      ),
    ),
  )
}
