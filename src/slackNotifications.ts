const BOARD_LINK = '<https://creative-board-lake.vercel.app/board|View on board>'
const DEV_BOARD_LINK = '<https://creative-board-lake.vercel.app/dev|View on Dev board>'
const SCRIPTS_PAGE_URL = 'https://creative-board-lake.vercel.app/scripts'

const VIDEO_WEBHOOK_URL = import.meta.env.VITE_SLACK_WEBHOOK_VIDEO
const DEV_WEBHOOK_URL = import.meta.env.VITE_SLACK_WEBHOOK_DEV
const DM_WEBHOOK_URL = import.meta.env.VITE_SLACK_DM_WEBHOOK

interface ChannelNotificationInput {
  webhookUrl: string | undefined
  text: string
}

interface ScriptReviewDmInput {
  scriptTitle: string
  brand: string
}

function postChannelNotification({ webhookUrl, text }: ChannelNotificationInput) {
  if (!webhookUrl) {
    return
  }

  try {
    void fetch(webhookUrl, {
      method: 'POST',
      mode: 'no-cors',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ text }),
    })
  } catch (error) {
    console.error('Slack channel notification failed.', error)
  }
}

function postScriptReviewDm(input: ScriptReviewDmInput) {
  if (!DM_WEBHOOK_URL) {
    return
  }

  try {
    void fetch(DM_WEBHOOK_URL, {
      method: 'POST',
      mode: 'no-cors',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        type: 'script-review',
        scriptTitle: input.scriptTitle,
        brand: input.brand,
        boardUrl: SCRIPTS_PAGE_URL,
      }),
    })
  } catch (error) {
    console.error('Slack script review DM notification failed.', error)
  }
}

export function notifyCreativeTaskAssigned(input: {
  cardTitle: string
  brand: string
  editorName: string
}) {
  postChannelNotification({
    webhookUrl: VIDEO_WEBHOOK_URL,
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
    webhookUrl: VIDEO_WEBHOOK_URL,
    text: `🚫 Blocker added on ${input.cardTitle} (${input.brand}): ${input.blockerText}. Assigned to ${input.editorName}. ${BOARD_LINK}`,
  })
}

export function notifyCreativeBlockerRemoved(input: {
  cardTitle: string
  brand: string
  editorName: string
}) {
  postChannelNotification({
    webhookUrl: VIDEO_WEBHOOK_URL,
    text: `✅ Blocker removed on ${input.cardTitle} (${input.brand}). ${input.editorName} can proceed. ${BOARD_LINK}`,
  })
}

export function notifyCreativeReadyForReview(input: {
  cardTitle: string
  brand: string
  editorName: string
}) {
  postChannelNotification({
    webhookUrl: VIDEO_WEBHOOK_URL,
    text: `👀 Ready for review: ${input.cardTitle} (${input.brand}) by ${input.editorName}. ${BOARD_LINK}`,
  })
}

export function notifyDevTaskAssigned(input: {
  cardTitle: string
  assigneeName: string
}) {
  postChannelNotification({
    webhookUrl: DEV_WEBHOOK_URL,
    text: `📋 New dev task assigned: ${input.cardTitle} → ${input.assigneeName}. ${DEV_BOARD_LINK}`,
  })
}

export function notifyDevBlockerAdded(input: {
  cardTitle: string
  blockerText: string
  assigneeName: string
}) {
  postChannelNotification({
    webhookUrl: DEV_WEBHOOK_URL,
    text: `🚫 Blocker on ${input.cardTitle}: ${input.blockerText}. Assigned to ${input.assigneeName}. ${DEV_BOARD_LINK}`,
  })
}

export function notifyDevBlockerRemoved(input: {
  cardTitle: string
  assigneeName: string
}) {
  postChannelNotification({
    webhookUrl: DEV_WEBHOOK_URL,
    text: `✅ Blocker cleared on ${input.cardTitle}. ${input.assigneeName} can proceed. ${DEV_BOARD_LINK}`,
  })
}

export function notifyDevReadyForReview(input: {
  cardTitle: string
  assigneeName: string
}) {
  postChannelNotification({
    webhookUrl: DEV_WEBHOOK_URL,
    text: `👀 Ready for review: ${input.cardTitle} by ${input.assigneeName}. ${DEV_BOARD_LINK}`,
  })
}

export function notifyScriptReadyForReview(input: ScriptReviewDmInput) {
  postScriptReviewDm(input)
}
