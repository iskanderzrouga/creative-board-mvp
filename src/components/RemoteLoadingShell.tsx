interface RemoteLoadingShellProps {
  email: string
  signOutPending: boolean
  onSignOut: () => void
}

const SKELETON_COLUMNS = ['Backlog', 'Briefed', 'In Production'] as const

export function RemoteLoadingShell({
  email,
  signOutPending,
  onSignOut,
}: RemoteLoadingShellProps) {
  return (
    <div className="app-frame remote-loading-frame" aria-busy="true">
      <div className="remote-loading-sidebar">
        <span className="auth-kicker">Editors Board</span>
        <h2>Shared workspace</h2>
        <p>Syncing the latest remote state before the board opens.</p>
      </div>

      <div className="main-shell">
        <div className="page-shell remote-loading-page">
          <div className="page-header remote-loading-toolbar">
            <div>
              <h1>Loading your latest board</h1>
              <p className="remote-loading-copy">
                We are restoring the newest shared workspace so you land on the same version as the
                rest of the team.
              </p>
            </div>

            <div className="session-toolbar">
              <span className="sync-status-pill is-loading">Loading shared workspace</span>
              <span className="session-email">{email}</span>
              <button
                type="button"
                className="ghost-button"
                disabled={signOutPending}
                onClick={onSignOut}
              >
                {signOutPending ? 'Signing out...' : 'Sign out'}
              </button>
            </div>
          </div>

          <section className="stats-bar remote-loading-stats" aria-hidden="true">
            <span className="remote-loading-chip skeleton-block" />
            <span className="remote-loading-chip skeleton-block" />
            <span className="remote-loading-chip skeleton-block" />
          </section>

          <main className="board-scroll">
            <div className="remote-loading-columns" aria-hidden="true">
              {SKELETON_COLUMNS.map((column) => (
                <section key={column} className="stage-column remote-loading-column">
                  <div className="stage-column-header">
                    <div className="remote-loading-title skeleton-block" />
                  </div>
                  <div className="stage-column-content">
                    <div className="remote-loading-card skeleton-block" />
                    <div className="remote-loading-card skeleton-block" />
                    <div className="remote-loading-card short skeleton-block" />
                  </div>
                </section>
              ))}
            </div>
          </main>
        </div>
      </div>
    </div>
  )
}
