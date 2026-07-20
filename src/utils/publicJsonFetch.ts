import { lookup as dnsLookup } from 'node:dns/promises';
import * as https from 'node:https';
import * as net from 'node:net';
import * as tls from 'node:tls';
import { HttpError } from './http';
import { normalizeHttpUrl, redactUrl } from './urlSafety';

const DEFAULT_MAX_BYTES = 256 * 1024;
const DEFAULT_MAX_REDIRECTS = 5;
const DEFAULT_TIMEOUT_MS = 15000;
const REDIRECT_STATUS_CODES = new Set([301, 302, 303, 307, 308]);

export type PublicNetworkPolicyCode =
  | 'invalid_url'
  | 'invalid_redirect'
  | 'blocked_address'
  | 'redirect_loop'
  | 'too_many_redirects'
  | 'response_too_large';

export class PublicNetworkPolicyError extends Error {
  constructor(
    public readonly code: PublicNetworkPolicyCode,
    message: string
  ) {
    super(message);
    this.name = 'PublicNetworkPolicyError';
  }
}

export interface ResolvedAddress {
  address: string;
  family: 4 | 6;
}

export interface PublicHttpsResponse {
  statusCode: number;
  statusMessage?: string;
  headers: Record<string, string | string[] | undefined>;
  body: AsyncIterable<Uint8Array>;
  destroy(): void;
}

export type PublicDnsResolver = (hostname: string) => Promise<ResolvedAddress[]>;
export type PublicHttpsTransport = (
  url: URL,
  address: ResolvedAddress,
  signal: AbortSignal
) => Promise<PublicHttpsResponse>;

export interface PublicJsonFetchOptions {
  timeout?: number;
  maxBytes?: number;
  maxRedirects?: number;
  resolver?: PublicDnsResolver;
  transport?: PublicHttpsTransport;
}

const blockedIpv4 = createBlockedIpv4List();
const blockedIpv6 = createBlockedIpv6List();
const globalIpv6 = new net.BlockList();
globalIpv6.addSubnet('2000::', 3, 'ipv6');

export function isPublicIpAddress(address: string): boolean {
  const family = net.isIP(address);
  if (family === 4) return !blockedIpv4.check(address, 'ipv4');
  if (family === 6) {
    return globalIpv6.check(address, 'ipv6') && !blockedIpv6.check(address, 'ipv6');
  }
  return false;
}

export function isPublicNetworkPolicyError(error: unknown): error is PublicNetworkPolicyError {
  return error instanceof PublicNetworkPolicyError;
}

export async function fetchPublicJson<T = unknown>(
  value: string,
  options: PublicJsonFetchOptions = {}
): Promise<T> {
  const timeout = options.timeout ?? DEFAULT_TIMEOUT_MS;
  const maxBytes = options.maxBytes ?? DEFAULT_MAX_BYTES;
  const maxRedirects = options.maxRedirects ?? DEFAULT_MAX_REDIRECTS;
  const resolver = options.resolver ?? defaultResolver;
  const transport = options.transport ?? requestPinnedHttps;

  validatePositiveInteger(timeout, 'timeout');
  validatePositiveInteger(maxBytes, 'maxBytes');
  validateNonNegativeInteger(maxRedirects, 'maxRedirects');

  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), timeout);
  let currentUrl: URL | undefined;

  try {
    currentUrl = normalizePublicHttpsUrl(value, 'Agent Card discovery URL', 'invalid_url');
    const visited = new Set<string>();
    let redirectCount = 0;

    while (true) {
      const currentKey = currentUrl.toString();
      if (visited.has(currentKey)) {
        throw new PublicNetworkPolicyError(
          'redirect_loop',
          'Agent Card discovery redirect loop detected.'
        );
      }
      visited.add(currentKey);

      const addresses = await resolvePublicAddresses(currentUrl, resolver);
      const response = await transport(currentUrl, addresses[0], controller.signal);

      if (REDIRECT_STATUS_CODES.has(response.statusCode)) {
        response.destroy();
        const location = firstHeader(response.headers.location);
        if (!location) {
          throw new HttpError(response.statusCode, 'Redirect response did not include Location.');
        }
        if (redirectCount >= maxRedirects) {
          throw new PublicNetworkPolicyError(
            'too_many_redirects',
            `Agent Card discovery exceeded ${maxRedirects} redirects.`
          );
        }

        let redirectUrl: string;
        try {
          redirectUrl = new URL(location, currentUrl).toString();
        } catch {
          throw new PublicNetworkPolicyError(
            'invalid_redirect',
            'Agent Card discovery returned an invalid redirect URL.'
          );
        }
        currentUrl = normalizePublicHttpsUrl(
          redirectUrl,
          'Agent Card redirect URL',
          'invalid_redirect'
        );
        redirectCount += 1;
        continue;
      }

      if (response.statusCode < 200 || response.statusCode >= 300) {
        response.destroy();
        throw new HttpError(
          response.statusCode,
          `HTTP ${response.statusCode}: ${response.statusMessage ?? 'Request failed'}`
        );
      }

      return await readBoundedJson<T>(response, maxBytes);
    }
  } catch (error) {
    if (error instanceof PublicNetworkPolicyError || error instanceof HttpError) {
      throw error;
    }
    const safeUrl = currentUrl ? redactUrl(currentUrl.toString()) : redactUrl(value);
    if (controller.signal.aborted) {
      throw new Error(`Request timed out after ${timeout}ms: ${safeUrl}`);
    }
    throw new Error(
      `Request failed: ${safeUrl} - ${error instanceof Error ? error.message : String(error)}`
    );
  } finally {
    clearTimeout(timeoutId);
  }
}

async function resolvePublicAddresses(
  url: URL,
  resolver: PublicDnsResolver
): Promise<ResolvedAddress[]> {
  const hostname = stripIpv6Brackets(url.hostname);
  const literalFamily = net.isIP(hostname);
  const addresses: ResolvedAddress[] =
    literalFamily === 4 || literalFamily === 6
      ? [{ address: hostname, family: literalFamily }]
      : await resolver(hostname);

  if (addresses.length === 0) {
    throw new Error(`DNS resolution returned no addresses for ${hostname}.`);
  }

  for (const resolved of addresses) {
    const actualFamily = net.isIP(resolved.address);
    if (actualFamily !== resolved.family || !isPublicIpAddress(resolved.address)) {
      throw new PublicNetworkPolicyError(
        'blocked_address',
        `Agent Card discovery hostname ${hostname} resolved to a non-public address.`
      );
    }
  }

  return addresses;
}

async function defaultResolver(hostname: string): Promise<ResolvedAddress[]> {
  const addresses = await dnsLookup(hostname, { all: true, verbatim: true });
  return addresses.flatMap((entry) => {
    if (entry.family !== 4 && entry.family !== 6) return [];
    return [{ address: entry.address, family: entry.family as 4 | 6 }];
  });
}

export function createPinnedHttpsRequestOptions(
  url: URL,
  address: ResolvedAddress,
  signal: AbortSignal
): https.RequestOptions {
  const originalHostname = stripIpv6Brackets(url.hostname);
  const requestOptions: https.RequestOptions = {
    agent: false,
    checkServerIdentity: (_hostname, certificate) =>
      tls.checkServerIdentity(originalHostname, certificate),
    family: address.family,
    headers: {
      Accept: 'application/json',
      Host: url.host,
    },
    hostname: address.address,
    maxHeaderSize: 16 * 1024,
    method: 'GET',
    path: `${url.pathname}${url.search}`,
    port: url.port ? Number(url.port) : 443,
    protocol: 'https:',
    rejectUnauthorized: true,
    signal,
  };
  if (net.isIP(originalHostname) === 0) {
    requestOptions.servername = originalHostname;
  }
  return requestOptions;
}

function requestPinnedHttps(
  url: URL,
  address: ResolvedAddress,
  signal: AbortSignal
): Promise<PublicHttpsResponse> {
  return new Promise((resolve, reject) => {
    const request = https.request(
      createPinnedHttpsRequestOptions(url, address, signal),
      (response) => {
        resolve({
          body: response,
          destroy: () => response.destroy(),
          headers: response.headers,
          statusCode: response.statusCode ?? 0,
          ...(response.statusMessage ? { statusMessage: response.statusMessage } : {}),
        });
      }
    );
    request.once('error', reject);
    request.end();
  });
}

async function readBoundedJson<T>(response: PublicHttpsResponse, maxBytes: number): Promise<T> {
  const contentLength = firstHeader(response.headers['content-length']);
  if (contentLength !== undefined) {
    const declaredBytes = Number(contentLength);
    if (Number.isFinite(declaredBytes) && declaredBytes > maxBytes) {
      response.destroy();
      throw new PublicNetworkPolicyError(
        'response_too_large',
        `Agent Card response exceeds the ${maxBytes}-byte limit.`
      );
    }
  }

  const chunks: Buffer[] = [];
  let totalBytes = 0;
  for await (const value of response.body) {
    const chunk = Buffer.from(value);
    totalBytes += chunk.byteLength;
    if (totalBytes > maxBytes) {
      response.destroy();
      throw new PublicNetworkPolicyError(
        'response_too_large',
        `Agent Card response exceeds the ${maxBytes}-byte limit.`
      );
    }
    chunks.push(chunk);
  }

  const text = Buffer.concat(chunks, totalBytes).toString('utf8');
  return JSON.parse(text) as T;
}

function normalizePublicHttpsUrl(
  value: string,
  label: string,
  code: 'invalid_url' | 'invalid_redirect'
): URL {
  let normalized: string;
  try {
    normalized = normalizeHttpUrl(value, {
      allowLocalhost: false,
      allowPrivateNetwork: false,
      label,
    });
  } catch (error) {
    throw new PublicNetworkPolicyError(
      code,
      error instanceof Error ? error.message : `${label} is invalid.`
    );
  }

  const url = new URL(normalized);
  if (url.protocol !== 'https:') {
    throw new PublicNetworkPolicyError(code, `${label} must use HTTPS.`);
  }

  const hostname = stripIpv6Brackets(url.hostname).toLowerCase().replace(/\.$/, '');
  if (hostname === 'localhost' || hostname.endsWith('.localhost') || hostname.endsWith('.local')) {
    throw new PublicNetworkPolicyError(code, `${label} must target a public hostname.`);
  }
  if (net.isIP(hostname) !== 0 && !isPublicIpAddress(hostname)) {
    throw new PublicNetworkPolicyError(code, `${label} must target a public address.`);
  }
  return url;
}

function firstHeader(value: string | string[] | undefined): string | undefined {
  if (Array.isArray(value)) return value[0];
  return value;
}

function stripIpv6Brackets(hostname: string): string {
  return hostname.replace(/^\[(.*)\]$/, '$1');
}

function validatePositiveInteger(value: number, label: string): void {
  if (!Number.isInteger(value) || value <= 0) {
    throw new Error(`${label} must be a positive integer.`);
  }
}

function validateNonNegativeInteger(value: number, label: string): void {
  if (!Number.isInteger(value) || value < 0) {
    throw new Error(`${label} must be a non-negative integer.`);
  }
}

function createBlockedIpv4List(): net.BlockList {
  const blockList = new net.BlockList();
  [
    ['0.0.0.0', 8],
    ['10.0.0.0', 8],
    ['100.64.0.0', 10],
    ['127.0.0.0', 8],
    ['169.254.0.0', 16],
    ['172.16.0.0', 12],
    ['192.0.0.0', 24],
    ['192.0.2.0', 24],
    ['192.88.99.0', 24],
    ['192.168.0.0', 16],
    ['198.18.0.0', 15],
    ['198.51.100.0', 24],
    ['203.0.113.0', 24],
    ['224.0.0.0', 4],
    ['240.0.0.0', 4],
  ].forEach(([address, prefix]) => blockList.addSubnet(String(address), Number(prefix), 'ipv4'));
  return blockList;
}

function createBlockedIpv6List(): net.BlockList {
  const blockList = new net.BlockList();
  [
    ['::', 128],
    ['::1', 128],
    ['::ffff:0:0', 96],
    ['64:ff9b::', 96],
    ['64:ff9b:1::', 48],
    ['100::', 64],
    ['2001::', 32],
    ['2001:2::', 48],
    ['2001:10::', 28],
    ['2001:db8::', 32],
    ['2002::', 16],
    ['3fff::', 20],
    ['fc00::', 7],
    ['fe80::', 10],
    ['fec0::', 10],
    ['ff00::', 8],
  ].forEach(([address, prefix]) => blockList.addSubnet(String(address), Number(prefix), 'ipv6'));
  return blockList;
}
