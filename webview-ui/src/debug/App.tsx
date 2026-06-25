import React, { useCallback, useEffect, useState } from 'react';
import { createRoot } from 'react-dom/client';
import { EmptyState } from '../components/EmptyState';

declare function acquireVsCodeApi(): {
  postMessage(message: unknown): void;
  getState(): unknown;
  setState(state: unknown): void;
};

interface FixAttempt {
  id: string;
  description: string;
  timestamp: string;
  successful: boolean;
}

interface TerminalCommand {
  command: string;
  timestamp: string;
  exitCode?: number;
}

interface DebugSession {
  id: string;
  title: string;
  status: 'open' | 'resolved' | 'abandoned';
  errorText?: string;
  description?: string;
  createdAt: string;
  updatedAt: string;
  tags: string[];
  fixAttempts: FixAttempt[];
  terminalCommands: TerminalCommand[];
}

type DebugMessage =
  | { type: 'update'; payload: DebugSession }
  | { type: 'error'; payload: { message?: string } };

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
          <strong>Debug view failed</strong>
          <p>{this.state.message}</p>
        </div>
      );
    }
    return this.props.children;
  }
}

function Section({ children, title }: { children: React.ReactNode; title: string }) {
  return (
    <section style={styles.section}>
      <h2 style={styles.sectionTitle}>{title}</h2>
      {children}
    </section>
  );
}

function formatExitCode(command: TerminalCommand): string {
  return command.exitCode === undefined ? 'exit unknown' : `exit ${command.exitCode}`;
}

function App() {
  const [session, setSession] = useState<DebugSession | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [newFix, setNewFix] = useState('');

  useEffect(() => {
    const handler = (event: MessageEvent<DebugMessage>) => {
      const message = event.data;
      if (message.type === 'update') {
        setSession(message.payload);
        setError(null);
        return;
      }
      if (message.type === 'error') {
        setError(message.payload.message ?? 'Unknown debug panel error');
      }
    };

    window.addEventListener('message', handler);
    vscode?.postMessage({ type: 'ready' });
    return () => window.removeEventListener('message', handler);
  }, []);

  const submitFix = useCallback(() => {
    const description = newFix.trim();
    if (!description) return;
    vscode?.postMessage({ type: 'addFix', description });
    setNewFix('');
  }, [newFix]);

  if (error) {
    return (
      <main style={styles.container}>
        <div style={styles.errorBox}>{error}</div>
      </main>
    );
  }

  if (!session) {
    return (
      <main style={styles.container}>
        <EmptyState
          icon="bug"
          title="No debug sessions"
          description="Open a debug session from the Orbit Debug panel to inspect errors and fixes."
          actionLabel="Start Debug Session"
          onAction={() =>
            vscode?.postMessage({ type: 'command', command: 'orbit.debug.newSession' })
          }
        />
      </main>
    );
  }

  const statusColors: Record<DebugSession['status'], string> = {
    open: '#3b82f6',
    resolved: '#16a34a',
    abandoned: '#6b7280',
  };

  return (
    <main style={styles.container}>
      <header style={styles.header}>
        <div>
          <h1 style={styles.title}>{session.title}</h1>
          <div style={styles.meta}>
            <span>Created: {session.createdAt}</span>
            <span>Updated: {session.updatedAt}</span>
          </div>
        </div>
        <span style={{ ...styles.badge, background: statusColors[session.status] }}>
          {session.status.toUpperCase()}
        </span>
      </header>

      {session.tags.length > 0 && (
        <div style={styles.tags}>
          {session.tags.map((tag) => (
            <span key={tag} style={styles.tag}>
              {tag}
            </span>
          ))}
        </div>
      )}

      {session.description && <p style={styles.description}>{session.description}</p>}
      {session.errorText && <pre style={styles.errorText}>{session.errorText}</pre>}

      <Section title={`Fix Attempts (${session.fixAttempts.length})`}>
        {session.fixAttempts.length === 0 ? (
          <p style={styles.muted}>No fix attempts recorded yet.</p>
        ) : (
          session.fixAttempts.map((fix) => (
            <article key={fix.id} style={styles.card}>
              <div style={styles.cardHeader}>
                <strong>{fix.successful ? 'Successful fix' : 'Attempted fix'}</strong>
                <span style={styles.muted}>{fix.timestamp}</span>
              </div>
              <p>{fix.description}</p>
            </article>
          ))
        )}
        <div style={styles.formRow}>
          <textarea
            value={newFix}
            onChange={(event) => setNewFix(event.target.value)}
            placeholder="Describe a fix attempt…"
            style={styles.textarea}
          />
          <button style={styles.button} onClick={submitFix} disabled={newFix.trim().length === 0}>
            Add Fix
          </button>
        </div>
      </Section>

      <Section title={`Terminal Commands (${session.terminalCommands.length})`}>
        {session.terminalCommands.length === 0 ? (
          <p style={styles.muted}>No terminal commands recorded yet.</p>
        ) : (
          session.terminalCommands.map((command, index) => (
            <article key={`${command.timestamp}-${index}`} style={styles.card}>
              <code>{command.command}</code>
              <div style={styles.meta}>
                <span>{command.timestamp}</span>
                <span>{formatExitCode(command)}</span>
              </div>
            </article>
          ))
        )}
      </Section>
    </main>
  );
}

const styles: Record<string, React.CSSProperties> = {
  badge: {
    borderRadius: 999,
    color: '#fff',
    fontSize: 11,
    fontWeight: 700,
    padding: '4px 8px',
  },
  button: {
    marginTop: 8,
    padding: '6px 10px',
  },
  card: {
    border: '1px solid var(--vscode-panel-border)',
    borderRadius: 8,
    marginTop: 8,
    padding: 12,
  },
  cardHeader: {
    alignItems: 'center',
    display: 'flex',
    justifyContent: 'space-between',
    gap: 12,
  },
  container: {
    color: 'var(--vscode-foreground)',
    fontFamily: 'var(--vscode-font-family)',
    padding: 20,
  },
  description: {
    opacity: 0.85,
  },
  errorBox: {
    background: 'var(--vscode-inputValidation-errorBackground)',
    border: '1px solid var(--vscode-inputValidation-errorBorder)',
    borderRadius: 8,
    color: 'var(--vscode-inputValidation-errorForeground)',
    padding: 12,
  },
  errorText: {
    background: 'var(--vscode-textCodeBlock-background)',
    borderRadius: 8,
    overflowX: 'auto',
    padding: 12,
    whiteSpace: 'pre-wrap',
  },
  formRow: {
    display: 'flex',
    flexDirection: 'column',
    marginTop: 12,
  },
  header: {
    alignItems: 'flex-start',
    display: 'flex',
    gap: 16,
    justifyContent: 'space-between',
  },
  meta: {
    display: 'flex',
    flexWrap: 'wrap',
    gap: 12,
    opacity: 0.7,
    fontSize: 12,
    marginTop: 4,
  },
  muted: {
    opacity: 0.65,
  },
  section: {
    marginTop: 24,
  },
  sectionTitle: {
    fontSize: 15,
    margin: '0 0 8px',
  },
  tag: {
    border: '1px solid var(--vscode-panel-border)',
    borderRadius: 999,
    fontSize: 12,
    padding: '2px 8px',
  },
  tags: {
    display: 'flex',
    flexWrap: 'wrap',
    gap: 6,
    marginTop: 12,
  },
  textarea: {
    background: 'var(--vscode-input-background)',
    border: '1px solid var(--vscode-input-border)',
    color: 'var(--vscode-input-foreground)',
    minHeight: 72,
    padding: 8,
    resize: 'vertical',
  },
  title: {
    fontSize: 20,
    margin: 0,
  },
};

createRoot(document.getElementById('root')!).render(
  <ErrorBoundary>
    <App />
  </ErrorBoundary>
);
