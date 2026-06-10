import * as vscode from 'vscode';
import type { DebugClient } from '../panels/debug/DebugClient';
import { Logger } from '../utils/logger';

const errorDecorationType = vscode.window.createTextEditorDecorationType({
  after: {
    margin: '0 0 0 16px',
    color: new vscode.ThemeColor('editorCodeLens.foreground'),
  },
});

export class DebugDecorationProvider implements vscode.Disposable {
  private disposables: vscode.Disposable[] = [];
  private logger = new Logger('Orbit:DebugDecorations');
  private debounceTimer: ReturnType<typeof setTimeout> | undefined;

  constructor(private debugClient: DebugClient) {
    this.disposables.push(
      vscode.window.onDidChangeActiveTextEditor((e) => {
        if (e) this.scheduleUpdate(e);
      })
    );
  }

  private scheduleUpdate(editor: vscode.TextEditor): void {
    if (this.debounceTimer) clearTimeout(this.debounceTimer);
    this.debounceTimer = setTimeout(() => {
      void this.updateDecorations(editor);
    }, 500);
  }

  private async updateDecorations(editor: vscode.TextEditor): Promise<void> {
    const text = editor.document.getText();
    const errorPattern = /Error:\s(.+)/g;
    const decorations: vscode.DecorationOptions[] = [];
    let match: RegExpExecArray | null;

    while ((match = errorPattern.exec(text)) !== null) {
      const errorText = match[1].trim();
      if (!errorText) continue;
      try {
        const similar = await this.debugClient.findSimilarErrors(errorText);
        if (similar.length > 0) {
          const pos = editor.document.positionAt(match.index);
          decorations.push({
            range: new vscode.Range(pos, pos),
            renderOptions: {
              after: {
                contentText: `  \u2299 seen ${similar.length}x in debug history`,
              },
            },
          });
        }
      } catch {
        this.logger.warn('Failed to check error similarity');
      }
    }

    editor.setDecorations(errorDecorationType, decorations);
  }

  dispose(): void {
    if (this.debounceTimer !== undefined) {
      clearTimeout(this.debounceTimer);
      this.debounceTimer = undefined;
    }
    this.disposables.forEach((d) => d.dispose());
    errorDecorationType.dispose();
  }
}
