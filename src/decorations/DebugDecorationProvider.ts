import * as vscode from 'vscode';
import type { DebugClient } from '../panels/debug/DebugClient';
import type { DebugSession } from '../panels/debug/types';
import { Logger } from '../utils/logger';

const ERROR_PATTERN = /Error:\s(.+)/g;
const MAX_DOCUMENT_CHARS = 200_000;
const MAX_ERROR_MATCHES = 50;
const MAX_ERROR_TEXT_CHARS = 500;
const SIMILARITY_CACHE_TTL_MS = 30_000;
const SIMILARITY_LOOKUP_TIMEOUT_MS = 1_500;
const MAX_SIMILARITY_CACHE_ENTRIES = 100;
const DEFAULT_DEBOUNCE_MS = 500;

interface ErrorMatch {
  index: number;
  text: string;
}

interface SimilarityCacheEntry {
  expiresAt: number;
  sessions: DebugSession[];
}

export class DebugDecorationProvider implements vscode.Disposable {
  private readonly decorationType = vscode.window.createTextEditorDecorationType({
    after: {
      margin: '0 0 0 16px',
      color: new vscode.ThemeColor('editorCodeLens.foreground'),
    },
  });
  private readonly disposables: vscode.Disposable[] = [];
  private readonly decoratedEditors = new Set<vscode.TextEditor>();
  private readonly logger = new Logger('Orbit:DebugDecorations');
  private readonly similarityCache = new Map<string, SimilarityCacheEntry>();
  private debounceTimer: ReturnType<typeof setTimeout> | undefined;
  private updateGeneration = 0;
  private disposed = false;

  constructor(
    private readonly getDebugClient: () => DebugClient,
    private readonly debounceMs = DEFAULT_DEBOUNCE_MS
  ) {
    this.disposables.push(
      vscode.window.onDidChangeActiveTextEditor((editor) => {
        this.cancelPendingUpdate();
        this.clearDecorationsExcept(editor);
        if (editor) this.scheduleUpdate(editor);
      }),
      vscode.workspace.onDidChangeTextDocument((event) => {
        const editor = vscode.window.activeTextEditor;
        if (editor?.document === event.document) this.scheduleUpdate(editor);
      })
    );

    if (vscode.window.activeTextEditor) {
      this.scheduleUpdate(vscode.window.activeTextEditor);
    }
  }

  onClientChanged(): void {
    if (this.disposed) return;
    this.similarityCache.clear();
    this.cancelPendingUpdate();
    if (vscode.window.activeTextEditor) {
      this.scheduleUpdate(vscode.window.activeTextEditor);
    } else {
      this.clearAllDecorations();
    }
  }

  private scheduleUpdate(editor: vscode.TextEditor): void {
    if (this.disposed) return;
    if (this.debounceTimer) clearTimeout(this.debounceTimer);
    const generation = ++this.updateGeneration;
    this.debounceTimer = setTimeout(() => {
      this.debounceTimer = undefined;
      void this.updateDecorations(editor, generation);
    }, this.debounceMs);
  }

  private cancelPendingUpdate(): void {
    this.updateGeneration++;
    if (this.debounceTimer !== undefined) {
      clearTimeout(this.debounceTimer);
      this.debounceTimer = undefined;
    }
  }

  private async updateDecorations(editor: vscode.TextEditor, generation: number): Promise<void> {
    if (this.disposed || generation !== this.updateGeneration) return;

    const document = editor.document;
    const text = document.getText();
    if (text.length > MAX_DOCUMENT_CHARS) {
      this.clearEditorDecorations(editor);
      this.logger.info(`Skipped debug decorations for large document (${text.length} chars)`);
      return;
    }

    const matches = this.collectErrorMatches(text);
    const decorations: vscode.DecorationOptions[] = [];

    for (const match of matches) {
      if (this.disposed || generation !== this.updateGeneration) return;
      try {
        const similar = await this.findSimilarErrorsCached(match.text);
        if (this.disposed || generation !== this.updateGeneration) return;
        if (similar.length > 0) {
          const pos = document.positionAt(match.index);
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

    if (!this.disposed && generation === this.updateGeneration) {
      editor.setDecorations(this.decorationType, decorations);
      if (decorations.length > 0) {
        this.decoratedEditors.add(editor);
      } else {
        this.decoratedEditors.delete(editor);
      }
    }
  }

  private collectErrorMatches(text: string): ErrorMatch[] {
    const matches: ErrorMatch[] = [];
    const seen = new Set<string>();
    ERROR_PATTERN.lastIndex = 0;
    let match: RegExpExecArray | null;

    while ((match = ERROR_PATTERN.exec(text)) !== null && matches.length < MAX_ERROR_MATCHES) {
      const errorText = this.normalizeErrorText(match[1] ?? '');
      if (!errorText || seen.has(errorText)) continue;
      seen.add(errorText);
      matches.push({ index: match.index, text: errorText });
    }

    return matches;
  }

  private normalizeErrorText(errorText: string): string {
    return errorText.trim().slice(0, MAX_ERROR_TEXT_CHARS);
  }

  private async findSimilarErrorsCached(errorText: string): Promise<DebugSession[]> {
    const cached = this.similarityCache.get(errorText);
    const now = Date.now();
    if (cached && cached.expiresAt > now) {
      return cached.sessions;
    }

    const sessions = await this.withSimilarityLookupTimeout(errorText);
    this.similarityCache.set(errorText, {
      expiresAt: now + SIMILARITY_CACHE_TTL_MS,
      sessions,
    });
    this.pruneSimilarityCache();
    return sessions;
  }

  private async withSimilarityLookupTimeout(errorText: string): Promise<DebugSession[]> {
    let timeout: ReturnType<typeof setTimeout> | undefined;
    try {
      return await Promise.race([
        this.getDebugClient().findSimilarErrors(errorText, SIMILARITY_LOOKUP_TIMEOUT_MS),
        new Promise<DebugSession[]>((resolve) => {
          timeout = setTimeout(() => resolve([]), SIMILARITY_LOOKUP_TIMEOUT_MS);
        }),
      ]);
    } finally {
      if (timeout !== undefined) {
        clearTimeout(timeout);
      }
    }
  }

  private pruneSimilarityCache(): void {
    while (this.similarityCache.size > MAX_SIMILARITY_CACHE_ENTRIES) {
      const oldestKey = this.similarityCache.keys().next().value as string | undefined;
      if (!oldestKey) return;
      this.similarityCache.delete(oldestKey);
    }
  }

  private clearDecorationsExcept(editor: vscode.TextEditor | undefined): void {
    for (const decoratedEditor of Array.from(this.decoratedEditors)) {
      if (decoratedEditor !== editor) this.clearEditorDecorations(decoratedEditor);
    }
  }

  private clearEditorDecorations(editor: vscode.TextEditor): void {
    editor.setDecorations(this.decorationType, []);
    this.decoratedEditors.delete(editor);
  }

  private clearAllDecorations(): void {
    for (const editor of Array.from(this.decoratedEditors)) {
      this.clearEditorDecorations(editor);
    }
  }

  dispose(): void {
    if (this.disposed) return;
    this.disposed = true;
    this.cancelPendingUpdate();
    this.clearAllDecorations();
    this.similarityCache.clear();
    this.disposables.forEach((disposable) => disposable.dispose());
    this.decorationType.dispose();
    this.logger.dispose();
  }
}
