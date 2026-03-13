import { useState } from 'react'
import {
  getAccessLevelLabel,
  getEffectiveAccessSummary,
  getScopeLabel,
  normalizeScopeAssignments,
} from '../accessHelpers'
import {
  formatDateTime,
  type AccessScopeMode,
  type Portfolio,
  type PortfolioAccessScope,
  type RoleMode,
} from '../board'
import { ButtonSpinner } from './ButtonSpinner'
import { ConfirmDialog } from './ConfirmDialog'
import type { WorkspaceAccessEntry } from '../supabase'

type WorkspaceDirectoryStatus = 'idle' | 'loading' | 'ready' | 'error'

interface WorkspaceAccessManagerProps {
  entries: WorkspaceAccessEntry[]
  editorOptions: string[]
  portfolios: Portfolio[]
  status: WorkspaceDirectoryStatus
  errorMessage: string | null
  pendingEmail: string | null
  onSave: (entry: {
    email: string
    roleMode: RoleMode
    editorName: string | null
    scopeMode: AccessScopeMode
    scopeAssignments: PortfolioAccessScope[]
    previousEmail?: string
  }) => Promise<void>
  onDelete: (email: string) => Promise<void>
}

interface AccessDraft {
  email: string
  roleMode: RoleMode
  editorName: string
  scopeMode: AccessScopeMode
  scopeAssignments: PortfolioAccessScope[]
}

const ACCESS_LEVEL_OPTIONS: Array<{
  value: RoleMode
  description: string
}> = [
  {
    value: 'owner',
    description: 'Can see and manage all portfolios, settings, people, and access.',
  },
  {
    value: 'manager',
    description: 'Can manage work only inside assigned portfolio and brand scope.',
  },
  {
    value: 'contributor',
    description: 'Can see only their own cards and update the work they personally own.',
  },
  {
    value: 'viewer',
    description: 'Can open the workspace in read-only mode.',
  },
]

const MANAGER_SCOPE_OPTIONS: Array<{
  value: AccessScopeMode
  label: string
  description: string
}> = [
  {
    value: 'all-portfolios',
    label: 'All portfolios',
    description: 'Full portfolio and brand visibility.',
  },
  {
    value: 'selected-portfolios',
    label: 'Selected portfolios',
    description: 'Choose one or more portfolios. Brands inside them stay visible.',
  },
  {
    value: 'selected-brands',
    label: 'Selected brands',
    description: 'Choose specific brands. Products under those brands stay visible automatically.',
  },
]

function normalizeEmail(value: string) {
  return value.trim().toLowerCase()
}

function isValidEmail(value: string) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(normalizeEmail(value))
}

function getEmailValidationMessage(
  value: string,
  entries: WorkspaceAccessEntry[],
  currentEmail?: string,
) {
  const normalizedValue = normalizeEmail(value)

  if (!normalizedValue) {
    return null
  }

  if (!isValidEmail(normalizedValue)) {
    return 'Enter a valid work email.'
  }

  const normalizedCurrentEmail = currentEmail ? normalizeEmail(currentEmail) : null
  const duplicate = entries.some(
    (entry) =>
      normalizeEmail(entry.email) === normalizedValue &&
      normalizeEmail(entry.email) !== normalizedCurrentEmail,
  )

  if (duplicate) {
    return 'That email already has login access.'
  }

  return null
}

function getRoleDescription(roleMode: RoleMode) {
  return ACCESS_LEVEL_OPTIONS.find((option) => option.value === roleMode)?.description ?? ''
}

function createEmptyDraft(): AccessDraft {
  return {
    email: '',
    roleMode: 'manager',
    editorName: '',
    scopeMode: 'selected-portfolios',
    scopeAssignments: [],
  }
}

function normalizeDraftForRole(draft: AccessDraft): AccessDraft {
  if (draft.roleMode === 'owner') {
    return {
      ...draft,
      editorName: '',
      scopeMode: 'all-portfolios',
      scopeAssignments: [],
    }
  }

  if (draft.roleMode === 'contributor') {
    return {
      ...draft,
      scopeMode: 'all-portfolios',
      scopeAssignments: [],
    }
  }

  return {
    ...draft,
    editorName: '',
    scopeAssignments: normalizeScopeAssignments(draft.scopeAssignments),
  }
}

function getValidationMessage(
  draft: AccessDraft,
  entries: WorkspaceAccessEntry[],
  currentEmail?: string,
) {
  const emailMessage = getEmailValidationMessage(draft.email, entries, currentEmail)
  if (emailMessage) {
    return emailMessage
  }

  if (draft.roleMode === 'contributor' && !draft.editorName) {
    return 'Choose a teammate profile in Works as.'
  }

  if (draft.roleMode === 'manager' || draft.roleMode === 'viewer') {
    if (
      draft.scopeMode === 'selected-portfolios' &&
      normalizeScopeAssignments(draft.scopeAssignments).length === 0
    ) {
      return 'Choose at least one portfolio for this access level.'
    }

    if (draft.scopeMode === 'selected-brands') {
      const selectedBrands = normalizeScopeAssignments(draft.scopeAssignments).flatMap(
        (assignment) => assignment.brandNames,
      )
      if (selectedBrands.length === 0) {
        return 'Choose at least one brand for this access level.'
      }
    }
  }

  return null
}

function isDirty(entry: WorkspaceAccessEntry, draft: AccessDraft) {
  const normalizedDraft = normalizeDraftForRole(draft)
  return (
    normalizeEmail(entry.email) !== normalizeEmail(normalizedDraft.email) ||
    entry.roleMode !== normalizedDraft.roleMode ||
    (entry.editorName ?? '') !== normalizedDraft.editorName ||
    entry.scopeMode !== normalizedDraft.scopeMode ||
    JSON.stringify(normalizeScopeAssignments(entry.scopeAssignments)) !==
      JSON.stringify(normalizeScopeAssignments(normalizedDraft.scopeAssignments))
  )
}

function getEntryDraft(entry: WorkspaceAccessEntry): AccessDraft {
  return {
    email: entry.email,
    roleMode: entry.roleMode,
    editorName: entry.editorName ?? '',
    scopeMode: entry.scopeMode,
    scopeAssignments: normalizeScopeAssignments(entry.scopeAssignments),
  }
}

function toggleSelectedPortfolio(
  current: PortfolioAccessScope[],
  portfolioId: string,
  checked: boolean,
) {
  const normalized = normalizeScopeAssignments(current)
  if (checked) {
    if (normalized.some((assignment) => assignment.portfolioId === portfolioId)) {
      return normalized
    }

    return [...normalized, { portfolioId, brandNames: [] }]
  }

  return normalized.filter((assignment) => assignment.portfolioId !== portfolioId)
}

function toggleSelectedBrand(
  current: PortfolioAccessScope[],
  portfolioId: string,
  brandName: string,
  checked: boolean,
) {
  const nextAssignments = new Map(
    normalizeScopeAssignments(current).map((assignment) => [
      assignment.portfolioId,
      new Set(assignment.brandNames),
    ]),
  )
  const brandNames = nextAssignments.get(portfolioId) ?? new Set<string>()

  if (checked) {
    brandNames.add(brandName)
    nextAssignments.set(portfolioId, brandNames)
  } else {
    brandNames.delete(brandName)
    if (brandNames.size === 0) {
      nextAssignments.delete(portfolioId)
    } else {
      nextAssignments.set(portfolioId, brandNames)
    }
  }

  return Array.from(nextAssignments.entries()).map(([nextPortfolioId, names]) => ({
    portfolioId: nextPortfolioId,
    brandNames: Array.from(names).sort((left, right) => left.localeCompare(right)),
  }))
}

function getScopePreview(draft: AccessDraft, portfolios: Portfolio[]) {
  return getScopeLabel(
    {
      roleMode: draft.roleMode,
      editorName: draft.editorName || null,
      scopeMode: draft.scopeMode,
      scopeAssignments: normalizeScopeAssignments(draft.scopeAssignments),
    },
    portfolios,
  )
}

function ScopePicker({
  draft,
  portfolios,
  onChange,
}: {
  draft: AccessDraft
  portfolios: Portfolio[]
  onChange: (draft: AccessDraft) => void
}) {
  if (draft.roleMode === 'owner') {
    return (
      <div className="workspace-access-preview">
        <strong>Scope</strong>
        <span>All portfolios</span>
      </div>
    )
  }

  if (draft.roleMode === 'contributor') {
    return (
      <div className="workspace-access-preview">
        <strong>Scope</strong>
        <span>Own cards only</span>
      </div>
    )
  }

  const normalizedAssignments = normalizeScopeAssignments(draft.scopeAssignments)

  return (
    <div className="workspace-access-scope">
      <label>
        <span>Scope</span>
        <select
          aria-label={`Scope for ${draft.email || getAccessLevelLabel(draft.roleMode)}`}
          value={draft.scopeMode}
          onChange={(event) =>
            onChange({
              ...draft,
              scopeMode: event.target.value as AccessScopeMode,
              scopeAssignments:
                event.target.value === 'all-portfolios' ? [] : normalizedAssignments,
            })
          }
        >
          {MANAGER_SCOPE_OPTIONS.map((option) => (
            <option key={option.value} value={option.value}>
              {option.label}
            </option>
          ))}
        </select>
      </label>
      <p className="field-hint">
        {MANAGER_SCOPE_OPTIONS.find((option) => option.value === draft.scopeMode)?.description}
      </p>

      {draft.scopeMode === 'selected-portfolios' ? (
        <div className="scope-checkbox-grid">
          {portfolios.map((portfolio) => {
            const checked = normalizedAssignments.some(
              (assignment) => assignment.portfolioId === portfolio.id,
            )
            return (
              <label key={portfolio.id} className="scope-choice-card">
                <input
                  type="checkbox"
                  checked={checked}
                  onChange={(event) =>
                    onChange({
                      ...draft,
                      scopeAssignments: toggleSelectedPortfolio(
                        normalizedAssignments,
                        portfolio.id,
                        event.target.checked,
                      ),
                    })
                  }
                />
                <span>{portfolio.name}</span>
              </label>
            )
          })}
        </div>
      ) : null}

      {draft.scopeMode === 'selected-brands' ? (
        <div className="scope-brand-groups">
          {portfolios.map((portfolio) => {
            const selectedBrands =
              normalizedAssignments.find((assignment) => assignment.portfolioId === portfolio.id)
                ?.brandNames ?? []

            return (
              <div key={portfolio.id} className="scope-brand-group">
                <strong>{portfolio.name}</strong>
                <div className="scope-checkbox-grid">
                  {portfolio.brands.map((brand) => (
                    <label key={`${portfolio.id}-${brand.name}`} className="scope-choice-card">
                      <input
                        type="checkbox"
                        checked={selectedBrands.includes(brand.name)}
                        onChange={(event) =>
                          onChange({
                            ...draft,
                            scopeAssignments: toggleSelectedBrand(
                              normalizedAssignments,
                              portfolio.id,
                              brand.name,
                              event.target.checked,
                            ),
                          })
                        }
                      />
                      <span>{brand.name}</span>
                    </label>
                  ))}
                </div>
              </div>
            )
          })}
        </div>
      ) : null}
    </div>
  )
}

function WorksAsField({
  draft,
  editorOptions,
  onChange,
}: {
  draft: AccessDraft
  editorOptions: string[]
  onChange: (draft: AccessDraft) => void
}) {
  if (draft.roleMode !== 'contributor') {
    return (
      <div className="board-identity-static">
        <strong>Works as</strong>
        <span>No teammate profile needed.</span>
      </div>
    )
  }

  const hasBoardPeople = editorOptions.length > 0

  return (
    <label>
      <span>Works as</span>
      <select
        aria-label={`Works as for ${draft.email || 'new access row'}`}
        value={draft.editorName}
        disabled={!hasBoardPeople}
        onChange={(event) =>
          onChange({
            ...draft,
            editorName: event.target.value,
          })
        }
      >
        <option value="">
          {hasBoardPeople ? 'Choose teammate profile' : 'Add a teammate in People first'}
        </option>
        {editorOptions.map((editorName) => (
          <option key={editorName} value={editorName}>
            {editorName}
          </option>
        ))}
      </select>
      <p className="field-hint">
        {hasBoardPeople
          ? 'Choose which teammate profile this person uses on the board.'
          : 'People comes first. Add the teammate profile, then connect this login access row.'}
      </p>
    </label>
  )
}

function AccessCard({
  title,
  draft,
  entries,
  portfolios,
  editorOptions,
  pendingEmail,
  updatedAt,
  isNew,
  onChange,
  onSave,
  onDelete,
}: {
  title: string
  draft: AccessDraft
  entries: WorkspaceAccessEntry[]
  portfolios: Portfolio[]
  editorOptions: string[]
  pendingEmail: string | null
  updatedAt?: string | null
  isNew?: boolean
  onChange: (draft: AccessDraft) => void
  onSave: () => void
  onDelete?: () => void
}) {
  const validationMessage = getValidationMessage(draft, entries, isNew ? undefined : title)
  const isPending =
    pendingEmail === normalizeEmail(draft.email) || (isNew && pendingEmail === '__new__')
  const canSave = normalizeEmail(draft.email).length > 0 && !validationMessage && !isPending

  return (
    <div className="settings-block workspace-access-card">
      <div className="settings-block-header">
        <div>
          <strong>{title}</strong>
          {updatedAt ? (
            <p className="muted-copy">{`Last updated ${formatDateTime(updatedAt)}`}</p>
          ) : null}
        </div>
      </div>

      <div className="settings-form-grid">
        <label>
          <span>Work email</span>
          <input
            type="email"
            aria-invalid={validationMessage ? 'true' : 'false'}
            value={draft.email}
            onChange={(event) =>
              onChange({
                ...draft,
                email: event.target.value,
              })
            }
          />
        </label>

        <label>
          <span>Access level</span>
          <select
            aria-label={`Access level for ${draft.email || title}`}
            value={draft.roleMode}
            onChange={(event) =>
              onChange(
                normalizeDraftForRole({
                  ...draft,
                  roleMode: event.target.value as RoleMode,
                }),
              )
            }
          >
            {ACCESS_LEVEL_OPTIONS.map((option) => (
              <option key={option.value} value={option.value}>
                {getAccessLevelLabel(option.value)}
              </option>
            ))}
          </select>
          <p className="field-hint">{getRoleDescription(draft.roleMode)}</p>
        </label>

        <WorksAsField draft={draft} editorOptions={editorOptions} onChange={onChange} />
      </div>

      <ScopePicker draft={draft} portfolios={portfolios} onChange={onChange} />

      <div className="workspace-access-preview">
        <strong>Scope</strong>
        <span>{getScopePreview(draft, portfolios)}</span>
      </div>

      <div className="workspace-access-preview">
        <strong>Effective access</strong>
        <span>
          {getEffectiveAccessSummary(
            {
              roleMode: draft.roleMode,
              editorName: draft.editorName || null,
              scopeMode: draft.scopeMode,
              scopeAssignments: normalizeScopeAssignments(draft.scopeAssignments),
            },
            portfolios,
          )}
        </span>
      </div>

      {validationMessage ? (
        <p className="field-error" role="alert">
          {validationMessage}
        </p>
      ) : null}

      <div className="task-type-actions">
        <button
          type="button"
          className="ghost-button"
          disabled={!canSave}
          onClick={onSave}
        >
          {isPending ? <ButtonSpinner /> : null}
          <span>{isNew ? 'Add access' : 'Save changes'}</span>
        </button>
        {onDelete ? (
          <button
            type="button"
            className="clear-link danger-link"
            disabled={isPending}
            onClick={onDelete}
          >
            Remove
          </button>
        ) : null}
      </div>
    </div>
  )
}

export function WorkspaceAccessManager({
  entries,
  editorOptions,
  portfolios,
  status,
  errorMessage,
  pendingEmail,
  onSave,
  onDelete,
}: WorkspaceAccessManagerProps) {
  const [drafts, setDrafts] = useState<Record<string, AccessDraft>>({})
  const [pendingDeleteEmail, setPendingDeleteEmail] = useState<string | null>(null)
  const [newEntry, setNewEntry] = useState<AccessDraft>(() => createEmptyDraft())

  return (
    <div className="settings-stack">
      <div className="settings-block">
        <div className="settings-block-header">
          <div>
            <strong>Access</strong>
            <p className="muted-copy">
              Decide who can sign in, what they can see, and which teammate profile they use on
              the board.
            </p>
          </div>
        </div>

        <div className="workspace-access-explainer">
          <strong>Simple mental model</strong>
          <p>
            Access level controls authority. Scope controls portfolio and brand visibility. Works
            as connects a contributor login to a teammate profile. Products follow brand access
            automatically.
          </p>
        </div>

        {status === 'loading' ? <p className="muted-copy">Loading access records…</p> : null}
        {status === 'error' && errorMessage ? <p className="auth-error">{errorMessage}</p> : null}
      </div>

      {entries.map((entry) => {
        const draft = drafts[entry.email] ?? getEntryDraft(entry)
        const rowIsDirty = isDirty(entry, draft)

        return (
          <AccessCard
            key={entry.email}
            title={entry.email}
            draft={draft}
            entries={entries}
            portfolios={portfolios}
            editorOptions={editorOptions}
            pendingEmail={pendingEmail}
            updatedAt={entry.updatedAt}
            onChange={(nextDraft) =>
              setDrafts((current) => ({
                ...current,
                [entry.email]: nextDraft,
              }))
            }
            onSave={() => {
              if (!rowIsDirty) {
                return
              }

              const normalizedDraft = normalizeDraftForRole(draft)
              void onSave({
                email: normalizedDraft.email,
                roleMode: normalizedDraft.roleMode,
                editorName:
                  normalizedDraft.roleMode === 'contributor'
                    ? normalizedDraft.editorName || null
                    : null,
                scopeMode: normalizedDraft.scopeMode,
                scopeAssignments: normalizeScopeAssignments(normalizedDraft.scopeAssignments),
                previousEmail: entry.email,
              })
                .then(() =>
                  setDrafts((current) => {
                    const next = { ...current }
                    delete next[entry.email]
                    return next
                  }),
                )
                .catch(() => undefined)
            }}
            onDelete={() => setPendingDeleteEmail(entry.email)}
          />
        )
      })}

      <AccessCard
        title="Add access"
        draft={newEntry}
        entries={entries}
        portfolios={portfolios}
        editorOptions={editorOptions}
        pendingEmail={pendingEmail}
        isNew
        onChange={setNewEntry}
        onSave={() => {
          const normalizedDraft = normalizeDraftForRole(newEntry)
          void onSave({
            email: normalizedDraft.email,
            roleMode: normalizedDraft.roleMode,
            editorName:
              normalizedDraft.roleMode === 'contributor'
                ? normalizedDraft.editorName || null
                : null,
            scopeMode: normalizedDraft.scopeMode,
            scopeAssignments: normalizeScopeAssignments(normalizedDraft.scopeAssignments),
          })
            .then(() => setNewEntry(createEmptyDraft()))
            .catch(() => undefined)
        }}
      />

      {pendingDeleteEmail ? (
        <ConfirmDialog
          title="Remove access?"
          message={
            <p>
              {`This will remove sign-in access for ${pendingDeleteEmail}. Cards, portfolios, and teammate profiles stay untouched.`}
            </p>
          }
          confirmLabel="Remove access"
          onCancel={() => setPendingDeleteEmail(null)}
          onConfirm={() => {
            void onDelete(pendingDeleteEmail).finally(() => setPendingDeleteEmail(null))
          }}
        />
      ) : null}
    </div>
  )
}
