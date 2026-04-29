interface HandlerResponse {
  status?: (status: number) => HandlerResponse
  setHeader?: (name: string, value: string) => void
  json?: (payload: unknown) => void
  end?: (body?: string) => void
  statusCode?: number
}

type HandlerRequest = Request | {
  method?: string
  body?: unknown
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

  if (typeof res.status === 'function' && typeof res.json === 'function') {
    res.status(status).json(payload)
    return undefined
  }

  res.statusCode = status
  res.end?.(JSON.stringify(payload))
  return undefined
}

function isAllowedAppsScriptUrl(value: unknown) {
  if (typeof value !== 'string') {
    return false
  }

  try {
    const url = new URL(value)
    return (
      url.protocol === 'https:' &&
      url.hostname === 'script.google.com' &&
      url.pathname.startsWith('/macros/s/') &&
      url.pathname.endsWith('/exec')
    )
  } catch {
    return false
  }
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

export default async function handler(req: HandlerRequest, res?: HandlerResponse) {
  if (req.method !== 'POST') {
    return sendJson(res, { success: false, message: 'Method not allowed' }, 405)
  }

  try {
    const body = (await readJsonBody(req)) as {
      webhookUrl?: unknown
      payload?: unknown
    } | null

    if (!body || !isAllowedAppsScriptUrl(body.webhookUrl)) {
      return sendJson(res, { success: false, message: 'Invalid Drive webhook URL' }, 400)
    }
    const webhookUrl = String(body.webhookUrl)

    if (!body.payload || typeof body.payload !== 'object') {
      return sendJson(res, { success: false, message: 'Missing Drive payload' }, 400)
    }

    const webhookResponse = await fetch(webhookUrl, {
      method: 'POST',
      redirect: 'follow',
      body: JSON.stringify(body.payload),
    })
    const raw = await webhookResponse.text()

    let payload: unknown = null
    try {
      payload = raw ? JSON.parse(raw) : null
    } catch {
      return sendJson(
        res,
        {
          success: false,
          message: 'Drive webhook returned an invalid JSON response.',
          raw,
        },
        502,
      )
    }

    const status = webhookResponse.ok ? 200 : webhookResponse.status
    return sendJson(res, payload ?? { success: false, message: 'Empty Drive webhook response' }, status)
  } catch (error) {
    return sendJson(
      res,
      {
        success: false,
        message: error instanceof Error ? error.message : String(error),
      },
      500,
    )
  }
}
