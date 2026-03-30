import { memo, type ComponentType, type SVGProps } from 'react'
import type { ActiveRole, AppPage, Portfolio } from '../board'
import {
  AnalyticsIcon,
  BoardIcon,
  SettingsIcon,
  WorkloadIcon,
} from './icons/AppIcons'

type ExtendedPage = AppPage | 'backlog' | 'dev'

interface SidebarProps {
  expanded: boolean
  page: ExtendedPage
  portfolio: Portfolio | null
  portfolios: Portfolio[]
  role: ActiveRole
  canAccessBacklog: boolean
  userName: string
  userSecondaryLabel: string | null
  signOutPending?: boolean
  attention: {
    hasAttention: boolean
  }
  onTogglePinned: () => void
  onPortfolioChange: (portfolioId: string) => void
  onPageChange: (page: ExtendedPage) => void
  onSignOut?: () => void
}

type PageIcon = ComponentType<SVGProps<SVGSVGElement>>

function BacklogIcon(props: SVGProps<SVGSVGElement>) {
  return (
    <svg
      viewBox="0 0 24 24"
      width="1em"
      height="1em"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      {...props}
    >
      <path d="M6 4.5h9.5L19 8v11a1.5 1.5 0 0 1-1.5 1.5h-11A1.5 1.5 0 0 1 5 19V6A1.5 1.5 0 0 1 6.5 4.5Z" />
      <path d="M15.5 4.5V8H19" />
      <path d="M8.5 11h7" />
      <path d="M8.5 14.5h7" />
    </svg>
  )
}

function DevIcon(props: SVGProps<SVGSVGElement>) {
  return (
    <svg
      viewBox="0 0 24 24"
      width="1em"
      height="1em"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      {...props}
    >
      <path d="M12 2.5 3.5 7v10L12 21.5 20.5 17V7L12 2.5Z" />
      <path d="M8.5 10.5 11 13l4.5-4.5" />
    </svg>
  )
}

function ScriptsIcon(props: SVGProps<SVGSVGElement>) {
  return (
    <svg
      viewBox="0 0 24 24"
      width="1em"
      height="1em"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      {...props}
    >
      <path d="M6 4.5h12a1.5 1.5 0 0 1 1.5 1.5v12A1.5 1.5 0 0 1 18 19.5H6A1.5 1.5 0 0 1 4.5 18V6A1.5 1.5 0 0 1 6 4.5Z" />
      <path d="M8 9h8" />
      <path d="M8 12.5h8" />
      <path d="M8 16h5" />
    </svg>
  )
}

function getPageLabel(page: ExtendedPage) {
  if (page === 'backlog') {
    return 'Backlog'
  }
  if (page === 'dev') {
    return 'Dev Board'
  }

  switch (page) {
    case 'board':
      return 'Board'
    case 'analytics':
      return 'Analytics'
    case 'workload':
      return 'Workload'
    case 'scripts':
      return 'Script Workshop'
    case 'settings':
      return 'Settings'
  }
}

function getPageIcon(page: ExtendedPage): PageIcon {
  if (page === 'backlog') {
    return BacklogIcon
  }
  if (page === 'dev') {
    return DevIcon
  }

  switch (page) {
    case 'board':
      return BoardIcon
    case 'analytics':
      return AnalyticsIcon
    case 'workload':
      return WorkloadIcon
    case 'scripts':
      return ScriptsIcon
    case 'settings':
      return SettingsIcon
  }
}

function getRoleLabel(mode: ActiveRole['mode']) {
  switch (mode) {
    case 'owner':
      return 'Owner'
    case 'manager':
      return 'Manager'
    case 'contributor':
      return 'Contributor'
    case 'viewer':
      return 'Viewer'
  }
}

function SidebarComponent({
  expanded,
  page,
  portfolio,
  portfolios,
  role,
  canAccessBacklog,
  userName,
  userSecondaryLabel,
  signOutPending = false,
  attention,
  onTogglePinned,
  onPortfolioChange,
  onPageChange,
  onSignOut,
}: SidebarProps) {
  const canAccessAllPages = role.mode === 'owner' || role.mode === 'manager'
  const canAccessWorkload = role.mode === 'owner' || role.mode === 'manager' || role.mode === 'contributor'
  const navItems: Array<{
    page: ExtendedPage
    disabled: boolean
    tooltip?: string
  }> = [
    ...(canAccessBacklog && canAccessAllPages ? [{ page: 'backlog' as const, disabled: false }] : []),
    ...(canAccessAllPages ? [{ page: 'dev' as const, disabled: false }] : []),
    { page: 'board', disabled: false },
    ...(canAccessAllPages ? [{ page: 'scripts' as const, disabled: false }] : []),
    ...(canAccessAllPages ? [{ page: 'analytics' as const, disabled: false }] : []),
    ...(canAccessWorkload ? [{ page: 'workload' as const, disabled: false }] : []),
    ...(canAccessAllPages ? [{ page: 'settings' as const, disabled: false }] : []),
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
