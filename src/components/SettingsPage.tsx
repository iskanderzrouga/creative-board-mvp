import { useState, type ReactNode, type RefObject } from 'react'
import { ConfirmDialog } from './ConfirmDialog'
import { PageHeader } from './PageHeader'
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
  type AppState,
  type Portfolio,
  type RoleMode,
  type SettingTab,
} from '../board'

type ToastTone = 'green' | 'amber' | 'red' | 'blue'
type WorkspaceDirectoryStatus = 'idle' | 'loading' | 'ready' | 'error'
type PendingSettingsDelete =
  | { kind: 'portfolio'; portfolioId: string }
  | { kind: 'brand'; portfolioId: string; brandIndex: number }
  | { kind: 'member'; portfolioId: string; memberIndex: number }

interface SettingsPageProps {
  state: AppState
  settingsTab: SettingTab
  settingsPortfolioId: string
  importInputRef: RefObject<HTMLInputElement | null>
  headerUtilityContent?: ReactNode
  workspaceAccessEntries: WorkspaceAccessEntry[]
  workspaceAccessStatus: WorkspaceDirectoryStatus
  workspaceAccessErrorMessage: string | null
  workspaceAccessPendingEmail: string | null
  onTabChange: (tab: SettingTab) => void
  onSettingsPortfolioChange: (portfolioId: string) => void
  onBackToBoard: () => void
  onStateChange: (updater: (state: AppState) => AppState) => void
  onExportData: () => void
  onImportClick: () => void
  onResetData: () => void
  onClearAllData: () => void
  onWorkspaceAccessSave: (entry: {
    email: string
    roleMode: RoleMode
    editorName: string | null
    previousEmail?: string
  }) => Promise<void>
  onWorkspaceAccessDelete: (email: string) => Promise<void>
  showToast: (message: string, tone: ToastTone) => void
}

export function SettingsPage({
  state,
  settingsTab,
  settingsPortfolioId,
  importInputRef,
  headerUtilityContent,
  workspaceAccessEntries,
  workspaceAccessStatus,
  workspaceAccessErrorMessage,
  workspaceAccessPendingEmail,
  onTabChange,
  onSettingsPortfolioChange,
  onBackToBoard,
  onStateChange,
  onExportData,
  onImportClick,
  onResetData,
  onClearAllData,
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
  const [pendingSettingsDelete, setPendingSettingsDelete] = useState<PendingSettingsDelete | null>(null)
  const teamRoleOptions = Array.from(
    new Set(
      ['Manager', 'Editor', 'Designer', 'Launch Ops', ...state.portfolios.flatMap((portfolio) =>
        portfolio.team.map((member) => member.role),
      )].filter(Boolean),
    ),
  ).sort((left, right) => left.localeCompare(right))
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

  function updatePortfolio(portfolioId: string, updater: (portfolio: Portfolio) => Portfolio) {
    onStateChange((current) => ({
      ...current,
      portfolios: current.portfolios.map((portfolio) =>
        portfolio.id === portfolioId ? updater(portfolio) : portfolio,
      ),
    }))
  }

  function getAllBrandPrefixes(excluding?: { portfolioId: string; brandIndex: number }) {
    const prefixes: string[] = []
    state.portfolios.forEach((portfolio) => {
      portfolio.brands.forEach((brand, brandIndex) => {
        if (excluding && excluding.portfolioId === portfolio.id && excluding.brandIndex === brandIndex) {
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

  function confirmSettingsDelete() {
    if (!pendingSettingsDelete) {
      return
    }

    if (pendingSettingsDelete.kind === 'portfolio') {
      onStateChange((current) => removePortfolioFromAppState(current, pendingSettingsDelete.portfolioId))
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
      const portfolio = state.portfolios.find((item) => item.id === pendingSettingsDelete.portfolioId)
      if (!portfolio) {
        return null
      }

      return {
        title: `Delete ${portfolio.name}?`,
        message: (
          <p>
            This removes the portfolio and all cards, brands, and team assignments inside it.
          </p>
        ),
        confirmLabel: 'Delete portfolio',
      }
    }

    if (pendingSettingsDelete.kind === 'brand') {
      const portfolio = state.portfolios.find((item) => item.id === pendingSettingsDelete.portfolioId)
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

    const portfolio = state.portfolios.find((item) => item.id === pendingSettingsDelete.portfolioId)
    const member = portfolio?.team[pendingSettingsDelete.memberIndex]
    if (!portfolio || !member) {
      return null
    }

    return {
      title: `Delete ${member.name}?`,
      message: <p>This removes the team member from {portfolio.name}.</p>,
      confirmLabel: 'Delete member',
    }
  }

  const settingsDeleteDialog = getSettingsDeleteDialog()

  return (
    <div className="settings-page">
      <div className="settings-page-sidebar">
        <button type="button" className="ghost-button settings-back" onClick={onBackToBoard}>
          ← Back to Board
        </button>
        <div className="settings-tab-list">
          {(Object.keys(SETTINGS_TAB_LABELS) as SettingTab[]).map((tab) => (
            <button
              key={tab}
              type="button"
              className={`settings-tab ${settingsTab === tab ? 'is-active' : ''}`}
              onClick={() => onTabChange(tab)}
            >
              {SETTINGS_TAB_LABELS[tab]}
            </button>
          ))}
        </div>
      </div>

      <div className="settings-page-content">
        <PageHeader title="Settings" rightContent={headerUtilityContent} />

        {settingsTab === 'general' ? (
          <div className="settings-block">
            <div className="settings-form-grid">
              <label>
                <span>App name</span>
                <input
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
                <span>Default portfolio on startup</span>
                <select
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
                <input value="Light" disabled />
              </label>
              <label>
                <span>Amber warning at days</span>
                <input
                  type="number"
                  min={1}
                  value={state.settings.general.timeInStageThresholds.amberStart}
                  onChange={(event) =>
                    onStateChange((current) => ({
                      ...current,
                      settings: {
                        ...current.settings,
                        general: {
                          ...current.settings.general,
                          timeInStageThresholds: {
                            ...current.settings.general.timeInStageThresholds,
                            amberStart: Number(event.target.value) || 1,
                          },
                        },
                      },
                    }))
                  }
                />
              </label>
              <label>
                <span>Red warning at days</span>
                <input
                  type="number"
                  min={1}
                  value={state.settings.general.timeInStageThresholds.redStart}
                  onChange={(event) =>
                    onStateChange((current) => ({
                      ...current,
                      settings: {
                        ...current.settings,
                        general: {
                          ...current.settings.general,
                          timeInStageThresholds: {
                            ...current.settings.general.timeInStageThresholds,
                            redStart: Number(event.target.value) || 1,
                          },
                        },
                      },
                    }))
                  }
                />
              </label>
              <label className="toggle-row">
                <span>Auto-archive Live cards</span>
                <input
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
            </div>
          </div>
        ) : null}

        {settingsTab === 'portfolios' ? (
          <div className="settings-stack">
            {state.portfolios.map((portfolio) => (
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
                    <span>{collapsedPortfolioIds.includes(portfolio.id) ? '▸' : '▾'}</span>
                    <input
                      className="portfolio-title-input"
                      value={portfolio.name}
                      onChange={(event) =>
                        updatePortfolio(portfolio.id, (currentPortfolio) => ({
                          ...currentPortfolio,
                          name: event.target.value,
                        }))
                      }
                      onClick={(event) => event.stopPropagation()}
                    />
                  </button>
                  <div className="task-type-actions">
                    <button
                      type="button"
                      className="clear-link danger-link"
                    onClick={() => {
                      if (state.portfolios.length === 1) {
                        showToast('At least one portfolio is required', 'red')
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
                </div>
                {!collapsedPortfolioIds.includes(portfolio.id) ? (
                  <>
                    <div className="nested-settings-block">
                      <div className="nested-settings-title">Brands</div>
                      <div className="settings-table full-table">
                        <div className="settings-row settings-head brand-head">
                          <span>Name</span>
                          <span>Prefix</span>
                          <span>Products</span>
                          <span>Drive Folder ID</span>
                          <span />
                        </div>
                        {portfolio.brands.map((brand, brandIndex) => (
                          <div key={`${portfolio.id}-${brand.prefix}-${brandIndex}`} className="settings-row brand-row">
                            <input
                              value={brand.name}
                              onChange={(event) =>
                                updatePortfolio(portfolio.id, (currentPortfolio) =>
                                  renameBrandInPortfolio(currentPortfolio, brandIndex, event.target.value),
                                )
                              }
                            />
                            <input
                              value={brand.prefix}
                              onChange={(event) => {
                                const nextPrefix = event.target.value.toUpperCase().slice(0, 2)
                                if (
                                  nextPrefix &&
                                  getAllBrandPrefixes({ portfolioId: portfolio.id, brandIndex }).includes(nextPrefix)
                                ) {
                                  showToast('Brand prefixes must be unique across all portfolios', 'red')
                                  return
                                }
                                updatePortfolio(portfolio.id, (currentPortfolio) => ({
                                  ...currentPortfolio,
                                  brands: currentPortfolio.brands.map((item, index) =>
                                    index === brandIndex ? { ...item, prefix: nextPrefix } : item,
                                  ),
                                }))
                              }}
                            />
                            <input
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
                              value={brand.driveParentFolderId}
                              onChange={(event) =>
                                updatePortfolio(portfolio.id, (currentPortfolio) => ({
                                  ...currentPortfolio,
                                  brands: currentPortfolio.brands.map((item, index) =>
                                    index === brandIndex ? { ...item, driveParentFolderId: event.target.value } : item,
                                  ),
                                }))
                              }
                            />
                            <button
                              type="button"
                              className="clear-link"
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
                                name: 'New Brand',
                                prefix: nextPrefix,
                                products: ['New Product'],
                                driveParentFolderId: '',
                                color: '#94a3b8',
                                surfaceColor: '#e2e8f0',
                                textColor: '#334155',
                              },
                            ],
                            lastIdPerPrefix: {
                              ...currentPortfolio.lastIdPerPrefix,
                              [nextPrefix]: currentPortfolio.lastIdPerPrefix[nextPrefix] ?? 0,
                            },
                          }))
                        }}
                      >
                        + Add Brand
                      </button>
                    </div>

                    <div className="nested-settings-block">
                      <div className="nested-settings-title">Drive Webhook</div>
                      <label className="full-width">
                        <div className="integration-inline">
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
                        </div>
                      </label>
                      <p className="muted-copy">
                        Save the receiving webhook URL here. Validate delivery from the destination
                        service during deployment instead of using a fake in-app test.
                      </p>
                    </div>
                  </>
                ) : null}
              </div>
            ))}

            <button
              type="button"
              className="ghost-button"
              onClick={() =>
                onStateChange((current) => ({
                  ...current,
                  portfolios: [...current.portfolios, createEmptyPortfolio('New Portfolio', current.portfolios.length)],
                }))
              }
            >
              + Add Portfolio
            </button>
          </div>
        ) : null}

        {settingsTab === 'team' ? (
          <div className="settings-stack">
            <div className="portfolio-tab-strip">
              {state.portfolios.map((portfolio) => (
                <button
                  key={portfolio.id}
                  type="button"
                  className={`filter-pill ${settingsPortfolio.id === portfolio.id ? 'is-active is-all' : ''}`}
                  onClick={() => onSettingsPortfolioChange(portfolio.id)}
                >
                  {portfolio.name}
                </button>
              ))}
            </div>

            <div className="settings-table full-table">
              <div className="settings-row settings-head team-head">
                <span>Name</span>
                <span>Role</span>
                <span>Weekly Hours</span>
                <span>Hours/Day</span>
                <span>Working Days</span>
                <span>Timezone</span>
                <span>WIP Cap</span>
                <span>Status</span>
                <span />
              </div>
              {settingsPortfolio.team.map((member, memberIndex) => (
                <div key={`${settingsPortfolio.id}-${member.id}-${memberIndex}`} className="settings-row team-row">
                  <input
                    aria-label={`${member.name} team member name`}
                    value={member.name}
                    onChange={(event) =>
                      updatePortfolio(settingsPortfolio.id, (currentPortfolio) =>
                        renameTeamMemberInPortfolio(currentPortfolio, memberIndex, event.target.value),
                      )
                    }
                  />
                  <select
                    aria-label={`${member.name} role`}
                    value={member.role}
                    onChange={(event) => {
                      const nextRole = event.target.value
                      const removingLastManager =
                        member.role.toLowerCase().includes('manager') &&
                        !nextRole.toLowerCase().includes('manager') &&
                        settingsPortfolio.team.filter(
                          (item, index) => index !== memberIndex && item.role.toLowerCase().includes('manager'),
                        ).length === 0

                      if (removingLastManager) {
                        showToast('At least one manager is required.', 'amber')
                        return
                      }

                      updatePortfolio(settingsPortfolio.id, (currentPortfolio) => ({
                        ...currentPortfolio,
                        team: currentPortfolio.team.map((item, index) =>
                          index === memberIndex ? { ...item, role: nextRole } : item,
                          ),
                      }))
                    }}
                  >
                    {teamRoleOptions.map((roleOption) => (
                      <option key={roleOption} value={roleOption}>
                        {roleOption}
                      </option>
                    ))}
                  </select>
                  <input
                    aria-label={`${member.name} weekly hours`}
                    type="number"
                    min={0}
                    value={member.weeklyHours ?? ''}
                    onChange={(event) =>
                      updatePortfolio(settingsPortfolio.id, (currentPortfolio) => ({
                        ...currentPortfolio,
                        team: currentPortfolio.team.map((item, index) =>
                          index === memberIndex
                            ? { ...item, weeklyHours: event.target.value ? Number(event.target.value) : null }
                            : item,
                        ),
                      }))
                    }
                  />
                  <input
                    aria-label={`${member.name} hours per day`}
                    type="number"
                    min={0}
                    step={0.5}
                    value={member.hoursPerDay ?? ''}
                    onChange={(event) =>
                      updatePortfolio(settingsPortfolio.id, (currentPortfolio) => ({
                        ...currentPortfolio,
                        team: currentPortfolio.team.map((item, index) =>
                          index === memberIndex
                            ? { ...item, hoursPerDay: event.target.value ? Number(event.target.value) : null }
                            : item,
                        ),
                      }))
                    }
                  />
                  <div className="working-days-grid" aria-label={`${member.name} working days`}>
                    {WORKING_DAYS.map((day) => (
                      <label key={day} className="working-day-toggle">
                        <input
                          type="checkbox"
                          aria-label={`${member.name} works ${day}`}
                          checked={member.workingDays.includes(day)}
                          onChange={(event) =>
                            updatePortfolio(settingsPortfolio.id, (currentPortfolio) => ({
                              ...currentPortfolio,
                              team: currentPortfolio.team.map((item, index) =>
                                index === memberIndex
                                  ? {
                                      ...item,
                                      workingDays: WORKING_DAYS.filter((workingDay) =>
                                        workingDay === day
                                          ? event.target.checked
                                          : item.workingDays.includes(workingDay),
                                      ),
                                    }
                                  : item,
                              ),
                            }))
                          }
                        />
                        <span>{day}</span>
                      </label>
                    ))}
                  </div>
                  <input
                    aria-label={`${member.name} timezone`}
                    list="timezone-options"
                    value={member.timezone}
                    onChange={(event) =>
                      updatePortfolio(settingsPortfolio.id, (currentPortfolio) => ({
                        ...currentPortfolio,
                        team: currentPortfolio.team.map((item, index) =>
                          index === memberIndex ? { ...item, timezone: event.target.value } : item,
                        ),
                      }))
                    }
                    placeholder="Asia/Bangkok"
                  />
                  <input
                    aria-label={`${member.name} WIP cap`}
                    type="number"
                    min={0}
                    value={member.wipCap ?? ''}
                    onChange={(event) =>
                      updatePortfolio(settingsPortfolio.id, (currentPortfolio) => ({
                        ...currentPortfolio,
                        team: currentPortfolio.team.map((item, index) =>
                          index === memberIndex ? { ...item, wipCap: event.target.value ? Number(event.target.value) : null } : item,
                        ),
                      }))
                    }
                  />
                  <label className="toggle-row compact">
                    <input
                      type="checkbox"
                      aria-label={`${member.name} active status`}
                      checked={member.active}
                      onChange={(event) =>
                        updatePortfolio(settingsPortfolio.id, (currentPortfolio) => ({
                          ...currentPortfolio,
                          team: currentPortfolio.team.map((item, index) =>
                            index === memberIndex ? { ...item, active: event.target.checked } : item,
                          ),
                        }))
                      }
                    />
                  </label>
                  <button
                    type="button"
                    className="clear-link danger-link"
                    onClick={() => {
                      const blocker = getTeamMemberRemovalBlocker(settingsPortfolio, memberIndex)
                      if (blocker) {
                        showToast(blocker, 'amber')
                        return
                      }
                      setPendingSettingsDelete({
                        kind: 'member',
                        portfolioId: settingsPortfolio.id,
                        memberIndex,
                      })
                    }}
                  >
                    Delete
                  </button>
                </div>
              ))}
              <datalist id="timezone-options">
                {timezoneOptions.map((timezone) => (
                  <option key={timezone} value={timezone} />
                ))}
              </datalist>
            </div>

            <button
              type="button"
              className="ghost-button"
              onClick={() =>
                updatePortfolio(settingsPortfolio.id, (currentPortfolio) => ({
                  ...currentPortfolio,
                  team: [
                    ...currentPortfolio.team,
                    {
                      id: `member-${Date.now()}`,
                      name: 'New Member',
                      role: 'Editor',
                      weeklyHours: currentPortfolio.team.some((member) => member.weeklyHours)
                        ? currentPortfolio.team.find((member) => member.weeklyHours)?.weeklyHours ?? 40
                        : 40,
                      hoursPerDay: 8,
                      workingDays: ['Mon', 'Tue', 'Wed', 'Thu', 'Fri'],
                      timezone: Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC',
                      wipCap: 3,
                      active: true,
                    },
                  ],
                }))
              }
            >
              + Add team member
            </button>

            <WorkspaceAccessManager
              entries={workspaceAccessEntries}
              editorOptions={workspaceEditorOptions}
              status={workspaceAccessStatus}
              errorMessage={workspaceAccessErrorMessage}
              pendingEmail={workspaceAccessPendingEmail}
              onSave={onWorkspaceAccessSave}
              onDelete={onWorkspaceAccessDelete}
            />
          </div>
        ) : null}

        {settingsTab === 'task-library' ? (
          <div className="settings-stack">
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

        {settingsTab === 'capacity' ? (
          <div className="settings-block">
            <div className="settings-form-grid">
              <label>
                <span>Default weekly hours</span>
                <input
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
                <span>Green max %</span>
                <input
                  type="number"
                  min={1}
                  value={state.settings.capacity.utilizationThresholds.greenMax}
                  onChange={(event) =>
                    onStateChange((current) => ({
                      ...current,
                      settings: {
                        ...current.settings,
                        capacity: {
                          ...current.settings.capacity,
                          utilizationThresholds: {
                            ...current.settings.capacity.utilizationThresholds,
                            greenMax: Number(event.target.value) || 1,
                          },
                        },
                      },
                    }))
                  }
                />
              </label>
              <label>
                <span>Yellow max %</span>
                <input
                  type="number"
                  min={1}
                  value={state.settings.capacity.utilizationThresholds.yellowMax}
                  onChange={(event) =>
                    onStateChange((current) => ({
                      ...current,
                      settings: {
                        ...current.settings,
                        capacity: {
                          ...current.settings.capacity,
                          utilizationThresholds: {
                            ...current.settings.capacity.utilizationThresholds,
                            yellowMax: Number(event.target.value) || 1,
                          },
                        },
                      },
                    }))
                  }
                />
              </label>
              <label>
                <span>Red min %</span>
                <input
                  type="number"
                  min={1}
                  value={state.settings.capacity.utilizationThresholds.redMin}
                  onChange={(event) =>
                    onStateChange((current) => ({
                      ...current,
                      settings: {
                        ...current.settings,
                        capacity: {
                          ...current.settings.capacity,
                          utilizationThresholds: {
                            ...current.settings.capacity.utilizationThresholds,
                            redMin: Number(event.target.value) || 1,
                          },
                        },
                      },
                    }))
                  }
                />
              </label>
            </div>
          </div>
        ) : null}

        {settingsTab === 'integrations' ? (
          <div className="settings-block">
            <div className="settings-form-grid">
              <label className="full-width">
                <span>Global Google Drive webhook</span>
                <div className="integration-inline">
                  <input
                    aria-label="Global Google Drive webhook"
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
                  />
                </div>
                <span className="muted-copy">
                  Save the shared fallback webhook here. Verify delivery from the receiving service
                  or during the live rollout instead of relying on a placeholder test button.
                </span>
              </label>
              <div className="placeholder-card">
                <strong>Frame.io</strong>
                <span>Coming soon — Frame.io webhook integration for automatic review link detection</span>
              </div>
              <div className="placeholder-card">
                <strong>Slack</strong>
                <span>Coming soon — Slack notifications for card updates</span>
              </div>
            </div>
          </div>
        ) : null}

        {settingsTab === 'data' ? (
          <div className="settings-block">
            <div className="data-actions">
              <button type="button" className="primary-button" onClick={onExportData}>
                Export board data
              </button>
              <button type="button" className="ghost-button" onClick={onImportClick}>
                Import board data
              </button>
              <button type="button" className="ghost-button danger-outline" onClick={onResetData}>
                Reset to seed data
              </button>
              <button type="button" className="ghost-button danger-outline" onClick={onClearAllData}>
                Clear all data
              </button>
              <input ref={importInputRef} type="file" accept="application/json" hidden />
            </div>
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
