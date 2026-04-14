export const config = { runtime: 'edge' };

const SLASH = 'https://api.joinslash.com';

async function slashGet(path: string, apiKey: string) {
  const res = await fetch(`${SLASH}${path}`, {
    headers: { 'X-API-Key': apiKey, 'Content-Type': 'application/json' },
  });
  if (!res.ok) {
    const body = await res.text().catch(() => '');
    return { ok: false, status: res.status, error: body, data: null };
  }
  const json = await res.json();
  return { ok: true, status: 200, error: null, data: json };
}

function unwrap(json: unknown): unknown[] {
  if (Array.isArray(json)) return json;
  if (json && typeof json === 'object') {
    const obj = json as Record<string, unknown>;
    if (Array.isArray(obj.data)) return obj.data;
    if (Array.isArray(obj.items)) return obj.items;
    if (Array.isArray(obj.transactions)) return obj.transactions;
    if (Array.isArray(obj.accounts)) return obj.accounts;
    if (Array.isArray(obj.results)) return obj.results;
  }
  return [];
}

export default async function handler(req: Request): Promise<Response> {
  if (req.method !== 'POST') {
    return new Response(JSON.stringify({ error: 'Method not allowed' }), { status: 405 });
  }

  const apiKey = process.env.SLASH_API_KEY;
  if (!apiKey) {
    return new Response(JSON.stringify({ error: 'SLASH_API_KEY not configured' }), { status: 500 });
  }

  try {
    const body = (await req.json().catch(() => ({}))) as Record<string, unknown>;
    const dateFrom = (body.dateFrom as number) || Date.now() - 90 * 24 * 60 * 60 * 1000;

    // Step 1: Get legal entities
    const entityRes = await slashGet('/legal-entity', apiKey);
    const entities = entityRes.ok ? unwrap(entityRes.data) : [];

    // Step 2: Get accounts (try with entity ID if available)
    let accountPath = '/account';
    if (entities.length > 0) {
      const entityId = (entities[0] as Record<string, unknown>).id;
      if (entityId) accountPath = `/account?legalEntityId=${entityId}`;
    }
    const accRes = await slashGet(accountPath, apiKey);
    const accounts = accRes.ok ? unwrap(accRes.data) : [];

    // Step 3: Get transactions — try multiple approaches
    let transactions: unknown[] = [];

    // Try with legalEntityId first
    if (entities.length > 0) {
      const entityId = (entities[0] as Record<string, unknown>).id;
      const txRes = await slashGet(`/transaction?legalEntityId=${entityId}&dateFrom=${Math.floor(dateFrom)}`, apiKey);
      if (txRes.ok) transactions = unwrap(txRes.data);
    }

    // If empty, try with accountId
    if (transactions.length === 0 && accounts.length > 0) {
      const accountId = (accounts[0] as Record<string, unknown>).id;
      const txRes = await slashGet(`/transaction?accountId=${accountId}&dateFrom=${Math.floor(dateFrom)}`, apiKey);
      if (txRes.ok) transactions = unwrap(txRes.data);
    }

    // If still empty, try with no filters
    if (transactions.length === 0) {
      const txRes = await slashGet(`/transaction?dateFrom=${Math.floor(dateFrom)}`, apiKey);
      if (txRes.ok) transactions = unwrap(txRes.data);
    }

    // If STILL empty, try bare endpoint
    if (transactions.length === 0) {
      const txRes = await slashGet('/transaction', apiKey);
      if (txRes.ok) transactions = unwrap(txRes.data);
    }

    return new Response(
      JSON.stringify({
        transactions,
        accounts,
        debug: {
          entityCount: entities.length,
          accountCount: accounts.length,
          txCount: transactions.length,
          entityIds: entities.map((e) => (e as Record<string, unknown>).id),
          accountIds: accounts.map((a) => (a as Record<string, unknown>).id),
        },
      }),
      {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      },
    );
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    return new Response(JSON.stringify({ error: 'Sync failed: ' + message, transactions: [], accounts: [] }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    });
  }
}
