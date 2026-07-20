import React, { useCallback, useEffect, useState } from 'react';
import { createRoot } from 'react-dom/client';
import { EmptyState } from '../components/EmptyState';

declare function acquireVsCodeApi(): {
  postMessage(message: unknown): void;
  getState(): unknown;
  setState(state: unknown): void;
};

interface AgentSkill {
  id: string;
  name: string;
  description: string;
  tags: string[];
}

interface AgentInterface {
  protocolBinding: string;
  protocolVersion: string;
  url: string;
}

interface AgentCard {
  name: string;
  description: string;
  version: string;
  supportedInterfaces: AgentInterface[];
  defaultInputModes: string[];
  defaultOutputModes: string[];
  skills: AgentSkill[];
  signatures?: Array<{ protected: string; signature: string; header?: Record<string, unknown> }>;
}

type TrustState = 'unsigned' | 'unverified' | 'verified' | 'invalid' | 'key-unavailable';

interface AgentCardTrustResult {
  state: TrustState;
  reason: string;
  summary: string;
  signatureCount: number;
  verifiedSignatureIndex?: number;
  algorithm?: string;
  keyId?: string;
  keyUrl?: string;
}

interface ValidationResult {
  valid: boolean;
  errors: string[];
}

interface AgentCardInspection {
  card: AgentCard;
  trust: AgentCardTrustResult;
  validation: ValidationResult;
}

declare global {
  interface Window {
    __ORBIT_DATA__?: AgentCardInspection;
  }
}

const vscode = typeof acquireVsCodeApi !== 'undefined' ? acquireVsCodeApi() : null;

function App(): React.ReactElement {
  const [inspection, setInspection] = useState<AgentCardInspection | null>(
    window.__ORBIT_DATA__ ?? null
  );

  const handleMessage = useCallback((event: MessageEvent) => {
    const message = event.data as { type?: string; payload?: AgentCardInspection };
    if (message.type === 'update' && message.payload) {
      setInspection(message.payload);
    }
  }, []);

  useEffect(() => {
    window.addEventListener('message', handleMessage);
    return () => window.removeEventListener('message', handleMessage);
  }, [handleMessage]);

  if (!inspection) {
    return (
      <div style={styles.container}>
        <EmptyState
          icon="graph"
          title="No agents found"
          description="Discover an Agent Card to inspect its schema and signature trust."
          actionLabel="Discover Agent"
          onAction={() => vscode?.postMessage({ type: 'command', command: 'orbit.a2a.discover' })}
        />
      </div>
    );
  }

  const { card, trust, validation } = inspection;
  const trustTone = trustToneFor(trust.state);
  const schemaDetail = getSchemaDetail(validation);

  return (
    <main style={styles.container}>
      <header style={styles.header}>
        <div>
          <div style={styles.eyebrow}>A2A Agent Card</div>
          <h1 style={styles.title}>{card.name}</h1>
          <p style={styles.description}>{card.description}</p>
        </div>
        <button
          type="button"
          style={styles.button}
          onClick={() =>
            vscode?.postMessage({
              type: 'clipboard',
              text: JSON.stringify(card, null, 2),
            })
          }
        >
          Copy JSON
        </button>
      </header>

      <section style={styles.statusGrid} aria-label="Agent Card verification status">
        <div style={styles.statusCard}>
          <span style={styles.statusLabel}>Schema</span>
          <strong>{validation.valid ? 'Valid' : 'Invalid'}</strong>
          <span style={styles.statusDetail}>{schemaDetail}</span>
        </div>
        <div style={{ ...styles.statusCard, borderLeftColor: trustTone }}>
          <span style={styles.statusLabel}>Signature trust</span>
          <strong style={{ color: trustTone }}>{trustLabel(trust.state)}</strong>
          <span style={styles.statusDetail}>{trust.summary}</span>
        </div>
      </section>

      <section style={styles.section}>
        <h2 style={styles.sectionTitle}>Verification details</h2>
        <dl style={styles.definitionGrid}>
          <Definition label="Version" value={card.version} />
          <Definition label="Signatures" value={String(trust.signatureCount)} />
          <Definition label="Reason" value={trust.reason} />
          <Definition label="Algorithm" value={trust.algorithm ?? 'not available'} />
          <Definition label="Key ID" value={trust.keyId ?? 'not available'} />
          <Definition label="JWKS" value={trust.keyUrl ?? 'not available'} />
        </dl>
        <p style={styles.note}>
          “Verified” confirms integrity under a key allowed by Orbit’s JWKS policy. It does not
          independently endorse the organization operating that key.
        </p>
      </section>

      {validation.errors.length > 0 && (
        <section style={styles.section}>
          <h2 style={styles.sectionTitle}>Schema findings</h2>
          <ul style={styles.list}>
            {validation.errors.map((error) => (
              <li key={error}>{error}</li>
            ))}
          </ul>
        </section>
      )}

      <section style={styles.section}>
        <h2 style={styles.sectionTitle}>Interfaces</h2>
        <div style={styles.cards}>
          {card.supportedInterfaces.map((agentInterface) => (
            <article
              key={`${agentInterface.protocolBinding}:${agentInterface.url}`}
              style={styles.itemCard}
            >
              <strong>{agentInterface.protocolBinding}</strong>
              <span style={styles.muted}>Protocol {agentInterface.protocolVersion}</span>
              <code style={styles.code}>{agentInterface.url}</code>
            </article>
          ))}
        </div>
      </section>

      <section style={styles.section}>
        <h2 style={styles.sectionTitle}>Skills</h2>
        <div style={styles.cards}>
          {card.skills.map((skill) => (
            <article key={skill.id} style={styles.itemCard}>
              <strong>{skill.name}</strong>
              <span style={styles.muted}>{skill.description}</span>
              <span style={styles.tags}>{skill.tags.join(' · ')}</span>
            </article>
          ))}
        </div>
      </section>

      <section style={styles.section}>
        <h2 style={styles.sectionTitle}>Media modes</h2>
        <dl style={styles.definitionGrid}>
          <Definition label="Input" value={card.defaultInputModes.join(', ')} />
          <Definition label="Output" value={card.defaultOutputModes.join(', ')} />
        </dl>
      </section>
    </main>
  );
}

interface DefinitionProps {
  readonly label: string;
  readonly value: string;
}

function Definition({ label, value }: DefinitionProps): React.ReactElement {
  return (
    <div style={styles.definitionItem}>
      <dt style={styles.statusLabel}>{label}</dt>
      <dd style={styles.definitionValue}>{value}</dd>
    </div>
  );
}

function getSchemaDetail(validation: ValidationResult): string {
  if (validation.valid) return 'A2A structure passed validation.';
  const suffix = validation.errors.length === 1 ? '' : 's';
  return `${validation.errors.length} schema issue${suffix}`;
}

function trustLabel(state: TrustState): string {
  switch (state) {
    case 'key-unavailable':
      return 'Key unavailable';
    case 'verified':
      return 'Verified';
    case 'invalid':
      return 'Invalid';
    case 'unverified':
      return 'Unverified';
    default:
      return 'Unsigned';
  }
}

function trustToneFor(state: TrustState): string {
  switch (state) {
    case 'verified':
      return 'var(--vscode-testing-iconPassed)';
    case 'invalid':
      return 'var(--vscode-testing-iconFailed)';
    case 'key-unavailable':
    case 'unverified':
      return 'var(--vscode-editorWarning-foreground)';
    default:
      return 'var(--vscode-descriptionForeground)';
  }
}

const styles: Record<string, React.CSSProperties> = {
  container: {
    padding: '24px',
    fontFamily: 'var(--vscode-font-family)',
    color: 'var(--vscode-editor-foreground)',
    background: 'var(--vscode-editor-background)',
    minHeight: '100vh',
    boxSizing: 'border-box',
  },
  header: {
    display: 'flex',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
    gap: '24px',
    marginBottom: '24px',
  },
  eyebrow: {
    color: 'var(--vscode-descriptionForeground)',
    fontSize: '0.78rem',
    fontWeight: 600,
    letterSpacing: '0.08em',
    textTransform: 'uppercase',
  },
  title: { margin: '4px 0 8px', fontSize: '1.8rem' },
  description: { margin: 0, color: 'var(--vscode-descriptionForeground)', maxWidth: '72ch' },
  button: {
    border: '1px solid var(--vscode-button-border, transparent)',
    borderRadius: '3px',
    padding: '7px 12px',
    color: 'var(--vscode-button-foreground)',
    background: 'var(--vscode-button-background)',
    cursor: 'pointer',
    whiteSpace: 'nowrap',
  },
  statusGrid: {
    display: 'grid',
    gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))',
    gap: '12px',
    marginBottom: '20px',
  },
  statusCard: {
    display: 'flex',
    flexDirection: 'column',
    gap: '5px',
    padding: '14px',
    border: '1px solid var(--vscode-panel-border)',
    borderLeft: '4px solid var(--vscode-descriptionForeground)',
    borderRadius: '4px',
    background: 'var(--vscode-sideBar-background)',
  },
  statusLabel: {
    color: 'var(--vscode-descriptionForeground)',
    fontSize: '0.76rem',
    fontWeight: 600,
    letterSpacing: '0.04em',
    textTransform: 'uppercase',
  },
  statusDetail: { color: 'var(--vscode-descriptionForeground)', fontSize: '0.86rem' },
  section: {
    marginTop: '18px',
    paddingTop: '16px',
    borderTop: '1px solid var(--vscode-panel-border)',
  },
  sectionTitle: { margin: '0 0 12px', fontSize: '1rem' },
  definitionGrid: {
    display: 'grid',
    gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))',
    gap: '10px',
    margin: 0,
  },
  definitionItem: {
    minWidth: 0,
    padding: '10px',
    borderRadius: '4px',
    background: 'var(--vscode-textCodeBlock-background)',
  },
  definitionValue: { margin: '5px 0 0', overflowWrap: 'anywhere' },
  note: {
    margin: '12px 0 0',
    color: 'var(--vscode-descriptionForeground)',
    fontSize: '0.82rem',
  },
  cards: { display: 'grid', gap: '8px' },
  itemCard: {
    display: 'flex',
    flexDirection: 'column',
    gap: '5px',
    padding: '12px',
    border: '1px solid var(--vscode-panel-border)',
    borderRadius: '4px',
  },
  muted: { color: 'var(--vscode-descriptionForeground)' },
  code: {
    padding: '4px 6px',
    borderRadius: '3px',
    overflowWrap: 'anywhere',
    background: 'var(--vscode-textCodeBlock-background)',
  },
  tags: { color: 'var(--vscode-textLink-foreground)', fontSize: '0.82rem' },
  list: { margin: 0, paddingLeft: '20px' },
};

document.addEventListener('DOMContentLoaded', () => {
  const rootElement = document.getElementById('root');
  if (rootElement) {
    createRoot(rootElement).render(<App />);
  }
});
