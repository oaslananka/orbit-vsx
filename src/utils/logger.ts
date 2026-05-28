import * as vscode from 'vscode';
import { OUTPUT_CHANNEL_NAME } from '../constants';

export class Logger implements vscode.Disposable {
  private channel: vscode.OutputChannel;

  constructor(name: string = OUTPUT_CHANNEL_NAME) {
    this.channel = vscode.window.createOutputChannel(name);
  }

  info(message: string): void {
    const timestamp = new Date().toISOString();
    this.channel.appendLine(`[INFO ${timestamp}] ${message}`);
  }

  warn(message: string): void {
    const timestamp = new Date().toISOString();
    this.channel.appendLine(`[WARN ${timestamp}] ${message}`);
  }

  error(message: string, error?: unknown): void {
    const timestamp = new Date().toISOString();
    this.channel.appendLine(`[ERROR ${timestamp}] ${message}`);
    if (error instanceof Error) {
      this.channel.appendLine(`  ${error.message}`);
      if (error.stack) {
        this.channel.appendLine(`  ${error.stack}`);
      }
    } else if (error !== undefined) {
      this.channel.appendLine(`  ${String(error)}`);
    }
  }

  show(): void {
    this.channel.show();
  }

  dispose(): void {
    this.channel.dispose();
  }
}
