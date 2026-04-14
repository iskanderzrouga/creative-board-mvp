export const config = { runtime: 'edge' };

export default async function handler(req: Request): Promise<Response> {
  if (req.method !== 'POST') {
    return new Response(JSON.stringify({ error: 'Method not allowed' }), { status: 405 });
  }

  const apiKey = process.env.SLASH_API_KEY;
  if (!apiKey) {
    return new Response(JSON.stringify({ error: 'SLASH_API_KEY not configured' }), { status: 500 });
  }

  try {
    const body = await req.json().catch(() => ({}));
    const dateFrom = body.dateFrom || Date.now() - 90 * 24 * 60 * 60 * 1000;

    const [txRes, accRes] = await Promise.all([
      fetch(`https://api.joinslash.com/transaction?dateFrom=${dateFrom}&limit=500`, {
        headers: { 'X-API-Key': apiKey, 'Content-Type': 'application/json' },
      }),
      fetch('https://api.joinslash.com/account', {
        headers: { 'X-API-Key': apiKey, 'Content-Type': 'application/json' },
      }),
    ]);

    if (!txRes.ok) {
      const status = txRes.status;
      const msg = status === 401 ? 'Invalid API key' : status === 429 ? 'Rate limited' : `Slash API error ${status}`;
      return new Response(JSON.stringify({ error: msg, transactions: [], accounts: [] }), { status: 200 });
    }

    const txData = await txRes.json();
    const accData = await accRes.json().catch(() => []);

    const transactions = Array.isArray(txData) ? txData : (txData.data || txData.transactions || []);
    const accounts = Array.isArray(accData) ? accData : (accData.data || accData.accounts || []);

    return new Response(JSON.stringify({ transactions, accounts }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    });
  } catch (err: any) {
    return new Response(JSON.stringify({ error: 'Cannot reach Slash: ' + (err.message || ''), transactions: [], accounts: [] }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    });
  }
}
