# Technology Stack Documentation

## Languages and Runtime

- **Primary Language**: TypeScript (~5.9.3)
- **Runtime**: Node.js (referenced in `@types/node@^24.10.1`)
- **JavaScript Target**: ES2022
- **Module System**: ES Modules (ESM)
- **Browser APIs**: DOM and DOM.Iterable

## Frontend Framework and UI

- **React**: 19.2.0
- **React DOM**: 19.2.0
- **JSX**: React 17+ new JSX transform via `@vitejs/plugin-react@^5.1.1`

## Build Tools and Bundlers

- **Build Tool**: Vite 7.3.1
  - Configuration: `/Users/iskanderzrouga/Desktop/Editors\ Board/vite.config.ts`
  - Uses `@vitejs/plugin-react` for React compilation

- **TypeScript Compiler**: TypeScript 5.9.3
  - Build command: `tsc -b && vite build`
  - Configuration files:
    - `/Users/iskanderzrouga/Desktop/Editors\ Board/tsconfig.json` (root)
    - `/Users/iskanderzrouga/Desktop/Editors\ Board/tsconfig.app.json` (app config)
    - `/Users/iskanderzrouga/Desktop/Editors\ Board/tsconfig.node.json` (node config)

## Package Manager

- **npm** (package-lock.json present)
- Node package location: `/Users/iskanderzrouga/Desktop/Editors\ Board/node_modules`

## Key Dependencies and Their Use Cases

### Drag and Drop
- **@dnd-kit/core**: ^6.3.1 - Core drag-and-drop functionality
- **@dnd-kit/sortable**: ^10.0.0 - Sortable lists/reordering
- **@dnd-kit/modifiers**: ^9.0.0 - Drag behavior modifiers
- **@dnd-kit/utilities**: ^3.2.2 - Helper utilities for DnD

### Backend and Database
- **@supabase/supabase-js**: ^2.99.1 - Supabase client SDK for:
  - Authentication (magic links, password-based)
  - Real-time database access (workspace_access, workspace_state tables)
  - Edge function invocation (request-magic-link)
  - Row-level security enforcement

### Security and Content
- **dompurify**: ^3.3.3 - HTML sanitization to prevent XSS attacks

### Type Definitions
- **@types/react**: ^19.2.7
- **@types/react-dom**: ^19.2.3
- **@types/dompurify**: ^3.0.5
- **@types/node**: ^24.10.1

## Development Dependencies and Tools

### Testing and Quality Assurance

**Unit Testing**
- **vitest**: ^4.0.18 - Vite-native unit test runner
- **@vitest/coverage-v8**: ^4.0.18 - Code coverage reporting
- Configuration: `/Users/iskanderzrouga/Desktop/Editors\ Board/vitest.config.ts`
- Test pattern: `src/**/*.test.ts`
- Coverage provider: v8

**End-to-End Testing**
- **@playwright/test**: ^1.58.2 - Playwright E2E test framework
- Configuration: `/Users/iskanderzrouga/Desktop/Editors\ Board/playwright.config.ts`
- Test directory: `e2e/`
- Test server: Localhost 127.0.0.1:4273
- Multi-browser testing: Chromium, Firefox, WebKit (in CI)
- Retries: 1 in CI, 0 locally
- Parallel workers: 3 in CI, 1 locally
- Artifacts: HTML reports, traces, and videos on failure

### Linting and Code Quality
- **eslint**: ^9.39.1 - JavaScript/TypeScript linter
- **typescript-eslint**: ^8.48.0 - TypeScript plugin for ESLint
- **eslint-plugin-react-hooks**: ^7.0.1 - React hooks linting
- **eslint-plugin-react-refresh**: ^0.4.24 - React Fast Refresh plugin
- **@eslint/js**: ^9.39.1 - ESLint core rules
- **globals**: ^16.5.0 - Global variable definitions

Configuration: `/Users/iskanderzrouga/Desktop/Editors\ Board/eslint.config.js`

## Configuration Files and Their Purposes

| File | Purpose |
|------|---------|
| `vite.config.ts` | Vite build configuration (React plugin) |
| `tsconfig.json` | Root TypeScript configuration |
| `tsconfig.app.json` | App-specific TypeScript settings (ES2022, strict mode, DOM libs) |
| `tsconfig.node.json` | Node-specific TypeScript settings |
| `vitest.config.ts` | Unit test runner configuration |
| `playwright.config.ts` | E2E test configuration |
| `eslint.config.js` | ESLint rules and plugins |
| `package.json` | Project metadata and dependencies |
| `.env.example` | Environment variable template |
| `.env.local` | Local environment variables (development) |
| `index.html` | HTML entry point |

## Backend Infrastructure

### Deployment
- **Vercel**: Production hosting and CI/CD
  - Project configuration: `/Users/iskanderzrouga/Desktop/Editors\ Board/.vercel/project.json`
  - Environment: Development (hobby plan)

### Database and Backend Services
- **Supabase**:
  - PostgreSQL database with real-time capabilities
  - Authentication with magic link and password flows
  - Edge functions (Deno-based serverless)
  - Row-level security (RLS) policies
  - Location: `/Users/iskanderzrouga/Desktop/Editors\ Board/supabase/`

### Supabase Components

**Database Migrations** (`supabase/migrations/`)
- Workspace state management (create, restrict writes)
- Workspace access controls (RLS policies)
- Manager and owner role enforcement
- Schema versioning for scope-based access

**Edge Functions** (`supabase/functions/`)
- **request-magic-link**: Deno-based function handling:
  - Magic link token generation and sending
  - Password-based authentication
  - Schema auto-migration
  - PostgREST schema reloading
  - Workspace access verification

## Build and Development Scripts

| Script | Purpose |
|--------|---------|
| `npm run dev` | Start Vite dev server |
| `npm run build` | Compile TypeScript and build with Vite |
| `npm run lint` | Run ESLint on codebase |
| `npm run preview` | Preview production build locally |
| `npm run test` | Run all tests (unit + E2E) |
| `npm run test:unit` | Run unit tests with vitest |
| `npm run test:unit:coverage` | Generate code coverage report |
| `npm run test:e2e` | Run Playwright E2E tests |

## Code Quality Standards

- **Strict TypeScript**: `strict: true`
  - No unused locals or parameters
  - No fallthrough cases in switch statements
  - No unchecked side-effect imports

- **Module Resolution**: Bundler mode with verbatim syntax
  - Resolves JSON modules
  - Allows importing TS extensions
  - Module detection: forced

- **Ignored Directories** (ESLint/Build):
  - `dist/` - Build output
  - `coverage/` - Test coverage reports
  - `playwright-report/` - E2E test reports
  - `test-results/` - Test artifacts
  - `artifacts/` - Build artifacts
  - `node_modules/` - Dependencies

## Version Lock Strategy

- **TypeScript**: `~5.9.3` (allows patch updates)
- **Most dependencies**: Caret ranges (`^`) allowing minor/patch updates
- Uses `package-lock.json` for deterministic installs
