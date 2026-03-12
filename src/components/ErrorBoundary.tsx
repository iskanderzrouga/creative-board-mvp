import { Component, type ErrorInfo, type ReactNode } from 'react'

interface ErrorBoundaryProps {
  children: ReactNode
}

interface ErrorBoundaryState {
  hasError: boolean
}

export class ErrorBoundary extends Component<ErrorBoundaryProps, ErrorBoundaryState> {
  state: ErrorBoundaryState = {
    hasError: false,
  }

  static getDerivedStateFromError() {
    return { hasError: true }
  }

  componentDidCatch(error: Error, errorInfo: ErrorInfo) {
    console.error('Editors Board render error', error, errorInfo)
  }

  render() {
    if (this.state.hasError) {
      return (
        <div
          style={{
            minHeight: '100vh',
            display: 'grid',
            placeItems: 'center',
            padding: '32px',
            background:
              'radial-gradient(circle at top, rgba(20, 184, 166, 0.12), transparent 45%), #f4f6fb',
            color: '#172033',
          }}
        >
          <div
            style={{
              width: 'min(100%, 520px)',
              borderRadius: '24px',
              padding: '32px',
              background: 'rgba(255, 255, 255, 0.96)',
              boxShadow: '0 24px 64px rgba(23, 32, 51, 0.16)',
            }}
          >
            <p style={{ margin: 0, fontSize: '12px', letterSpacing: '0.12em', textTransform: 'uppercase' }}>
              Editors Board
            </p>
            <h1 style={{ margin: '12px 0 0', fontSize: '32px', lineHeight: 1.1 }}>
              Something went wrong.
            </h1>
            <p style={{ margin: '16px 0 24px', fontSize: '16px', lineHeight: 1.6, color: '#52607a' }}>
              The app hit an unexpected error while rendering. Reload to get back to the last saved state.
            </p>
            <button
              type="button"
              className="primary-button"
              onClick={() => window.location.reload()}
            >
              Reload app
            </button>
          </div>
        </div>
      )
    }

    return this.props.children
  }
}
