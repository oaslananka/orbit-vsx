import React, { useState, useEffect, useCallback } from 'react';
import { createRoot } from 'react-dom/client';

declare function acquireVsCodeApi(): {
  postMessage(message: unknown): void;
  getState(): unknown;
  setState(state: unknown): void;
};

const vscode = typeof acquireVsCodeApi !== 'undefined' ? acquireVsCodeApi() : null;

interface TaskItem {
  id: string;
  title: string;
  status: 'pending' | 'in_progress' | 'completed' | 'failed';
  description?: string;
}

interface TaskUpdate {
  tasks: TaskItem[];
}

const statusColors: Record<string, string> = {
  pending: 'var(--vscode-charts-yellow)',
  in_progress: 'var(--vscode-charts-blue)',
  completed: 'var(--vscode-charts-green)',
  failed: 'var(--vscode-charts-red)',
};

class ErrorBoundary extends React.Component<
  { children: React.ReactNode },
  { hasError: boolean; message: string }
> {
  constructor(props: { children: React.ReactNode }) {
    super(props);
    this.state = { hasError: false, message: '' };
  }
  static getDerivedStateFromError(error: Error) {
    return { hasError: true, message: error.message };
  }
  render() {
    if (this.state.hasError) {
      return (
        <div style={{ padding: 16, color: 'var(--vscode-errorForeground)' }}>
          <strong>Something went wrong</strong>
          <pre style={{ marginTop: 8, fontSize: '0.85em' }}>{this.state.message}</pre>
          <button
            style={{
              background: 'var(--vscode-button-background)',
              color: 'var(--vscode-button-foreground)',
              border: 'none',
              borderRadius: 3,
              padding: '4px 12px',
              cursor: 'pointer',
              marginTop: 8,
            }}
            onClick={() => this.setState({ hasError: false, message: '' })}
          >
            Retry
          </button>
        </div>
      );
    }
    return this.props.children;
  }
}

function App(): React.ReactElement {
  const [data, setData] = useState<TaskUpdate | null>(null);
  const [loading, setLoading] = useState(true);

  const handleMessage = useCallback((event: MessageEvent) => {
    const msg = event.data as { type: string; payload: TaskUpdate };
    if (msg.type === 'update') {
      setData(msg.payload);
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    window.addEventListener('message', handleMessage);
    vscode?.postMessage({ type: 'ready' });
    return () => window.removeEventListener('message', handleMessage);
  }, [handleMessage]);

  return (
    <div
      style={{
        padding: 12,
        fontFamily: 'var(--vscode-font-family)',
        color: 'var(--vscode-editor-foreground)',
      }}
    >
      <h1 style={{ fontSize: '1.1em', fontWeight: 600, margin: '0 0 8px' }}>Tasks</h1>
      {loading && <p style={{ opacity: 0.5 }}>Loading tasks…</p>}
      {!loading && (!data || data.tasks.length === 0) && (
        <p style={{ opacity: 0.5 }}>No tasks found.</p>
      )}
      {data?.tasks.map((t) => (
        <div
          key={t.id}
          style={{
            background: 'var(--vscode-list-hoverBackground)',
            borderRadius: 4,
            padding: '8px 10px',
            marginBottom: 4,
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <span
              style={{
                width: 8,
                height: 8,
                borderRadius: '50%',
                background: statusColors[t.status] ?? 'gray',
                display: 'inline-block',
                flexShrink: 0,
              }}
            />
            <span style={{ fontWeight: 500 }}>{t.title}</span>
          </div>
          {t.description && (
            <div style={{ fontSize: '0.8em', opacity: 0.6, marginTop: 4, marginLeft: 16 }}>
              {t.description}
            </div>
          )}
        </div>
      ))}
    </div>
  );
}

document.addEventListener('DOMContentLoaded', () => {
  const rootEl = document.getElementById('root');
  if (rootEl) {
    const root = createRoot(rootEl);
    root.render(
      <ErrorBoundary>
        <App />
      </ErrorBoundary>
    );
  }
});
