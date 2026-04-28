import { Fragment, useState, type ReactNode } from 'react'
import { ConfirmDialog } from './ConfirmDialog'
import { PeopleSection } from './PeopleSection'
import { RevisionReasonLibraryEditor } from './RevisionReasonLibraryEditor'
import { TaskLibraryEditor } from './TaskLibraryEditor'
import type { WorkspaceAccessEntry } from '../supabase'
import {
  BRAND_PALETTES,
  SETTING_TABS,
  SETTINGS_TAB_LABELS,
  createEmptyPortfolio,
  getBrandRemovalBlocker,
  getTeamMemberById,
  markPortfolioMetadataUpdated,
  removeBrandFromPortfolio,
  removePortfolioFromAppState,
  removeTeamMemberFromPortfolio,
  renameBrandInPortfolio,
  syncPortfolioCardProducts,
  type AccessScopeMode,
  type ActiveRole,
  type AppState,
  type Portfolio,
  type PortfolioAccessScope,
  type RoleMode,
  type SettingTab,
  type TeamMember,
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

function ProductTagInput({
  products,
  brandName,
  onChange,
}: {
  products: string[]
  brandName: string
  onChange: (products: string[]) => void
}) {
  const [inputValue, setInputValue] = useState('')

  function commitTag() {
    const trimmed = inputValue.trim()
    if (trimmed && !products.includes(trimmed)) {
      onChange([...products, trimmed])
    }
    setInputValue('')
  }

  return (
    <div className="product-tags-container" aria-label={`${brandName || 'Brand'} products`}>
      {products.map((product, index) => (
        <span key={`${product}-${index}`} className="product-tag">
          {product}
          <button
            type="button"
            className="product-tag-remove"
            aria-label={`Remove ${product}`}
            onClick={() => onChange(products.filter((_, i) => i !== index))}
          >
            &times;
          </button>
        </span>
      ))}
      <input
        className="product-tag-input"
        value={inputValue}
        placeholder={products.length === 0 ? 'Add product...' : '+'}
        onChange={(event) => {
          const value = event.target.value
          if (value.endsWith(',')) {
            const trimmed = value.slice(0, -1).trim()
            if (trimmed && !products.includes(trimmed)) {
              onChange([...products, trimmed])
            }
            setInputValue('')
          } else {
            setInputValue(value)
          }
        }}
        onKeyDown={(event) => {
          if (event.key === 'Enter') {
            event.preventDefault()
            commitTag()
          }
          if (event.key === 'Backspace' && inputValue === '' && products.length > 0) {
            onChange(products.slice(0, -1))
          }
        }}
        onBlur={commitTag}
      />
    </div>
  )
}

export function SettingsPage({
  state,
  authEnabled,
  settingsTab,
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
  const [selectedPortfolioId, setSelectedPortfolioId] = useState(
    () => state.activePortfolioId || state.portfolios[0]?.id || '',
  )
  const [colorPickerOpenKey, setColorPickerOpenKey] = useState<string | null>(null)
  const [pendingSettingsDelete, setPendingSettingsDelete] = useState<PendingSettingsDelete | null>(
    null,
  )
  const selectedPortfolio =
    state.portfolios.find((portfolio) => portfolio.id === selectedPortfolioId) ??
    state.portfolios[0] ??
    null
  const totalBrandCount = state.portfolios.reduce(
    (sum, portfolio) => sum + portfolio.brands.length,
    0,
  )
  const totalMemberCount = state.portfolios.reduce(
    (sum, portfolio) => sum + portfolio.team.length,
    0,
  )
  const totalActiveCardCount = state.portfolios.reduce(
    (sum, portfolio) => sum + portfolio.cards.filter((card) => !card.archivedAt).length,
    0,
  )
  const drivePortfolioOverrideCount = state.portfolios.filter((portfolio) =>
    portfolio.webhookUrl.trim(),
  ).length
  const driveBrandFolderCount = state.portfolios.reduce(
    (sum, portfolio) =>
      sum + portfolio.brands.filter((brand) => brand.driveParentFolderId.trim()).length,
    0,
  )

  function selectPortfolio(portfolioId: string) {
    setSelectedPortfolioId(portfolioId)
    onSettingsPortfolioChange(portfolioId)
  }

  function updatePortfolio(portfolioId: string, updater: (portfolio: Portfolio) => Portfolio) {
    onStateChange((current) => ({
      ...current,
      portfolios: current.portfolios.map((portfolio) =>
        portfolio.id === portfolioId
          ? markPortfolioMetadataUpdated(updater(portfolio))
          : portfolio,
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

  if (localRole.mode === 'contributor') {
    let contributorMember: TeamMember | null = null
    let contributorPortfolioName: string | null = null

    for (const portfolio of state.portfolios) {
      const member = getTeamMemberById(portfolio, localRole.editorId)
      if (member) {
        contributorMember = member
        contributorPortfolioName = portfolio.name
        break
      }
    }

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
            <button type="button" className="settings-tab is-active">
              <span className="settings-tab-label">My Profile</span>
            </button>
          </div>
        </div>

        <div className="settings-page-content">
          <div className="settings-stack">
            <div className="settings-block">
              <SettingsToolbar
                title="My Profile"
                description="Your team member details (read-only)."
              />

              {contributorMember ? (
                <>
                  <div className="settings-section-divider" />
                  <div className="settings-section">
                    <div className="settings-form-grid">
                      <label>
                        <span>Name</span>
                        <input value={contributorMember.name} readOnly />
                      </label>

                      <label>
                        <span>Role</span>
                        <input value={contributorMember.role || 'Not set'} readOnly />
                      </label>

                      <label>
                        <span>Portfolio</span>
                        <input value={contributorPortfolioName ?? 'Unknown'} readOnly />
                      </label>

                      <label>
                        <span>Working days</span>
                        <input
                          value={
                            contributorMember.workingDays.length > 0
                              ? contributorMember.workingDays.join(', ')
                              : 'Not set'
                          }
                          readOnly
                        />
                      </label>

                      <label>
                        <span>Timezone</span>
                        <input value={contributorMember.timezone || 'Not set'} readOnly />
                      </label>

                      <label>
                        <span>Hours per week</span>
                        <input
                          value={contributorMember.weeklyHours ?? 'Not set'}
                          readOnly
                        />
                      </label>

                      <label>
                        <span>Hours per day</span>
                        <input
                          value={contributorMember.hoursPerDay ?? 'Not set'}
                          readOnly
                        />
                      </label>

                      <label>
                        <span>Status</span>
                        <input value={contributorMember.active ? 'Active' : 'Inactive'} readOnly />
                      </label>
                    </div>
                  </div>
                </>
              ) : (
                <>
                  <div className="settings-section-divider" />
                  <div className="settings-section">
                    <p className="muted-copy">
                      No team member profile found. Contact your workspace owner.
                    </p>
                  </div>
                </>
              )}
            </div>
          </div>
        </div>
      </div>
    )
  }

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
          {SETTING_TABS.map((tab) => (
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
                description="Workspace defaults and preferences."
                actions={headerUtilityContent}
              />

              {!authEnabled ? (
                <>
                  <div className="settings-section-divider" />
                  <div className="settings-section">
                    <div className="settings-section-header">
                      <h3>Demo mode</h3>
                      <p className="muted-copy">
                        Local browser only. Bypasses sign-in for UI testing and never represents the shared team workspace.
                      </p>
                    </div>
                    <div className="settings-form-grid">
                      <label>
                        <span>Demo access level</span>
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

                      {(localRole.mode as string) === 'contributor' ? (
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
                </div>
              </div>
            </div>

            <div className="settings-block">
              <div className="settings-section">
                <div className="settings-section-header">
                  <h3>Thresholds</h3>
                  <p className="muted-copy">
                    Card stage limits, auto-archiving, and team capacity bands.
                  </p>
                </div>
                <div className="settings-form-grid">
                  <label>
                    <span>Card warning (amber) after days</span>
                    <input
                      aria-label="Warning (amber) after days"
                      type="number"
                      min={1}
                      value={state.settings.general.timeInStageThresholds.amberStart}
                      onChange={(event) => updateGeneralThreshold('amberStart', event.target.value)}
                    />
                  </label>

                  <label>
                    <span>Card warning (red) after days</span>
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
            </div>

            <div className="settings-block">
              <div className="settings-section">
                <div className="settings-section-header">
                  <h3>Connections</h3>
                  <p className="muted-copy">
                    Integrations with external services.
                  </p>
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
            </div>

            <div className="settings-block settings-danger-block">
              <div className="settings-section">
                <div className="settings-section-header">
                  <h3>Data management</h3>
                  <p className="muted-copy">
                    Export, import, or reset your workspace data.
                  </p>
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

        {settingsTab === 'drive' ? (
          <div className="settings-stack drive-settings">
            <div className="settings-block">
              <SettingsToolbar
                title="Drive"
                description="Google Drive folder routing for production cards."
                actions={headerUtilityContent}
              />

              <div className="drive-status-row">
                <span>
                  <strong>
                    {state.settings.integrations.globalDriveWebhookUrl.trim() ? 'On' : 'Off'}
                  </strong>
                  shared webhook
                </span>
                <span>
                  <strong>{drivePortfolioOverrideCount}</strong>
                  portfolio overrides
                </span>
                <span>
                  <strong>{driveBrandFolderCount}</strong>
                  brand folders
                </span>
              </div>

              <div className="settings-section-divider" />

              <div className="settings-section drive-shared-section">
                <div className="settings-section-header">
                  <h3>Shared webhook</h3>
                </div>
                <label className="drive-url-field">
                  <span>Google Drive webhook URL</span>
                  <input
                    aria-label="Drive shared webhook URL"
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
              </div>
            </div>

            <div className="settings-block">
              <div className="settings-section">
                <div className="settings-section-header">
                  <h3>Portfolios and brands</h3>
                </div>

                <div className="drive-portfolio-list">
                  {state.portfolios.map((portfolio) => {
                    const portfolioUsesOverride = Boolean(portfolio.webhookUrl.trim())
                    return (
                      <section key={portfolio.id} className="drive-portfolio-card">
                        <div className="drive-portfolio-head">
                          <div>
                            <h4>{portfolio.name}</h4>
                            <span>{portfolio.brands.length} brands</span>
                          </div>
                          <span className={`drive-status-pill${portfolioUsesOverride ? ' is-on' : ''}`}>
                            {portfolioUsesOverride ? 'Portfolio webhook' : 'Shared webhook'}
                          </span>
                        </div>

                        <div className="drive-portfolio-controls">
                          <label className="drive-url-field">
                            <span>Portfolio webhook URL</span>
                            <input
                              aria-label={`${portfolio.name} Drive webhook URL`}
                              value={portfolio.webhookUrl}
                              onChange={(event) =>
                                updatePortfolio(portfolio.id, (currentPortfolio) => ({
                                  ...currentPortfolio,
                                  webhookUrl: event.target.value,
                                }))
                              }
                              placeholder="Use shared webhook"
                            />
                          </label>
                          {portfolioUsesOverride ? (
                            <button
                              type="button"
                              className="ghost-button compact-button"
                              onClick={() =>
                                updatePortfolio(portfolio.id, (currentPortfolio) => ({
                                  ...currentPortfolio,
                                  webhookUrl: '',
                                }))
                              }
                            >
                              Use shared
                            </button>
                          ) : null}
                        </div>

                        <div className="drive-brand-list">
                          {portfolio.brands.length === 0 ? (
                            <span className="organization-empty-inline">No brands in this portfolio.</span>
                          ) : null}
                          {portfolio.brands.map((brand, brandIndex) => (
                            <label key={`${portfolio.id}-${brand.prefix}-${brandIndex}`}>
                              <span>{brand.name || 'Untitled brand'} parent folder ID</span>
                              <input
                                aria-label={`${brand.name || 'Brand'} Drive parent folder ID`}
                                value={brand.driveParentFolderId}
                                onChange={(event) =>
                                  updatePortfolio(portfolio.id, (currentPortfolio) => ({
                                    ...currentPortfolio,
                                    brands: currentPortfolio.brands.map((item, index) =>
                                      index === brandIndex
                                        ? {
                                            ...item,
                                            driveParentFolderId: event.target.value,
                                          }
                                        : item,
                                    ),
                                  }))
                                }
                                placeholder="Google Drive folder ID"
                              />
                            </label>
                          ))}
                        </div>
                      </section>
                    )
                  })}
                </div>
              </div>
            </div>
          </div>
        ) : null}

        {settingsTab === 'portfolios' ? (
          <div className="settings-stack organization-settings">
            <div className="settings-block organization-shell">
              <SettingsToolbar
                title="Organization"
                description="Portfolios, brands, team lanes, and workspace integrations."
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
                        setSelectedPortfolioId(nextPortfolio.id)
                        onSettingsPortfolioChange(nextPortfolio.id)
                      }}
                    >
                      Add portfolio
                    </button>
                  </>
                }
              />

              <div className="organization-summary-row">
                <span>
                  <strong>{state.portfolios.length}</strong>
                  portfolios
                </span>
                <span>
                  <strong>{totalBrandCount}</strong>
                  brands
                </span>
                <span>
                  <strong>{totalMemberCount}</strong>
                  members
                </span>
                <span>
                  <strong>{totalActiveCardCount}</strong>
                  active cards
                </span>
              </div>

              <div className="organization-grid">
                <aside className="organization-index" aria-label="Portfolios">
                  <div className="organization-index-header">
                    <span>Portfolios</span>
                    <span>{state.portfolios.length}</span>
                  </div>
                  <div className="organization-index-list">
                    {state.portfolios.map((portfolio) => {
                      const activeCards = portfolio.cards.filter((card) => !card.archivedAt).length
                      return (
                        <button
                          key={portfolio.id}
                          type="button"
                          className={`organization-index-item${
                            selectedPortfolio?.id === portfolio.id ? ' is-active' : ''
                          }`}
                          onClick={() => selectPortfolio(portfolio.id)}
                        >
                          <span className="organization-index-name">{portfolio.name}</span>
                          <span className="organization-index-meta">
                            {portfolio.brands.length} brands · {portfolio.team.length} members
                          </span>
                          <span className="organization-index-foot">
                            <span>{activeCards} active cards</span>
                            <span>{portfolio.webhookUrl.trim() ? 'Drive connected' : 'No webhook'}</span>
                          </span>
                        </button>
                      )
                    })}
                  </div>
                </aside>

                {selectedPortfolio ? (
                  <section className="portfolio-settings-card organization-detail">
                    <div className="portfolio-settings-head organization-detail-head">
                      <div className="organization-title-cluster">
                        <span className="organization-eyebrow">Selected portfolio</span>
                        <input
                          className="portfolio-title-input organization-title-input"
                          value={selectedPortfolio.name}
                          aria-label={`${selectedPortfolio.name} portfolio name`}
                          onChange={(event) =>
                            updatePortfolio(selectedPortfolio.id, (currentPortfolio) => ({
                              ...currentPortfolio,
                              name: event.target.value,
                            }))
                          }
                        />
                      </div>
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
                            portfolioId: selectedPortfolio.id,
                          })
                        }}
                      >
                        Delete
                      </button>
                    </div>

                    <div className="organization-metric-grid">
                      <span>
                        <strong>{selectedPortfolio.brands.length}</strong>
                        Brands
                      </span>
                      <span>
                        <strong>
                          {selectedPortfolio.brands.reduce(
                            (sum, brand) => sum + brand.products.length,
                            0,
                          )}
                        </strong>
                        Products
                      </span>
                      <span>
                        <strong>{selectedPortfolio.team.length}</strong>
                        Members
                      </span>
                      <span>
                        <strong>
                          {selectedPortfolio.cards.filter((card) => !card.archivedAt).length}
                        </strong>
                        Active cards
                      </span>
                    </div>

                    <div className="organization-team-strip">
                      <div className="organization-team-copy">
                        <span className="nested-settings-title">Team lanes</span>
                        <div className="organization-member-chips">
                          {selectedPortfolio.team.length > 0 ? (
                            selectedPortfolio.team.slice(0, 8).map((member) => (
                              <span
                                key={member.id}
                                className={`organization-member-chip${member.active ? '' : ' is-muted'}`}
                              >
                                {member.name}
                                <small>{member.role}</small>
                              </span>
                            ))
                          ) : (
                            <span className="organization-empty-inline">No team members yet</span>
                          )}
                        </div>
                      </div>
                      <button
                        type="button"
                        className="ghost-button compact-button"
                        onClick={() => onTabChange('people')}
                      >
                        Manage team
                      </button>
                    </div>

                    <div className="nested-settings-block organization-brand-block">
                      <div className="organization-section-bar">
                        <div>
                          <div className="nested-settings-title">Brands</div>
                          <p className="muted-copy">
                            Prefixes, product tags, source folders, and paid-social destinations.
                          </p>
                        </div>
                        <button
                          type="button"
                          className="ghost-button compact-button"
                          onClick={() => {
                            const nextPrefix = getSuggestedPrefix()
                            const nextPalette =
                              BRAND_PALETTES[selectedPortfolio.brands.length % BRAND_PALETTES.length]
                            updatePortfolio(selectedPortfolio.id, (currentPortfolio) => ({
                              ...currentPortfolio,
                              brands: [
                                ...currentPortfolio.brands,
                                {
                                  name: 'Untitled brand',
                                  prefix: nextPrefix,
                                  products: [],
                                  driveParentFolderId: '',
                                  facebookPage: '',
                                  defaultLandingPage: '',
                                  color: nextPalette.color,
                                  surfaceColor: nextPalette.surfaceColor,
                                  textColor: nextPalette.textColor,
                                },
                              ],
                              lastIdPerPrefix: {
                                ...currentPortfolio.lastIdPerPrefix,
                                [nextPrefix]: currentPortfolio.lastIdPerPrefix[nextPrefix] ?? 0,
                              },
                            }))
                          }}
                        >
                          Add brand
                        </button>
                      </div>

                      <div className="settings-table full-table organization-brand-table">
                        <div className="settings-row settings-head brand-head">
                          <span />
                          <span>Name</span>
                          <span>Prefix</span>
                          <span>Products</span>
                          <span>Drive folder</span>
                          <span>Facebook Page</span>
                          <span>Default Landing Page</span>
                          <span />
                        </div>
                        {selectedPortfolio.brands.length === 0 ? (
                          <div className="organization-empty-state">No brands in this portfolio.</div>
                        ) : null}
                        {selectedPortfolio.brands.map((brand, brandIndex) => {
                          const pickerKey = `${selectedPortfolio.id}-${brandIndex}`
                          const isPickerOpen = colorPickerOpenKey === pickerKey
                          return (
                            <Fragment key={`${selectedPortfolio.id}-${brand.prefix}-${brandIndex}`}>
                              <div className="settings-row brand-row">
                                <div className="brand-color-cell">
                                  <button
                                    type="button"
                                    className="brand-color-swatch"
                                    style={{ background: brand.color }}
                                    aria-label={`Pick color for ${brand.name || 'brand'}`}
                                    onClick={() =>
                                      setColorPickerOpenKey(isPickerOpen ? null : pickerKey)
                                    }
                                  />
                                </div>
                                      <input
                                        aria-label={`${selectedPortfolio.name} brand name`}
                                        value={brand.name}
                                        placeholder="Brand name"
                                        onChange={(event) =>
                                          updatePortfolio(selectedPortfolio.id, (currentPortfolio) =>
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
                                        placeholder="AB"
                                        onChange={(event) => {
                                          const nextPrefix = event.target.value
                                            .toUpperCase()
                                            .slice(0, 2)
                                          if (
                                            nextPrefix &&
                                            getAllBrandPrefixes({
                                              portfolioId: selectedPortfolio.id,
                                              brandIndex,
                                            }).includes(nextPrefix)
                                          ) {
                                            showToast('That prefix is already in use.', 'red')
                                            return
                                          }
                                          updatePortfolio(selectedPortfolio.id, (currentPortfolio) => ({
                                            ...currentPortfolio,
                                            brands: currentPortfolio.brands.map((item, index) =>
                                              index === brandIndex
                                                ? { ...item, prefix: nextPrefix }
                                                : item,
                                            ),
                                          }))
                                        }}
                                      />
                                      <ProductTagInput
                                        products={brand.products}
                                        brandName={brand.name}
                                        onChange={(nextProducts) =>
                                          updatePortfolio(selectedPortfolio.id, (currentPortfolio) =>
                                            syncPortfolioCardProducts({
                                              ...currentPortfolio,
                                              brands: currentPortfolio.brands.map((item, index) =>
                                                index === brandIndex
                                                  ? { ...item, products: nextProducts }
                                                  : item,
                                              ),
                                            }, state.settings),
                                          )
                                        }
                                      />
                                      <input
                                        aria-label={`${brand.name || 'Brand'} Drive folder`}
                                        value={brand.driveParentFolderId}
                                        placeholder="Folder ID"
                                        onChange={(event) =>
                                          updatePortfolio(selectedPortfolio.id, (currentPortfolio) => ({
                                            ...currentPortfolio,
                                            brands: currentPortfolio.brands.map((item, index) =>
                                              index === brandIndex
                                                ? {
                                                    ...item,
                                                    driveParentFolderId: event.target.value,
                                                  }
                                                : item,
                                            ),
                                          }))
                                        }
                                      />
                                      <input
                                        aria-label={`${brand.name || 'Brand'} Facebook Page`}
                                        value={brand.facebookPage ?? ''}
                                        placeholder="Facebook page"
                                        onChange={(event) =>
                                          updatePortfolio(selectedPortfolio.id, (currentPortfolio) => ({
                                            ...currentPortfolio,
                                            brands: currentPortfolio.brands.map((item, index) =>
                                              index === brandIndex
                                                ? {
                                                    ...item,
                                                    facebookPage: event.target.value,
                                                  }
                                                : item,
                                            ),
                                          }))
                                        }
                                      />
                                      <input
                                        aria-label={`${brand.name || 'Brand'} Default Landing Page`}
                                        value={brand.defaultLandingPage ?? ''}
                                        placeholder="https://example.com"
                                        onChange={(event) =>
                                          updatePortfolio(selectedPortfolio.id, (currentPortfolio) => ({
                                            ...currentPortfolio,
                                            brands: currentPortfolio.brands.map((item, index) =>
                                              index === brandIndex
                                                ? {
                                                    ...item,
                                                    defaultLandingPage: event.target.value,
                                                  }
                                                : item,
                                            ),
                                          }))
                                        }
                                      />
                                      <button
                                        type="button"
                                        className="clear-link danger-link"
                                        onClick={() => {
                                          const blocker = getBrandRemovalBlocker(
                                            selectedPortfolio,
                                            brandIndex,
                                          )
                                          if (blocker) {
                                            showToast(blocker, 'amber')
                                            return
                                          }
                                          setPendingSettingsDelete({
                                            kind: 'brand',
                                            portfolioId: selectedPortfolio.id,
                                            brandIndex,
                                          })
                                        }}
                                      >
                                        Delete
                                      </button>
                              </div>
                              {isPickerOpen ? (
                                <div className="brand-color-picker">
                                  {BRAND_PALETTES.map((palette) => (
                                    <button
                                      key={palette.color}
                                      type="button"
                                      className={`brand-color-option${palette.color === brand.color ? ' is-selected' : ''}`}
                                      style={{ background: palette.color }}
                                      aria-label={`Select color ${palette.color}`}
                                      onClick={() => {
                                        updatePortfolio(
                                          selectedPortfolio.id,
                                          (currentPortfolio) => ({
                                            ...currentPortfolio,
                                            brands: currentPortfolio.brands.map((item, index) =>
                                              index === brandIndex
                                                ? {
                                                    ...item,
                                                    color: palette.color,
                                                    surfaceColor: palette.surfaceColor,
                                                    textColor: palette.textColor,
                                                  }
                                                : item,
                                            ),
                                          }),
                                        )
                                        setColorPickerOpenKey(null)
                                      }}
                                    />
                                  ))}
                                </div>
                              ) : null}
                            </Fragment>
                          )
                        })}
                      </div>
                    </div>

                    <div className="nested-settings-block organization-integration-row">
                      <div>
                        <div className="nested-settings-title">Drive webhook</div>
                        <p className="muted-copy">Used when creating folders for this portfolio.</p>
                      </div>
                      <label className="full-width">
                        <input
                          aria-label={`${selectedPortfolio.name} Drive webhook URL`}
                          value={selectedPortfolio.webhookUrl}
                          onChange={(event) =>
                            updatePortfolio(selectedPortfolio.id, (currentPortfolio) => ({
                              ...currentPortfolio,
                              webhookUrl: event.target.value,
                            }))
                          }
                          placeholder="https://script.google.com/macros/..."
                        />
                      </label>
                    </div>
                  </section>
                ) : null}
              </div>
            </div>
          </div>
        ) : null}

        {settingsTab === 'people' ? (
          <div className="settings-stack">
            <PeopleSection
              portfolios={state.portfolios}
              selectedPortfolioId={selectedPortfolioId}
              accessEntries={workspaceAccessEntries}
              accessStatus={workspaceAccessStatus}
              accessErrorMessage={workspaceAccessErrorMessage}
              accessPendingEmail={workspaceAccessPendingEmail}
              authEnabled={authEnabled}
              headerUtilityContent={headerUtilityContent}
              onAccessSave={onWorkspaceAccessSave}
              onAccessDelete={onWorkspaceAccessDelete}
              onPortfolioUpdate={updatePortfolio}
              showToast={showToast}
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
              onTaskTypeHoursChange={(taskTypeId, estimatedHours) =>
                onStateChange((current) => ({
                  ...current,
                  settings: {
                    ...current.settings,
                    taskLibrary: current.settings.taskLibrary.map((taskType) =>
                      taskType.id === taskTypeId ? { ...taskType, estimatedHours } : taskType,
                    ),
                  },
                }))
              }
              onAdNamingTemplateChange={(platform, template) =>
                onStateChange((current) => ({
                  ...current,
                  settings: {
                    ...current.settings,
                    adNamingTemplates: {
                      ...current.settings.adNamingTemplates,
                      [platform]: template,
                    },
                  },
                }))
              }
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
