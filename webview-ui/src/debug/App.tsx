import React, { useState, useEffect, useCallback } from 'react';
import { createRoot } from 'react-dom/client';

declare function acquireVsCodeApi(): {
  postMessage(message: unknown): void;
  getState(): unknown;
  setState(state: unknown): void;
};

interface DebugSession {
  id: string;
  title: string;
  status: 'open' | 'resolved' | 'abandoned';
  errorText?: string;
  createdAt: string;
  tags: string[];
}

interface DebugPayload {
  sessions: DebugSession[];
}

const vscode = typeof acquireVsCodeApi !== 'undefined' ? acquireVsCodeApi() : null;

const statusColors: Record<string, string> = {
  open: 'var(--vscode-charts-green)',
  resolved: 'var(--vscode-charts-blue, #3794ff)',
  abandoned: 'var(--vscode-charts-red)',
};

function App(): React.ReactElement {
  const [payload, setPayload] = useState<DebugPayload | null>(null);
  const [loading, setLoading] = useState(true);

  const handleMessage = useCallback((event: MessageEvent) => {
    const message = event.data;
    if (message.type === 'update' && message.payload) {
      setPayload(message.payload);
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    window.addEventListener('message', handleMessage);
    return () => window.removeEventListener('message', handleMessage);
  }, [handleMessage]);

  if (loading) {
    return (
      <div style={styles.container}>
        <p>Loading sessions...</p>
      </div>
    );
  }

  if (!payload || payload.sessions.length === 0) {
    return (
      <div style={styles.container}>
        <p style={styles.emptyState}>No debug sessions yet. Use "New Session" to start tracking.</p>
      </div>
    );
  }

  const active = payload.sessions.filter((s) => s.status === 'open');
  const recent = payload.sessions.filter((s) => s.status !== 'open');

  return (
    <div style={styles.container}>
      {renderSection('Active', active)}
      {renderSection('Recent', recent)}
    </div>
  );

  function renderSection(title: string, sessions: DebugSession[]): React.ReactNode {
    if (sessions.length === 0) return null;
    return (
      <>
        <div style={styles.sectionTitle}>{title}</div>
        {sessions.map((session) => (
          <div
            key={session.id}
            style={styles.card}
            onClick={() =>
              vscode?.postMessage({
                type: 'command',
                command: 'orbit.debug.openSession',
                data: { sessionId: session.id },
              })
            }
          >
            <div style={styles.cardHeader}>
              <span
                style={{
                  ...styles.statusDot,
                  background: statusColors[session.status] ?? 'gray',
                }}
              />
              <strong>{session.title}</strong>
            </div>
            <div style={styles.cardBody}>
              <span>{session.createdAt}</span>
              {session.tags.length > 0 && (
                <span style={styles.tags}>{session.tags.join(', ')}</span>
              )}
            </div>
            {session.errorText && <div style={styles.errorText}>{session.errorText}</div>}
          </div>
        ))}
      </>
    );
  }
}

const styles: Record<string, React.CSSProperties> = {
  container: {
    padding: '8px',
    fontFamily: 'var(--vscode-font-family)',
    color: 'var(--vscode-editor-foreground)',
    background: 'var(--vscode-editor-background)',
    minHeight: '100vh',
  },
  sectionTitle: {
    fontWeight: 600,
    fontSize: '0.85em',
    textTransform: 'uppercase',
    opacity: 0.6,
    padding: '8px 8px 4px',
  },
  card: {
    padding: '8px 12px',
    marginBottom: '2px',
    borderRadius: '4px',
    cursor: 'pointer',
  },
  cardHeader: {
    display: 'flex',
    alignItems: 'center',
    gap: '8px',
    marginBottom: '4px',
  },
  statusDot: {
    width: '8px',
    height: '8px',
    borderRadius: '50%',
    display: 'inline-block',
    flexShrink: 0,
  },
  cardBody: {
    fontSize: '0.85em',
    opacity: 0.7,
    display: 'flex',
    justifyContent: 'space-between',
    gap: '8px',
  },
  tags: { opacity: 0.5 },
  errorText: {
    fontSize: '0.85em',
    color: 'var(--vscode-charts-red)',
    marginTop: '4px',
    padding: '4px 8px',
    background: 'var(--vscode-input-background)',
    borderRadius: '3px',
    overflow: 'hidden',
    textOverflow: 'ellipsis',
    whiteSpace: 'nowrap',
  },
  emptyState: { opacity: 0.6, textAlign: 'center' as const, marginTop: '24px' },
};

document.addEventListener('DOMContentLoaded', () => {
  const rootEl = document.getElementById('root');
  if (rootEl) {
    const root = createRoot(rootEl);
    root.render(<App />);
  }
});
