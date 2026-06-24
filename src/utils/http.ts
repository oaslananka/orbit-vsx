import { redactUrl } from './urlSafety';

export class HttpError extends Error {
  constructor(
    public readonly statusCode: number,
    message?: string
  ) {
    super(message ?? `HTTP ${statusCode}`);
    this.name = 'HttpError';
  }
}

export interface FetchOptions {
  method?: string;
  headers?: Record<string, string>;
  body?: unknown;
  timeout?: number;
}

export async function fetchJson<T = unknown>(url: string, options: FetchOptions = {}): Promise<T> {
  const { method = 'GET', headers = {}, body, timeout = 10000 } = options;
  const safeUrl = redactUrl(url);

  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), timeout);

  try {
    const response = await fetch(
      url,
      Object.assign(
        { method, signal: controller.signal },
        {
          headers: {
            'Content-Type': 'application/json',
            ...headers,
          },
        },
        body !== undefined ? { body: JSON.stringify(body) } : {}
      )
    );

    if (!response.ok) {
      throw new HttpError(response.status, `HTTP ${response.status}: ${response.statusText}`);
    }

    const text = await response.text();
    if (text.length === 0) {
      return undefined as T;
    }
    return JSON.parse(text) as T;
  } catch (error) {
    if (error instanceof HttpError) {
      throw error;
    }
    if (error instanceof DOMException && error.name === 'AbortError') {
      throw new Error(`Request timed out after ${timeout}ms: ${safeUrl}`);
    }
    throw new Error(
      `Request failed: ${safeUrl} - ${error instanceof Error ? error.message : String(error)}`
    );
  } finally {
    clearTimeout(timeoutId);
  }
}

export async function postJson<T = unknown>(
  url: string,
  body: unknown,
  headers?: Record<string, string>,
  timeout?: number
): Promise<T> {
  const opts: FetchOptions = { method: 'POST', body, headers: headers ?? {} };
  if (timeout !== undefined) opts.timeout = timeout;
  return fetchJson<T>(url, opts);
}

export async function getJson<T = unknown>(
  url: string,
  headers?: Record<string, string>,
  timeout?: number
): Promise<T> {
  const opts: FetchOptions = { method: 'GET', headers: headers ?? {} };
  if (timeout !== undefined) opts.timeout = timeout;
  return fetchJson<T>(url, opts);
}
