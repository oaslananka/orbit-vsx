import * as vscode from 'vscode';

interface TreeEmptyStateOptions {
  icon: string;
  title: string;
  description: string;
  actionLabel?: string;
  actionCommand?: string;
  actionIcon?: string;
  actionTooltip?: string;
}

/** Creates an illustrated TreeView empty state with an optional command action row. */
export function createTreeEmptyState(options: TreeEmptyStateOptions): vscode.TreeItem[] {
  const summary = new vscode.TreeItem(options.title, vscode.TreeItemCollapsibleState.None);
  summary.description = options.description;
  summary.iconPath = new vscode.ThemeIcon(
    options.icon,
    new vscode.ThemeColor('descriptionForeground')
  );
  summary.tooltip = new vscode.MarkdownString(`**${options.title}**\n\n${options.description}`);
  summary.accessibilityInformation = {
    label: `${options.title}. ${options.description}`,
    role: 'status',
  };

  if (options.actionLabel === undefined || options.actionCommand === undefined) {
    return [summary];
  }

  const action = new vscode.TreeItem(options.actionLabel, vscode.TreeItemCollapsibleState.None);
  const actionTooltip = options.actionTooltip ?? options.actionLabel;
  action.iconPath = new vscode.ThemeIcon(options.actionIcon ?? 'add');
  action.tooltip = actionTooltip;
  action.command = { command: options.actionCommand, title: options.actionLabel };
  action.accessibilityInformation = { label: actionTooltip, role: 'button' };
  return [summary, action];
}
