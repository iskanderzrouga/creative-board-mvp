export function RemoteLoadingShell() {
  return (
    <div className="app-frame remote-loading-frame" aria-busy="true">
      <div
        className="remote-loading-center"
        role="status"
        aria-label="Loading board"
        aria-live="polite"
      >
        <span className="remote-loading-mark" aria-hidden="true" />
        <span className="remote-loading-label">Loading board</span>
      </div>
    </div>
  )
}
