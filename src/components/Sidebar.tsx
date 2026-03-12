import { memo } from 'react'
import type { ActiveRole, AppPage, Portfolio, TeamMember } from '../board'

interface SidebarProps {
  expanded: boolean
  page: AppPage
  portfolio: Portfolio | null
  portfolios: Portfolio[]
  role: ActiveRole
  lockedRole: ActiveRole | null
  editorOptions: TeamMember[]
  editorMenuOpen: boolean
  attention: {
    hasAttention: boolean
  }
  onTogglePinned: () => void
  onPortfolioChange: (portfolioId: string) => void
  onPageChange: (page: AppPage) => void
  onRoleChange: (role: ActiveRole) => void
  onToggleEditorMenu: () => void
}

function getPageLabel(page: AppPage) {
  switch (page) {
    case 'board':
      return 'Board'
    case 'analytics':
      return 'Analytics'
    case 'workload':
      return 'Workload'
    case 'settings':
      return 'Settings'
  }
}

function getPageIcon(page: AppPage) {
  switch (page) {
    case 'board':
      return '📋'
    case 'analytics':
      return '📊'
    case 'workload':
      return '👥'
    case 'settings':
      return '⚙️'
  }
}

function SidebarComponent({
  expanded,
  page,
  portfolio,
  portfolios,
  role,
  lockedRole,
  editorOptions,
  editorMenuOpen,
  attention,
  onTogglePinned,
  onPortfolioChange,
  onPageChange,
  onRoleChange,
  onToggleEditorMenu,
}: SidebarProps) {
  const canChooseManager = !lockedRole || lockedRole.mode === 'manager'
  const canChooseEditor = !lockedRole || lockedRole.mode === 'editor'
  const canChooseObserver = !lockedRole || lockedRole.mode === 'observer'
  const lockedEditorId = lockedRole?.mode === 'editor' ? lockedRole.editorId : null
  const navItems: Array<{
    page: AppPage
    disabled: boolean
    tooltip?: string
  }> = [
    { page: 'board', disabled: false },
    {
      page: 'analytics',
      disabled: role.mode === 'editor',
      tooltip: role.mode === 'editor' ? 'Manager and Observer only' : undefined,
    },
    {
      page: 'workload',
      disabled: role.mode === 'editor',
      tooltip: role.mode === 'editor' ? 'Manager and Observer only' : undefined,
    },
    {
      page: 'settings',
      disabled: role.mode !== 'manager',
      tooltip: role.mode !== 'manager' ? 'Manager only' : undefined,
    },
  ]

  return (
    <aside className={`app-sidebar ${expanded ? 'is-expanded' : ''}`}>
      <div className="sidebar-top">
        <button type="button" className="sidebar-pin" onClick={onTogglePinned}>
          {expanded ? '←' : '→'}
        </button>
      </div>

      <nav className="sidebar-nav">
        {navItems.map((item) => (
          <button
            key={item.page}
            type="button"
            className={`sidebar-nav-item ${page === item.page ? 'is-active' : ''}`}
            onClick={() => {
              if (!item.disabled) {
                onPageChange(item.page)
              }
            }}
            disabled={item.disabled}
            title={item.tooltip}
          >
            <span className="sidebar-nav-icon">
              {item.page === 'board' && attention.hasAttention ? (
                <span className="sidebar-alert-dot" />
              ) : null}
              {getPageIcon(item.page)}
            </span>
            {expanded ? <span>{getPageLabel(item.page)}</span> : null}
          </button>
        ))}
      </nav>

      <div className="sidebar-section">
        <label className="sidebar-label">Portfolio</label>
        <select
          className="sidebar-select"
          value={portfolio?.id ?? portfolios[0]?.id ?? ''}
          onChange={(event) => onPortfolioChange(event.target.value)}
        >
          {portfolios.map((item) => (
            <option key={item.id} value={item.id}>
              {item.name}
            </option>
          ))}
        </select>
      </div>

      <div className="sidebar-section">
        <label className="sidebar-label">Role</label>
        <div className="sidebar-role-stack">
          <button
            type="button"
            className={`role-segment ${role.mode === 'manager' ? 'is-active' : ''}`}
            onClick={() => onRoleChange({ mode: 'manager', editorId: role.editorId })}
            disabled={!canChooseManager}
            title={!canChooseManager ? 'Your account access is fixed by the workspace admin.' : undefined}
          >
            {expanded ? 'Manager' : 'M'}
          </button>
          <div className="sidebar-editor-picker">
            <button
              type="button"
              className={`role-segment ${role.mode === 'editor' ? 'is-active' : ''}`}
              onClick={() => {
                if (canChooseEditor && !lockedEditorId) {
                  onToggleEditorMenu()
                }
              }}
              disabled={!canChooseEditor || Boolean(lockedEditorId)}
              title={
                !canChooseEditor
                  ? 'Your account access is fixed by the workspace admin.'
                  : lockedEditorId
                    ? 'Your editor lane is assigned by the workspace admin.'
                    : undefined
              }
            >
              {expanded
                ? role.mode === 'editor'
                  ? `Editor: ${
                      editorOptions.find((member) => member.id === role.editorId)?.name ?? 'Select'
                    }`
                  : 'Editor'
                : 'E'}
              {expanded && !lockedEditorId ? <span className="segment-caret">▾</span> : null}
            </button>
            {editorMenuOpen && !lockedEditorId ? (
              <div className="sidebar-editor-menu">
                {editorOptions.map((member) => (
                  <button
                    key={member.id}
                    type="button"
                    className="sidebar-editor-item"
                    onClick={() => onRoleChange({ mode: 'editor', editorId: member.id })}
                  >
                    {member.name}
                  </button>
                ))}
              </div>
            ) : null}
          </div>
          <button
            type="button"
            className={`role-segment ${role.mode === 'observer' ? 'is-active' : ''}`}
            onClick={() => onRoleChange({ mode: 'observer', editorId: role.editorId })}
            disabled={!canChooseObserver}
            title={!canChooseObserver ? 'Your account access is fixed by the workspace admin.' : undefined}
          >
            {expanded ? 'Observer' : 'O'}
          </button>
        </div>
      </div>
    </aside>
  )
}

export const Sidebar = memo(SidebarComponent)
