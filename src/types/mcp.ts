/**
 * Anthropic Tool definition format
 */
export interface AnthropicTool {
  name: string;
  description: string;
  input_schema: Record<string, unknown>;
}

/**
 * MCP stdio server configuration
 */
export interface McpStdioServerConfig {
  type: 'stdio';
  /** Command to execute */
  command: string;
  /** Arguments to pass to command */
  args?: string[];
  /** Environment variables for the subprocess */
  env?: Record<string, string>;
}

/**
 * MCP SSE server configuration
 */
export interface McpSSEServerConfig {
  type: 'sse';
  /** URL of the SSE endpoint */
  url: string;
  /** Headers to include in requests */
  headers?: Record<string, string>;
}

/**
 * MCP HTTP server configuration
 */
export interface McpHttpServerConfig {
  type: 'http';
  /** URL of the HTTP endpoint */
  url: string;
  /** Headers to include in requests */
  headers?: Record<string, string>;
}

/**
 * MCP SDK server configuration (in-process)
 */
export interface McpSdkServerConfig {
  type: 'sdk';
  /** Server name */
  name: string;
  /** Tool definitions */
  tools: SdkMcpToolDefinition<unknown>[];
}

/**
 * MCP SDK server with instance (after connection)
 */
export interface McpSdkServerConfigWithInstance extends McpSdkServerConfig {
  /** McpServer instance (internal) */
  _instance?: unknown;
}

/**
 * Union of all MCP server config types
 */
export type McpServerConfig =
  | McpStdioServerConfig
  | McpSSEServerConfig
  | McpHttpServerConfig
  | McpSdkServerConfigWithInstance;

/**
 * SDK MCP tool definition
 */
export interface SdkMcpToolDefinition<Schema> {
  /** Tool name */
  name: string;
  /** Tool description */
  description: string;
  /** Input schema (Zod schema or JSON Schema) */
  inputSchema: Schema;
  /** Tool handler */
  handler: (input: unknown) => Promise<unknown> | unknown;
  /** Optional annotations */
  annotations?: {
    /** Tool is read-only */
    readOnly?: boolean;
    /** Tool is destructive */
    destructive?: boolean;
    /** Tool has open world knowledge */
    openWorld?: boolean;
  };
}

/**
 * MCP server status
 */
export interface McpServerStatus {
  /** Server name */
  name: string;
  /** Connection status */
  status: 'connected' | 'disconnected' | 'connecting' | 'error';
  /** Number of tools available */
  toolCount?: number;
  /** Error message if status is 'error' */
  error?: string;
}

/**
 * MCP resource
 * Represents a read-only data source exposed by an MCP server
 */
export interface McpResource {
  /** Resource URI (unique identifier) */
  uri: string;
  /** Resource name */
  name: string;
  /** Optional description */
  description?: string;
  /** MIME type of resource contents */
  mimeType?: string;
  /** Optional metadata */
  metadata?: Record<string, unknown>;
}

/**
 * MCP resource contents
 * Contents returned when reading a resource
 */
export interface McpResourceContents {
  /** Resource URI */
  uri: string;
  /** MIME type of contents */
  mimeType?: string;
  /** Text contents (for text resources) */
  text?: string;
  /** Binary contents as base64 (for binary resources) */
  blob?: string;
}

/**
 * MCP resource subscription
 * Tracks active resource subscriptions
 */
export interface McpResourceSubscription {
  /** Server name */
  serverName: string;
  /** Resource URI */
  uri: string;
  /** When subscription was created */
  subscribedAt: number;
}

/**
 * Convert SDK tool definition to Anthropic Tool format
 */
export function toAnthropicTool(
  definition: SdkMcpToolDefinition<Record<string, unknown>>
): AnthropicTool {
  return {
    name: definition.name,
    description: definition.description,
    input_schema: definition.inputSchema as Record<string, unknown>,
  };
}
