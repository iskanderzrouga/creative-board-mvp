import { useState, type ReactNode } from 'react'
import {
  getAccessLevelLabel,
  getEffectiveAccessSummary,
  getScopeLabel,
  normalizeScopeAssignments,
} from '../accessHelpers'
import {
  WORKING_DAYS,
  type AccessScopeMode,
  type Portfolio,
  type PortfolioAccessScope,
  type RoleMode,
  type TeamMember,
  type WorkingDay,
} from '../board'
import type { WorkspaceAccessEntry } from '../supabase'
import { ButtonSpinner } from './ButtonSpinner'
import { XIcon } from './icons/AppIcons'

type ToastTone = 'green' | 'amber' | 'red' | 'blue'
type WorkspaceDirectoryStatus = 'idle' | 'loading' | 'ready' | 'error'

interface PeopleSectionProps {
  portfolios: Portfolio[]
  accessEntries: WorkspaceAccessEntry[]
  accessStatus: WorkspaceDirectoryStatus
  accessErrorMessage: string | null
  accessPendingEmail: string | null
  authEnabled: boolean
  headerUtilityContent?: ReactNode
  onAccessSave: (entry: {
    email: string
    roleMode: RoleMode
    editorName: string | null
    scopeMode: AccessScopeMode
    scopeAssignments: PortfolioAccessScope[]
    previousEmail?: string
  }) => Promise<void>
  onAccessDelete: (email: string) => Promise<void>
  onPortfolioUpdate: (portfolioId: string, updater: (portfolio: Portfolio) => Portfolio) => void
  showToast: (message: string, tone: ToastTone) => void
}

/* ── Access level options ─────────────────────────── */

const ACCESS_LEVEL_OPTIONS: Array<{ value: RoleMode; description: string }> = [
  { value: 'owner', description: 'Full control over everything.' },
  { value: 'manager', description: 'Manages cards and people within their visibility.' },
  { value: 'contributor', description: 'Works on their own assigned cards.' },
  { value: 'viewer', description: 'Read-only view of their assigned area.' },
]

const BOARD_ROLE_OPTIONS = ['Editor', 'Designer', 'Developer', 'Launch Ops', 'Manager']

/* ── Person row: the unified view model ────────────── */

interface PersonRow {
  key: string
  displayName: string
  email: string | null
  boardRole: string
  accessLevel: RoleMode | null
  portfolioName: string | null
  portfolioId: string | null
  memberIndex: number | null
  teamMember: TeamMember | null
  accessEntry: WorkspaceAccessEntry | null
  isActive: boolean
}

function buildPersonRows(
  portfolios: Portfolio[],
  accessEntries: WorkspaceAccessEntry[],
): PersonRow[] {
  const linkedEditorNames = new Set<string>()
  const rows: PersonRow[] = []

  // 1. Team members first
  for (const portfolio of portfolios) {
    for (let memberIndex = 0; memberIndex < portfolio.team.length; memberIndex++) {
      const member = portfolio.team[memberIndex]
      const accessEntry =
        accessEntries.find(
          (entry) =>
            entry.editorName?.toLowerCase() === member.name.toLowerCase(),
        ) ?? null

      if (accessEntry) {
        linkedEditorNames.add(accessEntry.editorName?.toLowerCase() ?? '')
      }

      rows.push({
        key: `team:${portfolio.id}:${member.id}`,
        displayName: member.name,
        email: accessEntry?.email ?? null,
        boardRole: member.role,
        accessLevel: accessEntry?.roleMode ?? null,
        portfolioName: portfolio.name,
        portfolioId: portfolio.id,
        memberIndex,
        teamMember: member,
        accessEntry,
        isActive: member.active,
      })
    }
  }

  // 2. Access-only entries (no linked team member)
  for (const entry of accessEntries) {
    const isLinked =
      entry.editorName &&
      linkedEditorNames.has(entry.editorName.toLowerCase())

    if (!isLinked) {
      rows.push({
        key: `access:${entry.email}`,
        displayName: entry.editorName ?? entry.email.split('@')[0],
        email: entry.email,
        boardRole: '—',
        accessLevel: entry.roleMode,
        portfolioName: null,
        portfolioId: null,
        memberIndex: null,
        teamMember: null,
        accessEntry: entry,
        isActive: true,
      })
    }
  }

  return rows.sort((a, b) => a.displayName.localeCompare(b.displayName))
}

/* ── Draft: unified person form state ──────────────── */

interface PersonDraft {
  // Access fields
  email: string
  accessLevel: RoleMode
  scopeMode: AccessScopeMode
  scopeAssignments: PortfolioAccessScope[]
  // Team fields
  name: string
  boardRole: string
  portfolioId: string
  weeklyHours: number | null
  hoursPerDay: number | null
  workingDays: WorkingDay[]
  timezone: string
  wipCap: number | null
  active: boolean
  // Is this a team-member-bearing person?
  hasTeamProfile: boolean
}

function createEmptyDraft(portfolios: Portfolio[]): PersonDraft {
  return {
    email: '',
    accessLevel: 'contributor',
    scopeMode: 'all-portfolios',
    scopeAssignments: [],
    name: '',
    boardRole: 'Editor',
    portfolioId: portfolios[0]?.id ?? '',
    weeklyHours: 40,
    hoursPerDay: 8,
    workingDays: ['Mon', 'Tue', 'Wed', 'Thu', 'Fri'],
    timezone: Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC',
    wipCap: 3,
    active: true,
    hasTeamProfile: true,
  }
}

function draftFromPersonRow(row: PersonRow): PersonDraft {
  const member = row.teamMember
  const access = row.accessEntry

  return {
    email: access?.email ?? '',
    accessLevel: access?.roleMode ?? 'contributor',
    scopeMode: access?.scopeMode ?? 'all-portfolios',
    scopeAssignments: normalizeScopeAssignments(access?.scopeAssignments),
    name: member?.name ?? access?.editorName ?? '',
    boardRole: member?.role ?? 'Editor',
    portfolioId: row.portfolioId ?? '',
    weeklyHours: member?.weeklyHours ?? 40,
    hoursPerDay: member?.hoursPerDay ?? 8,
    workingDays: member?.workingDays ?? ['Mon', 'Tue', 'Wed', 'Thu', 'Fri'],
    timezone: member?.timezone ?? 'UTC',
    wipCap: member?.wipCap ?? 3,
    active: member?.active ?? true,
    hasTeamProfile: member !== null,
  }
}

/* ── Scope tree helpers (ported from WorkspaceAccessManager) ── */

function buildAllPortfolioAssignments(portfolios: Portfolio[]) {
  return portfolios.map((p) => ({ portfolioId: p.id, brandNames: [] as string[] }))
}

function getPortfolioAssignment(assignments: PortfolioAccessScope[], portfolioId: string) {
  return normalizeScopeAssignments(assignments).find((a) => a.portfolioId === portfolioId)
}

function isPortfolioFullySelected(assignments: PortfolioAccessScope[], portfolio: Portfolio) {
  const a = getPortfolioAssignment(assignments, portfolio.id)
  return a ? a.brandNames.length === 0 : false
}

function getSelectedBrandNames(assignments: PortfolioAccessScope[], portfolio: Portfolio) {
  const a = getPortfolioAssignment(assignments, portfolio.id)
  if (!a) return []
  return a.brandNames.length === 0
    ? portfolio.brands.map((b) => b.name)
    : a.brandNames
}

function setPortfolioAllBrands(
  current: PortfolioAccessScope[],
  portfolio: Portfolio,
  checked: boolean,
) {
  const normalized = normalizeScopeAssignments(current)
  if (checked) {
    return [
      ...normalized.filter((a) => a.portfolioId !== portfolio.id),
      { portfolioId: portfolio.id, brandNames: [] },
    ]
  }
  return normalized.filter((a) => a.portfolioId !== portfolio.id)
}

function setBrandSelection(
  current: PortfolioAccessScope[],
  portfolio: Portfolio,
  brandName: string,
  checked: boolean,
) {
  const allBrandNames = portfolio.brands.map((b) => b.name)
  const normalized = normalizeScopeAssignments(current)
  const assignment = getPortfolioAssignment(normalized, portfolio.id)
  const nextNames = new Set(
    assignment?.brandNames.length === 0
      ? allBrandNames
      : assignment?.brandNames ?? [],
  )

  if (checked) nextNames.add(brandName)
  else nextNames.delete(brandName)

  const rest = normalized.filter((a) => a.portfolioId !== portfolio.id)
  if (nextNames.size === 0) return rest

  return [
    ...rest,
    {
      portfolioId: portfolio.id,
      brandNames:
        nextNames.size === allBrandNames.length
          ? []
          : Array.from(nextNames).sort((a, b) => a.localeCompare(b)),
    },
  ]
}

function getDerivedNonAllScopeMode(
  assignments: PortfolioAccessScope[],
  portfolios: Portfolio[],
): AccessScopeMode {
  const normalized = normalizeScopeAssignments(assignments)
  const hasPartial = normalized.some((a) => {
    const p = portfolios.find((item) => item.id === a.portfolioId)
    return p && a.brandNames.length > 0 && a.brandNames.length < p.brands.length
  })
  return hasPartial ? 'selected-brands' : 'selected-portfolios'
}

function getNormalizedScopeState(
  draft: PersonDraft,
  portfolios: Portfolio[],
): { scopeMode: AccessScopeMode; scopeAssignments: PortfolioAccessScope[] } {
  if (draft.accessLevel === 'owner' || draft.accessLevel === 'contributor') {
    return { scopeMode: 'all-portfolios', scopeAssignments: [] }
  }

  if (draft.scopeMode === 'all-portfolios') {
    return { scopeMode: 'all-portfolios', scopeAssignments: [] }
  }

  const normalizedAssignments = normalizeScopeAssignments(draft.scopeAssignments)
    .map((a) => {
      const p = portfolios.find((item) => item.id === a.portfolioId)
      if (!p) return null
      const validBrands = a.brandNames.filter((bn) =>
        p.brands.some((b) => b.name === bn),
      )
      return {
        portfolioId: a.portfolioId,
        brandNames:
          validBrands.length === p.brands.length
            ? []
            : validBrands.sort((x, y) => x.localeCompare(y)),
      }
    })
    .filter((a): a is PortfolioAccessScope => Boolean(a))

  if (normalizedAssignments.length === 0) {
    return { scopeMode: 'selected-portfolios', scopeAssignments: [] }
  }

  const hasPartial = normalizedAssignments.some((a) => a.brandNames.length > 0)
  return {
    scopeMode: hasPartial ? 'selected-brands' : 'selected-portfolios',
    scopeAssignments: normalizedAssignments,
  }
}

/* ── Scope tree field ─────────────────────────────── */

function ScopeTreeField({
  draft,
  portfolios,
  onChange,
}: {
  draft: PersonDraft
  portfolios: Portfolio[]
  onChange: (d: PersonDraft) => void
}) {
  if (draft.accessLevel !== 'manager' && draft.accessLevel !== 'viewer') return null

  const allChecked = draft.scopeMode === 'all-portfolios'
  const assignments = allChecked
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
            checked={allChecked}
            onChange={(e) =>
              onChange({
                ...draft,
                scopeMode: e.target.checked
                  ? 'all-portfolios'
                  : getDerivedNonAllScopeMode(draft.scopeAssignments, portfolios),
              })
            }
          />
          <span>All portfolios</span>
        </label>

        <div className="workspace-scope-tree-groups">
          {portfolios.map((portfolio) => {
            const fullSel = allChecked || isPortfolioFullySelected(assignments, portfolio)
            const selBrands = getSelectedBrandNames(assignments, portfolio)

            return (
              <div key={portfolio.id} className="workspace-scope-tree-portfolio">
                <label className="workspace-scope-tree-option workspace-scope-tree-heading-option">
                  <input
                    type="checkbox"
                    checked={fullSel}
                    disabled={allChecked}
                    onChange={(e) => {
                      const next = setPortfolioAllBrands(draft.scopeAssignments, portfolio, e.target.checked)
                      onChange({
                        ...draft,
                        scopeMode: getDerivedNonAllScopeMode(next, portfolios),
                        scopeAssignments: next,
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
                        checked={selBrands.includes(brand.name)}
                        disabled={allChecked || fullSel}
                        onChange={(e) => {
                          const next = setBrandSelection(
                            draft.scopeAssignments,
                            portfolio,
                            brand.name,
                            e.target.checked,
                          )
                          onChange({
                            ...draft,
                            scopeMode: getDerivedNonAllScopeMode(next, portfolios),
                            scopeAssignments: next,
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

/* ── Validation ───────────────────────────────────── */

function isValidEmail(v: string) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v.trim().toLowerCase())
}

function getValidationMessage(
  draft: PersonDraft,
  accessEntries: WorkspaceAccessEntry[],
  portfolios: Portfolio[],
  currentEmail?: string,
): string | null {
  if (!draft.email.trim()) return 'Enter an email.'
  if (!isValidEmail(draft.email)) return 'Enter a valid email.'

  const normalizedEmail = draft.email.trim().toLowerCase()
  const normalizedCurrentEmail = currentEmail?.trim().toLowerCase() ?? null
  if (
    accessEntries.some(
      (e) => e.email === normalizedEmail && e.email !== normalizedCurrentEmail,
    )
  ) {
    return 'That email already has access.'
  }

  if (!draft.name.trim() && draft.hasTeamProfile) return 'Enter a name.'

  if (
    draft.accessLevel === 'manager' ||
    draft.accessLevel === 'viewer'
  ) {
    const scope = getNormalizedScopeState(draft, portfolios)
    if (scope.scopeMode !== 'all-portfolios' && scope.scopeAssignments.length === 0) {
      return 'Choose at least one portfolio or brand.'
    }
  }

  return null
}

/* ── Working days summary ────────────────────────── */

function formatWorkingDaysSummary(workingDays: WorkingDay[]) {
  if (workingDays.length === 0) return 'No days set'
  if (workingDays.length === WORKING_DAYS.length) return 'Mon\u2013Sun'
  const weekdays = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri']
  if (
    workingDays.length === weekdays.length &&
    weekdays.every((d) => workingDays.includes(d as WorkingDay))
  ) {
    return 'Mon\u2013Fri'
  }
  return workingDays.join(', ')
}

/* ── Person drawer ────────────────────────────────── */

function PersonDrawer({
  isOpen,
  isCreate,
  draft,
  portfolios,
  accessEntries,
  isPending,
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
  draft: PersonDraft | null
  portfolios: Portfolio[]
  accessEntries: WorkspaceAccessEntry[]
  isPending: boolean
  currentEmail: string | null
  saveAttempted: boolean
  errorMessage: string | null
  revokeConfirming: boolean
  onDraftChange: (d: PersonDraft) => void
  onClose: () => void
  onSave: () => void
  onStartRevoke: () => void
  onCancelRevoke: () => void
  onConfirmRevoke: () => void
}) {
  const [showSchedule, setShowSchedule] = useState(false)

  if (!draft) return null

  const validationMsg = getValidationMessage(
    draft,
    accessEntries,
    portfolios,
    isCreate ? undefined : currentEmail ?? undefined,
  )
  const visibleError = errorMessage ?? (saveAttempted ? validationMsg : null)
  const selectedLevelDesc =
    ACCESS_LEVEL_OPTIONS.find((o) => o.value === draft.accessLevel)?.description ?? ''
  const normalizedScope = getNormalizedScopeState(draft, portfolios)
  const summaryText = getEffectiveAccessSummary(
    {
      roleMode: draft.accessLevel,
      editorName: draft.hasTeamProfile ? draft.name || null : null,
      scopeMode: normalizedScope.scopeMode,
      scopeAssignments: normalizedScope.scopeAssignments,
    },
    portfolios,
  )

  const showTeamFields = draft.hasTeamProfile

  return (
    <>
      <div
        className={`panel-overlay ${isOpen ? 'is-visible' : ''}`}
        aria-hidden={!isOpen}
        onClick={onClose}
      />
      <aside className={`slide-panel ${isOpen ? 'is-open' : ''}`} aria-hidden={!isOpen}>
        <div className="slide-panel-header workspace-access-drawer-header">
          <h2>{isCreate ? 'Add person' : 'Edit person'}</h2>
          <button
            type="button"
            className="close-icon-button"
            aria-label="Close drawer"
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

          {/* ── Email ── */}
          <label className="workspace-access-field">
            <span className="workspace-access-field-label">Email</span>
            <input
              type="email"
              autoFocus={isCreate}
              value={draft.email}
              placeholder="team@company.com"
              onChange={(e) => onDraftChange({ ...draft, email: e.target.value })}
            />
          </label>

          {/* ── Name ── */}
          <label className="workspace-access-field">
            <span className="workspace-access-field-label">Name</span>
            <input
              value={draft.name}
              placeholder="Full name"
              onChange={(e) => onDraftChange({ ...draft, name: e.target.value })}
            />
          </label>

          {/* ── Access level ── */}
          <label className="workspace-access-field">
            <span className="workspace-access-field-label">Access level</span>
            <select
              value={draft.accessLevel}
              onChange={(e) => {
                const nextLevel = e.target.value as RoleMode
                const needsTeam = nextLevel === 'contributor' || nextLevel === 'manager'
                onDraftChange({
                  ...draft,
                  accessLevel: nextLevel,
                  hasTeamProfile: nextLevel === 'owner' || nextLevel === 'viewer'
                    ? draft.hasTeamProfile
                    : true,
                  scopeMode:
                    nextLevel === 'owner' || nextLevel === 'contributor'
                      ? 'all-portfolios'
                      : draft.scopeMode,
                  scopeAssignments:
                    nextLevel === 'owner' || nextLevel === 'contributor'
                      ? []
                      : draft.scopeAssignments,
                })
              }}
            >
              {ACCESS_LEVEL_OPTIONS.map((o) => (
                <option key={o.value} value={o.value}>
                  {getAccessLevelLabel(o.value)}
                </option>
              ))}
            </select>
            <p className="field-hint">{selectedLevelDesc}</p>
          </label>

          {/* ── Has team profile toggle (for owners/viewers) ── */}
          {(draft.accessLevel === 'owner' || draft.accessLevel === 'viewer') ? (
            <label className="toggle-row workspace-access-field">
              <span className="workspace-access-field-label">Board team member</span>
              <input
                type="checkbox"
                checked={draft.hasTeamProfile}
                onChange={(e) =>
                  onDraftChange({ ...draft, hasTeamProfile: e.target.checked })
                }
              />
              <p className="field-hint">
                {draft.hasTeamProfile
                  ? 'This person has a board identity with role and schedule.'
                  : 'This person only has sign-in access.'}
              </p>
            </label>
          ) : null}

          {/* ── Team fields ── */}
          {showTeamFields ? (
            <>
              {/* Portfolio */}
              {portfolios.length > 1 ? (
                <label className="workspace-access-field">
                  <span className="workspace-access-field-label">Portfolio</span>
                  <select
                    value={draft.portfolioId}
                    onChange={(e) =>
                      onDraftChange({ ...draft, portfolioId: e.target.value })
                    }
                  >
                    {portfolios.map((p) => (
                      <option key={p.id} value={p.id}>
                        {p.name}
                      </option>
                    ))}
                  </select>
                </label>
              ) : null}

              {/* Board role */}
              <label className="workspace-access-field">
                <span className="workspace-access-field-label">Board role</span>
                <select
                  value={draft.boardRole}
                  onChange={(e) =>
                    onDraftChange({ ...draft, boardRole: e.target.value })
                  }
                >
                  {BOARD_ROLE_OPTIONS.map((r) => (
                    <option key={r} value={r}>
                      {r}
                    </option>
                  ))}
                </select>
              </label>

              {/* Hrs/week */}
              <label className="workspace-access-field">
                <span className="workspace-access-field-label">Hours per week</span>
                <input
                  type="number"
                  min={0}
                  value={draft.weeklyHours ?? ''}
                  onChange={(e) => {
                    const nextHours = e.target.value ? Number(e.target.value) : null
                    const nextHpd =
                      nextHours !== null && draft.workingDays.length > 0
                        ? Math.round((nextHours / draft.workingDays.length) * 10) / 10
                        : draft.hoursPerDay
                    onDraftChange({
                      ...draft,
                      weeklyHours: nextHours,
                      hoursPerDay: nextHpd,
                    })
                  }}
                />
              </label>

              {/* Max cards */}
              <label className="workspace-access-field">
                <span className="workspace-access-field-label">Max cards (WIP cap)</span>
                <input
                  type="number"
                  min={0}
                  value={draft.wipCap ?? ''}
                  onChange={(e) =>
                    onDraftChange({
                      ...draft,
                      wipCap: e.target.value ? Number(e.target.value) : null,
                    })
                  }
                />
              </label>

              {/* Schedule toggle */}
              <div className="workspace-access-field">
                <button
                  type="button"
                  className="clear-link"
                  onClick={() => setShowSchedule((v) => !v)}
                >
                  {showSchedule ? 'Hide daily schedule' : `Customize schedule (${formatWorkingDaysSummary(draft.workingDays)})`}
                </button>

                {showSchedule ? (
                  <div className="people-schedule-panel">
                    <div className="working-days-grid">
                      {WORKING_DAYS.map((day) => (
                        <label key={day} className="working-day-toggle">
                          <input
                            type="checkbox"
                            checked={draft.workingDays.includes(day)}
                            onChange={(e) => {
                              const nextDays = e.target.checked
                                ? WORKING_DAYS.filter(
                                    (d) => d === day || draft.workingDays.includes(d),
                                  )
                                : draft.workingDays.filter((d) => d !== day)
                              const nextHpd =
                                draft.weeklyHours !== null && nextDays.length > 0
                                  ? Math.round((draft.weeklyHours / nextDays.length) * 10) / 10
                                  : draft.hoursPerDay
                              onDraftChange({
                                ...draft,
                                workingDays: nextDays,
                                hoursPerDay: nextHpd,
                              })
                            }}
                          />
                          <span>{day}</span>
                        </label>
                      ))}
                    </div>

                    <label className="workspace-access-field" style={{ marginTop: 8 }}>
                      <span className="workspace-access-field-label">Hours per day (override)</span>
                      <input
                        type="number"
                        min={0}
                        step={0.5}
                        value={draft.hoursPerDay ?? ''}
                        onChange={(e) =>
                          onDraftChange({
                            ...draft,
                            hoursPerDay: e.target.value ? Number(e.target.value) : null,
                          })
                        }
                      />
                    </label>
                  </div>
                ) : null}
              </div>

              {/* Active toggle */}
              <label className="toggle-row workspace-access-field">
                <span>Active</span>
                <input
                  type="checkbox"
                  checked={draft.active}
                  onChange={(e) => onDraftChange({ ...draft, active: e.target.checked })}
                />
              </label>
            </>
          ) : null}

          {/* ── Scope tree (for managers/viewers) ── */}
          <ScopeTreeField
            draft={draft}
            portfolios={portfolios}
            onChange={onDraftChange}
          />

          {/* ── Summary ── */}
          <p className="muted-copy workspace-access-effective-copy">{summaryText}</p>

          {/* ── Actions ── */}
          <div className="workspace-access-drawer-actions">
            {!isCreate && draft.email ? (
              <button
                type="button"
                className="clear-link danger-link"
                disabled={isPending}
                onClick={onStartRevoke}
              >
                Remove person
              </button>
            ) : (
              <span />
            )}
            <button
              type="button"
              className="ghost-button"
              disabled={
                isPending ||
                getValidationMessage(
                  draft,
                  accessEntries,
                  portfolios,
                  isCreate ? undefined : currentEmail ?? undefined,
                ) !== null
              }
              onClick={onSave}
            >
              {isPending ? <ButtonSpinner /> : null}
              <span>{isCreate ? 'Add person' : 'Save changes'}</span>
            </button>
          </div>

          {/* ── Revoke confirm ── */}
          {revokeConfirming ? (
            <div className="workspace-access-confirm">
              <strong>Remove {draft.name || draft.email}?</strong>
              <p>This removes their access and team profile.</p>
              <div className="workspace-access-confirm-actions">
                <button type="button" className="ghost-button" onClick={onCancelRevoke}>
                  Cancel
                </button>
                <button
                  type="button"
                  className="ghost-button danger-outline"
                  onClick={onConfirmRevoke}
                >
                  Remove
                </button>
              </div>
            </div>
          ) : null}
        </div>
      </aside>
    </>
  )
}

/* ── PeopleSection ────────────────────────────────── */

export function PeopleSection({
  portfolios,
  accessEntries,
  accessStatus,
  accessErrorMessage,
  accessPendingEmail,
  authEnabled,
  headerUtilityContent,
  onAccessSave,
  onAccessDelete,
  onPortfolioUpdate,
  showToast,
}: PeopleSectionProps) {
  const [activeKey, setActiveKey] = useState<string | null>(null)
  const [newDraft, setNewDraft] = useState<PersonDraft>(() =>
    createEmptyDraft(portfolios),
  )
  const [drafts, setDrafts] = useState<Record<string, PersonDraft>>({})
  const [saveAttempted, setSaveAttempted] = useState(false)
  const [drawerError, setDrawerError] = useState<string | null>(null)
  const [revokeConfirming, setRevokeConfirming] = useState(false)

  const isCreate = activeKey === '__new__'
  const personRows = buildPersonRows(portfolios, accessEntries)
  const activeRow = !isCreate
    ? personRows.find((r) => r.key === activeKey) ?? null
    : null

  const activeDraft = isCreate
    ? newDraft
    : activeRow
      ? drafts[activeRow.key] ?? draftFromPersonRow(activeRow)
      : null

  function openDrawer(key: string) {
    setActiveKey(key)
    setSaveAttempted(false)
    setDrawerError(null)
    setRevokeConfirming(false)
  }

  function closeDrawer() {
    setActiveKey(null)
    setSaveAttempted(false)
    setDrawerError(null)
    setRevokeConfirming(false)
  }

  function updateDraft(d: PersonDraft) {
    setSaveAttempted(false)
    setDrawerError(null)
    if (isCreate) {
      setNewDraft(d)
    } else if (activeRow) {
      setDrafts((c) => ({ ...c, [activeRow.key]: d }))
    }
  }

  async function handleSave() {
    if (!activeDraft) return
    setSaveAttempted(true)
    setDrawerError(null)

    const msg = getValidationMessage(
      activeDraft,
      accessEntries,
      portfolios,
      isCreate ? undefined : activeRow?.email ?? undefined,
    )
    if (msg) {
      setDrawerError(msg)
      return
    }

    const normalizedScope = getNormalizedScopeState(activeDraft, portfolios)
    const normalizedEmail = activeDraft.email.trim().toLowerCase()

    try {
      // 1. Save access entry
      if (authEnabled) {
        await onAccessSave({
          email: normalizedEmail,
          roleMode: activeDraft.accessLevel,
          editorName: activeDraft.hasTeamProfile
            ? activeDraft.name.trim() || null
            : null,
          scopeMode: normalizedScope.scopeMode,
          scopeAssignments: normalizedScope.scopeAssignments,
          previousEmail: activeRow?.email ?? undefined,
        })
      }

      // 2. Save team member
      if (activeDraft.hasTeamProfile) {
        const targetPortfolioId =
          activeDraft.portfolioId || portfolios[0]?.id
        if (!targetPortfolioId) {
          throw new Error('No portfolio available.')
        }

        if (activeRow?.teamMember && activeRow.portfolioId && activeRow.memberIndex !== null) {
          // Update existing team member
          onPortfolioUpdate(activeRow.portfolioId, (portfolio) => {
            // If portfolio changed, move the member
            if (activeRow.portfolioId !== targetPortfolioId) {
              return {
                ...portfolio,
                team: portfolio.team.filter(
                  (_, i) => i !== activeRow.memberIndex,
                ),
              }
            }
            return {
              ...portfolio,
              team: portfolio.team.map((m, i) =>
                i === activeRow.memberIndex
                  ? {
                      ...m,
                      name: activeDraft.name.trim() || m.name,
                      role: activeDraft.boardRole,
                      weeklyHours: activeDraft.weeklyHours,
                      hoursPerDay: activeDraft.hoursPerDay,
                      workingDays: activeDraft.workingDays,
                      wipCap: activeDraft.wipCap,
                      active: activeDraft.active,
                    }
                  : m,
              ),
            }
          })

          // If portfolio changed, add to new portfolio
          if (activeRow.portfolioId !== targetPortfolioId) {
            onPortfolioUpdate(targetPortfolioId, (portfolio) => ({
              ...portfolio,
              team: [
                ...portfolio.team,
                {
                  id: activeRow.teamMember!.id,
                  name: activeDraft.name.trim(),
                  role: activeDraft.boardRole,
                  weeklyHours: activeDraft.weeklyHours,
                  hoursPerDay: activeDraft.hoursPerDay,
                  workingDays: activeDraft.workingDays,
                  timezone: activeDraft.timezone,
                  wipCap: activeDraft.wipCap,
                  active: activeDraft.active,
                },
              ],
            }))
          }
        } else {
          // Create new team member
          const newMember: TeamMember = {
            id: `member-${Date.now()}`,
            name: activeDraft.name.trim(),
            role: activeDraft.boardRole,
            weeklyHours: activeDraft.weeklyHours,
            hoursPerDay: activeDraft.hoursPerDay,
            workingDays: activeDraft.workingDays,
            timezone: activeDraft.timezone,
            wipCap: activeDraft.wipCap,
            active: activeDraft.active,
          }
          onPortfolioUpdate(targetPortfolioId, (portfolio) => ({
            ...portfolio,
            team: [...portfolio.team, newMember],
          }))
        }
      }

      // 3. Cleanup
      if (isCreate) {
        setNewDraft(createEmptyDraft(portfolios))
      } else if (activeRow) {
        setDrafts((c) => {
          const next = { ...c }
          delete next[activeRow.key]
          return next
        })
      }

      closeDrawer()
      showToast(
        isCreate
          ? `Added ${activeDraft.name || activeDraft.email}`
          : `Updated ${activeDraft.name || activeDraft.email}`,
        'green',
      )
    } catch (err) {
      setDrawerError(
        err instanceof Error ? err.message : 'Could not save person.',
      )
    }
  }

  async function handleConfirmRevoke() {
    if (!activeRow) return
    setDrawerError(null)

    try {
      // Remove access entry
      if (activeRow.accessEntry) {
        await onAccessDelete(activeRow.accessEntry.email)
      }

      // Remove team member
      if (
        activeRow.teamMember &&
        activeRow.portfolioId &&
        activeRow.memberIndex !== null
      ) {
        onPortfolioUpdate(activeRow.portfolioId, (portfolio) => ({
          ...portfolio,
          team: portfolio.team.filter((_, i) => i !== activeRow.memberIndex),
        }))
      }

      closeDrawer()
      showToast(
        `Removed ${activeRow.displayName}`,
        'amber',
      )
    } catch (err) {
      setDrawerError(
        err instanceof Error ? err.message : 'Could not remove person.',
      )
    }
  }

  const pendingKey = isCreate
    ? '__new__'
    : activeRow?.email ?? null
  const isPending = accessPendingEmail === pendingKey

  return (
    <div className="settings-block">
      <div className="settings-block-header settings-page-toolbar">
        <div className="settings-section-header">
          <h2>People</h2>
          <p className="muted-copy">
            Everyone who works on or can sign in to this workspace.
          </p>
        </div>
        <div className="settings-page-toolbar-actions">
          {headerUtilityContent}
          <button
            type="button"
            className="ghost-button"
            onClick={() => openDrawer('__new__')}
          >
            Add person
          </button>
        </div>
      </div>

      {accessStatus === 'loading' ? (
        <p className="muted-copy">Loading…</p>
      ) : null}
      {accessStatus === 'error' && accessErrorMessage ? (
        <p className="auth-error">{accessErrorMessage}</p>
      ) : null}

      <div className="people-table">
        <div className="people-table-head">
          <span>Name</span>
          <span>Email</span>
          <span>Board role</span>
          <span>Access level</span>
          <span>Visibility</span>
          <span />
        </div>

        {personRows.length === 0 ? (
          <div className="workspace-access-empty">
            <strong>No people yet.</strong>
            <p>Add someone to get started.</p>
          </div>
        ) : null}

        {personRows.map((row) => (
          <div
            key={row.key}
            className={`people-table-row ${activeKey === row.key ? 'is-active' : ''} ${!row.isActive ? 'is-inactive' : ''}`}
          >
            <span className="people-table-primary">{row.displayName}</span>
            <span className="people-table-email">{row.email ?? '—'}</span>
            <span>{row.boardRole}</span>
            <span>
              {row.accessLevel ? getAccessLevelLabel(row.accessLevel) : '—'}
            </span>
            <span className="people-table-muted">
              {row.accessEntry
                ? getScopeLabel(row.accessEntry, portfolios)
                : '—'}
            </span>
            <span className="people-row-actions-cell">
              <button
                type="button"
                className="ghost-button workspace-access-edit-button"
                onClick={() => openDrawer(row.key)}
              >
                Edit
              </button>
            </span>
          </div>
        ))}
      </div>

      <PersonDrawer
        isOpen={Boolean(activeKey)}
        isCreate={isCreate}
        draft={activeDraft}
        portfolios={portfolios}
        accessEntries={accessEntries}
        isPending={isPending}
        currentEmail={activeRow?.email ?? null}
        saveAttempted={saveAttempted}
        errorMessage={drawerError}
        revokeConfirming={revokeConfirming}
        onDraftChange={updateDraft}
        onClose={closeDrawer}
        onSave={() => { void handleSave() }}
        onStartRevoke={() => setRevokeConfirming(true)}
        onCancelRevoke={() => setRevokeConfirming(false)}
        onConfirmRevoke={() => { void handleConfirmRevoke() }}
      />
    </div>
  )
}
