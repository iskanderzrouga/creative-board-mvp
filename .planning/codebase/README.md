# Codebase Documentation

This directory contains comprehensive analysis of the Editors Board codebase, covering conventions, patterns, and testing strategies.

## Documents

### CONVENTIONS.md (459 lines)
Complete guide to coding conventions and patterns:
- Code style and formatting (2-space indentation, semicolons, trailing commas)
- TypeScript configuration (strict mode, ES2022 target)
- Naming conventions for files, variables, functions, types, and components
- Import ordering patterns
- Component patterns (functional and class-based)
- Type system patterns (literal type extraction, interface composition)
- Error handling patterns (custom error classes, Error Boundaries)
- Data flow and state management patterns
- Module organization
- Key patterns and idioms

### TESTING.md (766 lines)
Comprehensive testing guide covering:
- Unit testing with Vitest
- E2E testing with Playwright
- Test file structure and organization
- Unit test patterns and examples
- E2E test patterns and examples
- Mocking and fixture strategies
- Playwright query selectors
- Coverage configuration
- CI/CD integration
- Testing checklist
- Key testing insights

## Key Findings

### Project Structure
- **Framework**: React 19 with TypeScript 5.9
- **Build tool**: Vite
- **Testing**: Vitest (unit) + Playwright (E2E)
- **Dependencies**: 
  - @dnd-kit for drag-and-drop
  - @supabase/supabase-js for auth
  - dompurify for XSS protection

### Code Organization
- **src/board.ts** - Core domain model and business logic (~2500+ lines)
- **src/components/** - 29 React components
- **src/hooks/** - Custom React hooks (useAppEffects, useWorkspaceSession)
- **e2e/** - 12 Playwright test specs
- **Unit tests** - 2 test files (board.test.ts, remoteAppState.test.ts)

### Testing Coverage
- **Unit tests**: Core business logic in board.ts and remote sync
- **E2E tests**: 12 comprehensive test scenarios covering:
  - Smoke tests (basic functionality)
  - CRUD operations
  - Drag-and-drop interactions
  - Authentication and sync
  - Role-based access control
  - Responsive design

### Key Conventions
1. **Naming**: camelCase functions (get*, is*, create*, on*), PascalCase components, UPPER_SNAKE_CASE constants
2. **Types**: Extracted from const arrays as literal types, type-only imports for type definitions
3. **State**: Immutable updates with spread operators, pure functions for transformations
4. **Components**: Props/State interfaces, separate concerns for functional vs class components
5. **Tests**: Vitest with seed data factories, Playwright with accessibility-first selectors

### Quality Measures
- Strict TypeScript (noUnusedLocals, noUnusedParameters, noFallthroughCasesInSwitch)
- ESLint with React hooks and refresh plugins
- React 19 strict mode
- Error boundaries for UI resilience
- Custom error classes for domain exceptions
- Comprehensive E2E coverage with multi-browser testing (CI)

## Usage

Use these documents as reference for:
- Understanding code style when writing new features
- Following established patterns for consistency
- Writing tests that match the project's testing patterns
- Onboarding new developers
- Code review guidelines
