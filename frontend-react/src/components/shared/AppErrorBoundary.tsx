import { Component, type ErrorInfo, type ReactNode } from 'react';

type Props = { children: ReactNode };
type State = { error: Error | null };

class AppErrorBoundary extends Component<Props, State> {
  state: State = { error: null };

  static getDerivedStateFromError(error: Error): State {
    return { error };
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    console.error('[Firefly renderer error]', error, info.componentStack);
  }

  render() {
    if (!this.state.error) return this.props.children;
    return <main className="app-error-fallback">
      <section>
        <span className="app-error-mark">✦</span>
        <p className="app-error-eyebrow">FIREFLY RECOVERY</p>
        <h1>页面暂时没有正确展开</h1>
        <p>你的本地数据没有被删除。可以先重新加载；若问题仍在，复制下方信息用于排查。</p>
        <pre>{this.state.error.message}</pre>
        <div><button onClick={() => window.location.reload()}>重新加载</button><button className="is-secondary" onClick={() => navigator.clipboard?.writeText(this.state.error?.stack || this.state.error?.message || '')}>复制错误信息</button></div>
      </section>
    </main>;
  }
}

export default AppErrorBoundary;
