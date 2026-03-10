export const STAGES = [
  'backlog',
  'briefed',
  'in_production',
  'review',
  'ready',
  'live',
] as const

export const STAGE_LABELS: Record<StageId, string> = {
  backlog: 'Backlog',
  briefed: 'Briefed',
  in_production: 'In Production',
  review: 'Review',
  ready: 'Ready',
  live: 'Live',
}

export const BRAND_FILTERS = ['All', 'Pluxy', 'Vivi'] as const
export const BRAND_IDS = ['Pluxy', 'Vivi'] as const
export const TASK_TYPES = ['Creative', 'Landing Page', 'Offer', 'Other'] as const

export type StageId = (typeof STAGES)[number]
export type BrandFilter = (typeof BRAND_FILTERS)[number]
export type BrandId = (typeof BRAND_IDS)[number]
export type TaskType = (typeof TASK_TYPES)[number]
export type AgeTone = 'fresh' | 'aging' | 'stuck'

export type UserId =
  | 'naomi'
  | 'daniel'
  | 'joe'
  | 'ezequiel'
  | 'bryan'
  | 'shita'
  | 'ivan'
  | 'iskander'

export type UserKind = 'manager' | 'editor' | 'launch_ops' | 'observer'
export type ViewerMode = 'manager' | 'editor' | 'observer'

export interface BoardUser {
  id: UserId
  name: string
  kind: UserKind
  title: string
}

export interface Attachment {
  id: string
  label: string
  url: string
}

export interface CommentItem {
  id: string
  authorId: UserId
  createdAt: string
  body: string
  parentId: string | null
}

export interface StageEntry {
  stage: StageId
  enteredAt: string
  exitedAt: string | null
  transitionKind?: 'moved_back'
}

export interface Task {
  id: string
  testId: string
  title: string
  brand: BrandId
  type: TaskType
  stage: StageId
  assigneeId: UserId | null
  createdAt: string
  briefHtml: string
  attachments: Attachment[]
  comments: CommentItem[]
  stageHistory: StageEntry[]
}

export interface BoardState {
  tasks: Record<string, Task>
  columns: Record<string, string[]>
  settings: {
    wipLimits: Record<UserId, number>
  }
}

export interface VisibleContainer {
  id: string
  stage: StageId
  label: string
  canonicalContainerId: string
  assigneeId: UserId | null
  assigneeName: string | null
  taskIds: string[]
  grouped: boolean
  emptyLabel: string
  wipCount: number | null
  wipLimit: number | null
}

export interface StageColumnModel {
  stage: StageId
  label: string
  grouped: boolean
  totalCount: number
  containers: VisibleContainer[]
}

export interface TaskFilters {
  brands?: BrandId[]
  editors?: UserId[]
}

export interface StageHistorySegment {
  stage: StageId
  durationMs: number
  durationLabel: string
  tone: AgeTone
  movedBack: boolean
  isCurrent: boolean
}

export interface EditorSnapshot {
  userId: UserId
  totalVisibleCards: number
  stageCounts: Record<StageId, number>
  inProductionCount: number
  wipLimit: number
  estimatedWorkloadDays: number
}

export type BoardAction =
  | {
      type: 'move-task'
      taskId: string
      destinationStage: StageId
      destinationAssigneeId: UserId | null
      destinationIndex: number
      movedAt?: string
    }
  | {
      type: 'update-task'
      taskId: string
      updates: Partial<
        Pick<Task, 'testId' | 'title' | 'brand' | 'type' | 'briefHtml'>
      >
    }
  | {
      type: 'update-assignee'
      taskId: string
      assigneeId: UserId | null
    }
  | {
      type: 'replace-attachments'
      taskId: string
      attachments: Attachment[]
    }
  | {
      type: 'add-comment'
      taskId: string
      comment: CommentItem
    }
  | {
      type: 'create-task'
      task: Task
    }
  | {
      type: 'update-wip-limit'
      userId: UserId
      limit: number
    }
  | {
      type: 'reset-board'
    }

export const STORAGE_KEY = 'creative-board-mvp:v1'

const DAY_MS = 24 * 60 * 60 * 1000
const HOUR_MS = 60 * 60 * 1000
const GROUPED_STAGE_SET = new Set<StageId>([
  'briefed',
  'in_production',
  'review',
])

export const USERS: BoardUser[] = [
  {
    id: 'naomi',
    name: 'Naomi',
    kind: 'manager',
    title: 'Brand Manager',
  },
  {
    id: 'daniel',
    name: 'Daniel',
    kind: 'editor',
    title: 'Editor + Developer',
  },
  {
    id: 'joe',
    name: 'Joe',
    kind: 'editor',
    title: 'Video Editor',
  },
  {
    id: 'ezequiel',
    name: 'Ezequiel',
    kind: 'editor',
    title: 'Video Editor',
  },
  {
    id: 'bryan',
    name: 'Bryan',
    kind: 'editor',
    title: 'Video Editor',
  },
  {
    id: 'shita',
    name: 'Shita',
    kind: 'editor',
    title: 'Designer',
  },
  {
    id: 'ivan',
    name: 'Ivan',
    kind: 'launch_ops',
    title: 'Launch Ops',
  },
  {
    id: 'iskander',
    name: 'Iskander',
    kind: 'observer',
    title: 'Founder / Observer',
  },
]

export const USER_MAP = Object.fromEntries(
  USERS.map((user) => [user.id, user]),
) as Record<UserId, BoardUser>

export const ROLE_SWITCHER_ORDER: UserId[] = [
  'naomi',
  'daniel',
  'joe',
  'ezequiel',
  'bryan',
  'shita',
  'ivan',
  'iskander',
]

export const EDITOR_ROLE_IDS: UserId[] = [
  'daniel',
  'joe',
  'ezequiel',
  'bryan',
  'shita',
  'ivan',
]

export const WORKER_IDS: UserId[] = [
  'daniel',
  'joe',
  'ezequiel',
  'bryan',
  'shita',
  'ivan',
  'naomi',
]

interface SeedComment {
  authorId: UserId
  body: string
  hoursAfterEnter: number
  parentId?: string
}

interface SeedTask {
  testId: string
  title: string
  brand: BrandId
  type: TaskType
  stage: StageId
  assigneeId: UserId | null
  ageDays: number
  briefLead: string
  bullets: string[]
  attachments?: Array<Pick<Attachment, 'label' | 'url'>>
  comments?: SeedComment[]
}

function isGroupedStage(stage: StageId) {
  return GROUPED_STAGE_SET.has(stage)
}

export function getViewerMode(userId: UserId): ViewerMode {
  if (userId === 'naomi') {
    return 'manager'
  }

  if (userId === 'iskander') {
    return 'observer'
  }

  return 'editor'
}

export function getCanonicalContainerId(
  stage: StageId,
  assigneeId: UserId | null,
) {
  if (stage === 'backlog' || stage === 'ready' || stage === 'live') {
    return `${stage}::all`
  }

  return `${stage}::${assigneeId ?? 'unassigned'}`
}

function createEmptyColumns() {
  const columns: Record<string, string[]> = {}

  for (const stage of STAGES) {
    if (isGroupedStage(stage)) {
      for (const userId of WORKER_IDS) {
        columns[getCanonicalContainerId(stage, userId)] = []
      }

      columns[getCanonicalContainerId(stage, null)] = []
      continue
    }

    columns[getCanonicalContainerId(stage, null)] = []
  }

  return columns
}

function getSeedStageHistory(stage: StageId, ageDays: number) {
  const stageIndex = STAGES.indexOf(stage)
  const visibleStages = STAGES.slice(0, stageIndex + 1)
  const currentStageDuration = ageDays === 0 ? 6 * HOUR_MS : ageDays * DAY_MS
  const earlierDurations = visibleStages
    .slice(0, -1)
    .map((_, index) => [1, 1, 2, 1, 1][index] ?? 1)

  const earlierDurationMs = earlierDurations.reduce(
    (sum, duration) => sum + duration * DAY_MS,
    0,
  )
  const createdAtMs = Date.now() - currentStageDuration - earlierDurationMs
  const stageHistory: StageEntry[] = []

  let cursor = createdAtMs
  for (let index = 0; index < visibleStages.length; index += 1) {
    const currentStageId = visibleStages[index]
    const isCurrentStage = index === visibleStages.length - 1
    const durationMs = isCurrentStage
      ? currentStageDuration
      : (earlierDurations[index] ?? 1) * DAY_MS
    const enteredAt = new Date(cursor).toISOString()
    const exitedAt = isCurrentStage
      ? null
      : new Date(cursor + durationMs).toISOString()

    stageHistory.push({
      stage: currentStageId,
      enteredAt,
      exitedAt,
    })

    cursor += durationMs
  }

  return {
    createdAt: new Date(createdAtMs).toISOString(),
    stageHistory,
  }
}

function createSeedComments(
  taskId: string,
  stageEnteredAt: string,
  comments: SeedComment[] | undefined,
) {
  if (!comments?.length) {
    return []
  }

  const stageEnteredAtMs = new Date(stageEnteredAt).getTime()

  return comments.map((comment, index) => ({
    id: `${taskId}-comment-${index + 1}`,
    authorId: comment.authorId,
    body: comment.body,
    parentId: comment.parentId ?? null,
    createdAt: new Date(
      stageEnteredAtMs + comment.hoursAfterEnter * HOUR_MS,
    ).toISOString(),
  }))
}

function buildBriefHtml(seed: SeedTask) {
  return `
    <p><strong>Objective:</strong> ${seed.briefLead}</p>
    <ul>
      ${seed.bullets.map((bullet) => `<li>${bullet}</li>`).join('')}
    </ul>
    <p><strong>Delivery:</strong> Keep the output structured so Naomi can review and move it through the board without needing a separate doc.</p>
  `.trim()
}

function buildSeedTask(seed: SeedTask): Task {
  const taskId = `task-${seed.testId.toLowerCase()}`
  const { createdAt, stageHistory } = getSeedStageHistory(seed.stage, seed.ageDays)

  return {
    id: taskId,
    testId: seed.testId,
    title: seed.title,
    brand: seed.brand,
    type: seed.type,
    stage: seed.stage,
    assigneeId: seed.assigneeId,
    createdAt,
    briefHtml: buildBriefHtml(seed),
    attachments: (seed.attachments ?? [
      {
        label: 'Drive Folder',
        url: `https://drive.google.com/drive/folders/${seed.testId.toLowerCase()}`,
      },
      {
        label: 'Reference Notes',
        url: `https://example.com/references/${seed.testId.toLowerCase()}`,
      },
    ]).map((attachment, index) => ({
      id: `${taskId}-attachment-${index + 1}`,
      label: attachment.label,
      url: attachment.url,
    })),
    comments: createSeedComments(
      taskId,
      stageHistory[stageHistory.length - 1].enteredAt,
      seed.comments,
    ),
    stageHistory,
  }
}

const SEED_TASKS: SeedTask[] = [
  {
    testId: 'T-002',
    title: 'White women Lunavia edit',
    assigneeId: 'joe',
    stage: 'ready',
    brand: 'Pluxy',
    type: 'Creative',
    ageDays: 0,
    briefLead: 'Package the Lunavia angle into a clean ready-to-launch edit.',
    bullets: [
      'Keep the opening 3 seconds tight and visual.',
      'Cut alternate hooks for testing against the existing control.',
      'Make the CTA feel native instead of scripted.',
    ],
  },
  {
    testId: 'T-003',
    title: 'Top-of-funnel AppLovin pain-relief ads',
    assigneeId: 'ezequiel',
    stage: 'in_production',
    brand: 'Pluxy',
    type: 'Creative',
    ageDays: 14,
    briefLead:
      'Develop a fresh top-of-funnel AppLovin set built around pain-relief messaging.',
    bullets: [
      'Focus on broad audience relevance before product detail.',
      'Make the first cut social-feed native, not polished brand film.',
      'Leave room for three fast hook variants.',
    ],
    comments: [
      {
        authorId: 'naomi',
        body: 'Need at least one version that feels more pain-story than direct sell.',
        hoursAfterEnter: 4,
      },
      {
        authorId: 'ezequiel',
        body: 'Hook options are in progress. I am re-cutting the first 5 seconds today.',
        hoursAfterEnter: 22,
      },
    ],
  },
  {
    testId: 'T-004',
    title: 'Net new PDP for Pluxy',
    assigneeId: 'daniel',
    stage: 'in_production',
    brand: 'Pluxy',
    type: 'Landing Page',
    ageDays: 14,
    briefLead:
      'Build a new PDP direction for Pluxy that sharpens the conversion narrative.',
    bullets: [
      'Use stronger proof blocks above the fold.',
      'Clarify who the page is for before deep feature detail.',
      'Design for paid traffic first, not organic browsing.',
    ],
  },
  {
    testId: 'T-005',
    title: 'Listicle advertorial (7 reasons why)',
    assigneeId: 'shita',
    stage: 'in_production',
    brand: 'Pluxy',
    type: 'Landing Page',
    ageDays: 14,
    briefLead:
      'Create a listicle advertorial format that feels editorial but still drives action.',
    bullets: [
      'Use an easy-to-scan list structure.',
      'Make the visual hierarchy feel article-first.',
      'Keep transition points tight so the page never feels bloated.',
    ],
  },
  {
    testId: 'T-008',
    title: 'Relaunch ID575 with winner H6 hook',
    assigneeId: 'joe',
    stage: 'in_production',
    brand: 'Pluxy',
    type: 'Creative',
    ageDays: 6,
    briefLead:
      'Rebuild the winning H6 hook into a launch-ready relaunch package for ID575.',
    bullets: [
      'Preserve what made the original hook work.',
      'Refresh pacing and scene selection to avoid fatigue.',
      'Export a main cut plus two quick alternates.',
    ],
  },
  {
    testId: 'T-010',
    title: 'P002 black women for AppLovin',
    assigneeId: 'daniel',
    stage: 'ready',
    brand: 'Pluxy',
    type: 'Creative',
    ageDays: 1,
    briefLead:
      'Package the AppLovin version for the black women angle so it is ready to launch.',
    bullets: [
      'Keep the headline emotionally direct.',
      'Make the proof moments land earlier.',
      'Deliver a version that can move straight into launch ops.',
    ],
  },
  {
    testId: 'T-011',
    title: 'Unboxing video fix: music + pacing',
    assigneeId: 'daniel',
    stage: 'briefed',
    brand: 'Pluxy',
    type: 'Creative',
    ageDays: 5,
    briefLead:
      'Tighten the current unboxing cut so the rhythm feels more premium and less choppy.',
    bullets: [
      'Smooth the music transitions between scenes.',
      'Remove the dead space from 12 to 30 seconds.',
      'Hold the strongest product reveal beat longer.',
    ],
    comments: [
      {
        authorId: 'naomi',
        body: 'Please fix the music timing in the 12-30 second section before moving this forward.',
        hoursAfterEnter: 3,
      },
    ],
  },
  {
    testId: 'T-012',
    title: 'BB Company/Miami MD exposed statics',
    assigneeId: 'naomi',
    stage: 'backlog',
    brand: 'Pluxy',
    type: 'Creative',
    ageDays: 6,
    briefLead:
      'Explore exposed-style statics inspired by BB Company and Miami MD references.',
    bullets: [
      'Pull reference patterns from proven exposed creative.',
      'Keep the copy short and punchy.',
      'Leave room to turn this into a full brief later.',
    ],
  },
  {
    testId: 'T-013',
    title: 'Geo-localized LP (AU/UK/CA)',
    assigneeId: 'daniel',
    stage: 'briefed',
    brand: 'Pluxy',
    type: 'Landing Page',
    ageDays: 0,
    briefLead:
      'Adapt the landing page for AU, UK, and CA with localized trust and offer framing.',
    bullets: [
      'Swap region-specific proof and shipping cues.',
      'Keep one clean page structure across markets.',
      'Flag any region where legal copy needs review.',
    ],
  },
  {
    testId: 'T-023',
    title: 'Black women advertorial page',
    assigneeId: 'daniel',
    stage: 'in_production',
    brand: 'Pluxy',
    type: 'Landing Page',
    ageDays: 6,
    briefLead:
      'Build the advertorial page version tailored to the black women angle.',
    bullets: [
      'Let the story do more of the persuasion than the hard pitch.',
      'Make testimonials feel matched to the audience.',
      'Keep the CTA placement clear but not intrusive.',
    ],
  },
  {
    testId: 'T-025',
    title: 'Launch black women LP with top creative',
    assigneeId: null,
    stage: 'backlog',
    brand: 'Pluxy',
    type: 'Landing Page',
    ageDays: 0,
    briefLead:
      'Prepare the launch package once the best black women creative is chosen.',
    bullets: [
      'Align the page with the winning hook.',
      'Make the launch handoff clean for Ivan.',
      'Keep this parked until the creative decision is locked.',
    ],
  },
  {
    testId: 'T-014',
    title: '3 iterations winning VV scripts',
    assigneeId: 'joe',
    stage: 'in_production',
    brand: 'Vivi',
    type: 'Creative',
    ageDays: 13,
    briefLead:
      'Write and cut three new iterations off the current winning Vivi scripts.',
    bullets: [
      'Push one version further into mechanism.',
      'Keep one version punchier and faster.',
      'Maintain the winning insight while changing surface execution.',
    ],
    comments: [
      {
        authorId: 'joe',
        body: 'Three hooks are drafted. I still need final voiceover timing on the strongest option.',
        hoursAfterEnter: 12,
      },
    ],
  },
  {
    testId: 'T-015',
    title: 'Listicle advertorial for VV',
    assigneeId: 'daniel',
    stage: 'in_production',
    brand: 'Vivi',
    type: 'Landing Page',
    ageDays: 14,
    briefLead:
      'Create a Vivi listicle advertorial that feels useful first and salesy second.',
    bullets: [
      'Lead with curiosity and symptom relevance.',
      'Use the article format to slow the clicker down.',
      'Keep the page readable on long-form paid traffic.',
    ],
  },
  {
    testId: 'T-016',
    title: 'Resilia-inspired PDP for VV',
    assigneeId: 'daniel',
    stage: 'in_production',
    brand: 'Vivi',
    type: 'Landing Page',
    ageDays: 21,
    briefLead:
      'Translate the strongest Resilia PDP cues into a Vivi-specific purchase flow.',
    bullets: [
      'Keep the structure modular so sections can be swapped later.',
      'Make the proof stack feel credible and modern.',
      'Sharpen how the product benefit unfolds down the page.',
    ],
    comments: [
      {
        authorId: 'naomi',
        body: 'This one has been sitting too long. I need the first pass in review as soon as possible.',
        hoursAfterEnter: 8,
      },
    ],
  },
  {
    testId: 'T-019',
    title: 'Launch winning videos via 3rd party page',
    assigneeId: 'ivan',
    stage: 'ready',
    brand: 'Vivi',
    type: 'Creative',
    ageDays: 4,
    briefLead:
      'Package the current winning Vivi videos for the 3rd party page launch flow.',
    bullets: [
      'Confirm final assets and naming conventions.',
      'Keep the launch checklist lightweight and clear.',
      'Flag any missing URLs before this moves to live.',
    ],
  },
  {
    testId: 'T-020',
    title: 'Day 1 vs Day 21 static iterations',
    assigneeId: 'shita',
    stage: 'briefed',
    brand: 'Vivi',
    type: 'Creative',
    ageDays: 6,
    briefLead:
      'Explore static iterations around the Day 1 versus Day 21 story for Vivi.',
    bullets: [
      'Make the before-and-after journey instantly legible.',
      'Test one clean educational version and one punchier ad version.',
      'Use the copy to carry the transformation narrative.',
    ],
    comments: [
      {
        authorId: 'naomi',
        body: 'I want one version that feels more like a diary update than a polished ad.',
        hoursAfterEnter: 5,
      },
    ],
  },
  {
    testId: 'T-021',
    title: 'Acid pocket static iterations',
    assigneeId: null,
    stage: 'backlog',
    brand: 'Vivi',
    type: 'Creative',
    ageDays: 6,
    briefLead:
      'Explore static concepts around the acid pocket angle for Vivi.',
    bullets: [
      'Keep the visual concept simple enough to brief quickly.',
      'Test a few copy framings before full production.',
      'Use this as a concept parking spot until assigned.',
    ],
  },
  {
    testId: 'T-022',
    title: 'Reposition to long-term gut health',
    assigneeId: null,
    stage: 'backlog',
    brand: 'Vivi',
    type: 'Offer',
    ageDays: 6,
    briefLead:
      'Reframe the Vivi offer around long-term gut health rather than short-term relief.',
    bullets: [
      'Clarify the strategic angle before production starts.',
      'Map how the message changes on creative and landing pages.',
      'Keep the brief flexible while the idea is still forming.',
    ],
  },
  {
    testId: 'T-026',
    title: 'VV videos without raft mechanism',
    assigneeId: null,
    stage: 'backlog',
    brand: 'Vivi',
    type: 'Creative',
    ageDays: 0,
    briefLead:
      'Develop Vivi video versions that work without leaning on the raft mechanism.',
    bullets: [
      'Find a stronger emotional or symptom-led angle.',
      'Keep the structure simple enough to iterate fast.',
      'Use this as a clean testing lane away from the current mechanism.',
    ],
  },
  {
    testId: 'T-027',
    title: 'Make TSLs for Vivi',
    assigneeId: null,
    stage: 'backlog',
    brand: 'Vivi',
    type: 'Creative',
    ageDays: 0,
    briefLead:
      'Create TSL concepts for Vivi that can support fresh creative testing.',
    bullets: [
      'Draft multiple top-line story approaches.',
      'Keep the structure easy to hand off into production.',
      'Focus on ideas that can scale into several ad variations.',
    ],
  },
]

function createSeedBoardState(): BoardState {
  const tasks = Object.fromEntries(
    SEED_TASKS.map((seed) => {
      const task = buildSeedTask(seed)
      return [task.id, task]
    }),
  )
  const columns = createEmptyColumns()

  for (const seed of SEED_TASKS) {
    const taskId = `task-${seed.testId.toLowerCase()}`
    const containerId = getCanonicalContainerId(seed.stage, seed.assigneeId)
    columns[containerId] = [...(columns[containerId] ?? []), taskId]
  }

  return {
    tasks,
    columns,
    settings: {
      wipLimits: {
        naomi: 3,
        daniel: 3,
        joe: 3,
        ezequiel: 3,
        bryan: 3,
        shita: 3,
        ivan: 3,
        iskander: 3,
      },
    },
  }
}

function normalizeBoardState(raw: BoardState): BoardState {
  const fresh = createSeedBoardState()
  const columns = createEmptyColumns()

  for (const [columnId, taskIds] of Object.entries(raw.columns ?? {})) {
    columns[columnId] = [...taskIds]
  }

  return {
    tasks: raw.tasks ?? fresh.tasks,
    columns,
    settings: {
      wipLimits: {
        ...fresh.settings.wipLimits,
        ...(raw.settings?.wipLimits ?? {}),
      },
    },
  }
}

export function loadBoardState() {
  if (typeof window === 'undefined') {
    return createSeedBoardState()
  }

  try {
    const saved = window.localStorage.getItem(STORAGE_KEY)

    if (!saved) {
      return createSeedBoardState()
    }

    return normalizeBoardState(JSON.parse(saved) as BoardState)
  } catch {
    return createSeedBoardState()
  }
}

export function persistBoardState(state: BoardState) {
  if (typeof window === 'undefined') {
    return
  }

  window.localStorage.setItem(STORAGE_KEY, JSON.stringify(state))
}

function getCurrentStageEntry(task: Task) {
  return task.stageHistory[task.stageHistory.length - 1]
}

export function getTaskTimeInStageMs(task: Task, nowMs = Date.now()) {
  const currentStage = getCurrentStageEntry(task)
  return nowMs - new Date(currentStage?.enteredAt ?? task.createdAt).getTime()
}

export function getAgeToneFromMs(durationMs: number): AgeTone {
  const dayCount = durationMs / DAY_MS

  if (dayCount >= 5) {
    return 'stuck'
  }

  if (dayCount >= 3) {
    return 'aging'
  }

  return 'fresh'
}

export function formatDurationShort(durationMs: number) {
  if (durationMs < DAY_MS) {
    return `${Math.max(1, Math.floor(durationMs / HOUR_MS) || 1)}h`
  }

  return `${Math.max(1, Math.floor(durationMs / DAY_MS))}d`
}

export function formatDateLabel(isoString: string) {
  return new Intl.DateTimeFormat('en', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  }).format(new Date(isoString))
}

export function formatDateTimeLabel(isoString: string) {
  return new Intl.DateTimeFormat('en', {
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  }).format(new Date(isoString))
}

function getEntryDurationMs(entry: StageEntry, nowMs = Date.now()) {
  const endTime = entry.exitedAt ? new Date(entry.exitedAt).getTime() : nowMs
  const startTime = new Date(entry.enteredAt).getTime()
  return endTime - startTime
}

export function getStageHistorySegments(task: Task, nowMs = Date.now()) {
  return task.stageHistory.map((entry, index) => {
    const durationMs = getEntryDurationMs(entry, nowMs)

    return {
      stage: entry.stage,
      durationMs,
      durationLabel: formatDurationShort(durationMs),
      tone: getAgeToneFromMs(durationMs),
      movedBack: entry.transitionKind === 'moved_back',
      isCurrent: index === task.stageHistory.length - 1,
    } satisfies StageHistorySegment
  })
}

export function getStageHistoryLabel(task: Task, nowMs = Date.now()) {
  return getStageHistorySegments(task, nowMs)
    .map((entry) => {
      const movedBackLabel = entry.movedBack ? ' moved back' : ''
      return `${STAGE_LABELS[entry.stage]} (${entry.durationLabel}${movedBackLabel})`
    })
    .join(' -> ')
}

export function matchesTaskFilters(task: Task, filters: TaskFilters = {}) {
  const brandIds = filters.brands ?? []
  const editorIds = filters.editors ?? []

  const matchesBrand =
    brandIds.length === 0 || brandIds.length === BRAND_IDS.length
      ? true
      : brandIds.includes(task.brand)
  const matchesEditor =
    editorIds.length === 0
      ? true
      : task.assigneeId !== null && editorIds.includes(task.assigneeId)

  return matchesBrand && matchesEditor
}

export function filterTasks(state: BoardState, filters: TaskFilters = {}) {
  return Object.values(state.tasks).filter((task) => matchesTaskFilters(task, filters))
}

export function getBoardStats(
  state: BoardState,
  filters: TaskFilters = {},
  nowMs = Date.now(),
) {
  const tasks = filterTasks(state, filters)

  const byStage = Object.fromEntries(
    STAGES.map((stage) => [stage, 0]),
  ) as Record<StageId, number>

  let stuck = 0
  for (const task of tasks) {
    byStage[task.stage] += 1
    if (getAgeToneFromMs(getTaskTimeInStageMs(task, nowMs)) === 'stuck') {
      stuck += 1
    }
  }

  return {
    total: tasks.length,
    stuck,
    byStage,
  }
}

export function getInProductionCount(
  state: BoardState,
  userId: UserId,
  excludingTaskId?: string,
) {
  return (state.columns[getCanonicalContainerId('in_production', userId)] ?? []).filter(
    (taskId) => taskId !== excludingTaskId,
  ).length
}

export function canEnterInProduction(
  state: BoardState,
  userId: UserId,
  taskId?: string,
) {
  return (
    getInProductionCount(state, userId, taskId) < state.settings.wipLimits[userId]
  )
}

export function getEditorNextStage(task: Task, viewerId: UserId) {
  switch (task.stage) {
    case 'briefed':
      return 'in_production'
    case 'in_production':
      return 'review'
    case 'review':
      return 'ready'
    case 'ready':
      return viewerId === 'ivan' ? 'live' : null
    default:
      return null
  }
}

export function canCommentOnTask(task: Task, viewerId: UserId) {
  if (viewerId === 'iskander') {
    return false
  }

  return viewerId === 'naomi' || viewerId === task.assigneeId
}

function moveTaskInBoard(
  state: BoardState,
  taskId: string,
  destinationStage: StageId,
  destinationAssigneeId: UserId | null,
  destinationIndex: number,
  movedAt: string,
) {
  const task = state.tasks[taskId]
  if (!task) {
    return state
  }

  const sourceContainerId = getCanonicalContainerId(task.stage, task.assigneeId)
  const nextAssigneeId =
    destinationStage === 'backlog'
      ? null
      : isGroupedStage(destinationStage)
        ? destinationAssigneeId ?? task.assigneeId
        : destinationAssigneeId ?? task.assigneeId
  const targetContainerId = getCanonicalContainerId(destinationStage, nextAssigneeId)
  const sourceIds = [...(state.columns[sourceContainerId] ?? [])]
  const targetIds =
    sourceContainerId === targetContainerId
      ? sourceIds
      : [...(state.columns[targetContainerId] ?? [])]
  const activeIndex = sourceIds.indexOf(taskId)
  const isBackwardMove =
    STAGES.indexOf(destinationStage) < STAGES.indexOf(task.stage)

  if (activeIndex === -1) {
    return state
  }

  sourceIds.splice(activeIndex, 1)
  const boundedIndex = Math.max(0, Math.min(destinationIndex, targetIds.length))

  if (sourceContainerId === targetContainerId) {
    sourceIds.splice(boundedIndex, 0, taskId)

    return {
      ...state,
      columns: {
        ...state.columns,
        [sourceContainerId]: sourceIds,
      },
      tasks: {
        ...state.tasks,
        [taskId]: {
          ...task,
          assigneeId: nextAssigneeId,
        },
      },
    }
  }

  targetIds.splice(boundedIndex, 0, taskId)

  const nextStageEntry: StageEntry = {
    stage: destinationStage,
    enteredAt: movedAt,
    exitedAt: null,
    transitionKind: isBackwardMove ? 'moved_back' : undefined,
  }

  const nextTask: Task =
    task.stage === destinationStage
      ? {
          ...task,
          assigneeId: nextAssigneeId,
        }
      : {
          ...task,
          stage: destinationStage,
          assigneeId: nextAssigneeId,
          stageHistory: [
            ...task.stageHistory.slice(0, -1),
            {
              ...task.stageHistory[task.stageHistory.length - 1],
              exitedAt: movedAt,
            },
            nextStageEntry,
          ],
        }

  return {
    ...state,
    tasks: {
      ...state.tasks,
      [taskId]: nextTask,
    },
    columns: {
      ...state.columns,
      [sourceContainerId]: sourceIds,
      [targetContainerId]: targetIds,
    },
  }
}

function updateTaskAssignee(state: BoardState, taskId: string, assigneeId: UserId | null) {
  const task = state.tasks[taskId]
  if (!task) {
    return state
  }

  if (!isGroupedStage(task.stage)) {
    return {
      ...state,
      tasks: {
        ...state.tasks,
        [taskId]: {
          ...task,
          assigneeId,
        },
      },
    }
  }

  return moveTaskInBoard(
    state,
    taskId,
    task.stage,
    assigneeId,
    (state.columns[getCanonicalContainerId(task.stage, assigneeId)] ?? []).length,
    new Date().toISOString(),
  )
}

export function boardReducer(state: BoardState, action: BoardAction): BoardState {
  switch (action.type) {
    case 'move-task':
      return moveTaskInBoard(
        state,
        action.taskId,
        action.destinationStage,
        action.destinationAssigneeId,
        action.destinationIndex,
        action.movedAt ?? new Date().toISOString(),
      )
    case 'update-task':
      return {
        ...state,
        tasks: {
          ...state.tasks,
          [action.taskId]: {
            ...state.tasks[action.taskId],
            ...action.updates,
          },
        },
      }
    case 'update-assignee':
      return updateTaskAssignee(state, action.taskId, action.assigneeId)
    case 'replace-attachments':
      return {
        ...state,
        tasks: {
          ...state.tasks,
          [action.taskId]: {
            ...state.tasks[action.taskId],
            attachments: action.attachments,
          },
        },
      }
    case 'add-comment':
      return {
        ...state,
        tasks: {
          ...state.tasks,
          [action.taskId]: {
            ...state.tasks[action.taskId],
            comments: [...state.tasks[action.taskId].comments, action.comment],
          },
        },
      }
    case 'create-task': {
      const backlogId = getCanonicalContainerId('backlog', null)

      return {
        ...state,
        tasks: {
          ...state.tasks,
          [action.task.id]: action.task,
        },
        columns: {
          ...state.columns,
          [backlogId]: [...state.columns[backlogId], action.task.id],
        },
      }
    }
    case 'update-wip-limit':
      return {
        ...state,
        settings: {
          ...state.settings,
          wipLimits: {
            ...state.settings.wipLimits,
            [action.userId]: Math.max(1, action.limit),
          },
        },
      }
    case 'reset-board':
      return createSeedBoardState()
    default:
      return state
  }
}

export function getVisibleColumns(
  state: BoardState,
  viewerId: UserId,
  filters: TaskFilters = {},
) {
  const viewerMode = getViewerMode(viewerId)
  const managerEditorIds = filters.editors ?? []
  const flattenSingleEditor = viewerMode === 'manager' && managerEditorIds.length === 1

  return STAGES.map((stage) => {
    if (viewerMode === 'editor') {
      const sourceIds = state.columns[getCanonicalContainerId(stage, viewerId)] ?? []
      const flatSourceIds = state.columns[getCanonicalContainerId(stage, null)] ?? []
      const taskIds =
        isGroupedStage(stage)
          ? sourceIds
          : flatSourceIds.filter((taskId) => state.tasks[taskId]?.assigneeId === viewerId)

      const visibleTaskIds = taskIds.filter((taskId) =>
        matchesTaskFilters(state.tasks[taskId], filters),
      )
      const wipCount =
        stage === 'in_production' ? getInProductionCount(state, viewerId) : null
      const wipLimit =
        stage === 'in_production' ? state.settings.wipLimits[viewerId] : null

      return {
        stage,
        label: STAGE_LABELS[stage],
        grouped: false,
        totalCount: visibleTaskIds.length,
        containers: [
          {
            id: `viewer::${viewerId}::${stage}`,
            stage,
            label: STAGE_LABELS[stage],
            canonicalContainerId: getCanonicalContainerId(
              stage,
              isGroupedStage(stage) ? viewerId : null,
            ),
            assigneeId: viewerId,
            assigneeName: USER_MAP[viewerId].name,
            taskIds: visibleTaskIds,
            grouped: false,
            emptyLabel:
              stage === 'backlog'
                ? 'No assigned backlog cards.'
                : 'Nothing in this stage.',
            wipCount,
            wipLimit,
          },
        ],
      } satisfies StageColumnModel
    }

    if (isGroupedStage(stage)) {
      const visibleWorkerIds =
        viewerMode === 'manager' && managerEditorIds.length > 0
          ? managerEditorIds
          : Array.from(
              new Set([
                ...EDITOR_ROLE_IDS,
                ...Object.values(state.tasks)
                  .filter(
                    (task) =>
                      task.stage === stage &&
                      task.assigneeId !== null &&
                      task.assigneeId !== 'iskander',
                  )
                  .map((task) => task.assigneeId as UserId),
              ]),
            )
      const containers = visibleWorkerIds.map((userId) => {
        const containerId = getCanonicalContainerId(stage, userId)
        const taskIds = (state.columns[containerId] ?? []).filter((taskId) =>
          matchesTaskFilters(state.tasks[taskId], filters),
        )
        const wipCount =
          stage === 'in_production' ? getInProductionCount(state, userId) : null
        const wipLimit =
          stage === 'in_production' ? state.settings.wipLimits[userId] : null

        return {
          id: containerId,
          stage,
          label: USER_MAP[userId].name,
          canonicalContainerId: containerId,
          assigneeId: userId,
          assigneeName: USER_MAP[userId].name,
          taskIds,
          grouped: true,
          emptyLabel: `Drop into ${USER_MAP[userId].name}'s queue.`,
          wipCount,
          wipLimit,
        } satisfies VisibleContainer
      })

      return {
        stage,
        label: STAGE_LABELS[stage],
        grouped: !flattenSingleEditor,
        totalCount: containers.reduce((sum, container) => sum + container.taskIds.length, 0),
        containers,
      } satisfies StageColumnModel
    }

    const containerId = getCanonicalContainerId(stage, null)
    const taskIds = (state.columns[containerId] ?? []).filter((taskId) =>
      matchesTaskFilters(state.tasks[taskId], filters),
    )

    return {
      stage,
      label: STAGE_LABELS[stage],
      grouped: false,
      totalCount: taskIds.length,
      containers: [
        {
          id: containerId,
          stage,
          label: STAGE_LABELS[stage],
          canonicalContainerId: containerId,
          assigneeId: null,
          assigneeName: null,
          taskIds,
          grouped: false,
          emptyLabel:
            stage === 'backlog'
              ? 'New cards land here until Naomi assigns them.'
              : `No cards in ${STAGE_LABELS[stage].toLowerCase()}.`,
          wipCount: null,
          wipLimit: null,
        },
      ],
    } satisfies StageColumnModel
  })
}

export function estimateTaskWorkloadDays(task: Task) {
  if (task.type === 'Landing Page') {
    return 5
  }

  if (task.type === 'Offer') {
    return 3
  }

  if (task.type === 'Other') {
    return 2
  }

  return /static|image/i.test(task.title) ? 1 : 3
}

export function getEditorSnapshot(
  state: BoardState,
  userId: UserId,
  filters: TaskFilters = {},
) {
  const stageCounts = Object.fromEntries(
    STAGES.map((stage) => [stage, 0]),
  ) as Record<StageId, number>
  let estimatedWorkloadDays = 0
  let totalVisibleCards = 0

  for (const task of Object.values(state.tasks)) {
    if (task.assigneeId !== userId || !matchesTaskFilters(task, filters)) {
      continue
    }

    totalVisibleCards += 1
    stageCounts[task.stage] += 1

    if (task.stage === 'briefed' || task.stage === 'in_production') {
      estimatedWorkloadDays += estimateTaskWorkloadDays(task)
    }
  }

  return {
    userId,
    totalVisibleCards,
    stageCounts,
    inProductionCount: stageCounts.in_production,
    wipLimit: state.settings.wipLimits[userId],
    estimatedWorkloadDays,
  } satisfies EditorSnapshot
}

function parseTestIdNumber(testId: string) {
  const match = /T-(\d+)/i.exec(testId)
  return match ? Number(match[1]) : 0
}

export function getNextTestId(tasks: Task[]) {
  const highest = tasks.reduce((max, task) => {
    return Math.max(max, parseTestIdNumber(task.testId))
  }, 0)

  return `T-${String(highest + 1).padStart(3, '0')}`
}

export function createDraftTask(state: BoardState): Task {
  const now = new Date().toISOString()

  return {
    id:
      typeof crypto !== 'undefined' && 'randomUUID' in crypto
        ? crypto.randomUUID()
        : `task-${Date.now()}`,
    testId: getNextTestId(Object.values(state.tasks)),
    title: '',
    brand: 'Pluxy',
    type: 'Creative',
    stage: 'backlog',
    assigneeId: null,
    createdAt: now,
    briefHtml: '<p><strong>Objective:</strong> </p><ul><li></li></ul>',
    attachments: [],
    comments: [],
    stageHistory: [
      {
        stage: 'backlog',
        enteredAt: now,
        exitedAt: null,
      },
    ],
  }
}
