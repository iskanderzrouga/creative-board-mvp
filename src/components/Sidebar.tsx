import { memo, type ComponentType, type SVGProps } from 'react'
import type { ActiveRole, AppPage, Portfolio } from '../board'
import {
  AnalyticsIcon,
  BoardIcon,
  SettingsIcon,
  WorkloadIcon,
} from './icons/AppIcons'

interface SidebarProps {
  expanded: boolean
  page: AppPage
  portfolio: Portfolio | null
  portfolios: Portfolio[]
  role: ActiveRole
  userName: string
  userSecondaryLabel: string | null
  signOutPending?: boolean
  attention: {
    hasAttention: boolean
  }
  onTogglePinned: () => void
  onPortfolioChange: (portfolioId: string) => void
  onPageChange: (page: AppPage) => void
  onSignOut?: () => void
}

type PageIcon = ComponentType<SVGProps<SVGSVGElement>>

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

function getPageIcon(page: AppPage): PageIcon {
  switch (page) {
    case 'board':
      return BoardIcon
    case 'analytics':
      return AnalyticsIcon
    case 'workload':
      return WorkloadIcon
    case 'settings':
      return SettingsIcon
  }
}

function getRoleLabel(mode: ActiveRole['mode']) {
  switch (mode) {
    case 'manager':
      return 'Manager'
    case 'editor':
      return 'Editor'
    case 'observer':
      return 'Observer'
  }
}

function SidebarComponent({
  expanded,
  page,
  portfolio,
  portfolios,
  role,
  userName,
  userSecondaryLabel,
  signOutPending = false,
  attention,
  onTogglePinned,
  onPortfolioChange,
  onPageChange,
  onSignOut,
}: SidebarProps) {
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
  const avatarSource = userName || userSecondaryLabel || 'User'
  const avatarInitial = avatarSource.charAt(0).toUpperCase() || 'U'

  return (
    <aside className={`app-sidebar ${expanded ? 'is-expanded' : ''}`}>
      <div className="sidebar-top">
        <button
          type="button"
          className="sidebar-pin"
          aria-label={expanded ? 'Collapse sidebar' : 'Expand sidebar'}
          onClick={onTogglePinned}
        >
          {expanded ? '←' : '→'}
        </button>
      </div>

      <nav className="sidebar-nav">
        {navItems.map((item) => {
          const Icon = getPageIcon(item.page)

          return (
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
              aria-label={getPageLabel(item.page)}
            >
              <span className="sidebar-nav-icon">
                {item.page === 'board' && attention.hasAttention ? (
                  <span className="sidebar-alert-dot" />
                ) : null}
                <Icon />
              </span>
              {expanded ? <span>{getPageLabel(item.page)}</span> : null}
            </button>
          )
        })}
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

      <div className="sidebar-user-shell">
        <div className="sidebar-user-info" title={userSecondaryLabel ?? userName}>
          <div className="sidebar-user-avatar" aria-hidden="true">
            {avatarInitial}
          </div>
          {expanded ? (
            <div className="sidebar-user-details">
              <span className="sidebar-user-name">{userName}</span>
              {userSecondaryLabel ? (
                <span className="sidebar-user-secondary">{userSecondaryLabel}</span>
              ) : null}
            </div>
          ) : null}
        </div>

        {expanded ? (
          <div className="sidebar-user-actions">
            <span className={`sidebar-user-role role-${role.mode}`}>{getRoleLabel(role.mode)}</span>
            {onSignOut ? (
              <button
                type="button"
                className="clear-link sidebar-signout"
                disabled={signOutPending}
                onClick={onSignOut}
              >
                {signOutPending ? 'Signing out...' : 'Sign out'}
              </button>
            ) : (
              <span className="sidebar-user-secondary">Local demo access</span>
            )}
          </div>
        ) : null}
      </div>
    </aside>
  )
}

export const Sidebar = memo(SidebarComponent)
