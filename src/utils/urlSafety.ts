import * as net from 'node:net';

export interface HttpUrlValidationOptions {
  readonly allowLocalhost?: boolean;
  readonly allowPrivateNetwork?: boolean;
  readonly label?: string;
}

const LOCAL_HOSTNAMES = new Set(['localhost', 'localhost.localdomain']);

function isLocalHostname(hostname: string): boolean {
  const normalized = hostname.toLowerCase().replace(/\.$/, '');
  return LOCAL_HOSTNAMES.has(normalized);
}

function isPrivateIpv4(hostname: string): boolean {
  const parts = hostname.split('.').map((part) => Number(part));
  if (
    parts.length !== 4 ||
    parts.some((part) => !Number.isInteger(part) || part < 0 || part > 255)
  ) {
    return false;
  }
  const [a = 0, b = 0] = parts;
  return (
    a === 0 ||
    a === 10 ||
    a === 127 ||
    (a === 169 && b === 254) ||
    (a === 172 && b >= 16 && b <= 31) ||
    (a === 192 && b === 168)
  );
}

function isPrivateIpv6(hostname: string): boolean {
  const normalized = hostname.toLowerCase();
  return (
    normalized === '::1' ||
    normalized === '0:0:0:0:0:0:0:1' ||
    normalized.startsWith('fc') ||
    normalized.startsWith('fd') ||
    normalized.startsWith('fe80:')
  );
}

function isLocalOrPrivateHost(hostname: string): boolean {
  if (isLocalHostname(hostname)) return true;
  const ipVersion = net.isIP(hostname);
  if (ipVersion === 4) return isPrivateIpv4(hostname);
  if (ipVersion === 6) return isPrivateIpv6(hostname);
  return false;
}

export function redactUrl(value: string): string {
  try {
    const url = new URL(value);
    url.username = '';
    url.password = '';
    if (url.search) url.search = '?…';
    if (url.hash) url.hash = '#…';
    return url.toString();
  } catch {
    return '<invalid-url>';
  }
}

export function normalizeHttpUrl(value: string, options: HttpUrlValidationOptions = {}): string {
  const label = options.label ?? 'URL';
  const trimmed = value.trim();
  if (!trimmed) {
    throw new Error(`${label} is required.`);
  }

  let url: URL;
  try {
    url = new URL(trimmed);
  } catch {
    throw new Error(`${label} must be an absolute HTTP(S) URL.`);
  }

  if (url.protocol !== 'http:' && url.protocol !== 'https:') {
    throw new Error(`${label} must use http:// or https://.`);
  }

  if (url.username || url.password) {
    throw new Error(`${label} must not include credentials.`);
  }

  const hostname = url.hostname.replace(/^\[(.*)\]$/, '$1');
  const privateHost = isLocalOrPrivateHost(hostname);
  if (privateHost && !options.allowLocalhost && !options.allowPrivateNetwork) {
    throw new Error(`${label} must not target localhost or a private network address.`);
  }

  if (privateHost && !options.allowPrivateNetwork && !options.allowLocalhost) {
    throw new Error(`${label} must not target a private network address.`);
  }

  url.hash = '';
  return url.toString().replace(/\/$/, '');
}

export function joinUrl(baseUrl: string, path: string): string {
  const normalizedBase = normalizeHttpUrl(baseUrl, {
    allowLocalhost: true,
    allowPrivateNetwork: true,
    label: 'Endpoint URL',
  });
  return new URL(path.replace(/^\/+/, ''), `${normalizedBase}/`).toString();
}
