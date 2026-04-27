import {
  REMOTE_WORKSPACE_ID,
  getSupabaseClient,
  isSupabaseConfigured,
} from './supabase'
import type {
  DailyCheckinFormValues,
  DailyCheckinRow,
  DailyPulseTeamMember,
  TeamMember,
} from './board'

interface QueryResult<T> {
  data: T
  error: string | null
}

const DAILY_CHECKIN_EXCLUDED_EMAILS = new Set(['iskander@bluebrands.co'])
const DAILY_CHECKIN_EXCLUDED_NAMES = new Set(['iskander'])

export interface DailyPulseDateRange {
  from: string
  to: string
}

export function isDailyCheckinExemptUser(email: string | null | undefined) {
  const normalizedEmail = email?.trim().toLowerCase()
  return Boolean(normalizedEmail && DAILY_CHECKIN_EXCLUDED_EMAILS.has(normalizedEmail))
}

export function isDailyPulseExcludedPerson(input: { email?: string | null; name?: string | null }) {
  const normalizedEmail = input.email?.trim().toLowerCase()
  const normalizedName = input.name?.trim().toLowerCase()
  return Boolean(
    (normalizedEmail && DAILY_CHECKIN_EXCLUDED_EMAILS.has(normalizedEmail)) ||
      (normalizedName && DAILY_CHECKIN_EXCLUDED_NAMES.has(normalizedName)),
  )
}

function normalizeTimezone(timezone: string | null | undefined) {
  const candidate = timezone?.trim()
  if (!candidate) {
    return Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC'
  }

  try {
    new Intl.DateTimeFormat('en-US', { timeZone: candidate }).format(new Date())
    return candidate
  } catch {
    return Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC'
  }
}

function getDateStringForTimezone(timezone: string, referenceDate = new Date()) {
  return referenceDate.toLocaleDateString('en-CA', { timeZone: timezone })
}

function getPreviousDateString(dateString: string) {
  const [year, month, day] = dateString.split('-').map((part) => Number(part))
  const date = new Date(Date.UTC(year || 1970, (month || 1) - 1, day || 1))
  date.setUTCDate(date.getUTCDate() - 1)
  return date.toISOString().slice(0, 10)
}

function getNextDateString(dateString: string) {
  const [year, month, day] = dateString.split('-').map((part) => Number(part))
  const date = new Date(Date.UTC(year || 1970, (month || 1) - 1, day || 1))
  date.setUTCDate(date.getUTCDate() + 1)
  return date.toISOString().slice(0, 10)
}

export function normalizeDailyPulseRange(range: DailyPulseDateRange): DailyPulseDateRange {
  return range.from <= range.to ? range : { from: range.to, to: range.from }
}

export function getDailyPulseRangeDays(range: DailyPulseDateRange) {
  const normalizedRange = normalizeDailyPulseRange(range)
  const days: string[] = []
  let cursor = normalizedRange.from

  while (cursor <= normalizedRange.to) {
    days.push(cursor)
    cursor = getNextDateString(cursor)
  }

  return days
}

export function resolveViewerTimezone(
  team: TeamMember[],
  userEmail: string | null,
  editorName: string | null,
) {
  const normalizedEmail = userEmail?.trim().toLowerCase() ?? null
  const byEmail = normalizedEmail
    ? team.find((member) => member.accessEmail?.trim().toLowerCase() === normalizedEmail)
    : null

  if (byEmail) {
    return normalizeTimezone(byEmail.timezone)
  }

  const byName = editorName
    ? team.find((member) => member.name.trim().toLowerCase() === editorName.trim().toLowerCase())
    : null

  if (byName) {
    return normalizeTimezone(byName.timezone)
  }

  return normalizeTimezone(null)
}

export function getCheckinDates(timezone: string, referenceDate = new Date()) {
  const today = getDateStringForTimezone(timezone, referenceDate)
  const yesterday = getPreviousDateString(today)
  return { today, yesterday }
}

export async function hasCheckinForDate(userEmail: string, checkinDate: string): Promise<QueryResult<boolean>> {
  if (!isSupabaseConfigured()) {
    return { data: false, error: 'supabase-not-configured' }
  }

  const supabase = getSupabaseClient()
  if (!supabase) {
    return { data: false, error: 'supabase-not-configured' }
  }
  const { data, error } = await supabase
    .from('daily_checkins')
    .select('id')
    .eq('workspace_id', REMOTE_WORKSPACE_ID)
    .eq('user_email', userEmail)
    .eq('checkin_date', checkinDate)
    .limit(1)

  if (error) {
    return { data: false, error: error.message }
  }

  return { data: (data?.length ?? 0) > 0, error: null }
}

export async function getPreviousDayPlan(
  userEmail: string,
  checkinDate: string,
): Promise<QueryResult<string | null>> {
  if (!isSupabaseConfigured()) {
    return { data: null, error: 'supabase-not-configured' }
  }

  const supabase = getSupabaseClient()
  if (!supabase) {
    return { data: null, error: 'supabase-not-configured' }
  }
  const { data, error } = await supabase
    .from('daily_checkins')
    .select('today_plan')
    .eq('workspace_id', REMOTE_WORKSPACE_ID)
    .eq('user_email', userEmail)
    .eq('checkin_date', checkinDate)
    .maybeSingle<{ today_plan: string }>()

  if (error) {
    return { data: null, error: error.message }
  }

  return { data: data?.today_plan ?? null, error: null }
}

export async function submitDailyCheckin(
  userEmail: string,
  userName: string,
  checkinDate: string,
  values: DailyCheckinFormValues,
): Promise<QueryResult<DailyCheckinRow | null>> {
  if (!isSupabaseConfigured()) {
    return { data: null, error: 'supabase-not-configured' }
  }

  const supabase = getSupabaseClient()
  if (!supabase) {
    return { data: null, error: 'supabase-not-configured' }
  }
  const payload = {
    workspace_id: REMOTE_WORKSPACE_ID,
    user_email: userEmail,
    user_name: userName,
    checkin_date: checkinDate,
    yesterday_work: values.yesterdayWork.trim(),
    today_plan: values.todayPlan.trim(),
    blockers: values.blockers.trim() || null,
  }

  const { data, error } = await supabase
    .from('daily_checkins')
    .insert(payload)
    .select('*')
    .single<DailyCheckinRow>()

  if (error) {
    return { data: null, error: error.message }
  }

  return { data, error: null }
}

export async function getCheckinsByDate(
  checkinDate: string,
): Promise<QueryResult<DailyCheckinRow[]>> {
  if (!isSupabaseConfigured()) {
    return { data: [], error: 'supabase-not-configured' }
  }

  const supabase = getSupabaseClient()
  if (!supabase) {
    return { data: [], error: 'supabase-not-configured' }
  }
  const { data, error } = await supabase
    .from('daily_checkins')
    .select('*')
    .eq('workspace_id', REMOTE_WORKSPACE_ID)
    .eq('checkin_date', checkinDate)
    .order('created_at', { ascending: true })

  if (error) {
    return { data: [], error: error.message }
  }

  return { data: (data ?? []) as DailyCheckinRow[], error: null }
}

export async function getCheckinsByDateRange(
  range: DailyPulseDateRange,
): Promise<QueryResult<DailyCheckinRow[]>> {
  if (!isSupabaseConfigured()) {
    return { data: [], error: 'supabase-not-configured' }
  }

  const supabase = getSupabaseClient()
  if (!supabase) {
    return { data: [], error: 'supabase-not-configured' }
  }

  const normalizedRange = normalizeDailyPulseRange(range)
  const { data, error } = await supabase
    .from('daily_checkins')
    .select('*')
    .eq('workspace_id', REMOTE_WORKSPACE_ID)
    .gte('checkin_date', normalizedRange.from)
    .lte('checkin_date', normalizedRange.to)
    .order('checkin_date', { ascending: false })
    .order('created_at', { ascending: true })

  if (error) {
    return { data: [], error: error.message }
  }

  return { data: (data ?? []) as DailyCheckinRow[], error: null }
}

export function getTeamMembersForPulse(team: TeamMember[]): DailyPulseTeamMember[] {
  const deduped = new Map<string, DailyPulseTeamMember>()

  team
    .filter((member) => member.active)
    .filter((member) => !isDailyPulseExcludedPerson({ email: member.accessEmail, name: member.name }))
    .forEach((member) => {
      const key = member.name.trim().toLowerCase()
      if (!key || deduped.has(key)) {
        return
      }

      deduped.set(key, {
        name: member.name,
        email: member.accessEmail?.trim() || null,
      })
    })

  return Array.from(deduped.values()).sort((a, b) => a.name.localeCompare(b.name))
}

export function formatDisplayDate(_value: string, timezone: string) {
  const parsed = new Date(`${_value}T12:00:00Z`)
  const date = Number.isNaN(parsed.getTime()) ? new Date() : parsed

  return date.toLocaleDateString('en-US', {
    weekday: 'long',
    year: 'numeric',
    month: 'long',
    day: 'numeric',
    timeZone: timezone,
  })
}
