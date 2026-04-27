export const config = { runtime: 'edge' }

const PERFORMANCE_URL = process.env.BLUEBRANDS_PERFORMANCE_URL
const PERFORMANCE_TOKEN = process.env.BLUEBRANDS_PERFORMANCE_TOKEN

export default async function handler(req: Request): Promise<Response> {
  if (req.method !== 'GET') {
    return new Response(JSON.stringify({ error: 'Method not allowed' }), { status: 405 })
  }

  if (!PERFORMANCE_URL) {
    return new Response(JSON.stringify({ error: 'BLUEBRANDS_PERFORMANCE_URL not configured', rows: [] }), {
      status: 501,
      headers: { 'Content-Type': 'application/json' },
    })
  }

  try {
    const source = new URL(PERFORMANCE_URL)
    const requestedUrl = new URL(req.url)

    for (const key of ['from', 'to', 'days']) {
      const value = requestedUrl.searchParams.get(key)
      if (value) {
        source.searchParams.set(key, value)
      }
    }

    const response = await fetch(source.toString(), {
      headers: {
        Accept: 'application/json',
        ...(PERFORMANCE_TOKEN ? { Authorization: `Bearer ${PERFORMANCE_TOKEN}` } : {}),
      },
    })

    const body = await response.text()
    return new Response(body, {
      status: response.status,
      headers: { 'Content-Type': response.headers.get('Content-Type') ?? 'application/json' },
    })
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Performance sync failed'
    return new Response(JSON.stringify({ error: message, rows: [] }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' },
    })
  }
}
