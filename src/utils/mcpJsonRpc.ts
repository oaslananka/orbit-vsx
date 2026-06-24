import { postJson } from './http';
import { joinUrl } from './urlSafety';

export type JsonRpcId = number;
export type JsonObject = Record<string, unknown>;

export interface McpJsonRpcRequest {
  jsonrpc: '2.0';
  method: string;
  params?: JsonObject;
  id: JsonRpcId;
}

export interface McpJsonRpcErrorEnvelope {
  code: number;
  message: string;
  data?: unknown;
}

export interface McpJsonRpcResponse<T = unknown> {
  jsonrpc: '2.0';
  result?: T;
  error?: McpJsonRpcErrorEnvelope;
  id: JsonRpcId;
}

export type ResultValidator<T> = (value: unknown, context: string) => T;

export class McpJsonRpcError extends Error {
  constructor(
    public readonly code: number,
    message: string,
    public readonly data?: unknown
  ) {
    super(`MCP error ${code}: ${message}`);
    this.name = 'McpJsonRpcError';
  }
}

export class McpProtocolError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'McpProtocolError';
  }
}

export interface McpJsonRpcClientOptions {
  endpoint: string;
  headers?: () => Record<string, string>;
  path?: string;
  timeout?: number;
}

let nextJsonRpcId = 1;

function createJsonRpcId(): JsonRpcId {
  const id = nextJsonRpcId;
  nextJsonRpcId = nextJsonRpcId >= Number.MAX_SAFE_INTEGER ? 1 : nextJsonRpcId + 1;
  return id;
}

export class McpJsonRpcClient {
  private readonly mcpUrl: string;
  private readonly headers: () => Record<string, string>;
  private readonly timeout: number | undefined;

  constructor(options: McpJsonRpcClientOptions) {
    this.mcpUrl = joinUrl(options.endpoint, options.path ?? '/mcp');
    this.headers = options.headers ?? (() => ({}));
    this.timeout = options.timeout;
  }

  async toolCall<T>(
    name: string,
    args: JsonObject = {},
    validate: ResultValidator<T> = unsafeResultCast<T>()
  ): Promise<T> {
    return this.call('tools/call', { name, arguments: args }, validate, name);
  }

  async call<T>(
    method: string,
    params: JsonObject | undefined,
    validate: ResultValidator<T> = unsafeResultCast<T>(),
    context = method
  ): Promise<T> {
    const id = createJsonRpcId();
    const request: McpJsonRpcRequest = { jsonrpc: '2.0', method, id };
    if (params !== undefined) request.params = params;

    const response = await postJson<unknown>(this.mcpUrl, request, this.headers(), this.timeout);
    const result = parseJsonRpcResponse(response, id, context);
    return validate(result, context);
  }
}

function unsafeResultCast<T>(): ResultValidator<T> {
  return (value) => value as T;
}

export function parseJsonRpcResponse(
  response: unknown,
  expectedId: JsonRpcId,
  context: string
): unknown {
  const envelope = asRecord(response, `${context} JSON-RPC response`);

  if (envelope.jsonrpc !== '2.0') {
    throw new McpProtocolError(`${context}: expected JSON-RPC 2.0 response`);
  }

  if (envelope.id !== expectedId) {
    throw new McpProtocolError(`${context}: response id did not match request id`);
  }

  const hasError = envelope.error !== undefined && envelope.error !== null;
  const hasResult = Object.prototype.hasOwnProperty.call(envelope, 'result');

  if (hasError && hasResult) {
    throw new McpProtocolError(
      `${context}: JSON-RPC response cannot contain both result and error`
    );
  }

  if (hasError) {
    const error = asRecord(envelope.error, `${context} error`);
    const code = asNumber(error.code, `${context} error.code`);
    const message = asString(error.message, `${context} error.message`);
    throw new McpJsonRpcError(code, message, error.data);
  }

  if (!hasResult) {
    throw new McpProtocolError(`${context}: JSON-RPC response did not include result`);
  }

  return envelope.result;
}

export function asRecord(value: unknown, context: string): JsonObject {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) {
    throw new McpProtocolError(`${context}: expected object`);
  }
  return value as JsonObject;
}

export function asArray(value: unknown, context: string): unknown[] {
  if (!Array.isArray(value)) {
    throw new McpProtocolError(`${context}: expected array`);
  }
  return value;
}

export function asString(value: unknown, context: string): string {
  if (typeof value !== 'string') {
    throw new McpProtocolError(`${context}: expected string`);
  }
  return value;
}

export function asNumber(value: unknown, context: string): number {
  if (typeof value !== 'number' || !Number.isFinite(value)) {
    throw new McpProtocolError(`${context}: expected finite number`);
  }
  return value;
}

export function asBoolean(value: unknown, context: string): boolean {
  if (typeof value !== 'boolean') {
    throw new McpProtocolError(`${context}: expected boolean`);
  }
  return value;
}

export function asStringArray(value: unknown, context: string): string[] {
  return asArray(value, context).map((item, index) => asString(item, `${context}[${index}]`));
}

export function asEnum<T extends string>(
  value: unknown,
  allowed: readonly T[],
  context: string
): T {
  if (typeof value !== 'string' || !allowed.includes(value as T)) {
    throw new McpProtocolError(`${context}: expected one of ${allowed.join(', ')}`);
  }
  return value as T;
}
