import { memo, type ComponentType, type SVGProps } from 'react'
import type { ActiveRole, AppPage, Portfolio } from '../board'
import {
  AnalyticsIcon,
  BoardIcon,
  SettingsIcon,
  WorkloadIcon,
} from './icons/AppIcons'

type ExtendedPage = AppPage | 'backlog' | 'strategy' | 'finance'

interface SidebarProps {
  expanded: boolean
  page: ExtendedPage
  portfolio: Portfolio | null
  portfolios: Portfolio[]
  role: ActiveRole
  isDeveloperUser: boolean
  canAccessBacklog: boolean
  canAccessPerformance: boolean
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

function PulseIcon(props: SVGProps<SVGSVGElement>) {
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
      <path d="M4 12h3l2-4 4 8 2-4h5" />
      <path d="M4.5 6.5h15a1.5 1.5 0 0 1 1.5 1.5v8a1.5 1.5 0 0 1-1.5 1.5h-15A1.5 1.5 0 0 1 3 16V8a1.5 1.5 0 0 1 1.5-1.5Z" />
    </svg>
  )
}

function StrategyIcon(props: SVGProps<SVGSVGElement>) {
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
      <path d="M4.5 6.5h15A1.5 1.5 0 0 1 21 8v8a1.5 1.5 0 0 1-1.5 1.5h-15A1.5 1.5 0 0 1 3 16V8a1.5 1.5 0 0 1 1.5-1.5Z" />
      <path d="M7.5 14.5v-3" />
      <path d="M12 14.5V10" />
      <path d="M16.5 14.5V8.5" />
    </svg>
  )
}


function FinanceIcon(props: SVGProps<SVGSVGElement>) {
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
      <path d="M12 3v18" />
      <path d="M16.5 7.5c0-1.7-1.9-3-4.5-3s-4.5 1.3-4.5 3 1.9 3 4.5 3 4.5 1.3 4.5 3-1.9 3-4.5 3-4.5-1.3-4.5-3" />
    </svg>
  )
}

function getPageLabel(page: ExtendedPage) {
  if (page === 'backlog') {
    return 'Backlog'
  }
  if (page === 'strategy') {
    return 'Strategy'
  }
  if (page === 'finance') {
    return 'Performance'
  }

  switch (page) {
    case 'board':
      return 'Board'
    case 'analytics':
      return 'Analytics'
    case 'workload':
      return 'Workload'
    case 'pulse':
      return 'Daily Pulse'
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
  if (page === 'strategy') {
    return StrategyIcon
  }
  if (page === 'finance') {
    return FinanceIcon
  }

  switch (page) {
    case 'board':
      return BoardIcon
    case 'analytics':
      return AnalyticsIcon
    case 'workload':
      return WorkloadIcon
    case 'pulse':
      return PulseIcon
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
  isDeveloperUser,
  canAccessBacklog,
  canAccessPerformance,
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
  }> = isDeveloperUser
    ? [
        { page: 'board', disabled: false },
        { page: 'pulse', disabled: false },
        { page: 'settings', disabled: false },
      ]
    : [
        ...(canAccessBacklog && canAccessAllPages ? [{ page: 'backlog' as const, disabled: false }] : []),
        ...(canAccessAllPages ? [{ page: 'strategy' as const, disabled: false }] : []),
        ...(canAccessPerformance ? [{ page: 'finance' as const, disabled: false }] : []),
        { page: 'board', disabled: false },
        { page: 'pulse', disabled: false },
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

      {portfolios.length > 1 ? (
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
      ) : null}

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
              <span className="sidebar-user-secondary">Demo/local access</span>
            )}
          </div>
        ) : null}
      </div>
    </aside>
  )
}

export const Sidebar = memo(SidebarComponent)
