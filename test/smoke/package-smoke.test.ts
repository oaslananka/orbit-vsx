import * as assert from 'node:assert';
import * as fs from 'node:fs';
import * as path from 'node:path';
import * as vscode from 'vscode';

interface ActivityBarContainer {
  id: string;
}

interface ManifestView {
  id: string;
}

interface ExtensionManifest {
  contributes: {
    viewsContainers: {
      activitybar: ActivityBarContainer[];
    };
    views: {
      orbit: ManifestView[];
    };
  };
}

const EXTENSION_ID = 'oaslananka.orbit-vsx';
const ORBIT_CONTAINER_ID = 'orbit';
const CORE_VIEW_IDS = ['orbit.health', 'orbit.debug', 'orbit.a2a', 'orbit.mcp.explorer'];
const EXPECTED_README_SECTIONS = [
  '## Features',
  '### Health Monitor',
  '### Debug Recorder',
  '### A2A Explorer',
  '### MCP Explorer',
  '## Quick Start',
  '## Requirements',
  '## Configuration',
  '## Troubleshooting',
  '## License',
];
const FORBIDDEN_README_CONTENT = ['Publishing (Maintainers)', 'VSCE_PAT', 'OVSX_PAT'];
const SHOW_EXTENSION_DETAILS_COMMAND = 'workbench.extensions.action.showExtensionsWithIds';

function getOrbitExtension(): vscode.Extension<unknown> {
  const extension = vscode.extensions.getExtension(EXTENSION_ID);
  assert.ok(extension, `Installed extension ${EXTENSION_ID} should be available`);
  return extension;
}

function getManifest(): ExtensionManifest {
  return getOrbitExtension().packageJSON as ExtensionManifest;
}

function getOrbitContainerCommand(): string {
  const container = getManifest().contributes.viewsContainers.activitybar.find(
    ({ id }) => id === ORBIT_CONTAINER_ID
  );
  assert.ok(container, `${ORBIT_CONTAINER_ID} activity-bar container should be contributed`);
  return `workbench.view.extension.${container.id}`;
}

function readInstalledReadme(extensionPath: string): string {
  const readmeEntry = fs
    .readdirSync(extensionPath)
    .find((entry) => entry.toLowerCase() === 'readme.md');
  assert.ok(readmeEntry, 'Packaged extension should include a README for Marketplace rendering');
  return fs.readFileSync(path.join(extensionPath, readmeEntry), 'utf8');
}

suite('Packaged Orbit VSIX', () => {
  test('Should install and activate from the packaged extension path', async () => {
    const extension = getOrbitExtension();

    assert.ok(fs.existsSync(path.join(extension.extensionPath, 'dist', 'extension.js')));
    await extension.activate();

    assert.ok(extension.isActive, `${EXTENSION_ID} should activate from the installed VSIX`);
  });

  test('Should open the Orbit activity-bar container and core views', async () => {
    const extension = getOrbitExtension();
    await extension.activate();
    const allCommands = await vscode.commands.getCommands(true);
    const containerCommand = getOrbitContainerCommand();

    assert.ok(allCommands.includes(containerCommand), `${containerCommand} should be registered`);
    assert.ok(!allCommands.includes(`${containerCommand}.health`));
    await vscode.commands.executeCommand(containerCommand);

    for (const viewId of CORE_VIEW_IDS) {
      const focusCommand = `${viewId}.focus`;
      assert.ok(allCommands.includes(focusCommand), `${focusCommand} should be registered`);
      await vscode.commands.executeCommand(focusCommand);
    }
  });

  test('Should expose expected Marketplace README sections from the installed VSIX', async () => {
    const extension = getOrbitExtension();
    const readme = readInstalledReadme(extension.extensionPath);

    EXPECTED_README_SECTIONS.forEach((section) => {
      assert.ok(readme.includes(section), `Packaged README should include ${section}`);
    });
    FORBIDDEN_README_CONTENT.forEach((content) => {
      assert.ok(!readme.includes(content), `Packaged README should not include ${content}`);
    });
    assert.ok(
      !fs.existsSync(path.join(extension.extensionPath, 'RELEASING.md')),
      'Packaged extension should exclude maintainer-only release instructions'
    );
    await vscode.commands.executeCommand(SHOW_EXTENSION_DETAILS_COMMAND, [EXTENSION_ID]);
  });
});
