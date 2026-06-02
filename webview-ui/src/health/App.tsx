import React, { useState, useEffect, useCallback } from 'react';
import { createRoot } from 'react-dom/client';
import { EmptyState } from '../components/EmptyState';

declare function acquireVsCodeApi(): {
  postMessage(message: unknown): void;
  getState(): unknown;
  setState(state: unknown): void;
};

interface McpServer {
  name: string;
  url: string;
  status: 'up' | 'down' | 'degraded';
  uptime: number;
  latencyMs: number;
  lastCheck: string;
}

interface HealthPayload {
  servers: McpServer[];
  summary: { total: number; up: number; down: number; degraded: number };
}

const vscode = typeof acquireVsCodeApi !== 'undefined' ? acquireVsCodeApi() : null;

const statusColors: Record<string, string> = {
  up: 'var(--vscode-charts-green)',
  down: 'var(--vscode-charts-red)',
  degraded: 'var(--vscode-charts-yellow)',
};

function App(): React.ReactElement {
  const [payload, setPayload] = useState<HealthPayload | null>(null);
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
        <p>Loading health data...</p>
      </div>
    );
  }

  if (!payload || payload.servers.length === 0) {
    return (
      <div style={styles.container}>
        <EmptyState
          icon="pulse"
          title="No servers connected"
          description="Add a health-monitor-mcp endpoint to start monitoring."
          actionLabel="Add Server"
          onAction={() =>
            vscode?.postMessage({ type: 'command', command: 'orbit.health.addServer' })
          }
        />
      </div>
    );
  }

  const summaryText = `${payload.summary.up}/${payload.summary.total} servers up`;

  return (
    <div style={styles.container}>
      <div
        style={{
          ...styles.summaryBar,
          color:
            payload.summary.up === payload.summary.total
              ? 'var(--vscode-charts-green)'
              : 'var(--vscode-charts-red)',
        }}
      >
        {summaryText}
      </div>
      {payload.servers.map((server) => (
        <div
          key={server.name}
          style={styles.card}
          onClick={() =>
            vscode?.postMessage({
              type: 'command',
              command: 'orbit.health.openDetail',
              data: { serverName: server.name },
            })
          }
        >
          <div style={styles.cardHeader}>
            <span
              style={{
                ...styles.statusDot,
                background: statusColors[server.status] ?? 'gray',
              }}
            />
            <strong>{server.name}</strong>
            <span style={styles.latency}>{server.latencyMs}ms</span>
          </div>
          <div style={styles.cardBody}>
            <span>Uptime: {server.uptime.toFixed(1)}%</span>
            <span style={styles.lastCheck}>Last: {server.lastCheck}</span>
          </div>
        </div>
      ))}
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
  summaryBar: {
    padding: '8px 12px',
    fontWeight: 600,
    fontSize: '1em',
    background: 'var(--vscode-list-hoverBackground)',
    borderRadius: '4px',
    marginBottom: '8px',
  },
  card: {
    padding: '8px 12px',
    marginBottom: '4px',
    borderRadius: '4px',
    cursor: 'pointer',
    background: 'transparent',
  },
  cardHeader: {
    display: 'flex',
    alignItems: 'center',
    gap: '8px',
    marginBottom: '4px',
  },
  statusDot: {
    width: '10px',
    height: '10px',
    borderRadius: '50%',
    display: 'inline-block',
    flexShrink: 0,
  },
  latency: {
    marginLeft: 'auto',
    opacity: 0.6,
    fontSize: '0.85em',
  },
  cardBody: {
    fontSize: '0.85em',
    opacity: 0.7,
    display: 'flex',
    justifyContent: 'space-between',
  },
  lastCheck: { opacity: 0.5 },
};

document.addEventListener('DOMContentLoaded', () => {
  const rootEl = document.getElementById('root');
  if (rootEl) {
    const root = createRoot(rootEl);
    root.render(<App />);
  }
});
