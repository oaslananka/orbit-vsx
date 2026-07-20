import * as assert from 'node:assert';
import * as fs from 'node:fs';
import * as path from 'node:path';

const REPO_ROOT = path.resolve(__dirname, '..', '..');

suite('Debug Decoration Contracts', () => {
  test('keeps decorations instance-scoped, bounded, cached, and stale-safe', () => {
    const source = fs.readFileSync(
      path.join(REPO_ROOT, 'src/decorations/DebugDecorationProvider.ts'),
      'utf8'
    );

    assert.ok(source.includes('private readonly decorationType ='));
    assert.ok(!source.includes('const errorDecorationType ='));
    assert.ok(source.includes('MAX_DOCUMENT_CHARS'));
    assert.ok(source.includes('MAX_ERROR_MATCHES'));
    assert.ok(source.includes('MAX_SIMILARITY_CACHE_ENTRIES'));
    assert.ok(source.includes('private readonly similarityCache = new Map'));
    assert.ok(source.includes('private readonly decoratedEditors = new Set'));
    assert.ok(source.includes('private updateGeneration = 0'));
    assert.ok(source.includes('generation !== this.updateGeneration'));
    assert.ok(source.includes('vscode.workspace.onDidChangeTextDocument'));
    assert.ok(source.includes('vscode.window.activeTextEditor'));
    assert.ok(source.includes('this.clearAllDecorations()'));
    assert.ok(source.includes('this.getDebugClient().findSimilarErrors'));
    assert.ok(source.includes('this.updateGeneration++'));
    assert.ok(source.includes('this.decorationType.dispose()'));
  });
});
