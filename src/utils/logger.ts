import * as vscode from 'vscode';
import { OUTPUT_CHANNEL_NAME } from '../constants';

export class Logger implements vscode.Disposable {
  private channel: vscode.OutputChannel | undefined;
  private disposed = false;

  constructor(private readonly name: string = OUTPUT_CHANNEL_NAME) {}

  info(message: string): void {
    this.append('INFO', message);
  }

  warn(message: string): void {
    this.append('WARN', message);
  }

  error(message: string, error?: unknown): void {
    const channel = this.getChannel();
    if (!channel) return;

    const timestamp = new Date().toISOString();
    channel.appendLine(`[ERROR ${timestamp}] ${message}`);
    if (error instanceof Error) {
      channel.appendLine(`  ${error.message}`);
      if (error.stack) {
        channel.appendLine(`  ${error.stack}`);
      }
    } else if (error !== undefined) {
      channel.appendLine(`  ${String(error)}`);
    }
  }

  show(): void {
    this.getChannel()?.show();
  }

  dispose(): void {
    if (this.disposed) return;
    this.disposed = true;
    this.channel?.dispose();
    this.channel = undefined;
  }

  private append(level: 'INFO' | 'WARN', message: string): void {
    const channel = this.getChannel();
    if (!channel) return;

    const timestamp = new Date().toISOString();
    channel.appendLine(`[${level} ${timestamp}] ${message}`);
  }

  private getChannel(): vscode.OutputChannel | undefined {
    if (this.disposed) return undefined;
    this.channel ??= vscode.window.createOutputChannel(this.name);
    return this.channel;
  }
}
