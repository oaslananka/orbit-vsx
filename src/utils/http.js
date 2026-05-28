"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.HttpError = void 0;
exports.fetchJson = fetchJson;
exports.postJson = postJson;
exports.getJson = getJson;
class HttpError extends Error {
    statusCode;
    constructor(statusCode, message) {
        super(message ?? `HTTP ${statusCode}`);
        this.statusCode = statusCode;
        this.name = 'HttpError';
    }
}
exports.HttpError = HttpError;
async function fetchJson(url, options = {}) {
    const { method = 'GET', headers = {}, body, timeout = 10000 } = options;
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), timeout);
    try {
        const response = await fetch(url, Object.assign({ method, signal: controller.signal }, {
            headers: {
                'Content-Type': 'application/json',
                ...headers,
            },
        }, body !== undefined ? { body: JSON.stringify(body) } : {}));
        if (!response.ok) {
            throw new HttpError(response.status, `HTTP ${response.status}: ${response.statusText}`);
        }
        const text = await response.text();
        if (text.length === 0) {
            return undefined;
        }
        return JSON.parse(text);
    }
    catch (error) {
        if (error instanceof HttpError) {
            throw error;
        }
        if (error instanceof DOMException && error.name === 'AbortError') {
            throw new Error(`Request timed out after ${timeout}ms: ${url}`);
        }
        throw new Error(`Request failed: ${url} - ${error instanceof Error ? error.message : String(error)}`);
    }
    finally {
        clearTimeout(timeoutId);
    }
}
async function postJson(url, body, headers, timeout) {
    const opts = { method: 'POST', body, headers: headers ?? {} };
    if (timeout !== undefined)
        opts.timeout = timeout;
    return fetchJson(url, opts);
}
async function getJson(url, headers, timeout) {
    const opts = { method: 'GET', headers: headers ?? {} };
    if (timeout !== undefined)
        opts.timeout = timeout;
    return fetchJson(url, opts);
}
