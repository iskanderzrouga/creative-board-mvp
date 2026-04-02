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

function buildDateFormatter(timezone: string) {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: timezone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  })
}

function getDateParts(value: Date, timezone: string) {
  const formatter = buildDateFormatter(timezone)
  const parts = formatter.formatToParts(value)
  const year = parts.find((part) => part.type === 'year')?.value ?? '1970'
  const month = parts.find((part) => part.type === 'month')?.value ?? '01'
  const day = parts.find((part) => part.type === 'day')?.value ?? '01'
  return { year, month, day }
}

function toDateString(value: Date, timezone: string) {
  const parts = getDateParts(value, timezone)
  return `${parts.year}-${parts.month}-${parts.day}`
}

function shiftDateByDays(value: Date, days: number) {
  const next = new Date(value)
  next.setUTCDate(next.getUTCDate() + days)
  return next
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
  const today = toDateString(referenceDate, timezone)
  const yesterday = toDateString(shiftDateByDays(referenceDate, -1), timezone)
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

export function getTeamMembersForPulse(team: TeamMember[]): DailyPulseTeamMember[] {
  const deduped = new Map<string, DailyPulseTeamMember>()

  team
    .filter((member) => member.active)
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

export function formatDisplayDate(value: string, timezone: string) {
  const [year, month, day] = value.split('-').map((part) => Number(part))
  const utcDate = new Date(Date.UTC(year || 1970, (month || 1) - 1, day || 1, 12, 0, 0))
  return new Intl.DateTimeFormat('en-US', {
    timeZone: timezone,
    weekday: 'long',
    month: 'long',
    day: 'numeric',
    year: 'numeric',
  }).format(utcDate)
}
