import { useEffect, useState, type ReactNode } from 'react'
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
import type { WorkspaceAccessEntry } from '../supabase'
import { ButtonSpinner } from './ButtonSpinner'
import { XIcon } from './icons/AppIcons'

type WorkspaceDirectoryStatus = 'idle' | 'loading' | 'ready' | 'error'

interface WorkspaceAccessManagerProps {
  entries: WorkspaceAccessEntry[]
  editorOptions: string[]
  portfolios: Portfolio[]
  status: WorkspaceDirectoryStatus
  errorMessage: string | null
  pendingEmail: string | null
  headerUtilityContent?: ReactNode
  onOpenTeam: () => void
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

const ACCESS_HELP_DISMISSED_KEY = 'editors-board-access-help-dismissed'
const NEW_ENTRY_KEY = '__new__'

const ACCESS_LEVEL_OPTIONS: Array<{
  value: RoleMode
  description: string
}> = [
  {
    value: 'owner',
    description: 'Full control over everything.',
  },
  {
    value: 'manager',
    description: 'Manages cards and people within their visibility.',
  },
  {
    value: 'contributor',
    description: 'Works on their own assigned cards.',
  },
  {
    value: 'viewer',
    description: 'Read-only view of their assigned area.',
  },
]

function hasBrowser() {
  return typeof window !== 'undefined'
}

function getInitialHelpDismissed() {
  if (!hasBrowser()) {
    return false
  }

  return window.localStorage.getItem(ACCESS_HELP_DISMISSED_KEY) === 'true'
}

function normalizeEmail(value: string) {
  return value.trim().toLowerCase()
}

function isValidEmail(value: string) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(normalizeEmail(value))
}

function createEmptyDraft(): AccessDraft {
  return {
    email: '',
    roleMode: 'manager',
    editorName: '',
    scopeMode: 'all-portfolios',
    scopeAssignments: [],
  }
}

function buildAllPortfolioAssignments(portfolios: Portfolio[]) {
  return portfolios.map((portfolio) => ({
    portfolioId: portfolio.id,
    brandNames: [],
  }))
}

function getPortfolioAssignment(
  assignments: PortfolioAccessScope[],
  portfolioId: string,
) {
  return normalizeScopeAssignments(assignments).find(
    (assignment) => assignment.portfolioId === portfolioId,
  )
}

function getPortfolioBrandNames(portfolio: Portfolio) {
  return portfolio.brands.map((brand) => brand.name)
}

function isPortfolioFullySelected(
  assignments: PortfolioAccessScope[],
  portfolio: Portfolio,
) {
  const assignment = getPortfolioAssignment(assignments, portfolio.id)
  if (!assignment) {
    return false
  }

  return assignment.brandNames.length === 0
}

function getSelectedBrandNames(
  assignments: PortfolioAccessScope[],
  portfolio: Portfolio,
) {
  const assignment = getPortfolioAssignment(assignments, portfolio.id)
  if (!assignment) {
    return []
  }

  return assignment.brandNames.length === 0
    ? getPortfolioBrandNames(portfolio)
    : assignment.brandNames
}

function setPortfolioAllBrands(
  current: PortfolioAccessScope[],
  portfolio: Portfolio,
  checked: boolean,
) {
  const normalized = normalizeScopeAssignments(current)

  if (checked) {
    const nextAssignments = normalized.filter(
      (assignment) => assignment.portfolioId !== portfolio.id,
    )
    return [...nextAssignments, { portfolioId: portfolio.id, brandNames: [] }]
  }

  return normalized.filter((assignment) => assignment.portfolioId !== portfolio.id)
}

function setBrandSelection(
  current: PortfolioAccessScope[],
  portfolio: Portfolio,
  brandName: string,
  checked: boolean,
) {
  const allBrandNames = getPortfolioBrandNames(portfolio)
  const normalized = normalizeScopeAssignments(current)
  const assignment = getPortfolioAssignment(normalized, portfolio.id)
  const nextNames = new Set(
    assignment?.brandNames.length === 0 ? allBrandNames : assignment?.brandNames ?? [],
  )

  if (checked) {
    nextNames.add(brandName)
  } else {
    nextNames.delete(brandName)
  }

  const nextAssignments = normalized.filter(
    (currentAssignment) => currentAssignment.portfolioId !== portfolio.id,
  )

  if (nextNames.size === 0) {
    return nextAssignments
  }

  return [
    ...nextAssignments,
    {
      portfolioId: portfolio.id,
      brandNames:
        nextNames.size === allBrandNames.length
          ? []
          : Array.from(nextNames).sort((left, right) => left.localeCompare(right)),
    },
  ]
}

function getDerivedNonAllScopeMode(
  assignments: PortfolioAccessScope[],
  portfolios: Portfolio[],
) {
  const normalized = normalizeScopeAssignments(assignments)
  const hasPartialSelection = normalized.some((assignment) => {
    const portfolio = portfolios.find((item) => item.id === assignment.portfolioId)
    if (!portfolio || assignment.brandNames.length === 0) {
      return false
    }
    return assignment.brandNames.length < portfolio.brands.length
  })

  return hasPartialSelection ? 'selected-brands' : 'selected-portfolios'
}

function getNormalizedScopeState(
  draft: AccessDraft,
  portfolios: Portfolio[],
): { scopeMode: AccessScopeMode; scopeAssignments: PortfolioAccessScope[] } {
  if (draft.roleMode === 'owner' || draft.roleMode === 'contributor') {
    return {
      scopeMode: 'all-portfolios',
      scopeAssignments: [],
    }
  }

  if (draft.scopeMode === 'all-portfolios') {
    return {
      scopeMode: 'all-portfolios',
      scopeAssignments: [],
    }
  }

  const normalizedAssignments = normalizeScopeAssignments(draft.scopeAssignments)
    .map((assignment) => {
      const portfolio = portfolios.find((item) => item.id === assignment.portfolioId)
      if (!portfolio) {
        return null
      }

      const validBrands = assignment.brandNames.filter((brandName) =>
        portfolio.brands.some((brand) => brand.name === brandName),
      )

      return {
        portfolioId: assignment.portfolioId,
        brandNames:
          validBrands.length === portfolio.brands.length
            ? []
            : validBrands.sort((left, right) => left.localeCompare(right)),
      }
    })
    .filter((assignment): assignment is PortfolioAccessScope => Boolean(assignment))

  if (normalizedAssignments.length === 0) {
    return {
      scopeMode: 'selected-portfolios',
      scopeAssignments: [],
    }
  }

  const hasPartialSelection = normalizedAssignments.some(
    (assignment) => assignment.brandNames.length > 0,
  )

  return {
    scopeMode: hasPartialSelection ? 'selected-brands' : 'selected-portfolios',
    scopeAssignments: normalizedAssignments,
  }
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

function getValidationMessage(
  draft: AccessDraft,
  entries: WorkspaceAccessEntry[],
  portfolios: Portfolio[],
  currentEmail?: string,
) {
  const normalizedValue = normalizeEmail(draft.email)
  if (!normalizedValue) {
    return 'Enter an email.'
  }

  if (!isValidEmail(normalizedValue)) {
    return 'Enter a valid email.'
  }

  const normalizedCurrentEmail = currentEmail ? normalizeEmail(currentEmail) : null
  const duplicate = entries.some(
    (entry) =>
      normalizeEmail(entry.email) === normalizedValue &&
      normalizeEmail(entry.email) !== normalizedCurrentEmail,
  )

  if (duplicate) {
    return 'That email already has access.'
  }

  if (draft.roleMode === 'contributor' && !draft.editorName.trim()) {
    return 'Select a team member.'
  }

  if (draft.roleMode === 'manager' || draft.roleMode === 'viewer') {
    const normalizedScope = getNormalizedScopeState(draft, portfolios)
    if (
      normalizedScope.scopeMode !== 'all-portfolios' &&
      normalizedScope.scopeAssignments.length === 0
    ) {
      return 'Choose at least one portfolio or brand.'
    }
  }

  return null
}

function isReadyForSave(
  draft: AccessDraft,
  entries: WorkspaceAccessEntry[],
  portfolios: Portfolio[],
  currentEmail?: string,
) {
  return getValidationMessage(draft, entries, portfolios, currentEmail) === null
}

function getAccessSummary(draft: AccessDraft, portfolios: Portfolio[]) {
  const normalizedScope = getNormalizedScopeState(draft, portfolios)

  return getEffectiveAccessSummary(
    {
      roleMode: draft.roleMode,
      editorName: draft.roleMode === 'contributor' ? draft.editorName || null : null,
      scopeMode: normalizedScope.scopeMode,
      scopeAssignments: normalizedScope.scopeAssignments,
    },
    portfolios,
  )
}

function ScopeTreeField({
  draft,
  portfolios,
  onChange,
}: {
  draft: AccessDraft
  portfolios: Portfolio[]
  onChange: (draft: AccessDraft) => void
}) {
  if (draft.roleMode !== 'manager' && draft.roleMode !== 'viewer') {
    return null
  }

  const allPortfoliosChecked = draft.scopeMode === 'all-portfolios'
  const normalizedAssignments = allPortfoliosChecked
    ? buildAllPortfolioAssignments(portfolios)
    : normalizeScopeAssignments(draft.scopeAssignments)

  return (
    <div className="workspace-access-field">
      <span className="workspace-access-field-label">
        Visibility — which portfolios and brands they can see
      </span>
      <div className="workspace-scope-tree">
        <label className="workspace-scope-tree-option is-root">
          <input
            type="checkbox"
            checked={allPortfoliosChecked}
            onChange={(event) =>
              onChange({
                ...draft,
                scopeMode: event.target.checked
                  ? 'all-portfolios'
                  : getDerivedNonAllScopeMode(draft.scopeAssignments, portfolios),
              })
            }
          />
          <span>All portfolios</span>
        </label>

        <div className="workspace-scope-tree-groups">
          {portfolios.map((portfolio) => {
            const fullPortfolioSelected =
              allPortfoliosChecked || isPortfolioFullySelected(normalizedAssignments, portfolio)
            const selectedBrandNames = getSelectedBrandNames(normalizedAssignments, portfolio)

            return (
              <div key={portfolio.id} className="workspace-scope-tree-portfolio">
                <label className="workspace-scope-tree-option workspace-scope-tree-heading-option">
                  <input
                    type="checkbox"
                    checked={fullPortfolioSelected}
                    disabled={allPortfoliosChecked}
                    onChange={(event) => {
                      const nextAssignments = setPortfolioAllBrands(
                        draft.scopeAssignments,
                        portfolio,
                        event.target.checked,
                      )

                      onChange({
                        ...draft,
                        scopeMode: getDerivedNonAllScopeMode(nextAssignments, portfolios),
                        scopeAssignments: nextAssignments,
                      })
                    }}
                  />
                  <span className="workspace-scope-tree-heading">{portfolio.name}</span>
                </label>

                <div className="workspace-scope-tree-brand-list">
                  {portfolio.brands.map((brand) => (
                    <label
                      key={`${portfolio.id}-${brand.name}`}
                      className="workspace-scope-tree-option is-child"
                    >
                      <input
                        type="checkbox"
                        checked={selectedBrandNames.includes(brand.name)}
                        disabled={allPortfoliosChecked || fullPortfolioSelected}
                        onChange={(event) => {
                          const nextAssignments = setBrandSelection(
                            draft.scopeAssignments,
                            portfolio,
                            brand.name,
                            event.target.checked,
                          )

                          onChange({
                            ...draft,
                            scopeMode: getDerivedNonAllScopeMode(nextAssignments, portfolios),
                            scopeAssignments: nextAssignments,
                          })
                        }}
                      />
                      <span>{brand.name}</span>
                    </label>
                  ))}
                </div>
              </div>
            )
          })}
        </div>
      </div>
    </div>
  )
}

function TeamMemberField({
  draft,
  editorOptions,
  onChange,
  onOpenTeam,
}: {
  draft: AccessDraft
  editorOptions: string[]
  onChange: (draft: AccessDraft) => void
  onOpenTeam: () => void
}) {
  if (draft.roleMode !== 'contributor') {
    return null
  }

  const hasTeammates = editorOptions.length > 0

  return (
    <div className="workspace-access-field">
      <span className="workspace-access-field-label">Team member</span>
      {hasTeammates ? (
        <>
          <select
            aria-label={`Team member for ${draft.email || 'new person'}`}
            value={draft.editorName}
            onChange={(event) =>
              onChange({
                ...draft,
                editorName: event.target.value,
              })
            }
          >
            <option value="">Select team member</option>
            {editorOptions.map((editorName) => (
              <option key={editorName} value={editorName}>
                {editorName}
              </option>
            ))}
          </select>
          <p className="field-hint">Connects this sign-in to a board identity.</p>
        </>
      ) : (
        <button type="button" className="clear-link" onClick={onOpenTeam}>
          No team members yet — add one in Team
        </button>
      )}
    </div>
  )
}

function AccessDrawer({
  isOpen,
  isCreate,
  draft,
  entries,
  portfolios,
  editorOptions,
  pendingEmail,
  updatedAt,
  currentEmail,
  saveAttempted,
  errorMessage,
  revokeConfirming,
  onDraftChange,
  onClose,
  onSave,
  onStartRevoke,
  onCancelRevoke,
  onConfirmRevoke,
  onOpenTeam,
}: {
  isOpen: boolean
  isCreate: boolean
  draft: AccessDraft | null
  entries: WorkspaceAccessEntry[]
  portfolios: Portfolio[]
  editorOptions: string[]
  pendingEmail: string | null
  updatedAt: string | null
  currentEmail: string | null
  saveAttempted: boolean
  errorMessage: string | null
  revokeConfirming: boolean
  onDraftChange: (draft: AccessDraft) => void
  onClose: () => void
  onSave: () => void
  onStartRevoke: () => void
  onCancelRevoke: () => void
  onConfirmRevoke: () => void
  onOpenTeam: () => void
}) {
  if (!draft) {
    return null
  }

  const validationMessage = getValidationMessage(
    draft,
    entries,
    portfolios,
    isCreate ? undefined : currentEmail ?? undefined,
  )
  const pendingKey = isCreate ? NEW_ENTRY_KEY : normalizeEmail(currentEmail ?? draft.email)
  const isPending = pendingEmail === pendingKey
  const visibleError = errorMessage ?? (saveAttempted ? validationMessage : null)
  const selectedLevelDescription =
    ACCESS_LEVEL_OPTIONS.find((option) => option.value === draft.roleMode)?.description ?? ''

  return (
    <>
      <div
        className={`panel-overlay ${isOpen ? 'is-visible' : ''}`}
        aria-hidden={!isOpen}
        onClick={onClose}
      />
      <aside className={`slide-panel ${isOpen ? 'is-open' : ''}`} aria-hidden={!isOpen}>
        <div className="slide-panel-header workspace-access-drawer-header">
          <h2>{isCreate ? 'Add person' : 'Edit access'}</h2>
          <button
            type="button"
            className="close-icon-button"
            aria-label="Close access drawer"
            onClick={onClose}
          >
            <XIcon />
          </button>
        </div>

        <div className="workspace-access-drawer-body">
          {visibleError ? (
            <div className="workspace-access-inline-error" role="alert">
              {visibleError}
            </div>
          ) : null}

          <label className="workspace-access-field">
            <span className="workspace-access-field-label">Email</span>
            <input
              type="email"
              autoFocus={isCreate}
              value={draft.email}
              placeholder="team@company.com"
              onChange={(event) =>
                onDraftChange({
                  ...draft,
                  email: event.target.value,
                })
              }
            />
          </label>

          {updatedAt ? (
            <p className="workspace-access-drawer-meta">Updated {formatDateTime(updatedAt)}</p>
          ) : null}

          <label className="workspace-access-field">
            <span className="workspace-access-field-label">Access level</span>
            <select
              aria-label={`Access level for ${draft.email || 'new person'}`}
              value={draft.roleMode}
              onChange={(event) =>
                onDraftChange({
                  ...draft,
                  roleMode: event.target.value as RoleMode,
                })
              }
            >
              {ACCESS_LEVEL_OPTIONS.map((option) => (
                <option key={option.value} value={option.value}>
                  {getAccessLevelLabel(option.value)}
                </option>
              ))}
            </select>
            <p className="field-hint">{selectedLevelDescription}</p>
          </label>

          <ScopeTreeField draft={draft} portfolios={portfolios} onChange={onDraftChange} />

          <TeamMemberField
            draft={draft}
            editorOptions={editorOptions}
            onChange={onDraftChange}
            onOpenTeam={onOpenTeam}
          />

          <p className="muted-copy workspace-access-effective-copy">
            {getAccessSummary(draft, portfolios)}
          </p>

          <div className="workspace-access-drawer-actions">
            {!isCreate ? (
              <button
                type="button"
                className="clear-link danger-link"
                disabled={isPending}
                onClick={onStartRevoke}
              >
                Remove access
              </button>
            ) : (
              <span />
            )}
            <button
              type="button"
              className="ghost-button"
              disabled={
                isPending ||
                !isReadyForSave(
                  draft,
                  entries,
                  portfolios,
                  isCreate ? undefined : currentEmail ?? undefined,
                )
              }
              onClick={onSave}
            >
              {isPending ? <ButtonSpinner /> : null}
              <span>{isCreate ? 'Add person' : 'Save changes'}</span>
            </button>
          </div>

          {revokeConfirming ? (
            <div className="workspace-access-confirm">
              <strong>Remove access for {draft.email}?</strong>
              <p>Their cards and team profile are not affected.</p>
              <div className="workspace-access-confirm-actions">
                <button type="button" className="ghost-button" onClick={onCancelRevoke}>
                  Cancel
                </button>
                <button
                  type="button"
                  className="ghost-button danger-outline"
                  onClick={onConfirmRevoke}
                >
                  Remove access
                </button>
              </div>
            </div>
          ) : null}
        </div>
      </aside>
    </>
  )
}

export function WorkspaceAccessManager({
  entries,
  editorOptions,
  portfolios,
  status,
  errorMessage,
  pendingEmail,
  headerUtilityContent,
  onOpenTeam,
  onSave,
  onDelete,
}: WorkspaceAccessManagerProps) {
  const [drafts, setDrafts] = useState<Record<string, AccessDraft>>({})
  const [newEntry, setNewEntry] = useState<AccessDraft>(() => createEmptyDraft())
  const [activeKey, setActiveKey] = useState<string | null>(null)
  const [saveAttempted, setSaveAttempted] = useState(false)
  const [drawerErrorMessage, setDrawerErrorMessage] = useState<string | null>(null)
  const [revokeConfirming, setRevokeConfirming] = useState(false)
  const [dismissedHelpOnce, setDismissedHelpOnce] = useState(getInitialHelpDismissed)

  useEffect(() => {
    if (!hasBrowser() || entries.length === 0) {
      return
    }

    try {
      window.localStorage.setItem(ACCESS_HELP_DISMISSED_KEY, 'true')
    } catch {
      console.warn('[storage] Write failed, continuing:', ACCESS_HELP_DISMISSED_KEY)
    }
  }, [entries.length])

  const helpDismissed = dismissedHelpOnce || entries.length > 0

  const isCreate = activeKey === NEW_ENTRY_KEY
  const activeEntry = !isCreate ? entries.find((entry) => entry.email === activeKey) ?? null : null
  const activeDraft = isCreate
    ? newEntry
    : activeEntry
      ? drafts[activeEntry.email] ?? getEntryDraft(activeEntry)
      : null

  function openDrawer(key: string) {
    setActiveKey(key)
    setSaveAttempted(false)
    setDrawerErrorMessage(null)
    setRevokeConfirming(false)
  }

  function closeDrawer() {
    setActiveKey(null)
    setSaveAttempted(false)
    setDrawerErrorMessage(null)
    setRevokeConfirming(false)
  }

  function updateActiveDraft(nextDraft: AccessDraft) {
    setSaveAttempted(false)
    setDrawerErrorMessage(null)

    if (activeKey === NEW_ENTRY_KEY) {
      setNewEntry(nextDraft)
      return
    }

    if (!activeEntry) {
      return
    }

    setDrafts((current) => ({
      ...current,
      [activeEntry.email]: nextDraft,
    }))
  }

  async function handleInlineRoleChange(entry: WorkspaceAccessEntry, nextRole: RoleMode) {
    try {
      await onSave({
        email: entry.email,
        roleMode: nextRole,
        editorName: nextRole === 'contributor' ? entry.editorName : null,
        scopeMode: nextRole === 'owner' || nextRole === 'contributor' ? 'all-portfolios' : entry.scopeMode,
        scopeAssignments: nextRole === 'owner' || nextRole === 'contributor' ? [] : entry.scopeAssignments,
        previousEmail: entry.email,
      })
    } catch {
      // Error is handled by the parent via toast
    }
  }

  async function handleSave() {
    if (!activeDraft) {
      return
    }

    setSaveAttempted(true)
    setDrawerErrorMessage(null)

    const validationMessage = getValidationMessage(
      activeDraft,
      entries,
      portfolios,
      isCreate ? undefined : activeEntry?.email,
    )

    if (validationMessage) {
      setDrawerErrorMessage(validationMessage)
      return
    }

    const normalizedScope = getNormalizedScopeState(activeDraft, portfolios)

    try {
      await onSave({
        email: normalizeEmail(activeDraft.email),
        roleMode: activeDraft.roleMode,
        editorName:
          activeDraft.roleMode === 'contributor'
            ? activeDraft.editorName.trim() || null
            : null,
        scopeMode: normalizedScope.scopeMode,
        scopeAssignments: normalizedScope.scopeAssignments,
        previousEmail: activeEntry?.email,
      })

      if (isCreate) {
        setNewEntry(createEmptyDraft())
      } else if (activeEntry) {
        setDrafts((current) => {
          const next = { ...current }
          delete next[activeEntry.email]
          return next
        })
      }

      closeDrawer()
    } catch (error) {
      setDrawerErrorMessage(error instanceof Error ? error.message : 'Access could not be saved.')
    }
  }

  async function handleConfirmRevoke() {
    if (!activeEntry) {
      return
    }

    setDrawerErrorMessage(null)

    try {
      await onDelete(activeEntry.email)
      closeDrawer()
    } catch (error) {
      setDrawerErrorMessage(
        error instanceof Error ? error.message : 'Access could not be removed.',
      )
    }
  }

  return (
    <div className="settings-block">
      <div className="settings-block-header settings-page-toolbar">
        <div className="settings-section-header">
          <h2>Access</h2>
          <p className="muted-copy">
            Who can sign in, what they can see, and how that access works.
          </p>
        </div>
        <div className="settings-page-toolbar-actions">
          {headerUtilityContent}
          <button type="button" className="ghost-button" onClick={() => openDrawer(NEW_ENTRY_KEY)}>
            Add person
          </button>
        </div>
      </div>

      {!helpDismissed && entries.length === 0 ? (
        <div className="workspace-access-help-banner">
          <div>
            <strong>How access works</strong>
            <p>
              Add people with their email and choose an access level. Owners have full control.
              Managers and viewers can be scoped to specific portfolios or brands.
              Contributors are linked to a team member on the board.
            </p>
          </div>
          <button
            type="button"
            className="clear-link"
            onClick={() => {
              if (hasBrowser()) {
                try {
                  window.localStorage.setItem(ACCESS_HELP_DISMISSED_KEY, 'true')
                } catch {
                  console.warn('[storage] Write failed, continuing:', ACCESS_HELP_DISMISSED_KEY)
                }
              }
              setDismissedHelpOnce(true)
            }}
          >
            Dismiss
          </button>
        </div>
      ) : null}

      {status === 'loading' ? <p className="muted-copy">Loading…</p> : null}
      {status === 'error' && errorMessage ? <p className="auth-error">{errorMessage}</p> : null}

      <div className="workspace-access-table">
        <div className="workspace-access-table-head">
          <span>Email</span>
          <span>Access level</span>
          <span>Visibility</span>
          <span>Team member</span>
          <span />
        </div>

        {entries.length === 0 ? (
          <div className="workspace-access-empty">
            <strong>No one has access yet.</strong>
            <p>Add the first person to enable sign-in.</p>
          </div>
        ) : null}

        {entries.map((entry) => (
          <div
            key={entry.email}
            className={`workspace-access-row ${
              activeKey === entry.email ? 'is-active' : ''
            }`}
          >
            <span className="workspace-access-email">{entry.email}</span>
            <span className="workspace-access-row-cell" onClick={(e) => e.stopPropagation()}>
              <select
                className="workspace-access-inline-select"
                aria-label={`Access level for ${entry.email}`}
                value={entry.roleMode}
                onChange={(event) => {
                  void handleInlineRoleChange(entry, event.target.value as RoleMode)
                }}
              >
                {ACCESS_LEVEL_OPTIONS.map((option) => (
                  <option key={option.value} value={option.value}>
                    {getAccessLevelLabel(option.value)}
                  </option>
                ))}
              </select>
            </span>
            <span className="workspace-access-row-muted">{getScopeLabel(entry, portfolios)}</span>
            <span className="workspace-access-row-muted">{entry.editorName ?? '—'}</span>
            <span className="workspace-access-row-actions-cell">
              <button
                type="button"
                className="ghost-button workspace-access-edit-button"
                onClick={() => openDrawer(entry.email)}
              >
                Edit
              </button>
            </span>
          </div>
        ))}
      </div>

      <AccessDrawer
        isOpen={Boolean(activeKey)}
        isCreate={isCreate}
        draft={activeDraft}
        entries={entries}
        portfolios={portfolios}
        editorOptions={editorOptions}
        pendingEmail={pendingEmail}
        updatedAt={activeEntry?.updatedAt ?? null}
        currentEmail={activeEntry?.email ?? null}
        saveAttempted={saveAttempted}
        errorMessage={drawerErrorMessage}
        revokeConfirming={revokeConfirming}
        onDraftChange={updateActiveDraft}
        onClose={closeDrawer}
        onSave={() => {
          void handleSave()
        }}
        onStartRevoke={() => setRevokeConfirming(true)}
        onCancelRevoke={() => setRevokeConfirming(false)}
        onConfirmRevoke={() => {
          void handleConfirmRevoke()
        }}
        onOpenTeam={() => {
          closeDrawer()
          onOpenTeam()
        }}
      />
    </div>
  )
}
