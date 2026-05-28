import * as vscode from 'vscode';
import { readConfig } from '../config';
import type { HealthProvider } from '../panels/health/HealthProvider';
import { VIEW_IDS } from '../constants';

export class StatusBarController implements vscode.Disposable {
  private item: vscode.StatusBarItem;
  private healthProvider: HealthProvider;
  private pollingTimer: ReturnType<typeof setInterval> | undefined;

  constructor(healthProvider: HealthProvider) {
    this.healthProvider = healthProvider;
    this.item = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Right, 100);
    this.item.command = `workbench.view.extension.${VIEW_IDS.HEALTH}`;
    this.item.tooltip = 'Orbit - Click to open Health Monitor';
  }

  start(): void {
    this.update();
    this.startPolling();
    this.item.show();
  }

  private startPolling(): void {
    const config = readConfig();
    this.stopPolling();
    if (config.health.enabled) {
      this.pollingTimer = setInterval(() => {
        this.update();
      }, config.health.pollingIntervalSeconds * 1000);
    }
  }

  private stopPolling(): void {
    if (this.pollingTimer !== undefined) {
      clearInterval(this.pollingTimer);
      this.pollingTimer = undefined;
    }
  }

  private async update(): Promise<void> {
    try {
      const dashboard = await this.healthProvider.getDashboard();
      const { up, total } = dashboard.summary;
      if (total === 0) {
        this.item.text = '$(pulse) Orbit';
        this.item.backgroundColor = undefined;
        return;
      }
      const allUp = up === total;
      this.item.text = `$(pulse) ${up}/${total} up`;
      if (!allUp) {
        this.item.backgroundColor = new vscode.ThemeColor('statusBarItem.warningBackground');
      } else {
        this.item.backgroundColor = undefined;
      }
    } catch {
      this.item.text = '$(pulse) Orbit';
      this.item.backgroundColor = new vscode.ThemeColor('statusBarItem.errorBackground');
    }
  }

  onConfigChanged(): void {
    this.startPolling();
    this.update();
  }

  dispose(): void {
    this.stopPolling();
    this.item.dispose();
  }
}
