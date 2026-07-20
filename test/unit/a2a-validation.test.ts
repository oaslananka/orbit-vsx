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

  test('Should accept canonical A2A 1.0 security wrappers and extended card capabilities', () => {
    const payload = {
      ...validAgentCard(),
      capabilities: {
        extendedAgentCard: true,
        pushNotifications: false,
        streaming: true,
      },
      securityRequirements: [
        {
          schemes: {
            oidc: { list: ['openid', 'profile'] },
          },
        },
      ],
      securitySchemes: {
        apiKey: {
          apiKeySecurityScheme: {
            location: 'header',
            name: 'X-API-Key',
          },
        },
        bearer: {
          httpAuthSecurityScheme: {
            bearerFormat: 'JWT',
            scheme: 'Bearer',
          },
        },
        mtls: {
          mtlsSecurityScheme: {
            description: 'Client certificate authentication',
          },
        },
        oauth: {
          oauth2SecurityScheme: {
            flows: {
              clientCredentials: {
                scopes: { 'agent.read': 'Read agent data' },
                tokenUrl: 'https://auth.example.com/token',
              },
            },
            oauth2MetadataUrl: 'https://auth.example.com/.well-known/oauth-authorization-server',
          },
        },
        oidc: {
          openIdConnectSecurityScheme: {
            openIdConnectUrl: 'https://accounts.example.com/.well-known/openid-configuration',
          },
        },
      },
      skills: [
        {
          description: 'Answer questions',
          id: 'answer_questions',
          name: 'Answer Questions',
          securityRequirements: [
            {
              schemes: {
                oidc: { list: ['openid'] },
              },
            },
          ],
          tags: ['support', 'qa'],
        },
      ],
    };

    const card = validateAgentCardPayload(payload);

    assert.strictEqual(card.capabilities.extendedAgentCard, true);
    assert.deepStrictEqual(card.securitySchemes, {
      apiKey: {
        apiKeySecurityScheme: { location: 'header', name: 'X-API-Key' },
      },
      bearer: {
        httpAuthSecurityScheme: { bearerFormat: 'JWT', scheme: 'Bearer' },
      },
      mtls: {
        mtlsSecurityScheme: { description: 'Client certificate authentication' },
      },
      oauth: {
        oauth2SecurityScheme: {
          flows: {
            clientCredentials: {
              scopes: { 'agent.read': 'Read agent data' },
              tokenUrl: 'https://auth.example.com/token',
            },
          },
          oauth2MetadataUrl: 'https://auth.example.com/.well-known/oauth-authorization-server',
        },
      },
      oidc: {
        openIdConnectSecurityScheme: {
          openIdConnectUrl: 'https://accounts.example.com/.well-known/openid-configuration',
        },
      },
    });
    assert.deepStrictEqual(card.securityRequirements, [
      { schemes: { oidc: { list: ['openid', 'profile'] } } },
    ]);
    assert.deepStrictEqual(card.skills[0]?.securityRequirements, [
      { schemes: { oidc: { list: ['openid'] } } },
    ]);
  });

  test('Should normalize legacy security shapes without losing their meaning', () => {
    const payload: Record<string, unknown> = {
      ...validAgentCard(),
      security: [{ bearerAuth: [] }],
      securitySchemes: {
        bearerAuth: { bearerFormat: 'JWT', scheme: 'bearer', type: 'http' },
        oidc: {
          openIdConnectUrl: 'https://accounts.example.com/.well-known/openid-configuration',
          type: 'openIdConnect',
        },
      },
    };
    delete payload.securityRequirements;

    const card = validateAgentCardPayload(payload);

    assert.deepStrictEqual(card.securityRequirements, [{ schemes: { bearerAuth: { list: [] } } }]);
    assert.deepStrictEqual(card.securitySchemes?.bearerAuth, {
      httpAuthSecurityScheme: { bearerFormat: 'JWT', scheme: 'bearer' },
    });
    assert.deepStrictEqual(card.securitySchemes?.oidc, {
      openIdConnectSecurityScheme: {
        openIdConnectUrl: 'https://accounts.example.com/.well-known/openid-configuration',
      },
    });
  });

  test('Should reject ambiguous A2A 1.0 security scheme wrappers', () => {
    assert.throws(
      () =>
        validateAgentCardPayload({
          ...validAgentCard(),
          securitySchemes: {
            ambiguous: {
              httpAuthSecurityScheme: { scheme: 'Bearer' },
              mtlsSecurityScheme: {},
            },
          },
        }),
      (error: unknown) => {
        assert.ok(error instanceof AgentCardValidationError);
        assert.match(error.message, /exactly one security scheme wrapper/);
        return true;
      }
    );
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
