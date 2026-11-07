import { Component, type ReactNode } from 'react'

/**
 * Catches a screen that fails to render, so the app shows a recovery card instead of going blank.
 * Saved data is untouched: works, scores, and signatures live on disk, not in this screen's state.
 * Only an error code goes to the diagnostics log, never the message (it could contain names).
 */
export class ErrorBoundary extends Component<
  { children: ReactNode; resetKey?: unknown; onHome?: () => void },
  { failed: boolean; prevKey: unknown }
> {
  state = { failed: false, prevKey: this.props.resetKey }

  static getDerivedStateFromError() {
    return { failed: true }
  }

  static getDerivedStateFromProps(props: { resetKey?: unknown }, state: { failed: boolean; prevKey: unknown }) {
    // Moving to another tab clears the error.
    return props.resetKey !== state.prevKey ? { failed: false, prevKey: props.resetKey } : null
  }

  componentDidCatch() {
    void window.api?.reportError?.('RENDER_ERROR')
  }

  render() {
    if (!this.state.failed) return this.props.children
    return (
      <section className="card error-screen" role="alert">
        <h2>화면을 표시하지 못했습니다</h2>
        <p className="hint">
          저장된 성적과 서명은 그대로 있습니다. 다시 시도해도 같으면 처음 화면에서 작업을 다시 여세요.
        </p>
        <div className="row">
          <button className="btn" onClick={() => this.setState({ failed: false })}>
            다시 시도
          </button>
          <button
            className="btn primary"
            onClick={() => {
              this.setState({ failed: false })
              if (this.props.onHome) this.props.onHome()
              else window.location.reload()
            }}
          >
            처음 화면으로
          </button>
        </div>
      </section>
    )
  }
}
