import * as assert from 'node:assert';
import { A2AClient } from '../../src/panels/a2a/A2AClient';
import { DebugClient } from '../../src/panels/debug/DebugClient';
import { HealthClient } from '../../src/panels/health/HealthClient';
import { HttpError, getJson, postJson } from '../../src/utils/http';

interface CapturedRequest {
  body?: unknown;
  headers: Record<string, string>;
  method: string;
  url: string;
}

interface JsonRpcToolCallBody {
  id?: number;
  method?: string;
  params: {
    arguments?: Record<string, unknown>;
    name: string;
  };
}

type JsonRpcResponder = (name: string, args: Record<string, unknown>) => unknown;

const originalFetch = globalThis.fetch;

function jsonResponse(body: unknown, init: ResponseInit = {}): Response {
  return new Response(JSON.stringify(body), {
    headers: { 'Content-Type': 'application/json' },
    status: 200,
    ...init,
  });
}

function installJsonFetch(responseBody: unknown, requests: CapturedRequest[] = []): void {
  globalThis.fetch = (async (input: RequestInfo | URL, init?: RequestInit): Promise<Response> => {
    const body = init?.body ? (JSON.parse(String(init.body)) as JsonRpcToolCallBody) : undefined;
    requests.push({
      body,
      headers: (init?.headers ?? {}) as Record<string, string>,
      method: init?.method ?? 'GET',
      url: String(input),
    });

    if (body?.method === 'tools/call' && typeof body.id === 'number' && isRecord(responseBody)) {
      const shouldWrap =
        responseBody.jsonrpc === undefined &&
        (responseBody.result !== undefined || responseBody.error !== undefined);
      if (shouldWrap) {
        return jsonResponse({ jsonrpc: '2.0', ...responseBody, id: body.id });
      }
    }

    return jsonResponse(responseBody);
  }) as typeof fetch;
}

function installJsonRpcFetch(responder: JsonRpcResponder, requests: CapturedRequest[] = []): void {
  globalThis.fetch = (async (input: RequestInfo | URL, init?: RequestInit): Promise<Response> => {
    const body = init?.body ? (JSON.parse(String(init.body)) as JsonRpcToolCallBody) : undefined;
    requests.push({
      body,
      headers: (init?.headers ?? {}) as Record<string, string>,
      method: init?.method ?? 'GET',
      url: String(input),
    });

    assert.ok(body, 'JSON-RPC request body should be captured');
    assert.strictEqual(body.method, 'tools/call');
    assert.strictEqual(typeof body.id, 'number');
    return jsonResponse({
      jsonrpc: '2.0',
      result: responder(body.params.name, body.params.arguments ?? {}),
      id: body.id,
    });
  }) as typeof fetch;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function mcpServer(name = 'local'): Record<string, unknown> {
  return {
    lastCheck: '2026-06-02T00:00:00.000Z',
    latencyMs: 12,
    name,
    status: 'up',
    uptime: 99.5,
    url: 'http://127.0.0.1:8080',
  };
}

function toolCallBody(request: CapturedRequest | undefined): JsonRpcToolCallBody {
  assert.ok(request?.body, 'request body should be captured');
  return request.body as JsonRpcToolCallBody;
}

function debugSession(id = 'session-1'): Record<string, unknown> {
  return {
    createdAt: '2026-06-02T00:00:00.000Z',
    fixAttempts: [],
    id,
    status: 'open',
    tags: [],
    terminalCommands: [],
    title: 'Fix auth',
    updatedAt: '2026-06-02T00:00:00.000Z',
  };
}

suite('HTTP and Client Contracts', () => {
  teardown(() => {
    globalThis.fetch = originalFetch;
  });

  test('Should send JSON POST requests with headers and body', async () => {
    const requests: CapturedRequest[] = [];
    installJsonFetch({ ok: true }, requests);

    const result = await postJson<{ ok: boolean }>(
      'http://127.0.0.1:3000/mcp',
      { name: 'list_servers' },
      { Authorization: 'Bearer token' }
    );

    assert.deepStrictEqual(result, { ok: true });
    assert.strictEqual(requests[0]?.method, 'POST');
    assert.deepStrictEqual(requests[0]?.body, { name: 'list_servers' });
    assert.strictEqual(requests[0]?.headers.Authorization, 'Bearer token');
  });

  test('Should throw HttpError for non-OK responses', async () => {
    globalThis.fetch = (async (): Promise<Response> => {
      return new Response('missing', { status: 404, statusText: 'Not Found' });
    }) as typeof fetch;

    await assert.rejects(() => getJson('http://127.0.0.1:3000/missing'), HttpError);
  });

  test('Should map HealthClient MCP calls to JSON-RPC tool calls', async () => {
    const requests: CapturedRequest[] = [];
    installJsonFetch({ result: { servers: [mcpServer('local')] } }, requests);
    const client = new HealthClient('http://127.0.0.1:3000', 'health-token');

    const servers = await client.listServers();

    assert.strictEqual(servers[0]?.name, 'local');
    assert.strictEqual(requests[0]?.url, 'http://127.0.0.1:3000/mcp');
    assert.strictEqual(requests[0]?.headers.Authorization, 'Bearer health-token');
    assert.strictEqual(toolCallBody(requests[0]).params.name, 'list_servers');
  });

  test('Should report HealthClient checkHealth failures as false', async () => {
    globalThis.fetch = (async (): Promise<Response> => {
      throw new Error('offline');
    }) as typeof fetch;
    const client = new HealthClient('http://127.0.0.1:3000', '');

    assert.strictEqual(await client.checkHealth(), false);
  });

  test('Should map HealthClient mutation and dashboard calls to MCP tools', async () => {
    const calls: string[] = [];
    installJsonRpcFetch((name, args) => {
      calls.push(`${name}:${JSON.stringify(args)}`);
      if (name === 'get_dashboard') {
        return { servers: [], summary: { degraded: 0, down: 0, total: 0, up: 0 } };
      }
      if (name === 'get_uptime') return { uptime: 42 };
      return {};
    });
    const client = new HealthClient('http://127.0.0.1:3000', '');

    await client.registerServer('api', 'http://127.0.0.1:8080');
    await client.unregisterServer('api');
    const dashboard = await client.getDashboard();
    await client.checkAll();
    const uptime = await client.getUptime('api');

    assert.deepStrictEqual(dashboard.summary, { degraded: 0, down: 0, total: 0, up: 0 });
    assert.strictEqual(uptime, 42);
    assert.deepStrictEqual(calls, [
      'register_server:{"name":"api","url":"http://127.0.0.1:8080"}',
      'unregister_server:{"name":"api"}',
      'get_dashboard:{}',
      'check_all:{}',
      'get_uptime:{"name":"api"}',
    ]);
  });

  test('Should throw HealthClient MCP errors with server message', async () => {
    installJsonFetch({ error: { code: -32000, message: 'health backend failed' } });
    const client = new HealthClient('http://127.0.0.1:3000', '');

    await assert.rejects(() => client.listServers(), /health backend failed/);
  });

  test('Should reject malformed JSON-RPC envelopes and result shapes', async () => {
    installJsonFetch({ result: { servers: [mcpServer('local')] }, id: 999, jsonrpc: '2.0' });
    const healthClient = new HealthClient('http://127.0.0.1:3000', '');

    await assert.rejects(() => healthClient.listServers(), /response id did not match/);

    installJsonFetch({ result: { sessions: [{ id: 'missing-fields' }] } });
    const debugClient = new DebugClient('http://127.0.0.1:3001', '');

    await assert.rejects(() => debugClient.listSessions(), /expected string/);
  });

  test('Should map DebugClient commands to JSON-RPC tool calls', async () => {
    const requests: CapturedRequest[] = [];
    installJsonFetch({ result: {} }, requests);
    const client = new DebugClient('http://127.0.0.1:3001', 'debug-token');

    await client.recordCommand('session-1', 'pnpm test');

    assert.strictEqual(requests[0]?.url, 'http://127.0.0.1:3001/mcp');
    assert.strictEqual(requests[0]?.headers.Authorization, 'Bearer debug-token');
    assert.strictEqual(toolCallBody(requests[0]).params.name, 'record_command');
    assert.deepStrictEqual(toolCallBody(requests[0]).params.arguments, {
      command: 'pnpm test',
      sessionId: 'session-1',
    });
  });

  test('Should map DebugClient session operations to MCP tools', async () => {
    const calls: string[] = [];
    installJsonRpcFetch((name, args) => {
      calls.push(`${name}:${JSON.stringify(args)}`);
      if (name === 'list_sessions' || name === 'find_similar_errors') {
        return { sessions: [debugSession()] };
      }
      if (name === 'search_sessions') return { sessions: [debugSession()], total: 1 };
      if (name === 'start_debug_session' || name === 'get_session_context') return debugSession();
      return {};
    });
    const client = new DebugClient('http://127.0.0.1:3001', '');

    assert.strictEqual((await client.listSessions())[0]?.id, 'session-1');
    assert.strictEqual((await client.startDebugSession('Fix auth')).title, 'Fix auth');
    await client.closeSession('session-1');
    assert.strictEqual((await client.getSessionContext('session-1')).id, 'session-1');
    assert.strictEqual((await client.searchSessions('auth')).total, 1);
    assert.strictEqual((await client.findSimilarErrors('stack'))[0]?.id, 'session-1');
    await client.addFix('session-1', 'rerun tests');

    assert.deepStrictEqual(calls, [
      'list_sessions:{}',
      'start_debug_session:{"title":"Fix auth"}',
      'close_session:{"id":"session-1"}',
      'get_session_context:{"id":"session-1"}',
      'search_sessions:{"query":"auth"}',
      'find_similar_errors:{"errorText":"stack"}',
      'add_fix:{"sessionId":"session-1","description":"rerun tests"}',
    ]);
  });

  test('Should throw DebugClient MCP errors with server message', async () => {
    installJsonFetch({ error: { code: -32000, message: 'debug backend failed' } });
    const client = new DebugClient('http://127.0.0.1:3001', '');

    await assert.rejects(() => client.listSessions(), /debug backend failed/);
  });

  test('Should map A2AClient HTTP endpoints and keep configured CLI path', async () => {
    const requests: CapturedRequest[] = [];
    installJsonFetch(
      {
        card: { description: 'desc', name: 'agent-a', skills: [], version: '1.0.0' },
        lastSeen: '2026-06-02T00:00:00.000Z',
        online: true,
      },
      requests
    );
    const client = new A2AClient('http://127.0.0.1:3099', 'a2a-warp');

    const agent = await client.getAgent('agent a');

    assert.strictEqual(agent.card.name, 'agent-a');
    assert.strictEqual(client.getCliPath(), 'a2a-warp');
    assert.strictEqual(requests[0]?.url, 'http://127.0.0.1:3099/agents/agent%20a');
  });

  test('Should map A2AClient registry and agent-card reads', async () => {
    const requests: CapturedRequest[] = [];
    installJsonFetch(
      [
        {
          card: { description: 'desc', name: 'agent-a', skills: [], version: '1.0.0' },
          lastSeen: '2026-06-02T00:00:00.000Z',
          online: true,
        },
      ],
      requests
    );
    const client = new A2AClient('http://127.0.0.1:3099', 'a2a-warp');

    const agents = await client.listAgents();

    assert.strictEqual(agents[0]?.card.name, 'agent-a');
    assert.strictEqual(requests[0]?.url, 'http://127.0.0.1:3099/agents');

    installJsonFetch(
      { description: 'desc', name: 'agent-b', skills: [], version: '1.0.0' },
      requests
    );
    const card = await client.fetchAgentCard('https://example.com/agent-card.json');

    assert.strictEqual(card.name, 'agent-b');
    assert.strictEqual(requests[1]?.url, 'https://example.com/agent-card.json');
  });

  test('Should reject unsafe agent-card URLs before network fetch', async () => {
    const client = new A2AClient('http://127.0.0.1:3099', 'a2a-warp');

    await assert.rejects(() => client.fetchAgentCard('file:///tmp/agent-card.json'), /http/);
    await assert.rejects(
      () => client.fetchAgentCard('https://user:pass@example.com/card.json'),
      /credentials/
    );
    await assert.rejects(
      () => client.fetchAgentCard('http://127.0.0.1:3000/card.json'),
      /localhost|private/
    );
    await assert.rejects(
      () => client.fetchAgentCard('http://192.168.1.50/card.json'),
      /localhost|private/
    );
  });

  test('Should redact URL credentials and query values in transport errors', async () => {
    globalThis.fetch = (async (): Promise<Response> => {
      throw new Error('network down');
    }) as typeof fetch;

    await assert.rejects(
      () => getJson('https://user:pass@example.com/agent.json?token=secret'),
      (error: unknown) => {
        const message = error instanceof Error ? error.message : String(error);
        assert.match(message, /https:\/\/example.com\/agent.json\?%E2%80%A6/);
        assert.ok(!message.includes('user'));
        assert.ok(!message.includes('pass'));
        assert.ok(!message.includes('secret'));
        return true;
      }
    );
  });

  test('Should convert A2A CLI validation failures into validation errors', async () => {
    const client = new A2AClient('http://127.0.0.1:3099', 'missing-a2a-cli');

    const result = await client.validateAgentCard('agent-card.json');

    assert.strictEqual(result.valid, false);
    assert.ok(result.errors.length > 0);
  });
});
