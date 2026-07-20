import * as assert from 'node:assert';
import * as fs from 'node:fs';
import * as path from 'node:path';

const REPO_ROOT = path.resolve(__dirname, '..', '..');

function read(relativePath: string): string {
  return fs.readFileSync(path.join(REPO_ROOT, relativePath), 'utf8');
}

suite('Agent Card Trust Surface Contracts', () => {
  test('Should expose an exact trusted JWKS allowlist configuration', () => {
    const manifest = JSON.parse(read('package.json')) as {
      contributes: {
        configuration: {
          properties: Record<string, { type: string; default: unknown; items?: { type: string } }>;
        };
      };
    };
    const setting = manifest.contributes.configuration.properties['orbit.a2a.trustedJwksUrls'];

    assert.strictEqual(setting?.type, 'array');
    assert.deepStrictEqual(setting?.default, []);
    assert.strictEqual(setting?.items?.type, 'string');
    assert.match(read('src/config.ts'), /readTrustedJwksUrls/);
    assert.match(read('src/config.ts'), /must use HTTPS/);
  });

  test('Should surface schema and trust independently across every Agent Card consumer', () => {
    const provider = read('src/panels/a2a/A2AProvider.ts');
    const commands = read('src/commands/a2a.ts');
    const tools = read('src/lm/orbitTools.ts');
    const webview = read('webview-ui/src/a2a/App.tsx');

    assert.match(provider, /Orbit A2A Schema/);
    assert.match(provider, /Orbit A2A Trust/);
    assert.match(provider, /trust\.state/);
    assert.match(commands, /detail: `trust:\$\{inspection\.trust\.state\}`/);
    assert.match(provider, /operation: 'verify_agent_card_signature'/);
    assert.match(tools, /trust: summarizeAgentCardTrust/);
    assert.match(webview, /Signature trust/);
    assert.match(webview, /does not\s+independently endorse/s);
  });

  test('Should avoid logging raw signatures or key material', () => {
    const verifier = read('src/panels/a2a/agentCardTrust.ts');
    const commands = read('src/commands/a2a.ts');

    assert.doesNotMatch(verifier, /console\.|Logger|recordAuditEvent/);
    assert.match(commands, /trust:\$\{inspection\.trust\.state\}/);
    assert.doesNotMatch(commands, /JSON\.stringify\(inspection\.card\.signatures/);
    assert.doesNotMatch(commands, /detail:.*protected|detail:.*signature|detail:.*jwks/i);
  });

  test('Should document algorithms, key policy, cache, state meaning, and limitations', () => {
    const securityModel = read('docs/SECURITY_MODEL.md');

    assert.match(securityModel, /ES256.*RS256/s);
    assert.match(securityModel, /RFC 8785/);
    assert.match(securityModel, /same-origin/i);
    assert.match(securityModel, /trustedJwksUrls/);
    assert.match(securityModel, /five minutes/i);
    for (const state of ['unsigned', 'unverified', 'verified', 'invalid', 'key-unavailable']) {
      assert.ok(securityModel.includes(`\`${state}\``), `${state} should be documented`);
    }
    assert.match(securityModel, /does not.*endorse|not.*endorsement/is);
  });
});
