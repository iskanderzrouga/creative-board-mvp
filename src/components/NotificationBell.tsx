import { useState, useRef, useEffect } from 'react'
import { formatRelativeTime, type AppNotification } from '../board'
import { BellIcon, XIcon } from './icons/AppIcons'

interface NotificationBellProps {
  notifications: AppNotification[]
  onMarkRead: (id: string) => void
  onMarkAllRead: () => void
  onDismiss: (id: string) => void
  onNotificationClick: (notification: AppNotification) => void
}

export function NotificationBell({
  notifications,
  onMarkRead,
  onMarkAllRead,
  onDismiss,
  onNotificationClick,
}: NotificationBellProps) {
  const [open, setOpen] = useState(false)
  const containerRef = useRef<HTMLDivElement>(null)
  const unreadCount = notifications.filter((n) => !n.read).length

  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (containerRef.current && !containerRef.current.contains(event.target as Node)) {
        setOpen(false)
      }
    }
    if (open) {
      document.addEventListener('mousedown', handleClickOutside)
      return () => document.removeEventListener('mousedown', handleClickOutside)
    }
  }, [open])

  // Sort newest first, limit to 50
  const sorted = [...notifications]
    .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())
    .slice(0, 50)

  return (
    <div className="notification-bell-container" ref={containerRef}>
      <button
        type="button"
        className="ghost-button notification-bell-trigger"
        aria-label={`Notifications${unreadCount > 0 ? ` (${unreadCount} unread)` : ''}`}
        onClick={() => setOpen(!open)}
      >
        <BellIcon />
        {unreadCount > 0 ? (
          <span className="notification-badge">{unreadCount > 99 ? '99+' : unreadCount}</span>
        ) : null}
      </button>

      {open ? (
        <div className="notification-panel">
          <div className="notification-panel-header">
            <h3>Notifications</h3>
            {unreadCount > 0 ? (
              <button
                type="button"
                className="clear-link notification-mark-all"
                onClick={() => onMarkAllRead()}
              >
                Mark all read
              </button>
            ) : null}
          </div>

          {sorted.length === 0 ? (
            <div className="notification-empty">
              <p>No notifications yet</p>
            </div>
          ) : (
            <div className="notification-list">
              {sorted.map((notification) => (
                <div
                  key={notification.id}
                  className={`notification-item ${notification.read ? '' : 'is-unread'}`}
                  onClick={() => {
                    if (!notification.read) {
                      onMarkRead(notification.id)
                    }
                    onNotificationClick(notification)
                    setOpen(false)
                  }}
                  role="button"
                  tabIndex={0}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') {
                      if (!notification.read) onMarkRead(notification.id)
                      onNotificationClick(notification)
                      setOpen(false)
                    }
                  }}
                >
                  <span
                    className={`notification-type-dot notification-type-${notification.type}`}
                  />
                  <div className="notification-content">
                    <p className="notification-message">{notification.message}</p>
                    <span className="notification-time">
                      {formatRelativeTime(notification.createdAt)}
                    </span>
                  </div>
                  <button
                    type="button"
                    className="notification-dismiss"
                    aria-label="Dismiss notification"
                    onClick={(e) => {
                      e.stopPropagation()
                      onDismiss(notification.id)
                    }}
                  >
                    <XIcon />
                  </button>
                </div>
              ))}
            </div>
          )}
        </div>
      ) : null}
    </div>
  )
}
