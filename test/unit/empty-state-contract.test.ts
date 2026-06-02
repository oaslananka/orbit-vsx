import * as assert from 'node:assert';
import * as fs from 'node:fs';
import * as Module from 'node:module';
import * as path from 'node:path';
import { COMMAND_IDS } from '../../src/constants';
import type * as TreeEmptyStateModule from '../../src/utils/treeEmptyState';
import type * as WebviewMessagesModule from '../../src/utils/webviewMessages';

type LoadFunction = (request: string, parent: NodeModule | null, isMain: boolean) => unknown;
type ModuleWithLoad = typeof Module & { _load: LoadFunction };
type CreateTreeEmptyState = typeof TreeEmptyStateModule.createTreeEmptyState;
type ExecuteAllowedWebviewCommand = typeof WebviewMessagesModule.executeAllowedWebviewCommand;
type GetWebviewClipboardText = typeof WebviewMessagesModule.getWebviewClipboardText;

class MockTreeItem {
  accessibilityInformation?: { label: string; role?: string };
  command?: { command: string; title: string };
  description?: string;
  iconPath?: unknown;
  tooltip?: unknown;

  constructor(
    public readonly label: string,
    public readonly collapsibleState?: number
  ) {}
}

class MockThemeIcon {
  constructor(
    public readonly id: string,
    public readonly color?: unknown
  ) {}
}

class MockThemeColor {
  constructor(public readonly id: string) {}
}

class MockMarkdownString {
  constructor(public readonly value: string) {}
}

const moduleWithLoad = Module as unknown as ModuleWithLoad;
const originalLoad = moduleWithLoad._load;
const executedCommands: Array<{ command: string; data: unknown }> = [];
const repoRoot = path.resolve(__dirname, '..', '..');

const vscodeMock = {
  MarkdownString: MockMarkdownString,
  ThemeColor: MockThemeColor,
  ThemeIcon: MockThemeIcon,
  TreeItem: MockTreeItem,
  TreeItemCollapsibleState: {
    None: 0,
  },
  commands: {
    executeCommand: (command: string, data: unknown): Promise<void> => {
      executedCommands.push({ command, data });
      return Promise.resolve();
    },
  },
};

let createTreeEmptyState: CreateTreeEmptyState;
let executeAllowedWebviewCommand: ExecuteAllowedWebviewCommand;
let getWebviewClipboardText: GetWebviewClipboardText;

function readWorkspaceFile(relativePath: string): string {
  return fs.readFileSync(path.join(repoRoot, relativePath), 'utf8');
}

suite('Empty State Contracts', () => {
  suiteSetup(async () => {
    moduleWithLoad._load = function load(request, parent, isMain): unknown {
      if (request === 'vscode') return vscodeMock;
      return originalLoad.call(this, request, parent, isMain);
    };

    ({ createTreeEmptyState } = await import('../../src/utils/treeEmptyState'));
    ({ executeAllowedWebviewCommand, getWebviewClipboardText } =
      await import('../../src/utils/webviewMessages'));
  });

  teardown(() => {
    executedCommands.length = 0;
  });

  suiteTeardown(() => {
    moduleWithLoad._load = originalLoad;
  });

  test('Should create illustrated TreeView empty states with an action command', () => {
    const [summary, action] = createTreeEmptyState({
      icon: 'pulse',
      title: 'No servers connected',
      description: 'Add a health-monitor-mcp endpoint to start monitoring.',
      actionLabel: 'Add Server',
      actionCommand: COMMAND_IDS.HEALTH_ADD_SERVER,
    }) as [MockTreeItem, MockTreeItem];

    assert.strictEqual(summary.label, 'No servers connected');
    assert.strictEqual(
      summary.description,
      'Add a health-monitor-mcp endpoint to start monitoring.'
    );
    assert.ok(summary.iconPath instanceof MockThemeIcon);
    assert.strictEqual(summary.accessibilityInformation?.role, 'status');
    assert.deepStrictEqual(action.command, {
      command: COMMAND_IDS.HEALTH_ADD_SERVER,
      title: 'Add Server',
    });
    assert.strictEqual(action.accessibilityInformation?.role, 'button');
  });

  test('Should execute only whitelisted webview command messages', () => {
    const data = { serverName: 'api' };
    const allowedCommands = new Set<string>([COMMAND_IDS.HEALTH_OPEN_DETAIL]);

    assert.strictEqual(
      executeAllowedWebviewCommand(
        { command: COMMAND_IDS.HEALTH_OPEN_DETAIL, data, type: 'command' },
        allowedCommands
      ),
      true
    );
    assert.deepStrictEqual(executedCommands, [{ command: COMMAND_IDS.HEALTH_OPEN_DETAIL, data }]);
    assert.strictEqual(
      executeAllowedWebviewCommand(
        { command: 'workbench.action.reloadWindow', type: 'command' },
        allowedCommands
      ),
      false
    );
    assert.strictEqual(executedCommands.length, 1);
  });

  test('Should expose clipboard text only for valid clipboard messages', () => {
    assert.strictEqual(
      getWebviewClipboardText({ text: 'agent-card', type: 'copyToClipboard' }),
      'agent-card'
    );
    assert.strictEqual(getWebviewClipboardText({ text: 42, type: 'copyToClipboard' }), undefined);
    assert.strictEqual(getWebviewClipboardText(null), undefined);
  });

  test('Should keep webview empty states illustrated and actionable', () => {
    const component = readWorkspaceFile('webview-ui/src/components/EmptyState.tsx');
    assert.match(component, /<svg/);
    assert.match(component, /<button/);
    assert.match(component, /aria-label/);

    [
      ['webview-ui/src/health/App.tsx', 'No servers connected', COMMAND_IDS.HEALTH_ADD_SERVER],
      ['webview-ui/src/debug/App.tsx', 'No debug sessions', COMMAND_IDS.DEBUG_NEW_SESSION],
      ['webview-ui/src/a2a/App.tsx', 'No agents found', COMMAND_IDS.A2A_DISCOVER],
    ].forEach(([filePath, title, command]) => {
      const contents = readWorkspaceFile(filePath);
      assert.match(contents, /<EmptyState/);
      assert.ok(contents.includes(title), `${filePath} should render ${title}`);
      assert.ok(contents.includes(command), `${filePath} should dispatch ${command}`);
    });
  });
});
