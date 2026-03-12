import { formatDateTime } from '../board'

type SyncStatus = 'local' | 'loading' | 'syncing' | 'synced' | 'error'

interface SyncStatusPillProps {
  syncStatus: SyncStatus
  lastSyncedAt: string | null
}

function getSyncStatusLabel(syncStatus: SyncStatus, lastSyncedAt: string | null) {
  switch (syncStatus) {
    case 'local':
      return 'Local mode'
    case 'loading':
      return 'Syncing workspace...'
    case 'syncing':
      return 'Saving...'
    case 'error':
      return 'Sync issue'
    case 'synced':
      return lastSyncedAt ? `Synced ${formatDateTime(lastSyncedAt)}` : 'Synced'
  }
}

export function SyncStatusPill({ syncStatus, lastSyncedAt }: SyncStatusPillProps) {
  return (
    <span className={`sync-status-pill is-${syncStatus}`} role="status" aria-live="polite">
      {getSyncStatusLabel(syncStatus, lastSyncedAt)}
    </span>
  )
}
