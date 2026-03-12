import { useState, type ReactNode, type RefObject } from 'react'
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
  type WorkingDay,
} from '../board'

type ToastTone = 'green' | 'amber' | 'red' | 'blue'
type WorkspaceDirectoryStatus = 'idle' | 'loading' | 'ready' | 'error'

interface SettingsPageProps {
  state: AppState
  settingsTab: SettingTab
  settingsPortfolioId: string
  importInputRef: RefObject<HTMLInputElement | null>
  testingWebhookId: string | null
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
  onTestWebhook: (scope: string, url: string) => void
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
  testingWebhookId,
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
  onTestWebhook,
  onWorkspaceAccessSave,
  onWorkspaceAccessDelete,
  showToast,
}: SettingsPageProps) {
  const settingsPortfolio =
    state.portfolios.find((portfolio) => portfolio.id === settingsPortfolioId) ??
    state.portfolios[0]
  const [collapsedPortfolioIds, setCollapsedPortfolioIds] = useState<string[]>([])
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
                        if (!window.confirm(`Delete ${portfolio.name}?`)) {
                          return
                        }
                        onStateChange((current) => removePortfolioFromAppState(current, portfolio.id))
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
                                if (!window.confirm(`Delete ${brand.name}?`)) {
                                  return
                                }
                                updatePortfolio(portfolio.id, (currentPortfolio) =>
                                  removeBrandFromPortfolio(currentPortfolio, brandIndex),
                                )
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
                      <div className="integration-inline">
                        <input
                          value={portfolio.webhookUrl}
                          onChange={(event) =>
                            updatePortfolio(portfolio.id, (currentPortfolio) => ({
                              ...currentPortfolio,
                              webhookUrl: event.target.value,
                            }))
                          }
                          placeholder="https://script.google.com/macros/..."
                        />
                        <button
                          type="button"
                          className="primary-button"
                          disabled={!portfolio.webhookUrl || testingWebhookId === portfolio.id}
                          onClick={() => onTestWebhook(portfolio.id, portfolio.webhookUrl)}
                        >
                          {testingWebhookId === portfolio.id ? 'Testing...' : 'Test Connection'}
                        </button>
                      </div>
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
                    value={member.name}
                    onChange={(event) =>
                      updatePortfolio(settingsPortfolio.id, (currentPortfolio) =>
                        renameTeamMemberInPortfolio(currentPortfolio, memberIndex, event.target.value),
                      )
                    }
                  />
                  <input
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
                  />
                  <input
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
                  <input
                    value={member.workingDays.join(', ')}
                    onChange={(event) =>
                      updatePortfolio(settingsPortfolio.id, (currentPortfolio) => ({
                        ...currentPortfolio,
                        team: currentPortfolio.team.map((item, index) =>
                          index === memberIndex
                            ? {
                                ...item,
                                workingDays: event.target.value
                                  .split(',')
                                  .map((day) => day.trim())
                                  .filter((day): day is WorkingDay => WORKING_DAYS.includes(day as WorkingDay)),
                              }
                            : item,
                        ),
                      }))
                    }
                    placeholder="Mon, Tue, Wed, Thu, Fri"
                  />
                  <input
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
                      if (!window.confirm(`Delete ${member.name}?`)) {
                        return
                      }
                      updatePortfolio(settingsPortfolio.id, (currentPortfolio) =>
                        removeTeamMemberFromPortfolio(currentPortfolio, memberIndex),
                      )
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
                  <button
                    type="button"
                    className="primary-button"
                    disabled={!state.settings.integrations.globalDriveWebhookUrl || testingWebhookId === 'global-drive'}
                    onClick={() => onTestWebhook('global-drive', state.settings.integrations.globalDriveWebhookUrl)}
                  >
                    {testingWebhookId === 'global-drive' ? 'Testing...' : 'Test'}
                  </button>
                </div>
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
      </div>
    </div>
  )
}
