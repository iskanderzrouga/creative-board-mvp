export const config = { runtime: 'edge' };

const SLASH = 'https://api.joinslash.com';
const DEFAULT_ALLOWED_FINANCE_EMAILS = new Set([
  'iskander@bluebrands.co',
  'nicolas@bluebrands.co',
  'naomi@bluebrands.co',
]);

function jsonResponse(payload: unknown, status = 200) {
  return new Response(JSON.stringify(payload), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

function getAllowedFinanceEmails() {
  const configured = process.env.FINANCE_ALLOWED_EMAILS;
  if (!configured) return DEFAULT_ALLOWED_FINANCE_EMAILS;

  const emails = configured
    .split(',')
    .map((email) => email.trim().toLowerCase())
    .filter(Boolean);

  return emails.length > 0 ? new Set(emails) : DEFAULT_ALLOWED_FINANCE_EMAILS;
}

function getSupabaseUrl() {
  return process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL;
}

function getSupabaseAnonKey() {
  return process.env.SUPABASE_ANON_KEY || process.env.VITE_SUPABASE_ANON_KEY || process.env.VITE_SUPABASE_PUBLISHABLE_KEY;
}

async function requireAllowedUser(req: Request) {
  const supabaseUrl = getSupabaseUrl();
  const anonKey = getSupabaseAnonKey();
  const auth = req.headers.get('authorization');

  if (!supabaseUrl || !anonKey || !auth) {
    return { ok: false as const, status: 401, error: 'finance_auth_required' };
  }

  const response = await fetch(`${supabaseUrl}/auth/v1/user`, {
    headers: {
      apikey: anonKey,
      Authorization: auth,
    },
  });

  if (!response.ok) {
    return { ok: false as const, status: 401, error: 'finance_auth_invalid' };
  }

  const user = (await response.json()) as { email?: unknown };
  const email = typeof user.email === 'string' ? user.email.trim().toLowerCase() : '';
  if (!email || !getAllowedFinanceEmails().has(email)) {
    return { ok: false as const, status: 403, error: 'finance_access_denied' };
  }

  return { ok: true as const, email };
}

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
    return jsonResponse({ error: 'Method not allowed' }, 405);
  }

  const user = await requireAllowedUser(req);
  if (!user.ok) {
    return jsonResponse({ error: user.error }, user.status);
  }

  const apiKey = process.env.SLASH_API_KEY;
  if (!apiKey) {
    return jsonResponse({ error: 'SLASH_API_KEY not configured' }, 500);
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

    return jsonResponse(
      {
        transactions,
        accounts,
        debug: {
          entityCount: entities.length,
          accountCount: accounts.length,
          txCount: transactions.length,
          entityIds: entities.map((e) => (e as Record<string, unknown>).id),
          accountIds: accounts.map((a) => (a as Record<string, unknown>).id),
        },
      },
    );
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    return jsonResponse({ error: 'Sync failed: ' + message, transactions: [], accounts: [] });
  }
}
