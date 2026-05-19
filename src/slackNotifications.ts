import { getSupabaseClient } from './supabase'

const BOARD_LINK = '<https://creative-board-lake.vercel.app/board|View on board>'
const SCRIPTS_PAGE_URL = 'https://creative-board-lake.vercel.app/scripts'

interface ChannelNotificationInput {
  channel: 'video' | 'dev'
  text: string
}

interface ScriptReviewDmInput {
  scriptTitle: string
  brand: string
}

async function getAuthToken() {
  const supabase = getSupabaseClient()
  if (!supabase) {
    return null
  }

  const { data, error } = await supabase.auth.getSession()
  if (error) {
    throw error
  }

  return data.session?.access_token ?? null
}

async function postSlackNotification(body: Record<string, unknown>) {
  const token = await getAuthToken()
  if (!token) {
    return
  }

  const response = await fetch('/api/slack/notify', {
    method: 'POST',
    headers: {
      Accept: 'application/json',
      'Content-Type': 'application/json',
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify(body),
  })

  if (!response.ok) {
    throw new Error('Slack notification endpoint rejected the request.')
  }
}

function postChannelNotification({ channel, text }: ChannelNotificationInput) {
  void postSlackNotification({ channel, text }).catch((error) => {
    console.error('Slack channel notification failed.', error)
  })
}

function postScriptReviewDm(input: ScriptReviewDmInput) {
  void postSlackNotification({
    channel: 'dm',
    scriptTitle: input.scriptTitle,
    brand: input.brand,
    boardUrl: SCRIPTS_PAGE_URL,
  }).catch((error) => {
    console.error('Slack script review DM notification failed.', error)
  })
}

export function notifyCreativeTaskAssigned(input: {
  cardTitle: string
  brand: string
  editorName: string
}) {
  postChannelNotification({
    channel: 'video',
    text: `📋 New task assigned: ${input.cardTitle} (${input.brand}) → ${input.editorName}. ${BOARD_LINK}`,
  })
}

export function notifyCreativeBlockerAdded(input: {
  cardTitle: string
  brand: string
  blockerText: string
  editorName: string
}) {
  postChannelNotification({
    channel: 'video',
    text: `🚫 Blocker added on ${input.cardTitle} (${input.brand}): ${input.blockerText}. Assigned to ${input.editorName}. ${BOARD_LINK}`,
  })
}

export function notifyCreativeBlockerRemoved(input: {
  cardTitle: string
  brand: string
  editorName: string
}) {
  postChannelNotification({
    channel: 'video',
    text: `✅ Blocker removed on ${input.cardTitle} (${input.brand}). ${input.editorName} can proceed. ${BOARD_LINK}`,
  })
}

export function notifyCreativeReadyForReview(input: {
  cardTitle: string
  brand: string
  editorName: string
}) {
  postChannelNotification({
    channel: 'video',
    text: `👀 Ready for review: ${input.cardTitle} (${input.brand}) by ${input.editorName}. ${BOARD_LINK}`,
  })
}

export function notifyDevTaskAssigned(input: {
  cardTitle: string
  assigneeName: string
}) {
  postChannelNotification({
    channel: 'dev',
    text: `📋 New dev task assigned: ${input.cardTitle} → ${input.assigneeName}. ${BOARD_LINK}`,
  })
}

export function notifyDevBlockerAdded(input: {
  cardTitle: string
  blockerText: string
  assigneeName: string
}) {
  postChannelNotification({
    channel: 'dev',
    text: `🚫 Blocker on ${input.cardTitle}: ${input.blockerText}. Assigned to ${input.assigneeName}. ${BOARD_LINK}`,
  })
}

export function notifyDevBlockerRemoved(input: {
  cardTitle: string
  assigneeName: string
}) {
  postChannelNotification({
    channel: 'dev',
    text: `✅ Blocker cleared on ${input.cardTitle}. ${input.assigneeName} can proceed. ${BOARD_LINK}`,
  })
}

export function notifyDevReadyForReview(input: {
  cardTitle: string
  assigneeName: string
}) {
  postChannelNotification({
    channel: 'dev',
    text: `👀 Ready for review: ${input.cardTitle} by ${input.assigneeName}. ${BOARD_LINK}`,
  })
}

export function notifyScriptReadyForReview(input: ScriptReviewDmInput) {
  postScriptReviewDm(input)
}
