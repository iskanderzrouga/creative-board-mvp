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

    let txRes = await fetch('https://api.joinslash.com/transaction', {
      headers: { 'X-API-Key': apiKey, 'Content-Type': 'application/json' },
    });

    // If that fails, try with just dateFrom
    if (!txRes.ok) {
      console.warn(`[finance/sync] Slash transaction request failed without params (${txRes.status}), retrying with dateFrom.`);
      txRes = await fetch(`https://api.joinslash.com/transaction?dateFrom=${Math.floor(dateFrom)}`, {
        headers: { 'X-API-Key': apiKey, 'Content-Type': 'application/json' },
      });
    }

    const accRes = await fetch('https://api.joinslash.com/account', {
      headers: { 'X-API-Key': apiKey, 'Content-Type': 'application/json' },
    });

    if (!txRes.ok) {
      const errBody = await txRes.text().catch(() => '');
      console.error(`[finance/sync] Slash transaction request failed after retries (${txRes.status}): ${errBody}`);
      return new Response(JSON.stringify({
        error: `Slash ${txRes.status}: ${errBody}`,
        debug: { url: 'https://api.joinslash.com/transaction', status: txRes.status },
        transactions: [],
        accounts: [],
      }), { status: 200, headers: { 'Content-Type': 'application/json' } });
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
