import type { CSSProperties, ReactElement } from 'react';

export type EmptyStateIcon = 'pulse' | 'bug' | 'graph' | 'plug' | 'server' | 'checklist';

interface EmptyStateProps {
  icon: EmptyStateIcon;
  title: string;
  description: string;
  actionLabel?: string;
  onAction?: () => void;
}

/** Renders a compact illustrated empty state for Orbit webviews. */
export function EmptyState({
  icon,
  title,
  description,
  actionLabel,
  onAction,
}: EmptyStateProps): ReactElement {
  const hasAction = actionLabel !== undefined && onAction !== undefined;

  return (
    <div style={styles.container} role="status" aria-label={title}>
      <div style={styles.illustration} aria-hidden="true">
        <svg viewBox="0 0 48 48" width="48" height="48" focusable="false">
          {renderIcon(icon)}
        </svg>
      </div>
      <div style={styles.title}>{title}</div>
      <div style={styles.description}>{description}</div>
      {hasAction && (
        <button type="button" style={styles.action} onClick={onAction} aria-label={actionLabel}>
          {actionLabel}
        </button>
      )}
    </div>
  );
}

function renderIcon(icon: EmptyStateIcon): ReactElement {
  const strokeProps = {
    fill: 'none',
    stroke: 'currentColor',
    strokeLinecap: 'round' as const,
    strokeLinejoin: 'round' as const,
    strokeWidth: 2.4,
  };

  if (icon === 'pulse') {
    return <path {...strokeProps} d="M4 25h8l4-12 8 24 5-14h15" />;
  }
  if (icon === 'bug') {
    return (
      <>
        <path {...strokeProps} d="M16 18h16v15a8 8 0 0 1-16 0z" />
        <path {...strokeProps} d="M19 18a5 5 0 0 1 10 0M10 24h6M32 24h6M11 34h6M31 34h7" />
      </>
    );
  }
  if (icon === 'graph') {
    return (
      <>
        <path {...strokeProps} d="M16 32 28 20l8 8" />
        <circle {...strokeProps} cx="14" cy="34" r="4" />
        <circle {...strokeProps} cx="29" cy="19" r="4" />
        <circle {...strokeProps} cx="38" cy="29" r="4" />
      </>
    );
  }

  return <path {...strokeProps} d="M14 31h20M10 24h28M14 17h20M19 10h10M19 38h10" />;
}

const styles: Record<string, CSSProperties> = {
  container: {
    minHeight: '180px',
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    justifyContent: 'center',
    gap: '8px',
    padding: '28px 16px',
    textAlign: 'center',
    color: 'var(--vscode-editor-foreground)',
  },
  illustration: {
    width: '64px',
    height: '64px',
    display: 'grid',
    placeItems: 'center',
    border: '1px solid var(--vscode-panel-border)',
    borderRadius: '8px',
    color: 'var(--vscode-symbolIcon-functionForeground)',
    background: 'var(--vscode-list-hoverBackground)',
  },
  title: {
    fontWeight: 600,
    fontSize: '1em',
    lineHeight: 1.35,
  },
  description: {
    maxWidth: '280px',
    color: 'var(--vscode-descriptionForeground)',
    fontSize: '0.9em',
    lineHeight: 1.45,
  },
  action: {
    marginTop: '4px',
    background: 'var(--vscode-button-background)',
    color: 'var(--vscode-button-foreground)',
    border: 'none',
    borderRadius: '4px',
    padding: '5px 12px',
    cursor: 'pointer',
    font: 'inherit',
  },
};
