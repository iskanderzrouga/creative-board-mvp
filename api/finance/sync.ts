function normalizeEnvelopeArray<T>(value: unknown, nestedKey?: string): T[] {
  if (Array.isArray(value)) {
    return value as T[]
  }

  if (!value || typeof value !== 'object') {
    return []
  }

  const record = value as Record<string, unknown>
  if (Array.isArray(record.data)) {
    return record.data as T[]
  }

  if (nestedKey && Array.isArray(record[nestedKey])) {
    return record[nestedKey] as T[]
  }

  return []
}

function getErrorMessage(status: number) {
  if (status === 401) {
    return 'Invalid API key'
  }
  if (status === 429) {
    return 'Rate limited'
  }
  if (status >= 500) {
    return 'Slash API down'
  }

  return 'Slash request failed'
}

function jsonResponse(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      'Content-Type': 'application/json',
    },
  })
}

export default async function handler(req: Request): Promise<Response> {
  if (req.method !== 'POST') {
    return jsonResponse({ transactions: [], accounts: [], error: 'Method not allowed' }, 405)
  }

  const apiKey = process.env.SLASH_API_KEY?.trim()
  if (!apiKey) {
    return jsonResponse({ transactions: [], accounts: [], error: 'Slash API key missing' }, 500)
  }

  let body: { dateFrom?: number } = {}
  try {
    body = (await req.json()) as { dateFrom?: number }
  } catch {
    body = {}
  }

  const defaultDateFrom = Date.now() - 90 * 24 * 60 * 60 * 1000
  const dateFrom = Number.isFinite(body?.dateFrom) ? Number(body.dateFrom) : defaultDateFrom

  try {
    const headers = { 'X-API-Key': apiKey }
    const [transactionsResponse, accountsResponse] = await Promise.all([
      fetch(`https://api.joinslash.com/transaction?dateFrom=${dateFrom}&limit=500`, { headers }),
      fetch('https://api.joinslash.com/account', { headers }),
    ])

    if (!transactionsResponse.ok) {
      const errorMessage = getErrorMessage(transactionsResponse.status)
      return jsonResponse({ transactions: [], accounts: [], error: errorMessage }, transactionsResponse.status)
    }

    if (!accountsResponse.ok) {
      const errorMessage = getErrorMessage(accountsResponse.status)
      return jsonResponse({ transactions: [], accounts: [], error: errorMessage }, accountsResponse.status)
    }

    const transactionsPayload = (await transactionsResponse.json()) as unknown
    const accountsPayload = (await accountsResponse.json()) as unknown

    const transactions = normalizeEnvelopeArray(transactionsPayload, 'transactions')
    const accounts = normalizeEnvelopeArray(accountsPayload, 'accounts')

    return jsonResponse({ transactions, accounts })
  } catch {
    return jsonResponse({ transactions: [], accounts: [], error: 'Cannot reach Slash' }, 502)
  }
}
