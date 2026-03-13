import { Fragment, useState, type ReactNode } from 'react'
import { ConfirmDialog } from './ConfirmDialog'
import { RevisionReasonLibraryEditor } from './RevisionReasonLibraryEditor'
import { TaskLibraryEditor } from './TaskLibraryEditor'
import { WorkspaceAccessManager } from './WorkspaceAccessManager'
import type { WorkspaceAccessEntry } from '../supabase'
import {
  SETTINGS_TAB_LABELS,
  WORKING_DAYS,
  createEmptyPortfolio,
  getBrandRemovalBlocker,
  getTeamMemberRemovalBlocker,
  removeBrandFromPortfolio,
  removePortfolioFromAppState,
  removeTeamMemberFromPortfolio,
  renameBrandInPortfolio,
  renameTeamMemberInPortfolio,
  syncPortfolioCardProducts,
  type AccessScopeMode,
  type ActiveRole,
  type AppState,
  type Portfolio,
  type PortfolioAccessScope,
  type RoleMode,
  type SettingTab,
  type TeamMember,
  type WorkingDay,
} from '../board'

type ToastTone = 'green' | 'amber' | 'red' | 'blue'
type WorkspaceDirectoryStatus = 'idle' | 'loading' | 'ready' | 'error'
type PendingSettingsDelete =
  | { kind: 'portfolio'; portfolioId: string }
  | { kind: 'brand'; portfolioId: string; brandIndex: number }
  | { kind: 'member'; portfolioId: string; memberIndex: number }

interface SettingsPageProps {
  state: AppState
  authEnabled: boolean
  settingsTab: SettingTab
  settingsPortfolioId: string
  headerUtilityContent?: ReactNode
  workspaceAccessEntries: WorkspaceAccessEntry[]
  workspaceAccessStatus: WorkspaceDirectoryStatus
  workspaceAccessErrorMessage: string | null
  workspaceAccessPendingEmail: string | null
  onTabChange: (tab: SettingTab) => void
  onSettingsPortfolioChange: (portfolioId: string) => void
  onBackToBoard: () => void
  onStateChange: (updater: (state: AppState) => AppState) => void
  localRole: ActiveRole
  localEditorOptions: TeamMember[]
  onLocalRoleChange: (role: ActiveRole) => void
  onExportData: () => void
  onImportClick: () => void
  onResetData: () => void
  onFreshStartData: () => void
  onWorkspaceAccessSave: (entry: {
    email: string
    roleMode: RoleMode
    editorName: string | null
    scopeMode: AccessScopeMode
    scopeAssignments: PortfolioAccessScope[]
    previousEmail?: string
  }) => Promise<void>
  onWorkspaceAccessDelete: (email: string) => Promise<void>
  showToast: (message: string, tone: ToastTone) => void
}

function SettingsToolbar({
  title,
  description,
  actions,
}: {
  title: string
  description?: string
  actions?: ReactNode
}) {
  return (
    <div className="settings-block-header settings-page-toolbar">
      <div className="settings-section-header">
        <h2>{title}</h2>
        {description ? <p className="muted-copy">{description}</p> : null}
      </div>
      {actions ? <div className="settings-page-toolbar-actions">{actions}</div> : null}
    </div>
  )
}

function formatWorkingDaysSummary(workingDays: WorkingDay[]) {
  if (workingDays.length === 0) {
    return 'No days set'
  }

  if (workingDays.length === WORKING_DAYS.length) {
    return 'Mon–Sun'
  }

  const weekdays = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri']
  if (
    workingDays.length === weekdays.length &&
    weekdays.every((day) => workingDays.includes(day as WorkingDay))
  ) {
    return 'Mon–Fri'
  }

  return workingDays.join(', ')
}

function createTeamMemberDraft(portfolio: Portfolio): TeamMember {
  const matchingMember = portfolio.team.find((member) => member.weeklyHours)

  return {
    id: `member-${Date.now()}`,
    name: 'Untitled member',
    role: 'Editor',
    weeklyHours: matchingMember?.weeklyHours ?? 40,
    hoursPerDay: 8,
    workingDays: ['Mon', 'Tue', 'Wed', 'Thu', 'Fri'],
    timezone: Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC',
    wipCap: 3,
    active: true,
  }
}

export function SettingsPage({
  state,
  authEnabled,
  settingsTab,
  settingsPortfolioId,
  headerUtilityContent,
  workspaceAccessEntries,
  workspaceAccessStatus,
  workspaceAccessErrorMessage,
  workspaceAccessPendingEmail,
  onTabChange,
  onSettingsPortfolioChange,
  onBackToBoard,
  onStateChange,
  localRole,
  localEditorOptions,
  onLocalRoleChange,
  onExportData,
  onImportClick,
  onResetData,
  onFreshStartData,
  onWorkspaceAccessSave,
  onWorkspaceAccessDelete,
  showToast,
}: SettingsPageProps) {
  const settingsPortfolio =
    state.portfolios.find((portfolio) => portfolio.id === settingsPortfolioId) ??
    state.portfolios[0]
  const intlWithSupportedValues = Intl as typeof Intl & {
    supportedValuesOf?: (key: 'timeZone') => string[]
  }
  const [collapsedPortfolioIds, setCollapsedPortfolioIds] = useState<string[]>([])
  const [expandedTeamRowKey, setExpandedTeamRowKey] = useState<string | null>(null)
  const [pendingSettingsDelete, setPendingSettingsDelete] = useState<PendingSettingsDelete | null>(
    null,
  )
  const teamRoleOptions = ['Editor', 'Designer', 'Developer', 'Launch Ops', 'Manager']
  const timezoneOptions =
    typeof intlWithSupportedValues.supportedValuesOf === 'function'
      ? intlWithSupportedValues.supportedValuesOf('timeZone')
      : ['UTC', 'Asia/Bangkok', 'America/New_York', 'Europe/London']
  const workspaceEditorOptions = Array.from(
    new Set(
      state.portfolios.flatMap((portfolio) =>
        portfolio.team
          .filter((member) => member.active && !member.role.toLowerCase().includes('manager'))
          .map((member) => member.name),
      ),
    ),
  ).sort((left, right) => left.localeCompare(right))
  const peopleRows = state.portfolios
    .flatMap((portfolio) =>
      portfolio.team.map((member, memberIndex) => ({
        portfolio,
        member,
        memberIndex,
      })),
    )
    .sort((left, right) => {
      const portfolioComparison = left.portfolio.name.localeCompare(right.portfolio.name)
      return portfolioComparison !== 0
        ? portfolioComparison
        : left.member.name.localeCompare(right.member.name)
    })

  function updatePortfolio(portfolioId: string, updater: (portfolio: Portfolio) => Portfolio) {
    onStateChange((current) => ({
      ...current,
      portfolios: current.portfolios.map((portfolio) =>
        portfolio.id === portfolioId ? updater(portfolio) : portfolio,
      ),
    }))
  }

  function updateTeamMember(
    portfolioId: string,
    memberIndex: number,
    updater: (member: TeamMember) => TeamMember,
  ) {
    updatePortfolio(portfolioId, (currentPortfolio) => ({
      ...currentPortfolio,
      team: currentPortfolio.team.map((member, index) =>
        index === memberIndex ? updater(member) : member,
      ),
    }))
  }

  function getAllBrandPrefixes(excluding?: { portfolioId: string; brandIndex: number }) {
    const prefixes: string[] = []
    state.portfolios.forEach((portfolio) => {
      portfolio.brands.forEach((brand, brandIndex) => {
        if (
          excluding &&
          excluding.portfolioId === portfolio.id &&
          excluding.brandIndex === brandIndex
        ) {
          return
        }
        prefixes.push(brand.prefix)
      })
    })
    return prefixes
  }

  function getSuggestedPrefix() {
    const taken = new Set(getAllBrandPrefixes())
    const alphabet = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ'

    for (const first of alphabet) {
      for (const second of alphabet) {
        const prefix = `${first}${second}`
        if (!taken.has(prefix)) {
          return prefix
        }
      }
    }

    return `B${state.portfolios.length}`
  }

  function updateGeneralThreshold(key: 'amberStart' | 'redStart', rawValue: string) {
    const nextValue = Number(rawValue) || 1
    const currentThresholds = state.settings.general.timeInStageThresholds
    const nextThresholds = {
      ...currentThresholds,
      [key]: nextValue,
    }

    if (nextThresholds.amberStart >= nextThresholds.redStart) {
      showToast('Amber must stay below red.', 'amber')
      return
    }

    onStateChange((current) => ({
      ...current,
      settings: {
        ...current.settings,
        general: {
          ...current.settings.general,
          timeInStageThresholds: nextThresholds,
        },
      },
    }))
  }

  function updateCapacityThreshold(key: 'greenMax' | 'yellowMax' | 'redMin', rawValue: string) {
    const nextValue = Number(rawValue) || 1
    const currentThresholds = state.settings.capacity.utilizationThresholds
    const isValidUpdate =
      key === 'greenMax'
        ? nextValue < currentThresholds.yellowMax
        : key === 'yellowMax'
          ? currentThresholds.greenMax < nextValue && nextValue < currentThresholds.redMin
          : currentThresholds.yellowMax < nextValue

    if (!isValidUpdate) {
      showToast(
        'Thresholds must be in ascending order: healthy < stretched < overloaded.',
        'amber',
      )
      return
    }

    onStateChange((current) => ({
      ...current,
      settings: {
        ...current.settings,
        capacity: {
          ...current.settings.capacity,
          utilizationThresholds: {
            ...current.settings.capacity.utilizationThresholds,
            [key]: nextValue,
          },
        },
      },
    }))
  }

  function confirmSettingsDelete() {
    if (!pendingSettingsDelete) {
      return
    }

    if (pendingSettingsDelete.kind === 'portfolio') {
      onStateChange((current) =>
        removePortfolioFromAppState(current, pendingSettingsDelete.portfolioId),
      )
      setPendingSettingsDelete(null)
      return
    }

    if (pendingSettingsDelete.kind === 'brand') {
      updatePortfolio(pendingSettingsDelete.portfolioId, (currentPortfolio) =>
        removeBrandFromPortfolio(currentPortfolio, pendingSettingsDelete.brandIndex),
      )
      setPendingSettingsDelete(null)
      return
    }

    updatePortfolio(pendingSettingsDelete.portfolioId, (currentPortfolio) =>
      removeTeamMemberFromPortfolio(currentPortfolio, pendingSettingsDelete.memberIndex),
    )
    setPendingSettingsDelete(null)
  }

  function getSettingsDeleteDialog() {
    if (!pendingSettingsDelete) {
      return null
    }

    if (pendingSettingsDelete.kind === 'portfolio') {
      const portfolio = state.portfolios.find(
        (item) => item.id === pendingSettingsDelete.portfolioId,
      )
      if (!portfolio) {
        return null
      }

      return {
        title: `Delete ${portfolio.name}?`,
        message: (
          <p>
            All cards, brands, and team assignments in this portfolio will be permanently removed.
          </p>
        ),
        confirmLabel: 'Delete portfolio',
      }
    }

    if (pendingSettingsDelete.kind === 'brand') {
      const portfolio = state.portfolios.find(
        (item) => item.id === pendingSettingsDelete.portfolioId,
      )
      const brand = portfolio?.brands[pendingSettingsDelete.brandIndex]
      if (!portfolio || !brand) {
        return null
      }

      return {
        title: `Delete ${brand.name}?`,
        message: <p>This removes the brand from {portfolio.name}.</p>,
        confirmLabel: 'Delete brand',
      }
    }

    const portfolio = state.portfolios.find(
      (item) => item.id === pendingSettingsDelete.portfolioId,
    )
    const member = portfolio?.team[pendingSettingsDelete.memberIndex]
    if (!portfolio || !member) {
      return null
    }

    return {
      title: `Remove ${member.name}?`,
      message: <p>This removes the team member from {portfolio.name}.</p>,
      confirmLabel: 'Remove member',
    }
  }

  const settingsDeleteDialog = getSettingsDeleteDialog()

  return (
    <div className="settings-page">
      <div className="settings-page-sidebar">
        <button type="button" className="ghost-button settings-back" onClick={onBackToBoard}>
          ← Back to board
        </button>
        <div className="settings-sidebar-meta">
          <strong className="settings-sidebar-name">{state.settings.general.appName}</strong>
        </div>
        <div className="settings-tab-list">
          {(['general', 'portfolios', 'team', 'access', 'workflow'] as SettingTab[]).map((tab) => (
            <button
              key={tab}
              type="button"
              className={`settings-tab ${settingsTab === tab ? 'is-active' : ''}`}
              onClick={() => onTabChange(tab)}
            >
              <span className="settings-tab-label">{SETTINGS_TAB_LABELS[tab]}</span>
            </button>
          ))}
        </div>
      </div>

      <div className="settings-page-content">
        {settingsTab === 'general' ? (
          <div className="settings-stack">
            <div className="settings-block">
              <SettingsToolbar
                title="General"
                description="Workspace defaults, thresholds, shared connections, and cleanup."
                actions={headerUtilityContent}
              />

              {!authEnabled ? (
                <>
                  <div className="settings-section-divider" />
                  <div className="settings-section">
                    <div className="settings-section-header">
                      <h3>Demo mode</h3>
                      <p className="muted-copy">
                        Bypasses sign-in so you can test as any role.
                      </p>
                    </div>
                    <div className="settings-form-grid">
                      <label>
                        <span>Access level</span>
                        <select
                          aria-label="Local demo role"
                          value={localRole.mode}
                          onChange={(event) => {
                            const nextMode = event.target.value as ActiveRole['mode']
                            onLocalRoleChange({
                              mode: nextMode,
                              editorId:
                                nextMode === 'contributor'
                                  ? localEditorOptions[0]?.id ?? localRole.editorId
                                  : null,
                            })
                          }}
                        >
                          <option value="owner">Owner</option>
                          <option value="manager">Manager</option>
                          <option value="contributor">Contributor</option>
                          <option value="viewer">Viewer</option>
                        </select>
                      </label>

                      {localRole.mode === 'contributor' ? (
                        <label>
                          <span>Simulate as</span>
                          <select
                            aria-label="Local demo contributor identity"
                            value={localRole.editorId ?? localEditorOptions[0]?.id ?? ''}
                            disabled={localEditorOptions.length === 0}
                            onChange={(event) =>
                              onLocalRoleChange({
                                mode: 'contributor',
                                editorId: event.target.value || null,
                              })
                            }
                          >
                            {localEditorOptions.length === 0 ? (
                              <option value="">No team members yet</option>
                            ) : null}
                            {localEditorOptions.map((member) => (
                              <option key={member.id} value={member.id}>
                                {member.name}
                              </option>
                            ))}
                          </select>
                        </label>
                      ) : null}
                    </div>
                  </div>
                </>
              ) : null}

              <div className="settings-section-divider" />
              <div className="settings-section">
                <div className="settings-section-header">
                  <h3>Workspace</h3>
                </div>
                <div className="settings-form-grid">
                  <label>
                    <span>Workspace name</span>
                    <input
                      aria-label="Workspace name"
                      value={state.settings.general.appName}
                      onChange={(event) =>
                        onStateChange((current) => ({
                          ...current,
                          settings: {
                            ...current.settings,
                            general: {
                              ...current.settings.general,
                              appName: event.target.value,
                            },
                          },
                        }))
                      }
                    />
                  </label>

                  <label>
                    <span>Default portfolio</span>
                    <select
                      aria-label="Default portfolio"
                      value={state.settings.general.defaultPortfolioId}
                      onChange={(event) =>
                        onStateChange((current) => ({
                          ...current,
                          settings: {
                            ...current.settings,
                            general: {
                              ...current.settings.general,
                              defaultPortfolioId: event.target.value,
                            },
                          },
                        }))
                      }
                    >
                      {state.portfolios.map((portfolio) => (
                        <option key={portfolio.id} value={portfolio.id}>
                          {portfolio.name}
                        </option>
                      ))}
                    </select>
                  </label>

                  <label>
                    <span>Theme</span>
                    <input aria-label="Theme" value="Light" disabled />
                  </label>
                </div>
              </div>

              <div className="settings-section-divider" />
              <div className="settings-section">
                <div className="settings-section-header">
                  <h3>Thresholds</h3>
                </div>
                <div className="settings-form-grid">
                  <label>
                    <span>Warning (amber) after days</span>
                    <input
                      aria-label="Warning (amber) after days"
                      type="number"
                      min={1}
                      value={state.settings.general.timeInStageThresholds.amberStart}
                      onChange={(event) => updateGeneralThreshold('amberStart', event.target.value)}
                    />
                  </label>

                  <label>
                    <span>Warning (red) after days</span>
                    <input
                      aria-label="Warning (red) after days"
                      type="number"
                      min={1}
                      value={state.settings.general.timeInStageThresholds.redStart}
                      onChange={(event) => updateGeneralThreshold('redStart', event.target.value)}
                    />
                  </label>

                  <label className="toggle-row">
                    <span>Auto-archive live cards</span>
                    <input
                      aria-label="Auto-archive live cards"
                      type="checkbox"
                      checked={state.settings.general.autoArchiveEnabled}
                      onChange={(event) =>
                        onStateChange((current) => ({
                          ...current,
                          settings: {
                            ...current.settings,
                            general: {
                              ...current.settings.general,
                              autoArchiveEnabled: event.target.checked,
                            },
                          },
                        }))
                      }
                    />
                  </label>

                  <label>
                    <span>Archive after days</span>
                    <input
                      aria-label="Archive after days"
                      type="number"
                      min={1}
                      value={state.settings.general.autoArchiveDays}
                      onChange={(event) =>
                        onStateChange((current) => ({
                          ...current,
                          settings: {
                            ...current.settings,
                            general: {
                              ...current.settings.general,
                              autoArchiveDays: Number(event.target.value) || 1,
                            },
                          },
                        }))
                      }
                    />
                  </label>

                  <label>
                    <span>Default hours per week</span>
                    <input
                      aria-label="Default hours per week"
                      type="number"
                      min={1}
                      value={state.settings.capacity.defaultWeeklyHours}
                      onChange={(event) =>
                        onStateChange((current) => ({
                          ...current,
                          settings: {
                            ...current.settings,
                            capacity: {
                              ...current.settings.capacity,
                              defaultWeeklyHours: Number(event.target.value) || 1,
                            },
                          },
                        }))
                      }
                    />
                  </label>

                  <label>
                    <span>Healthy max (%)</span>
                    <input
                      aria-label="Healthy max (%)"
                      type="number"
                      min={1}
                      value={state.settings.capacity.utilizationThresholds.greenMax}
                      onChange={(event) => updateCapacityThreshold('greenMax', event.target.value)}
                    />
                  </label>

                  <label>
                    <span>Stretched max (%)</span>
                    <input
                      aria-label="Stretched max (%)"
                      type="number"
                      min={1}
                      value={state.settings.capacity.utilizationThresholds.yellowMax}
                      onChange={(event) => updateCapacityThreshold('yellowMax', event.target.value)}
                    />
                  </label>

                  <label>
                    <span>Overloaded min (%)</span>
                    <input
                      aria-label="Overloaded min (%)"
                      type="number"
                      min={1}
                      value={state.settings.capacity.utilizationThresholds.redMin}
                      onChange={(event) => updateCapacityThreshold('redMin', event.target.value)}
                    />
                  </label>
                </div>
              </div>

              <div className="settings-section-divider" />
              <div className="settings-section">
                <div className="settings-section-header">
                  <h3>Connections</h3>
                </div>
                <div className="settings-form-grid">
                  <label className="full-width">
                    <span>Google Drive webhook (shared)</span>
                    <input
                      aria-label="Google Drive webhook (shared)"
                      value={state.settings.integrations.globalDriveWebhookUrl}
                      onChange={(event) =>
                        onStateChange((current) => ({
                          ...current,
                          settings: {
                            ...current.settings,
                            integrations: {
                              ...current.settings.integrations,
                              globalDriveWebhookUrl: event.target.value,
                            },
                          },
                        }))
                      }
                      placeholder="https://script.google.com/macros/..."
                    />
                  </label>

                  <div className="placeholder-card">
                    <strong>Frame.io</strong>
                    <span>Frame.io review link detection (coming soon)</span>
                  </div>

                  <div className="placeholder-card">
                    <strong>Slack</strong>
                    <span>Slack notifications for card updates (coming soon)</span>
                  </div>
                </div>
              </div>

              <div className="settings-section-divider is-danger" />
              <div className="settings-section settings-danger-zone">
                <div className="settings-section-header">
                  <h3>Data management</h3>
                </div>
                <div className="data-actions">
                  <button type="button" className="primary-button" onClick={onExportData}>
                    Export data
                  </button>
                  <button type="button" className="ghost-button" onClick={onImportClick}>
                    Import data
                  </button>
                  <button type="button" className="ghost-button danger-outline" onClick={onResetData}>
                    Reset to defaults
                  </button>
                  <button
                    type="button"
                    className="ghost-button danger-outline"
                    onClick={onFreshStartData}
                  >
                    Start fresh
                  </button>
                </div>
                <p className="muted-copy">
                  Start fresh keeps brands, products, settings, and your owner login. Everything
                  else is permanently removed.
                </p>
              </div>
            </div>
          </div>
        ) : null}

        {settingsTab === 'portfolios' ? (
          <div className="settings-stack">
            <div className="settings-block">
              <SettingsToolbar
                title="Portfolios"
                description="Portfolio, brand, product, and Drive structure."
                actions={
                  <>
                    {headerUtilityContent}
                    <button
                      type="button"
                      className="ghost-button"
                      onClick={() => {
                        const nextPortfolio = createEmptyPortfolio(
                          'Untitled portfolio',
                          state.portfolios.length,
                        )
                        onStateChange((current) => ({
                          ...current,
                          portfolios: [...current.portfolios, nextPortfolio],
                        }))
                        onSettingsPortfolioChange(nextPortfolio.id)
                      }}
                    >
                      Add portfolio
                    </button>
                  </>
                }
              />

              <div className="settings-stack">
                {state.portfolios.map((portfolio) => {
                  const isCollapsed = collapsedPortfolioIds.includes(portfolio.id)
                  return (
                    <div key={portfolio.id} className="portfolio-settings-card">
                      <div className="portfolio-settings-head">
                        <button
                          type="button"
                          className="portfolio-collapse"
                          onClick={() =>
                            setCollapsedPortfolioIds((current) =>
                              current.includes(portfolio.id)
                                ? current.filter((item) => item !== portfolio.id)
                                : [...current, portfolio.id],
                            )
                          }
                        >
                          <span>{isCollapsed ? '▸' : '▾'}</span>
                          <input
                            className="portfolio-title-input"
                            value={portfolio.name}
                            aria-label={`${portfolio.name} portfolio name`}
                            onChange={(event) =>
                              updatePortfolio(portfolio.id, (currentPortfolio) => ({
                                ...currentPortfolio,
                                name: event.target.value,
                              }))
                            }
                            onClick={(event) => event.stopPropagation()}
                          />
                        </button>
                        <button
                          type="button"
                          className="clear-link danger-link"
                          onClick={() => {
                            if (state.portfolios.length === 1) {
                              showToast('At least one portfolio is required.', 'red')
                              return
                            }
                            setPendingSettingsDelete({
                              kind: 'portfolio',
                              portfolioId: portfolio.id,
                            })
                          }}
                        >
                          Delete
                        </button>
                      </div>

                      {!isCollapsed ? (
                        <>
                          <div className="nested-settings-block">
                            <div className="nested-settings-title">Brands</div>
                            <div className="settings-table full-table">
                              <div className="settings-row settings-head brand-head">
                                <span>Name</span>
                                <span>Prefix</span>
                                <span>Products</span>
                                <span>Drive folder</span>
                                <span />
                              </div>
                              {portfolio.brands.map((brand, brandIndex) => (
                                <div
                                  key={`${portfolio.id}-${brand.prefix}-${brandIndex}`}
                                  className="settings-row brand-row"
                                >
                                  <input
                                    aria-label={`${portfolio.name} brand name`}
                                    value={brand.name}
                                    onChange={(event) =>
                                      updatePortfolio(portfolio.id, (currentPortfolio) =>
                                        renameBrandInPortfolio(
                                          currentPortfolio,
                                          brandIndex,
                                          event.target.value,
                                        ),
                                      )
                                    }
                                  />
                                  <input
                                    aria-label={`${brand.name || 'Brand'} prefix`}
                                    value={brand.prefix}
                                    onChange={(event) => {
                                      const nextPrefix = event.target.value
                                        .toUpperCase()
                                        .slice(0, 2)
                                      if (
                                        nextPrefix &&
                                        getAllBrandPrefixes({
                                          portfolioId: portfolio.id,
                                          brandIndex,
                                        }).includes(nextPrefix)
                                      ) {
                                        showToast('That prefix is already in use.', 'red')
                                        return
                                      }
                                      updatePortfolio(portfolio.id, (currentPortfolio) => ({
                                        ...currentPortfolio,
                                        brands: currentPortfolio.brands.map((item, index) =>
                                          index === brandIndex
                                            ? { ...item, prefix: nextPrefix }
                                            : item,
                                        ),
                                      }))
                                    }}
                                  />
                                  <input
                                    aria-label={`${brand.name || 'Brand'} products`}
                                    value={brand.products.join(', ')}
                                    onChange={(event) =>
                                      updatePortfolio(portfolio.id, (currentPortfolio) =>
                                        syncPortfolioCardProducts({
                                          ...currentPortfolio,
                                          brands: currentPortfolio.brands.map((item, index) =>
                                            index === brandIndex
                                              ? {
                                                  ...item,
                                                  products: event.target.value
                                                    .split(',')
                                                    .map((product) => product.trim())
                                                    .filter(Boolean),
                                                }
                                              : item,
                                          ),
                                        }),
                                      )
                                    }
                                  />
                                  <input
                                    aria-label={`${brand.name || 'Brand'} Drive folder`}
                                    value={brand.driveParentFolderId}
                                    onChange={(event) =>
                                      updatePortfolio(portfolio.id, (currentPortfolio) => ({
                                        ...currentPortfolio,
                                        brands: currentPortfolio.brands.map((item, index) =>
                                          index === brandIndex
                                            ? { ...item, driveParentFolderId: event.target.value }
                                            : item,
                                        ),
                                      }))
                                    }
                                  />
                                  <button
                                    type="button"
                                    className="clear-link danger-link"
                                    onClick={() => {
                                      const blocker = getBrandRemovalBlocker(portfolio, brandIndex)
                                      if (blocker) {
                                        showToast(blocker, 'amber')
                                        return
                                      }
                                      setPendingSettingsDelete({
                                        kind: 'brand',
                                        portfolioId: portfolio.id,
                                        brandIndex,
                                      })
                                    }}
                                  >
                                    Delete
                                  </button>
                                </div>
                              ))}
                            </div>
                            <button
                              type="button"
                              className="ghost-button"
                              onClick={() => {
                                const nextPrefix = getSuggestedPrefix()
                                updatePortfolio(portfolio.id, (currentPortfolio) => ({
                                  ...currentPortfolio,
                                  brands: [
                                    ...currentPortfolio.brands,
                                    {
                                      name: 'Untitled brand',
                                      prefix: nextPrefix,
                                      products: ['Untitled product'],
                                      driveParentFolderId: '',
                                      color: '#94a3b8',
                                      surfaceColor: '#e2e8f0',
                                      textColor: '#334155',
                                    },
                                  ],
                                  lastIdPerPrefix: {
                                    ...currentPortfolio.lastIdPerPrefix,
                                    [nextPrefix]:
                                      currentPortfolio.lastIdPerPrefix[nextPrefix] ?? 0,
                                  },
                                }))
                              }}
                            >
                              Add brand
                            </button>
                          </div>

                          <div className="nested-settings-block">
                            <div className="nested-settings-title">Drive webhook</div>
                            <label className="full-width">
                              <input
                                aria-label={`${portfolio.name} Drive webhook URL`}
                                value={portfolio.webhookUrl}
                                onChange={(event) =>
                                  updatePortfolio(portfolio.id, (currentPortfolio) => ({
                                    ...currentPortfolio,
                                    webhookUrl: event.target.value,
                                  }))
                                }
                                placeholder="https://script.google.com/macros/..."
                              />
                            </label>
                          </div>
                        </>
                      ) : null}
                    </div>
                  )
                })}
              </div>
            </div>
          </div>
        ) : null}

        {settingsTab === 'team' ? (
          <div className="settings-stack">
            <div className="settings-block">
              <SettingsToolbar
                title="Team"
                description="Team members on the board. Sign-in accounts are managed in Access."
                actions={
                  <>
                    {headerUtilityContent}
                    <label className="settings-inline-field">
                      <span>Portfolio</span>
                      <select
                        aria-label="Portfolio for new team member"
                        value={settingsPortfolio?.id ?? ''}
                        onChange={(event) => onSettingsPortfolioChange(event.target.value)}
                      >
                        {state.portfolios.map((portfolio) => (
                          <option key={portfolio.id} value={portfolio.id}>
                            {portfolio.name}
                          </option>
                        ))}
                      </select>
                    </label>
                    <button
                      type="button"
                      className="ghost-button"
                      onClick={() => {
                        if (!settingsPortfolio) {
                          return
                        }
                        const nextMember = createTeamMemberDraft(settingsPortfolio)
                        updatePortfolio(settingsPortfolio.id, (currentPortfolio) => ({
                          ...currentPortfolio,
                          team: [...currentPortfolio.team, nextMember],
                        }))
                        setExpandedTeamRowKey(`${settingsPortfolio.id}:${nextMember.id}`)
                      }}
                    >
                      Add member
                    </button>
                  </>
                }
              />

              <div className="team-table">
                <div className="team-table-head">
                  <span>Portfolio</span>
                  <span>Name</span>
                  <span>Role</span>
                  <span>Working days</span>
                  <span>Status</span>
                  <span />
                </div>

                {peopleRows.map(({ portfolio, member, memberIndex }) => {
                  const rowKey = `${portfolio.id}:${member.id}`
                  const isExpanded = expandedTeamRowKey === rowKey
                  return (
                    <Fragment key={rowKey}>
                      <button
                        type="button"
                        className={`team-table-row ${isExpanded ? 'is-expanded' : ''}`}
                        aria-expanded={isExpanded}
                        onClick={() =>
                          setExpandedTeamRowKey((current) => (current === rowKey ? null : rowKey))
                        }
                      >
                        <span>{portfolio.name}</span>
                        <span className="team-table-primary">{member.name}</span>
                        <span>{member.role}</span>
                        <span>{formatWorkingDaysSummary(member.workingDays)}</span>
                        <span>
                          <span
                            className={`team-status-badge ${member.active ? 'is-active' : 'is-inactive'}`}
                          >
                            {member.active ? 'Active' : 'Inactive'}
                          </span>
                        </span>
                        <span className="team-row-chevron">{isExpanded ? '▾' : '▸'}</span>
                      </button>

                      {isExpanded ? (
                        <div className="team-detail-row">
                          <div className="team-detail-panel">
                            <div className="settings-form-grid">
                              <label>
                                <span>Name</span>
                                <input
                                  aria-label={`${member.name} team member name`}
                                  value={member.name}
                                  onChange={(event) =>
                                    updatePortfolio(portfolio.id, (currentPortfolio) =>
                                      renameTeamMemberInPortfolio(
                                        currentPortfolio,
                                        memberIndex,
                                        event.target.value,
                                      ),
                                    )
                                  }
                                />
                              </label>

                              <label>
                                <span>Role</span>
                                <select
                                  aria-label={`${member.name} role`}
                                  value={member.role}
                                  onChange={(event) => {
                                    const nextRole = event.target.value
                                    const removingLastManager =
                                      member.role.toLowerCase().includes('manager') &&
                                      !nextRole.toLowerCase().includes('manager') &&
                                      portfolio.team.filter(
                                        (item, index) =>
                                          index !== memberIndex &&
                                          item.role.toLowerCase().includes('manager'),
                                      ).length === 0

                                    if (removingLastManager) {
                                      showToast(
                                        'Each portfolio needs at least one manager.',
                                        'amber',
                                      )
                                      return
                                    }

                                    updateTeamMember(portfolio.id, memberIndex, (currentMember) => ({
                                      ...currentMember,
                                      role: nextRole,
                                    }))
                                  }}
                                >
                                  {teamRoleOptions.map((roleOption) => (
                                    <option key={roleOption} value={roleOption}>
                                      {roleOption}
                                    </option>
                                  ))}
                                </select>
                              </label>

                              <label>
                                <span>Hrs/week</span>
                                <input
                                  aria-label={`${member.name} Hrs/week`}
                                  type="number"
                                  min={0}
                                  value={member.weeklyHours ?? ''}
                                  onChange={(event) =>
                                    updateTeamMember(portfolio.id, memberIndex, (currentMember) => ({
                                      ...currentMember,
                                      weeklyHours: event.target.value
                                        ? Number(event.target.value)
                                        : null,
                                    }))
                                  }
                                />
                              </label>

                              <label>
                                <span>Hrs/day</span>
                                <input
                                  aria-label={`${member.name} Hrs/day`}
                                  type="number"
                                  min={0}
                                  step={0.5}
                                  value={member.hoursPerDay ?? ''}
                                  onChange={(event) =>
                                    updateTeamMember(portfolio.id, memberIndex, (currentMember) => ({
                                      ...currentMember,
                                      hoursPerDay: event.target.value
                                        ? Number(event.target.value)
                                        : null,
                                    }))
                                  }
                                />
                              </label>

                              <label>
                                <span>Timezone</span>
                                <select
                                  aria-label={`${member.name} timezone`}
                                  value={member.timezone}
                                  onChange={(event) =>
                                    updateTeamMember(portfolio.id, memberIndex, (currentMember) => ({
                                      ...currentMember,
                                      timezone: event.target.value,
                                    }))
                                  }
                                >
                                  {timezoneOptions.map((timezone) => (
                                    <option key={timezone} value={timezone}>
                                      {timezone}
                                    </option>
                                  ))}
                                </select>
                              </label>

                              <label>
                                <span>Max cards</span>
                                <input
                                  aria-label={`${member.name} Max cards`}
                                  type="number"
                                  min={0}
                                  value={member.wipCap ?? ''}
                                  onChange={(event) =>
                                    updateTeamMember(portfolio.id, memberIndex, (currentMember) => ({
                                      ...currentMember,
                                      wipCap: event.target.value ? Number(event.target.value) : null,
                                    }))
                                  }
                                />
                              </label>
                            </div>

                            <div className="team-detail-secondary">
                              <label className="workspace-access-field">
                                <span className="workspace-access-field-label">Working days</span>
                                <div className="working-days-grid" aria-label={`${member.name} working days`}>
                                  {WORKING_DAYS.map((day) => (
                                    <label key={day} className="working-day-toggle">
                                      <input
                                        type="checkbox"
                                        aria-label={`${member.name} works ${day}`}
                                        checked={member.workingDays.includes(day)}
                                        onChange={(event) =>
                                          updateTeamMember(
                                            portfolio.id,
                                            memberIndex,
                                            (currentMember) => ({
                                              ...currentMember,
                                              workingDays: event.target.checked
                                                ? WORKING_DAYS.filter((workingDay) =>
                                                    workingDay === day
                                                      ? true
                                                      : currentMember.workingDays.includes(
                                                          workingDay,
                                                        ),
                                                  )
                                                : currentMember.workingDays.filter(
                                                    (workingDay) => workingDay !== day,
                                                  ),
                                            }),
                                          )
                                        }
                                      />
                                      <span>{day}</span>
                                    </label>
                                  ))}
                                </div>
                              </label>

                              <label className="toggle-row team-active-toggle">
                                <span>Active</span>
                                <input
                                  type="checkbox"
                                  aria-label={`${member.name} active status`}
                                  checked={member.active}
                                  onChange={(event) =>
                                    updateTeamMember(portfolio.id, memberIndex, (currentMember) => ({
                                      ...currentMember,
                                      active: event.target.checked,
                                    }))
                                  }
                                />
                              </label>
                            </div>

                            <button
                              type="button"
                              className="clear-link danger-link"
                              onClick={() => {
                                const blocker = getTeamMemberRemovalBlocker(
                                  portfolio,
                                  memberIndex,
                                )
                                if (blocker) {
                                  showToast(blocker, 'amber')
                                  return
                                }
                                setPendingSettingsDelete({
                                  kind: 'member',
                                  portfolioId: portfolio.id,
                                  memberIndex,
                                })
                              }}
                            >
                              Remove member
                            </button>
                          </div>
                        </div>
                      ) : null}
                    </Fragment>
                  )
                })}
              </div>
            </div>
          </div>
        ) : null}

        {settingsTab === 'access' ? (
          <div className="settings-stack">
            <WorkspaceAccessManager
              entries={workspaceAccessEntries}
              editorOptions={workspaceEditorOptions}
              portfolios={state.portfolios}
              status={workspaceAccessStatus}
              errorMessage={workspaceAccessErrorMessage}
              pendingEmail={workspaceAccessPendingEmail}
              headerUtilityContent={headerUtilityContent}
              onOpenTeam={() => onTabChange('team')}
              onSave={onWorkspaceAccessSave}
              onDelete={onWorkspaceAccessDelete}
            />
          </div>
        ) : null}

        {settingsTab === 'workflow' ? (
          <div className="settings-stack">
            <div className="settings-block settings-header-block">
              <SettingsToolbar
                title="Workflow"
                description="Task types and revision reasons that define how work moves."
                actions={headerUtilityContent}
              />
            </div>

            <TaskLibraryEditor
              settings={state.settings}
              portfolios={state.portfolios}
              onTaskTypeChange={(updater) =>
                onStateChange((current) => ({
                  ...current,
                  settings: {
                    ...current.settings,
                    taskLibrary: updater(current.settings.taskLibrary)
                      .slice()
                      .sort((left, right) => left.order - right.order)
                      .map((taskType, order) => ({ ...taskType, order })),
                  },
                }))
              }
              onDeleteTaskType={(taskTypeId) =>
                onStateChange((current) => ({
                  ...current,
                  portfolios: current.portfolios.map((portfolio) => ({
                    ...portfolio,
                    cards: portfolio.cards.map((card) =>
                      card.taskTypeId === taskTypeId ? { ...card, taskTypeId: 'custom' } : card,
                    ),
                  })),
                  settings: {
                    ...current.settings,
                    taskLibrary: current.settings.taskLibrary
                      .filter((taskType) => taskType.id !== taskTypeId)
                      .map((taskType, order) => ({ ...taskType, order })),
                  },
                }))
              }
              showToast={showToast}
            />

            <RevisionReasonLibraryEditor
              settings={state.settings}
              onRevisionReasonChange={(updater) =>
                onStateChange((current) => ({
                  ...current,
                  settings: {
                    ...current.settings,
                    revisionReasons: updater(current.settings.revisionReasons)
                      .slice()
                      .sort((left, right) => left.order - right.order)
                      .map((reason, order) => ({ ...reason, order })),
                  },
                }))
              }
              onDeleteRevisionReason={(revisionReasonId) =>
                onStateChange((current) => ({
                  ...current,
                  settings: {
                    ...current.settings,
                    revisionReasons: current.settings.revisionReasons
                      .filter((reason) => reason.id !== revisionReasonId)
                      .map((reason, order) => ({ ...reason, order })),
                  },
                }))
              }
              showToast={showToast}
            />
          </div>
        ) : null}

        {settingsDeleteDialog ? (
          <ConfirmDialog
            title={settingsDeleteDialog.title}
            message={settingsDeleteDialog.message}
            confirmLabel={settingsDeleteDialog.confirmLabel}
            onCancel={() => setPendingSettingsDelete(null)}
            onConfirm={confirmSettingsDelete}
          />
        ) : null}
      </div>
    </div>
  )
}
