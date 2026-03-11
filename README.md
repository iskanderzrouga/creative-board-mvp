# Editors Board

Editors Board is a production-minded creative operations board built with React, TypeScript, and Vite. The current rollout keeps the familiar board UI while moving persistence and team access into Supabase.

## What ships in this version

- Vercel-hosted frontend
- Supabase email magic-link authentication
- One shared team workspace stored in `public.workspace_state`
- Local browser storage kept as a resilience cache
- Playwright smoke coverage for the board, analytics access, and authenticated shared-workspace sync

## Environment variables

Set these in Vercel and, when needed, in a local `.env.local` file:

```bash
VITE_SUPABASE_URL="https://your-project.supabase.co"
VITE_SUPABASE_PUBLISHABLE_KEY="your-publishable-key"
VITE_REMOTE_WORKSPACE_ID="primary"
```

`VITE_SUPABASE_ANON_KEY` is supported only as a legacy fallback. Prefer `VITE_SUPABASE_PUBLISHABLE_KEY`.

## Local development

```bash
npm install
npm run dev
```

Without Supabase env vars, the app stays usable in local-only mode so the board can still be developed and tested safely.

## Verification

```bash
npm run lint
npm run test
npm run build
```

## Supabase rollout

### Database

The current production table is:

- `public.workspace_state`
  - `workspace_id text primary key`
  - `state jsonb not null`
  - `updated_at timestamptz not null`

The v1 contract is one shared authenticated workspace, usually `primary`.

### Applying migrations

Use the shared pooler from IPv4-only networks:

```bash
npx supabase db push \
  --db-url "postgresql://USER:PASSWORD@aws-1-us-east-1.pooler.supabase.com:5432/postgres?sslmode=require" \
  --include-all
```

Use the direct connection only from environments with working IPv6 support.

### Auth setup

This release uses Supabase email magic links. Add your deployed Vercel origin to Supabase Auth redirect URLs before going live, or login links may fail to return users to the app correctly.

## Vercel deployment

This repo is already linked to a Vercel project. Typical release flow:

```bash
npx vercel env add VITE_SUPABASE_URL production --value "https://your-project.supabase.co" --yes
npx vercel env add VITE_SUPABASE_PUBLISHABLE_KEY production --value "your-publishable-key" --yes
npx vercel env add VITE_REMOTE_WORKSPACE_ID production --value "primary" --yes
npx vercel --prod --yes
```

Repeat the env setup for `preview` and `development` if you want those environments to use Supabase too.

## Release checklist

- Supabase migration applied
- Supabase Auth enabled for team login
- Vercel env vars set
- Supabase redirect URLs include the deployed Vercel origin
- `npm run lint` passed
- `npm run test` passed
- `npm run build` passed
- Login flow verified
- Remote state read/write verified
- Export flow verified for recovery

## Recovery and limitations

- If Supabase is degraded, the app still falls back to local saved state and shows a sync warning.
- The UI export can be used as an operator recovery path.
- `workspace_state.state jsonb` is acceptable for one shared internal workspace, but it is not the final architecture for true large-scale SaaS.

## Next architecture step

When the product moves past one shared workspace, the next redesign should:

- normalize portfolios, cards, brands, team members, comments, and activity into relational tables
- add tenant and workspace membership tables
- move from whole-state writes to row-level mutations and realtime subscriptions
