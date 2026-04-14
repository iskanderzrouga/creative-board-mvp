import type { VercelRequest, VercelResponse } from '@vercel/node'

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

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'POST') {
    res.status(405).json({ transactions: [], accounts: [], error: 'Method not allowed' })
    return
  }

  const apiKey = process.env.SLASH_API_KEY?.trim()
  if (!apiKey) {
    res.status(500).json({ transactions: [], accounts: [], error: 'Slash API key missing' })
    return
  }

  const body = typeof req.body === 'string' ? JSON.parse(req.body || '{}') as { dateFrom?: number } : req.body as { dateFrom?: number }
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
      res.status(transactionsResponse.status).json({ transactions: [], accounts: [], error: errorMessage })
      return
    }

    if (!accountsResponse.ok) {
      const errorMessage = getErrorMessage(accountsResponse.status)
      res.status(accountsResponse.status).json({ transactions: [], accounts: [], error: errorMessage })
      return
    }

    const transactionsPayload = await transactionsResponse.json() as unknown
    const accountsPayload = await accountsResponse.json() as unknown

    const transactions = normalizeEnvelopeArray(transactionsPayload, 'transactions')
    const accounts = normalizeEnvelopeArray(accountsPayload, 'accounts')

    res.status(200).json({ transactions, accounts })
  } catch {
    res.status(502).json({ transactions: [], accounts: [], error: 'Cannot reach Slash' })
  }
}
