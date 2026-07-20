import * as assert from 'node:assert';
import * as Module from 'node:module';
import type * as DecorationModule from '../../src/decorations/DebugDecorationProvider';

type LoadFunction = (request: string, parent: NodeModule | null, isMain: boolean) => unknown;
type ModuleWithLoad = typeof Module & { _load: LoadFunction };
type Disposable = { dispose(): void };

type Document = {
  getText(): string;
  positionAt(offset: number): { line: number; character: number };
};

type Editor = {
  document: Document;
  calls: unknown[][];
  setDecorations(_type: unknown, decorations: unknown[]): void;
};

const moduleWithLoad = Module as unknown as ModuleWithLoad;
const originalLoad = moduleWithLoad._load;
const activeEditorCallbacks: Array<(editor: Editor | undefined) => void> = [];
const documentCallbacks: Array<(event: { document: Document }) => void> = [];
let activeTextEditor: Editor | undefined;
let decorationTypeDisposed = 0;
let listenerDisposals = 0;

const vscodeMock = {
  Range: class {
    constructor(
      public readonly start: unknown,
      public readonly end: unknown
    ) {}
  },
  ThemeColor: class {
    constructor(public readonly id: string) {}
  },
  window: {
    get activeTextEditor(): Editor | undefined {
      return activeTextEditor;
    },
    createOutputChannel: () => ({
      appendLine: () => undefined,
      dispose: () => undefined,
    }),
    createTextEditorDecorationType: () => ({
      dispose: () => {
        decorationTypeDisposed += 1;
      },
    }),
    onDidChangeActiveTextEditor: (callback: (editor: Editor | undefined) => void): Disposable => {
      activeEditorCallbacks.push(callback);
      return {
        dispose: () => {
          listenerDisposals += 1;
        },
      };
    },
  },
  workspace: {
    onDidChangeTextDocument: (callback: (event: { document: Document }) => void): Disposable => {
      documentCallbacks.push(callback);
      return {
        dispose: () => {
          listenerDisposals += 1;
        },
      };
    },
  },
};

function createEditor(text: string): Editor & { setText(value: string): void } {
  let currentText = text;
  const document: Document = {
    getText: () => currentText,
    positionAt: (offset) => ({ line: 0, character: offset }),
  };
  return {
    calls: [],
    document,
    setDecorations(_type, decorations): void {
      this.calls.push(decorations);
    },
    setText(value: string): void {
      currentText = value;
    },
  };
}

async function flush(): Promise<void> {
  await new Promise((resolve) => setTimeout(resolve, 15));
}

suite('Debug Decoration Provider Runtime', () => {
  let DebugDecorationProvider: typeof DecorationModule.DebugDecorationProvider;

  suiteSetup(async () => {
    moduleWithLoad._load = function load(request, parent, isMain): unknown {
      if (request === 'vscode') return vscodeMock;
      return originalLoad.call(this, request, parent, isMain);
    };
    ({ DebugDecorationProvider } = await import('../../src/decorations/DebugDecorationProvider'));
  });

  setup(() => {
    activeEditorCallbacks.length = 0;
    documentCallbacks.length = 0;
    activeTextEditor = undefined;
    decorationTypeDisposed = 0;
    listenerDisposals = 0;
  });

  suiteTeardown(() => {
    moduleWithLoad._load = originalLoad;
  });

  test('Should process the initially active editor and refresh it after document edits', async () => {
    const editor = createEditor('Error: first');
    activeTextEditor = editor;
    const searches: string[] = [];
    const provider = new DebugDecorationProvider(
      () =>
        ({
          findSimilarErrors: async (text: string) => {
            searches.push(text);
            return [{ id: 'one' }];
          },
        }) as never,
      0
    );

    await flush();
    assert.deepStrictEqual(searches, ['first']);
    assert.strictEqual((editor.calls.at(-1) ?? []).length, 1);

    editor.setText('Error: second');
    documentCallbacks[0]?.({ document: editor.document });
    await flush();
    assert.deepStrictEqual(searches, ['first', 'second']);
    assert.strictEqual((editor.calls.at(-1) ?? []).length, 1);

    provider.onClientChanged();
    await flush();
    assert.deepStrictEqual(searches, ['first', 'second', 'second']);

    provider.dispose();
    assert.deepStrictEqual(editor.calls.at(-1), []);
    assert.strictEqual(decorationTypeDisposed, 1);
    assert.strictEqual(listenerDisposals, 2);
  });

  test('Should clear previous and ineligible editors without querying the service', async () => {
    const first = createEditor('Error: first');
    const second = createEditor('x'.repeat(200_001));
    activeTextEditor = first;
    let searches = 0;
    const provider = new DebugDecorationProvider(
      () =>
        ({
          findSimilarErrors: async () => {
            searches += 1;
            return [{ id: 'one' }];
          },
        }) as never,
      0
    );
    await flush();

    activeTextEditor = second;
    activeEditorCallbacks[0]?.(second);
    await flush();

    assert.deepStrictEqual(first.calls.at(-1), []);
    assert.deepStrictEqual(second.calls.at(-1), []);
    assert.strictEqual(searches, 1);
    provider.dispose();
  });
});
