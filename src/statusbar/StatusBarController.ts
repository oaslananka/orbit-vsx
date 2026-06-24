import * as vscode from 'vscode';
import { readConfig } from '../config';
import { ORBIT_VIEW_CONTAINER_COMMAND } from '../constants';
import type { HealthProvider } from '../panels/health/HealthProvider';
import { isWorkspaceTrusted } from '../utils/workspaceTrust';

export class StatusBarController implements vscode.Disposable {
  private readonly item: vscode.StatusBarItem;
  private readonly healthProvider: HealthProvider;
  private readonly healthSubscription: vscode.Disposable;

  constructor(healthProvider: HealthProvider) {
    this.healthProvider = healthProvider;
    this.item = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Right, 100);
    this.item.command = ORBIT_VIEW_CONTAINER_COMMAND;
    this.item.tooltip = 'Orbit - Click to open Health Monitor';
    this.healthSubscription = this.healthProvider.onDidChangeTreeData(() => this.update());
  }

  start(): void {
    this.update();
    this.item.show();
  }

  private update(): void {
    const config = readConfig();
    if (!config.health.enabled || !isWorkspaceTrusted()) {
      this.item.text = '$(pulse) Orbit';
      this.item.backgroundColor = undefined;
      return;
    }

    const state = this.healthProvider.getState();
    if (state.error) {
      this.item.text = '$(pulse) Orbit';
      this.item.backgroundColor = new vscode.ThemeColor('statusBarItem.errorBackground');
      return;
    }

    const { up, total } = state.dashboard.summary;
    if (total === 0) {
      this.item.text = '$(pulse) Orbit';
      this.item.backgroundColor = undefined;
      return;
    }

    const allUp = up === total;
    this.item.text = `$(pulse) ${up}/${total} up`;
    this.item.backgroundColor = allUp
      ? undefined
      : new vscode.ThemeColor('statusBarItem.warningBackground');
  }

  onConfigChanged(): void {
    this.update();
  }

  dispose(): void {
    this.healthSubscription.dispose();
    this.item.dispose();
  }
}
