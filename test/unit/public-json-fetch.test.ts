import * as assert from 'node:assert';
import {
  PublicNetworkPolicyError,
  createPinnedHttpsRequestOptions,
  fetchPublicJson,
  isPublicIpAddress,
  type PublicHttpsResponse,
  type PublicJsonFetchOptions,
  type ResolvedAddress,
} from '../../src/utils/publicJsonFetch';

interface FakeResponseOptions {
  body?: Array<string | Uint8Array>;
  headers?: Record<string, string | string[] | undefined>;
  statusCode?: number;
  statusMessage?: string;
}

function fakeResponse(
  options: FakeResponseOptions = {}
): PublicHttpsResponse & { destroyed: boolean } {
  const chunks = options.body ?? [];
  const response = {
    destroyed: false,
    headers: options.headers ?? {},
    statusCode: options.statusCode ?? 200,
    statusMessage: options.statusMessage ?? 'OK',
    body: (async function* (): AsyncIterable<Uint8Array> {
      for (const chunk of chunks) {
        yield typeof chunk === 'string' ? Buffer.from(chunk) : chunk;
      }
    })(),
    destroy(): void {
      response.destroyed = true;
    },
  };
  return response;
}

function publicResolver(addresses: ResolvedAddress[] = [{ address: '1.1.1.1', family: 4 }]) {
  return async (): Promise<ResolvedAddress[]> => addresses;
}

function options(
  responses: PublicHttpsResponse[],
  seen: Array<{ address: ResolvedAddress; url: string }> = []
): PublicJsonFetchOptions {
  return {
    resolver: publicResolver(),
    transport: async (url, address) => {
      seen.push({ address, url: url.toString() });
      const response = responses.shift();
      assert.ok(response, 'a fake response should be available');
      return response;
    },
  };
}

suite('Public JSON Fetch', () => {
  test('Should classify public and special-use IPv4 and IPv6 ranges', () => {
    ['1.1.1.1', '8.8.8.8', '2606:4700:4700::1111'].forEach((address) => {
      assert.strictEqual(isPublicIpAddress(address), true, `${address} should be public`);
    });

    [
      '0.0.0.0',
      '10.0.0.1',
      '100.64.0.1',
      '127.0.0.1',
      '169.254.169.254',
      '172.16.0.1',
      '192.168.0.1',
      '224.0.0.1',
      '255.255.255.255',
      '::',
      '::1',
      'fc00::1',
      'fe80::1',
      'ff02::1',
      '::ffff:127.0.0.1',
      '64:ff9b::7f00:1',
      '2001:db8::1',
    ].forEach((address) => {
      assert.strictEqual(isPublicIpAddress(address), false, `${address} should be blocked`);
    });
  });

  test('Should pin HTTPS transport to the validated address while preserving Host and SNI', () => {
    const controller = new AbortController();
    const requestOptions = createPinnedHttpsRequestOptions(
      new URL('https://agent.example:8443/card.json?version=1'),
      { address: '1.1.1.1', family: 4 },
      controller.signal
    );

    assert.strictEqual(requestOptions.hostname, '1.1.1.1');
    assert.strictEqual(requestOptions.family, 4);
    assert.strictEqual(requestOptions.port, 8443);
    assert.strictEqual(requestOptions.path, '/card.json?version=1');
    assert.strictEqual(requestOptions.servername, 'agent.example');
    assert.deepStrictEqual(requestOptions.headers, {
      Accept: 'application/json',
      Host: 'agent.example:8443',
    });
    assert.strictEqual(requestOptions.agent, false);
  });

  test('Should reject encoded and DNS-resolved private destinations before transport', async () => {
    let transportCalled = false;
    const blockedOptions: PublicJsonFetchOptions = {
      resolver: publicResolver([{ address: '169.254.169.254', family: 4 }]),
      transport: async () => {
        transportCalled = true;
        return fakeResponse({ body: ['{}'] });
      },
    };

    await assert.rejects(
      () => fetchPublicJson('https://agent.example/card.json', blockedOptions),
      (error: unknown) => {
        assert.ok(error instanceof PublicNetworkPolicyError);
        assert.strictEqual(error.code, 'blocked_address');
        return true;
      }
    );
    assert.strictEqual(transportCalled, false);

    await assert.rejects(
      () => fetchPublicJson('https://0x7f000001/card.json', options([])),
      /localhost|private|public/i
    );
  });

  test('Should pin requests to a validated DNS address and follow safe relative redirects', async () => {
    const seen: Array<{ address: ResolvedAddress; url: string }> = [];
    const result = await fetchPublicJson<{ ok: boolean }>(
      'https://agent.example/card.json',
      options(
        [
          fakeResponse({ headers: { location: '/v1/card.json' }, statusCode: 302 }),
          fakeResponse({ body: ['{"ok":true}'] }),
        ],
        seen
      )
    );

    assert.deepStrictEqual(result, { ok: true });
    assert.deepStrictEqual(seen, [
      {
        address: { address: '1.1.1.1', family: 4 },
        url: 'https://agent.example/card.json',
      },
      {
        address: { address: '1.1.1.1', family: 4 },
        url: 'https://agent.example/v1/card.json',
      },
    ]);
  });

  test('Should block unsafe redirects, loops, and excessive chains', async () => {
    await assert.rejects(
      () =>
        fetchPublicJson(
          'https://agent.example/card.json',
          options([
            fakeResponse({
              headers: { location: 'http://169.254.169.254/latest/meta-data' },
              statusCode: 302,
            }),
          ])
        ),
      (error: unknown) => {
        assert.ok(error instanceof PublicNetworkPolicyError);
        assert.strictEqual(error.code, 'invalid_redirect');
        return true;
      }
    );

    await assert.rejects(
      () =>
        fetchPublicJson(
          'https://agent.example/card.json',
          options([
            fakeResponse({
              headers: { location: 'https://192.168.1.10/agent-card.json' },
              statusCode: 302,
            }),
          ])
        ),
      (error: unknown) => {
        assert.ok(error instanceof PublicNetworkPolicyError);
        assert.strictEqual(error.code, 'invalid_redirect');
        return true;
      }
    );

    await assert.rejects(
      () =>
        fetchPublicJson(
          'https://agent.example/card.json',
          options([fakeResponse({ headers: { location: '/card.json' }, statusCode: 302 })])
        ),
      (error: unknown) => {
        assert.ok(error instanceof PublicNetworkPolicyError);
        assert.strictEqual(error.code, 'redirect_loop');
        return true;
      }
    );

    const redirectResponses = Array.from({ length: 3 }, (_, index) =>
      fakeResponse({ headers: { location: `/redirect-${index + 1}.json` }, statusCode: 302 })
    );
    await assert.rejects(
      () =>
        fetchPublicJson('https://agent.example/card.json', {
          ...options(redirectResponses),
          maxRedirects: 2,
        }),
      (error: unknown) => {
        assert.ok(error instanceof PublicNetworkPolicyError);
        assert.strictEqual(error.code, 'too_many_redirects');
        return true;
      }
    );
  });

  test('Should reject oversized declared and chunked bodies before full buffering', async () => {
    const declared = fakeResponse({
      body: ['must not be read'],
      headers: { 'content-length': '1025' },
    });
    await assert.rejects(
      () =>
        fetchPublicJson('https://agent.example/card.json', {
          ...options([declared]),
          maxBytes: 1024,
        }),
      (error: unknown) => {
        assert.ok(error instanceof PublicNetworkPolicyError);
        assert.strictEqual(error.code, 'response_too_large');
        return true;
      }
    );
    assert.strictEqual(declared.destroyed, true);

    const chunked = fakeResponse({ body: ['12345678', 'abcdefgh'] });
    await assert.rejects(
      () =>
        fetchPublicJson('https://agent.example/card.json', {
          ...options([chunked]),
          maxBytes: 10,
        }),
      (error: unknown) => {
        assert.ok(error instanceof PublicNetworkPolicyError);
        assert.strictEqual(error.code, 'response_too_large');
        return true;
      }
    );
    assert.strictEqual(chunked.destroyed, true);
  });

  test('Should reject a hostname when any DNS answer is non-public', async () => {
    await assert.rejects(
      () =>
        fetchPublicJson('https://agent.example/card.json', {
          ...options([]),
          resolver: publicResolver([
            { address: '1.1.1.1', family: 4 },
            { address: '10.0.0.5', family: 4 },
          ]),
        }),
      (error: unknown) => {
        assert.ok(error instanceof PublicNetworkPolicyError);
        assert.strictEqual(error.code, 'blocked_address');
        return true;
      }
    );
  });
});
