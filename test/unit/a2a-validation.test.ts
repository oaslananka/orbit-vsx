import * as assert from 'node:assert';
import {
  AgentCardValidationError,
  resolveAgentCardDiscoveryUrl,
  validateAgentCardPayload,
  validateAgentCardText,
  validateAgentRegistryPayload,
} from '../../src/panels/a2a/agentCardValidation';

function validAgentCard(): Record<string, unknown> {
  return {
    capabilities: { pushNotifications: false, streaming: true },
    defaultInputModes: ['application/json'],
    defaultOutputModes: ['application/json'],
    description: 'Answers support questions',
    documentationUrl: 'https://agents.example.com/docs',
    name: 'support-agent',
    provider: { organization: 'Example Inc.', url: 'https://example.com' },
    securitySchemes: {
      bearerAuth: { scheme: 'bearer', type: 'http' },
    },
    skills: [
      {
        description: 'Answer questions',
        id: 'answer_questions',
        name: 'Answer Questions',
        tags: ['support', 'qa'],
      },
    ],
    supportedInterfaces: [
      {
        protocolBinding: 'jsonrpc',
        protocolVersion: '1.0',
        url: 'https://agents.example.com/a2a',
      },
    ],
    version: '1.0.0',
  };
}

suite('A2A Agent Card Validation', () => {
  test('Should accept a current Agent Card shape', () => {
    const card = validateAgentCardPayload(validAgentCard());

    assert.strictEqual(card.name, 'support-agent');
    assert.strictEqual(card.supportedInterfaces[0]?.url, 'https://agents.example.com/a2a');
    assert.strictEqual(card.skills[0]?.tags[0], 'support');
  });

  test('Should reject malformed and incomplete discovered cards', () => {
    assert.throws(
      () => validateAgentCardPayload({ ...validAgentCard(), capabilities: undefined }),
      (error: unknown) => {
        assert.ok(error instanceof AgentCardValidationError);
        assert.ok(error.message.includes('$.capabilities'));
        return true;
      }
    );

    const result = validateAgentCardText(
      JSON.stringify({
        ...validAgentCard(),
        skills: [{ id: 'skill', name: 'Skill', description: 'Desc' }],
      })
    );

    assert.strictEqual(result.valid, false);
    assert.match(result.errors.join('\n'), /tags/);
  });

  test('Should reject hostile card URLs and credential material', () => {
    const hostile = {
      ...validAgentCard(),
      access_key: 'secret-token',
      supportedInterfaces: [
        {
          protocolBinding: 'jsonrpc',
          protocolVersion: '1.0',
          url: 'http://127.0.0.1:9999/a2a',
        },
      ],
    };

    assert.throws(
      () => validateAgentCardPayload(hostile),
      (error: unknown) => {
        assert.ok(error instanceof AgentCardValidationError);
        assert.match(error.message, /credential material/);
        assert.match(error.message, /localhost|private|HTTPS/);
        return true;
      }
    );
  });

  test('Should validate registry entries before rendering', () => {
    const entries = validateAgentRegistryPayload([
      { card: validAgentCard(), lastSeen: '2026-06-24T00:00:00.000Z', online: true },
    ]);

    assert.strictEqual(entries[0]?.validation.valid, true);
    assert.strictEqual(entries[0]?.card.name, 'support-agent');

    assert.throws(
      () =>
        validateAgentRegistryPayload([{ card: { name: 'broken' }, lastSeen: '', online: 'yes' }]),
      AgentCardValidationError
    );
  });

  test('Should resolve safe well-known discovery URLs only', () => {
    assert.strictEqual(
      resolveAgentCardDiscoveryUrl('https://agent.example.com'),
      'https://agent.example.com/.well-known/agent-card.json'
    );
    assert.strictEqual(
      resolveAgentCardDiscoveryUrl('https://agent.example.com/custom/card.json'),
      'https://agent.example.com/custom/card.json'
    );
    assert.throws(() => resolveAgentCardDiscoveryUrl('http://agent.example.com'), /HTTPS/);
    assert.throws(
      () => resolveAgentCardDiscoveryUrl('https://user:pass@agent.example.com'),
      /credentials/
    );
    assert.throws(() => resolveAgentCardDiscoveryUrl('http://127.0.0.1:3000'), /localhost|private/);
  });
});
