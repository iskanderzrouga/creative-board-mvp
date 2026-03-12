# Editors Board

Editors Board is a production-minded creative operations board built with React, TypeScript, and Vite. The current rollout keeps the familiar board UI while moving persistence and team access into Supabase.

## What ships in this version

- Vercel-hosted frontend
- Supabase email magic-link authentication
- Supabase-backed workspace access control with role binding
- One shared team workspace stored in `public.workspace_state`
- Local browser storage kept as a resilience cache
- Playwright smoke coverage for the board, analytics access, and authenticated shared-workspace sync

## Environment variables

Set these in Vercel and, when needed, in a local `.env.local` file:

```bash
VITE_SUPABASE_URL="https://your-project.supabase.co"
VITE_SUPABASE_PUBLISHABLE_KEY="your-publishable-key"
VITE_REMOTE_WORKSPACE_ID="primary"
VITE_MAGIC_LINK_REDIRECT_URL="https://your-production-url.vercel.app"
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
- `public.workspace_access`
  - `email text primary key`
  - `role_mode text not null`
  - `editor_name text null`

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

This release uses Supabase email magic links with `shouldCreateUser: false`, so only invited Supabase Auth users can request a link.

Before going live:

- Set Supabase Auth `Site URL` to your production app origin, for example `https://creative-board-lake.vercel.app`.
- Add the same production origin to Supabase Auth redirect URLs.
- Add any local dev origins you still need, such as `http://localhost:5173`, `http://127.0.0.1:5173`, or your actual dev port.
- Keep `VITE_MAGIC_LINK_REDIRECT_URL` aligned with the production origin so links never default back to an old localhost value in production.

Every person who should enter the app now needs two things:

1. A row in `public.workspace_access`.
2. The shared login page URL.

Managers can now maintain `workspace_access` directly from the app under `Settings` → `Team & Roles`. Once an approved email is saved there, the teammate can visit the app login page and create their account on first sign-in with a magic link.

Example manager grant:

```sql
insert into public.workspace_access (email, role_mode)
values ('manager@company.com', 'manager')
on conflict (email) do update
set role_mode = excluded.role_mode, editor_name = excluded.editor_name;
```

Example editor grant:

```sql
insert into public.workspace_access (email, role_mode, editor_name)
values ('editor@company.com', 'editor', 'Daniel T')
on conflict (email) do update
set role_mode = excluded.role_mode, editor_name = excluded.editor_name;
```

Random authenticated users are no longer enough on their own. `workspace_state` now requires a matching `workspace_access` record through row-level security, and the app binds the visible role to that access record instead of letting the browser choose any role locally.

Supabase also rate-limits passwordless email sends. The app now surfaces a cooldown message when that happens, but the actual limit still lives in Supabase Auth settings and SMTP configuration.

## Vercel deployment

This repo is already linked to a Vercel project. Typical release flow:

```bash
npx vercel env add VITE_SUPABASE_URL production --value "https://your-project.supabase.co" --yes
npx vercel env add VITE_SUPABASE_PUBLISHABLE_KEY production --value "your-publishable-key" --yes
npx vercel env add VITE_REMOTE_WORKSPACE_ID production --value "primary" --yes
npx vercel env add VITE_MAGIC_LINK_REDIRECT_URL production --value "https://your-production-url.vercel.app" --yes
npx vercel --prod --yes
```

Repeat the env setup for `preview` and `development` if you want those environments to use Supabase too.

## Release checklist

- Supabase migration applied
- Supabase Auth enabled for invited team login
- `workspace_access` rows created for approved users
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
