import React, { useState, useEffect, useCallback } from 'react';
import { createRoot } from 'react-dom/client';
import { EmptyState } from '../components/EmptyState';

declare function acquireVsCodeApi(): {
  postMessage(message: unknown): void;
  getState(): unknown;
  setState(state: unknown): void;
};

interface FixAttempt {
  description: string;
  timestamp: string;
  success?: boolean;
}

interface CommandRecord {
  command: string;
  timestamp: string;
}

interface DebugSession {
  id: string;
  title: string;
  status: 'open' | 'resolved' | 'abandoned';
  errorText?: string;
  createdAt: string;
  tags: string[];
  fixes?: FixAttempt[];
  commands?: CommandRecord[];
}

const vscode = typeof acquireVsCodeApi !== 'undefined' ? acquireVsCodeApi() : null;

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
        <div style={styles.errorBox}>
          <strong>Something went wrong</strong>
          <pre style={{ marginTop: 8, fontSize: '0.85em' }}>{this.state.message}</pre>
          <button
            style={styles.btn}
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
  const [session, setSession] = useState<DebugSession | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [newFix, setNewFix] = useState('');

  const handleMessage = useCallback((event: MessageEvent) => {
    const msg = event.data as { type: string; payload: DebugSession & { message?: string } };
    if (msg.type === 'update') {
      setSession(msg.payload);
      setLoading(false);
      setError(null);
    }
    if (msg.type === 'error') {
      setError(msg.payload.message ?? 'Unknown error');
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    window.addEventListener('message', handleMessage);
    vscode?.postMessage({ type: 'ready' });
    return () => window.removeEventListener('message', handleMessage);
  }, [handleMessage]);

  if (loading) {
    return (
      <div style={styles.container}>
        <p style={{ opacity: 0.6 }}>Loading session…</p>
      </div>
    );
  }

  if (error) {
    return (
      <div style={styles.container}>
        <div style={styles.errorBox}>{error}</div>
      </div>
    );
  }

  if (!session) {
    return (
      <div style={styles.container}>
        <EmptyState
          icon="bug"
          title="No debug sessions"
          description="Start a session to track errors and fix attempts."
          actionLabel="New Session"
          onAction={() =>
            vscode?.postMessage({ type: 'command', command: 'orbit.debug.newSession' })
          }
        />
      </div>
    );
  }

  function submitFix() {
    if (!newFix.trim()) return;
    vscode?.postMessage({ type: 'addFix', description: newFix.trim() });
    setNewFix('');
  }

  const statusColors: Record<string, string> = {
    open: 'var(--vscode-charts-green)',
    resolved: 'var(--vscode-charts-blue, #3794ff)',
    abandoned: 'var(--vscode-charts-red)',
  };

  return (
    <div style={styles.container}>
      <div style={styles.header}>
        <h1 style={styles.title}>{session.title}</h1>
        <span
          style={{
            ...styles.badge,
            background: statusColors[session.status] ?? 'gray',
            color: '#fff',
          }}
        >
          {session.status.toUpperCase()}
        </span>
      </div>

      <div style={styles.meta}>
        <span>Created: {session.createdAt}</span>
        {session.tags.length > 0 && (
          <span style={{ marginLeft: 12 }}>
            {session.tags.map((t) => (
              <span key={t} style={styles.tag}>
                {t}
              </span>
            ))}
          </span>
        )}
      </div>

      {session.errorText && <div style={styles.errorText}>{session.errorText}</div>}

      <Section title={`Fix Attempts (${(session.fixes ?? []).length}`}>
        {(session.fixes ?? []).length === 0 ? (
          <p style={{ opacity: 0.5, margin: 0 }}>No fix attempts recorded.</p>
        ) : (
          (session.fixes ?? []).map((fix, i) => (
            <div key={i} style={styles.fixItem}>
              <span style={{ opacity: 0.5, fontSize: '0.8em', minWidth: 100 }}>
                {fix.timestamp}
              </span>
              <span>{fix.description}</span>
              {fix.success === true && (
                <span style={{ color: 'var(--vscode-charts-green)', marginLeft: 8 }}>✓</span>
              )}
              {fix.success === false && (
                <span style={{ color: 'var(--vscode-charts-red)', marginLeft: 8 }}>✗</span>
              )}
            </div>
          ))
        )}
        <div style={{ marginTop: 8, display: 'flex', gap: 6 }}>
          <input
            style={styles.input}
            value={newFix}
            onChange={(e) => setNewFix(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && submitFix()}
            placeholder="Describe fix attempt…"
          />
          <button style={styles.btn} onClick={submitFix}>
            Add
          </button>
        </div>
      </Section>

      <Section title={`Terminal Commands (${(session.commands ?? []).length}`}>
        {(session.commands ?? []).length === 0 ? (
          <p style={{ opacity: 0.5, margin: 0 }}>No commands recorded.</p>
        ) : (
          (session.commands ?? []).map((cmd, i) => (
            <div key={i} style={styles.cmdItem}>
              <span style={{ opacity: 0.4, fontSize: '0.75em', minWidth: 100 }}>
                {cmd.timestamp}
              </span>
              <code style={{ fontFamily: 'var(--vscode-editor-font-family)' }}>{cmd.command}</code>
            </div>
          ))
        )}
      </Section>
    </div>
  );
}

function Section({
  title,
  children,
}: {
  title: string;
  children: React.ReactNode;
}): React.ReactElement {
  return (
    <div style={styles.section}>
      <h2 style={styles.sectionTitle}>{title}</h2>
      {children}
    </div>
  );
}

const styles: Record<string, React.CSSProperties> = {
  container: {
    padding: '12px 16px',
    fontFamily: 'var(--vscode-font-family)',
    color: 'var(--vscode-editor-foreground)',
    background: 'var(--vscode-editor-background)',
    minHeight: '100vh',
  },
  header: { display: 'flex', alignItems: 'center', gap: 10, marginBottom: 4 },
  title: { fontSize: '1.3em', margin: 0, fontWeight: 600 },
  badge: {
    display: 'inline-block',
    padding: '2px 8px',
    borderRadius: 3,
    fontSize: '0.75em',
    fontWeight: 700,
    letterSpacing: 1,
  },
  meta: { fontSize: '0.85em', opacity: 0.6, marginBottom: 10 },
  tag: {
    display: 'inline-block',
    background: 'var(--vscode-badge-background)',
    color: 'var(--vscode-badge-foreground)',
    borderRadius: 3,
    padding: '1px 6px',
    fontSize: '0.8em',
    marginRight: 4,
  },
  errorText: {
    background: 'var(--vscode-inputValidation-errorBackground, rgba(255,0,0,0.1))',
    border: '1px solid var(--vscode-inputValidation-errorBorder, red)',
    borderRadius: 4,
    padding: '8px 12px',
    fontSize: '0.85em',
    marginBottom: 10,
    wordBreak: 'break-all',
  },
  section: {
    background: 'var(--vscode-list-hoverBackground)',
    borderRadius: 4,
    padding: '10px 12px',
    marginBottom: 10,
  },
  sectionTitle: { fontSize: '0.9em', fontWeight: 600, margin: '0 0 8px 0', opacity: 0.8 },
  fixItem: { display: 'flex', alignItems: 'baseline', gap: 8, padding: '3px 0', fontSize: '0.9em' },
  cmdItem: {
    display: 'flex',
    alignItems: 'baseline',
    gap: 8,
    padding: '2px 0',
    fontSize: '0.85em',
  },
  input: {
    flex: 1,
    background: 'var(--vscode-input-background)',
    color: 'var(--vscode-input-foreground)',
    border: '1px solid var(--vscode-input-border)',
    borderRadius: 3,
    padding: '3px 8px',
    fontSize: '0.9em',
    outline: 'none',
  },
  btn: {
    background: 'var(--vscode-button-background)',
    color: 'var(--vscode-button-foreground)',
    border: 'none',
    borderRadius: 3,
    padding: '4px 12px',
    cursor: 'pointer',
    fontSize: '0.9em',
  },
  errorBox: {
    background: 'var(--vscode-inputValidation-errorBackground, rgba(255,0,0,0.1))',
    border: '1px solid var(--vscode-inputValidation-errorBorder)',
    borderRadius: 4,
    padding: 12,
    margin: 12,
  },
};

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
