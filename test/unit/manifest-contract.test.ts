import * as assert from 'node:assert';
import * as fs from 'node:fs';
import * as path from 'node:path';
import {
  COMMAND_IDS,
  CONFIG_KEYS,
  ORBIT_VIEW_CONTAINER_COMMAND,
  VIEW_IDS,
} from '../../src/constants';

interface ManifestCommand {
  command: string;
}

interface ManifestMenuItem {
  command?: string;
}

interface ManifestView {
  id: string;
}

interface ManifestWelcomeItem {
  contents?: string;
}

interface Manifest {
  activationEvents: string[];
  contributes: {
    commands: ManifestCommand[];
    configuration: {
      properties: Record<string, unknown>;
    };
    menus?: Record<string, ManifestMenuItem[]>;
    views: {
      orbit: ManifestView[];
    };
    viewsWelcome?: ManifestWelcomeItem[];
  };
}

const REPO_ROOT = path.resolve(__dirname, '..', '..');
const MANIFEST_PATH = path.join(REPO_ROOT, 'package.json');
const COMMAND_URI_PATTERN = /command:([A-Za-z0-9_.-]+)/g;
const TEXT_FILE_EXTENSIONS = new Set(['.json', '.md', '.ts', '.tsx']);
const INVALID_ORBIT_VIEW_COMMAND_PATTERN = /workbench\.view\.extension\.orbit\.[A-Za-z0-9_.-]+/g;
const SOURCE_SCAN_TARGETS = ['package.json', 'README.md', 'src', 'webview-ui/src', 'test'];

function readManifest(): Manifest {
  return JSON.parse(fs.readFileSync(MANIFEST_PATH, 'utf8')) as Manifest;
}

function objectValues(record: Record<string, string>): string[] {
  return Object.values(record).sort();
}

function collectTextFiles(target: string): string[] {
  const fullPath = path.join(REPO_ROOT, target);
  if (!fs.existsSync(fullPath)) {
    return [];
  }
  const stat = fs.statSync(fullPath);
  if (stat.isFile()) {
    return TEXT_FILE_EXTENSIONS.has(path.extname(fullPath)) ? [fullPath] : [];
  }
  return fs.readdirSync(fullPath, { withFileTypes: true }).flatMap((entry) => {
    const child = path.join(target, entry.name);
    return collectTextFiles(child);
  });
}

function repositoryTextFiles(): Array<{ relativePath: string; text: string }> {
  return SOURCE_SCAN_TARGETS.flatMap((target) =>
    collectTextFiles(target).map((filePath) => ({
      relativePath: path.relative(REPO_ROOT, filePath),
      text: fs.readFileSync(filePath, 'utf8'),
    }))
  );
}

function commandUriReferences(text: string): string[] {
  return Array.from(text.matchAll(COMMAND_URI_PATTERN), (match) => match[1] ?? '');
}

suite('Manifest Contracts', () => {
  test('Should keep contributed commands in sync with command constants', () => {
    const manifest = readManifest();
    const contributedCommands = manifest.contributes.commands.map(({ command }) => command).sort();

    assert.deepStrictEqual(contributedCommands, objectValues(COMMAND_IDS));
  });

  test('Should keep contributed views in sync with view constants', () => {
    const manifest = readManifest();
    const contributedViews = manifest.contributes.views.orbit.map(({ id }) => id).sort();

    assert.deepStrictEqual(contributedViews, objectValues(VIEW_IDS));
  });

  test('Should keep contributed config keys in sync with config constants', () => {
    const manifest = readManifest();
    const contributedConfigKeys = Object.keys(manifest.contributes.configuration.properties).sort();

    assert.deepStrictEqual(contributedConfigKeys, objectValues(CONFIG_KEYS));
  });

  test('Should keep activation events pointed at contributed commands and views', () => {
    const manifest = readManifest();
    const contributedCommands = new Set(
      manifest.contributes.commands.map(({ command }) => command)
    );
    const contributedViews = new Set(manifest.contributes.views.orbit.map(({ id }) => id));

    manifest.activationEvents.forEach((event) => {
      if (event.startsWith('onCommand:')) {
        assert.ok(
          contributedCommands.has(event.replace('onCommand:', '')),
          `${event} should reference a contributed command`
        );
      }
      if (event.startsWith('onView:')) {
        assert.ok(
          contributedViews.has(event.replace('onView:', '')),
          `${event} should reference a contributed view`
        );
      }
    });
  });

  test('Should keep manifest menu and welcome command references registered', () => {
    const manifest = readManifest();
    const contributedCommands = new Set(
      manifest.contributes.commands.map(({ command }) => command)
    );

    Object.entries(manifest.contributes.menus ?? {}).forEach(([menu, items]) => {
      items.forEach(({ command }) => {
        if (!command) return;
        assert.ok(contributedCommands.has(command), `${menu} references registered ${command}`);
      });
    });

    (manifest.contributes.viewsWelcome ?? []).forEach(({ contents }) => {
      commandUriReferences(contents ?? '').forEach((command) => {
        assert.ok(
          contributedCommands.has(command),
          `viewsWelcome references registered ${command}`
        );
      });
    });
  });

  test('Should keep command URI links pointed at registered commands', () => {
    const allowedCommands = new Set([...Object.values(COMMAND_IDS), ORBIT_VIEW_CONTAINER_COMMAND]);

    repositoryTextFiles().forEach(({ relativePath, text }) => {
      commandUriReferences(text).forEach((command) => {
        assert.ok(allowedCommands.has(command), `${relativePath} links to registered ${command}`);
      });
    });
  });

  test('Should not contain invalid Orbit sub-view workbench commands', () => {
    repositoryTextFiles().forEach(({ relativePath, text }) => {
      const matches = Array.from(
        text.matchAll(INVALID_ORBIT_VIEW_COMMAND_PATTERN),
        (match) => match[0]
      );
      assert.deepStrictEqual(
        matches,
        [],
        `${relativePath} contains invalid Orbit sub-view commands: ${matches.join(', ')}`
      );
    });
  });

  test('Should have implementation files for contributed command groups and views', () => {
    const manifest = readManifest();
    const commandGroupFiles = new Map([
      ['orbit.health', 'src/commands/health.ts'],
      ['orbit.debug', 'src/commands/debug.ts'],
      ['orbit.a2a', 'src/commands/a2a.ts'],
      ['orbit.mcp.explorer', 'src/commands/mcp.ts'],
      ['orbit.sessions', 'src/commands/sessions.ts'],
    ]);
    const viewFiles = new Map([
      ['orbit.health', 'src/panels/health/HealthProvider.ts'],
      ['orbit.debug', 'src/panels/debug/DebugProvider.ts'],
      ['orbit.a2a', 'src/panels/a2a/A2AProvider.ts'],
      ['orbit.mcp.explorer', 'src/panels/mcp/McpExplorerProvider.ts'],
      ['orbit.info', 'src/panels/info/InfoWebviewPanel.ts'],
      ['orbit.sessions', 'src/panels/session/SessionWebviewPanel.ts'],
      ['orbit.tasks', 'src/panels/task/TaskWebviewPanel.ts'],
    ]);

    manifest.contributes.commands.forEach(({ command }) => {
      const group = Array.from(commandGroupFiles.keys()).find((prefix) =>
        command.startsWith(prefix)
      );
      assert.ok(group, `${command} should map to a command group`);
      const file = commandGroupFiles.get(group);
      assert.ok(file, `${group} should define an implementation file`);
      assert.ok(fs.existsSync(path.join(REPO_ROOT, file)), `${file} exists`);
    });

    manifest.contributes.views.orbit.forEach(({ id }) => {
      const file = viewFiles.get(id);
      assert.ok(file, `${id} should define an implementation file`);
      assert.ok(fs.existsSync(path.join(REPO_ROOT, file)), `${id} view file exists at ${file}`);
    });
  });
});
