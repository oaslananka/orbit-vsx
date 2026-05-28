import React, { useState, useEffect, useCallback } from 'react';
import { createRoot } from 'react-dom/client';

declare function acquireVsCodeApi(): {
  postMessage(message: unknown): void;
  getState(): unknown;
  setState(state: unknown): void;
};

interface AgentSkill {
  id: string;
  name: string;
  description: string;
}

interface AgentCard {
  name: string;
  description: string;
  version: string;
  url?: string;
  skills: AgentSkill[];
}

interface AgentRegistryEntry {
  card: AgentCard;
  online: boolean;
  lastSeen: string;
}

interface A2APayload {
  agents: AgentRegistryEntry[];
  localCards: string[];
}

const vscode = typeof acquireVsCodeApi !== 'undefined' ? acquireVsCodeApi() : null;

function App(): React.ReactElement {
  const [payload, setPayload] = useState<A2APayload | null>(null);
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
        <p>Loading agents...</p>
      </div>
    );
  }

  if (!payload || (payload.agents.length === 0 && payload.localCards.length === 0)) {
    return (
      <div style={styles.container}>
        <p style={styles.emptyState}>
          No agents found. Use "Discover" to find agents or scaffold a new one.
        </p>
      </div>
    );
  }

  return (
    <div style={styles.container}>
      {payload.agents.length > 0 && (
        <>
          <div style={styles.sectionTitle}>Registry Agents</div>
          {payload.agents.map((entry) => (
            <div
              key={entry.card.name}
              style={styles.card}
              onClick={() =>
                vscode?.postMessage({
                  type: 'command',
                  command: 'orbit.a2a.openCard',
                  data: { agentName: entry.card.name },
                })
              }
            >
              <div style={styles.cardHeader}>
                <span
                  style={{
                    ...styles.statusDot,
                    background: entry.online
                      ? 'var(--vscode-charts-green)'
                      : 'var(--vscode-charts-red)',
                  }}
                />
                <strong>{entry.card.name}</strong>
                <span style={styles.version}>v{entry.card.version}</span>
              </div>
              <p style={styles.description}>{entry.card.description}</p>
            </div>
          ))}
        </>
      )}

      {payload.localCards.length > 0 && (
        <>
          <div style={styles.sectionTitle}>Local Cards</div>
          {payload.localCards.map((fp) => (
            <div key={fp} style={styles.card}>
              <span>{fp}</span>
            </div>
          ))}
        </>
      )}
    </div>
  );
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
  version: { opacity: 0.5, fontSize: '0.85em' },
  description: { margin: 0, fontSize: '0.85em', opacity: 0.7 },
  emptyState: { opacity: 0.6, textAlign: 'center' as const, marginTop: '24px' },
};

document.addEventListener('DOMContentLoaded', () => {
  const rootEl = document.getElementById('root');
  if (rootEl) {
    const root = createRoot(rootEl);
    root.render(<App />);
  }
});
