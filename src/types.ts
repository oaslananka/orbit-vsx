/** JSON-RPC 2.0 request envelope for MCP tool calls. */
export interface McpJsonRpcRequest {
  jsonrpc: '2.0';
  method: string;
  params?: Record<string, unknown>;
  id: number;
}

/** JSON-RPC 2.0 response envelope for MCP tool calls. */
export interface McpJsonRpcResponse<T = unknown> {
  jsonrpc: '2.0';
  result?: T;
  error?: { code: number; message: string };
  id: number;
}
