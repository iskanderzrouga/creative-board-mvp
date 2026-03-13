import { useEffect, useState } from 'react'
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

const ACCESS_INFO_SEEN_KEY = 'editors-board-access-info-seen'
const ACCESS_INFO_COLLAPSED_KEY = 'editors-board-access-info-collapsed'
const NEW_ENTRY_KEY = '__new__'

const ACCESS_LEVEL_OPTIONS: Array<{
  value: RoleMode
  description: string
}> = [
  {
    value: 'owner',
    description: 'Full control across all portfolios, settings, people, and access.',
  },
  {
    value: 'manager',
    description: 'Manages work inside assigned scope.',
  },
  {
    value: 'contributor',
    description: 'Works only on assigned cards.',
  },
  {
    value: 'viewer',
    description: 'Views assigned scope in read-only mode.',
  },
]

const VISIBILITY_SCOPE_OPTIONS: Array<{
  value: AccessScopeMode
  label: string
  description: string
}> = [
  {
    value: 'all-portfolios',
    label: 'All portfolios',
    description: 'Shows every portfolio, brand, and product.',
  },
  {
    value: 'selected-portfolios',
    label: 'Selected portfolios',
    description: 'Shows every brand and product inside chosen portfolios.',
  },
  {
    value: 'selected-brands',
    label: 'Specific brands',
    description: 'Shows only chosen brands and the products under them.',
  },
]

function hasBrowser() {
  return typeof window !== 'undefined'
}

function getInitialInfoExpanded() {
  if (!hasBrowser()) {
    return true
  }

  const hasSeenInfo = window.localStorage.getItem(ACCESS_INFO_SEEN_KEY) === 'true'
  if (!hasSeenInfo) {
    return true
  }

  return window.localStorage.getItem(ACCESS_INFO_COLLAPSED_KEY) !== 'true'
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

function getScopeDescription(scopeMode: AccessScopeMode) {
  return VISIBILITY_SCOPE_OPTIONS.find((option) => option.value === scopeMode)?.description ?? ''
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
      editorName: draft.editorName,
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
  currentEmail?: string,
) {
  const normalizedValue = normalizeEmail(draft.email)
  if (!normalizedValue) {
    return 'Enter a work email.'
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
    return 'That email already has access.'
  }

  if (draft.roleMode === 'contributor' && !draft.editorName.trim()) {
    return 'Choose a teammate profile.'
  }

  if (draft.roleMode === 'manager' || draft.roleMode === 'viewer') {
    if (
      draft.scopeMode === 'selected-portfolios' &&
      normalizeScopeAssignments(draft.scopeAssignments).length === 0
    ) {
      return 'Choose at least one portfolio.'
    }

    if (draft.scopeMode === 'selected-brands') {
      const selectedBrands = normalizeScopeAssignments(draft.scopeAssignments).flatMap(
        (assignment) => assignment.brandNames,
      )
      if (selectedBrands.length === 0) {
        return 'Choose at least one brand.'
      }
    }
  }

  return null
}

function isReadyForSave(draft: AccessDraft) {
  if (!normalizeEmail(draft.email)) {
    return false
  }

  if (draft.roleMode === 'contributor') {
    return Boolean(draft.editorName.trim())
  }

  if (draft.roleMode === 'manager' || draft.roleMode === 'viewer') {
    if (draft.scopeMode === 'selected-portfolios') {
      return normalizeScopeAssignments(draft.scopeAssignments).length > 0
    }

    if (draft.scopeMode === 'selected-brands') {
      return normalizeScopeAssignments(draft.scopeAssignments).some(
        (assignment) => assignment.brandNames.length > 0,
      )
    }
  }

  return true
}

function getAccessSummary(draft: AccessDraft, portfolios: Portfolio[]) {
  return getEffectiveAccessSummary(
    {
      roleMode: draft.roleMode,
      editorName: draft.editorName || null,
      scopeMode: draft.scopeMode,
      scopeAssignments: normalizeScopeAssignments(draft.scopeAssignments),
    },
    portfolios,
  )
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

function getAvatarInitial(email: string) {
  return email.trim().charAt(0).toUpperCase() || '?'
}

function getBadgeTone(roleMode: RoleMode) {
  switch (roleMode) {
    case 'owner':
      return 'owner'
    case 'manager':
      return 'manager'
    case 'contributor':
      return 'contributor'
    case 'viewer':
      return 'viewer'
  }
}

function AccessChoiceGroup({
  label,
  value,
  options,
  onChange,
}: {
  label: string
  value: string
  options: Array<{
    value: string
    label: string
    description: string
  }>
  onChange: (value: string) => void
}) {
  return (
    <div className="workspace-access-field">
      <span className="workspace-access-field-label">{label}</span>
      <div className="workspace-access-choice-list">
        {options.map((option) => (
          <label
            key={option.value}
            className={`workspace-access-choice-card ${value === option.value ? 'is-selected' : ''}`}
          >
            <input
              type="radio"
              name={label}
              checked={value === option.value}
              onChange={() => onChange(option.value)}
            />
            <div>
              <strong>{option.label}</strong>
              <span>{option.description}</span>
            </div>
          </label>
        ))}
      </div>
    </div>
  )
}

function VisibilityScopeField({
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

  const normalizedAssignments = normalizeScopeAssignments(draft.scopeAssignments)

  return (
    <div className="workspace-access-field">
      <AccessChoiceGroup
        label="Visibility scope"
        value={draft.scopeMode}
        options={VISIBILITY_SCOPE_OPTIONS.map((option) => ({
          value: option.value,
          label: option.label,
          description: option.description,
        }))}
        onChange={(value) =>
          onChange({
            ...draft,
            scopeMode: value as AccessScopeMode,
            scopeAssignments: [],
          })
        }
      />

      {draft.scopeMode === 'selected-portfolios' ? (
        <div className="workspace-access-subpicker">
          <span className="workspace-access-subpicker-label">Choose portfolios</span>
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
        </div>
      ) : null}

      {draft.scopeMode === 'selected-brands' ? (
        <div className="workspace-access-subpicker">
          <span className="workspace-access-subpicker-label">Choose brands</span>
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
        </div>
      ) : null}

      <p className="field-hint">{getScopeDescription(draft.scopeMode)}</p>
    </div>
  )
}

function TeammateProfileField({
  draft,
  editorOptions,
  onChange,
}: {
  draft: AccessDraft
  editorOptions: string[]
  onChange: (draft: AccessDraft) => void
}) {
  if (draft.roleMode !== 'contributor') {
    return null
  }

  const hasTeammates = editorOptions.length > 0

  return (
    <label className="workspace-access-field">
      <span className="workspace-access-field-label">Teammate profile</span>
      <select
        aria-label={`Teammate profile for ${draft.email || 'new person'}`}
        value={draft.editorName}
        disabled={!hasTeammates}
        onChange={(event) =>
          onChange({
            ...draft,
            editorName: event.target.value,
          })
        }
      >
        <option value="">
          {hasTeammates ? 'Choose teammate profile' : 'Add a teammate in People first'}
        </option>
        {editorOptions.map((editorName) => (
          <option key={editorName} value={editorName}>
            {editorName}
          </option>
        ))}
      </select>
      <p className="field-hint">Links this login to the right person on the board.</p>
    </label>
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
}) {
  if (!draft) {
    return null
  }

  const normalizedDraft = normalizeDraftForRole(draft)
  const hasEmail = normalizeEmail(draft.email).length > 0
  const validationMessage = getValidationMessage(
    normalizedDraft,
    entries,
    isCreate ? undefined : currentEmail ?? undefined,
  )
  const pendingKey = isCreate ? NEW_ENTRY_KEY : normalizeEmail(currentEmail ?? draft.email)
  const isPending = pendingEmail === pendingKey
  const visibleError = saveAttempted ? errorMessage ?? validationMessage : errorMessage

  return (
    <>
      <div
        className={`panel-overlay ${isOpen ? 'is-visible' : ''}`}
        aria-hidden={!isOpen}
        onClick={onClose}
      />
      <aside className={`slide-panel ${isOpen ? 'is-open' : ''}`} aria-hidden={!isOpen}>
        <div className="slide-panel-header workspace-access-drawer-header">
          <div className="slide-panel-header-main">
            <span className="settings-intro-eyebrow">{isCreate ? 'Add person' : 'Edit access'}</span>
            <h2>{isCreate ? 'Add person' : draft.email}</h2>
            <p className="muted-copy">
              {updatedAt ? `Last updated ${formatDateTime(updatedAt)}` : 'Set identity, access level, and scope.'}
            </p>
          </div>
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
            <span className="workspace-access-field-label">Work email</span>
            <input
              type="email"
              value={draft.email}
              onChange={(event) =>
                onDraftChange({
                  ...draft,
                  email: event.target.value,
                })
              }
            />
          </label>

          {hasEmail ? (
            <AccessChoiceGroup
              label="Access level"
              value={draft.roleMode}
              options={ACCESS_LEVEL_OPTIONS.map((option) => ({
                value: option.value,
                label: getAccessLevelLabel(option.value),
                description: option.description,
              }))}
              onChange={(value) =>
                onDraftChange({
                  ...draft,
                  roleMode: value as RoleMode,
                  editorName: '',
                  scopeMode: 'all-portfolios',
                  scopeAssignments: [],
                })
              }
            />
          ) : null}

          {hasEmail ? (
            <VisibilityScopeField
              draft={draft}
              portfolios={portfolios}
              onChange={onDraftChange}
            />
          ) : null}

          {hasEmail ? (
            <TeammateProfileField
              draft={draft}
              editorOptions={editorOptions}
              onChange={onDraftChange}
            />
          ) : null}

          {hasEmail ? (
            <p className="muted-copy workspace-access-effective-copy">
              {getAccessSummary(draft, portfolios)}
            </p>
          ) : null}

          <div className="workspace-access-drawer-actions">
            {!isCreate ? (
              <button
                type="button"
                className="clear-link danger-link"
                disabled={isPending}
                onClick={onStartRevoke}
              >
                Revoke access
              </button>
            ) : <span />}
            <button
              type="button"
              className="ghost-button"
              disabled={isPending || !isReadyForSave(draft)}
              onClick={onSave}
            >
              {isPending ? <ButtonSpinner /> : null}
              <span>{isCreate ? 'Add person' : 'Save changes'}</span>
            </button>
          </div>

          {revokeConfirming ? (
            <div className="workspace-access-confirm">
              <strong>Remove {draft.email}?</strong>
              <p>Their cards and teammate profile stay intact.</p>
              <div className="workspace-access-confirm-actions">
                <button type="button" className="ghost-button" onClick={onCancelRevoke}>
                  Cancel
                </button>
                <button type="button" className="ghost-button danger-outline" onClick={onConfirmRevoke}>
                  Confirm revoke
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
  onSave,
  onDelete,
}: WorkspaceAccessManagerProps) {
  const [drafts, setDrafts] = useState<Record<string, AccessDraft>>({})
  const [newEntry, setNewEntry] = useState<AccessDraft>(() => createEmptyDraft())
  const [activeKey, setActiveKey] = useState<string | null>(null)
  const [menuOpenKey, setMenuOpenKey] = useState<string | null>(null)
  const [saveAttempted, setSaveAttempted] = useState(false)
  const [drawerErrorMessage, setDrawerErrorMessage] = useState<string | null>(null)
  const [revokeConfirming, setRevokeConfirming] = useState(false)
  const [infoExpanded, setInfoExpanded] = useState(getInitialInfoExpanded)

  useEffect(() => {
    if (!hasBrowser()) {
      return
    }

    const hasSeenInfo = window.localStorage.getItem(ACCESS_INFO_SEEN_KEY) === 'true'
    if (!hasSeenInfo) {
      window.localStorage.setItem(ACCESS_INFO_SEEN_KEY, 'true')
      if (!window.localStorage.getItem(ACCESS_INFO_COLLAPSED_KEY)) {
        window.localStorage.setItem(ACCESS_INFO_COLLAPSED_KEY, 'true')
      }
    }
  }, [])

  const isCreate = activeKey === NEW_ENTRY_KEY
  const activeEntry = !isCreate ? entries.find((entry) => entry.email === activeKey) ?? null : null
  const activeDraft = isCreate
    ? newEntry
    : activeEntry
      ? drafts[activeEntry.email] ?? getEntryDraft(activeEntry)
      : null

  function setDrawerExpanded(nextExpanded: boolean) {
    setInfoExpanded(nextExpanded)
    if (!hasBrowser()) {
      return
    }

    window.localStorage.setItem(ACCESS_INFO_COLLAPSED_KEY, nextExpanded ? 'false' : 'true')
  }

  function openDrawer(key: string) {
    setActiveKey(key)
    setMenuOpenKey(null)
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

  async function handleSave() {
    if (!activeDraft) {
      return
    }

    setSaveAttempted(true)
    setDrawerErrorMessage(null)

    const normalizedDraft = normalizeDraftForRole(activeDraft)
    const currentEmail = isCreate ? undefined : activeEntry?.email
    const validationMessage = getValidationMessage(normalizedDraft, entries, currentEmail)
    if (validationMessage) {
      setDrawerErrorMessage(validationMessage)
      return
    }

    try {
      await onSave({
        email: normalizedDraft.email,
        roleMode: normalizedDraft.roleMode,
        editorName:
          normalizedDraft.roleMode === 'contributor'
            ? normalizedDraft.editorName.trim() || null
            : null,
        scopeMode: normalizedDraft.scopeMode,
        scopeAssignments: normalizeScopeAssignments(normalizedDraft.scopeAssignments),
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
        error instanceof Error ? error.message : 'Access could not be revoked.',
      )
    }
  }

  return (
    <div className="settings-stack">
      <div className="settings-block">
        <div className="settings-block-header settings-inline-header">
          <div className="settings-section-header">
            <h3>Access</h3>
            <p className="muted-copy">
              Control who can sign in, what they can see, and how they interact with the board.
            </p>
          </div>
          <button type="button" className="ghost-button" onClick={() => openDrawer(NEW_ENTRY_KEY)}>
            Add person
          </button>
        </div>

        <div className="workspace-access-info-banner">
          <button
            type="button"
            className="clear-link workspace-access-info-toggle"
            onClick={() => setDrawerExpanded(!infoExpanded)}
          >
            {infoExpanded ? 'Hide' : 'Show'} how access works
          </button>
          <strong>How access works</strong>
          {infoExpanded ? (
            <p>
              Access level controls authority. Visibility scope controls portfolio and brand access.
              Teammate profile links a contributor login to the right person on the board. Products
              follow brand visibility automatically.
            </p>
          ) : null}
        </div>

        {status === 'loading' ? <p className="muted-copy">Loading access records...</p> : null}
        {status === 'error' && errorMessage ? <p className="auth-error">{errorMessage}</p> : null}

        <div className="workspace-access-table">
          <div className="workspace-access-table-head">
            <span>Email</span>
            <span>Access level</span>
            <span>Scope</span>
            <span>Teammate profile</span>
            <span>Last updated</span>
            <span />
          </div>

          {entries.length === 0 ? (
            <div className="workspace-access-empty">
              <strong>No access records yet</strong>
              <p>Add the first person to open workspace login.</p>
            </div>
          ) : null}

          {entries.map((entry) => {
            const isPending = pendingEmail === normalizeEmail(entry.email)
            return (
              <div
                key={entry.email}
                className={`workspace-access-table-row ${activeKey === entry.email ? 'is-active' : ''}`}
              >
                <button
                  type="button"
                  className="workspace-access-row-button"
                  onClick={() => openDrawer(entry.email)}
                >
                  <span className="workspace-access-identity">
                    <span className="workspace-access-avatar">{getAvatarInitial(entry.email)}</span>
                    <span className="workspace-access-email">{entry.email}</span>
                  </span>
                  <span className="workspace-access-row-cell">
                    <span className={`access-level-badge is-${getBadgeTone(entry.roleMode)}`}>
                      {getAccessLevelLabel(entry.roleMode)}
                    </span>
                  </span>
                  <span className="workspace-access-row-cell workspace-access-row-muted">
                    {getScopeLabel(entry, portfolios)}
                  </span>
                  <span className="workspace-access-row-cell workspace-access-row-muted">
                    {entry.editorName ?? '—'}
                  </span>
                  <span className="workspace-access-row-cell workspace-access-row-muted">
                    {entry.updatedAt ? formatDateTime(entry.updatedAt) : '—'}
                  </span>
                </button>
                <div className="workspace-access-row-actions">
                  <button
                    type="button"
                    className="workspace-access-menu-trigger"
                    aria-label={`More actions for ${entry.email}`}
                    disabled={isPending}
                    onClick={(event) => {
                      event.stopPropagation()
                      setMenuOpenKey((current) => (current === entry.email ? null : entry.email))
                    }}
                  >
                    •••
                  </button>
                  {menuOpenKey === entry.email ? (
                    <div className="workspace-access-menu">
                      <button
                        type="button"
                        onClick={() => openDrawer(entry.email)}
                      >
                        Edit
                      </button>
                      <button
                        type="button"
                        className="is-danger"
                        onClick={() => {
                          openDrawer(entry.email)
                          setRevokeConfirming(true)
                        }}
                      >
                        Revoke access
                      </button>
                    </div>
                  ) : null}
                </div>
              </div>
            )
          })}
        </div>
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
      />
    </div>
  )
}
