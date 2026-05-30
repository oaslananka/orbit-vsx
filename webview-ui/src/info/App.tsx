import React, { useState, useEffect, useCallback } from 'react';
import { createRoot } from 'react-dom/client';

declare function acquireVsCodeApi(): {
  postMessage(message: unknown): void;
  getState(): unknown;
  setState(state: unknown): void;
};

const vscode = typeof acquireVsCodeApi !== 'undefined' ? acquireVsCodeApi() : null;

interface InfoMessage {
  type: string;
  payload?: Record<string, unknown>;
}

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
  const [messages, setMessages] = useState<InfoMessage[]>([]);

  const handleMessage = useCallback((event: MessageEvent) => {
    const msg = event.data as InfoMessage;
    setMessages((prev) => [...prev, msg]);
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
      <h1 style={{ fontSize: '1.1em', fontWeight: 600, margin: '0 0 8px' }}>Info</h1>
      {messages.length === 0 && <p style={{ opacity: 0.5 }}>Waiting for messages…</p>}
      {messages.map((m, i) => (
        <div
          key={i}
          style={{
            background: 'var(--vscode-list-hoverBackground)',
            borderRadius: 4,
            padding: '6px 10px',
            marginBottom: 4,
            fontSize: '0.85em',
          }}
        >
          <strong>{m.type}</strong>
          {m.payload && (
            <pre style={{ margin: '4px 0 0', fontSize: '0.8em', opacity: 0.7 }}>
              {JSON.stringify(m.payload, null, 2)}
            </pre>
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
