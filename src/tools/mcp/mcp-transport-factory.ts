/**
 * MCP Transport Factory
 * Creates appropriate MCP client transport based on server configuration
 */

import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js';
import { SSEClientTransport } from '@modelcontextprotocol/sdk/client/sse.js';
import type {
  McpServerConfig,
  McpStdioServerConfig,
  McpSSEServerConfig,
  McpHttpServerConfig,
  McpSdkServerConfigWithInstance,
} from '../../types/mcp.js';

/**
 * InMemory transport pair (not exported from SDK, defining locally)
 */
interface InMemoryTransportPair {
  client: unknown;
  server: unknown;
}

/**
 * Create in-memory transport pair for SDK-type servers
 */
function createInMemoryTransportPair(): InMemoryTransportPair {
  // This is a placeholder - actual implementation would use the SDK's InMemoryTransport
  // For now, we'll create a simple in-memory channel
  const messages: unknown[] = [];

  return {
    client: {
      async send(message: unknown) {
        messages.push(message);
      },
      async receive() {
        return messages.shift();
      },
    },
    server: {
      async send(message: unknown) {
        messages.push(message);
      },
      async receive() {
        return messages.shift();
      },
    },
  };
}

/**
 * Create MCP client transport based on server config
 *
 * @param config - MCP server configuration
 * @returns Client and transport tuple
 *
 * @example
 * ```ts
 * const [client, transport] = await createTransport({
 *   type: 'stdio',
 *   command: 'npx',
 *   args: ['@modelcontextprotocol/server-filesystem', '/path'],
 * });
 * ```
 */
export async function createTransport(
  config: McpServerConfig
): Promise<[Client, unknown]> {
  const client = new Client(
    {
      name: 'agentic-sdk-client',
      version: '0.1.0',
    },
    {
      capabilities: {},
    }
  );

  let transport: unknown;

  switch (config.type) {
    case 'stdio': {
      transport = createStdioTransport(config);
      break;
    }
    case 'sse': {
      transport = await createSSETransport(config);
      break;
    }
    case 'http': {
      transport = await createHTTPTransport(config);
      break;
    }
    case 'sdk': {
      transport = createInMemoryTransport(config);
      break;
    }
    default: {
      throw new Error(`Unsupported MCP server type: ${(config as { type: string }).type}`);
    }
  }

  return [client, transport];
}

/**
 * Create stdio transport for subprocess-based MCP servers
 */
function createStdioTransport(
  config: McpStdioServerConfig
): StdioClientTransport {
  const { command, args = [], env = {} } = config;

  // Filter out secret env vars from logging
  const safeEnv: Record<string, string> = { ...env };
  const secretKeys = ['API_KEY', 'SECRET', 'TOKEN', 'PASSWORD', 'CREDENTIALS'];
  for (const key of Object.keys(safeEnv)) {
    if (secretKeys.some((secret) => key.toUpperCase().includes(secret))) {
      safeEnv[key] = '***REDACTED***';
    }
  }

  // Merge with process.env
  const mergedEnv: Record<string, string> = {
    ...(process.env as Record<string, string>),
    ...safeEnv,
  };

  return new StdioClientTransport({
    command,
    args,
    env: mergedEnv,
  });
}

/**
 * Create SSE transport for Server-Sent Events MCP servers
 */
async function createSSETransport(
  config: McpSSEServerConfig
): Promise<SSEClientTransport> {
  const { url, headers = {} } = config;

  return new SSEClientTransport(
    new URL(url),
    headers
  );
}

/**
 * Create HTTP transport for HTTP-based MCP servers
 * Note: Using SSE transport for HTTP as it's compatible
 */
async function createHTTPTransport(
  config: McpHttpServerConfig
): Promise<SSEClientTransport> {
  const { url, headers = {} } = config;

  // StreamableHTTPClientTransport is experimental
  // Using SSE as fallback for HTTP endpoints
  return new SSEClientTransport(
    new URL(url),
    headers
  );
}

/**
 * Create in-memory transport for SDK-type MCP servers
 * Returns linked pair of transports for client-server communication
 */
function createInMemoryTransport(
  _config: McpSdkServerConfigWithInstance
): [unknown, unknown] {
  // Create linked pair for in-memory communication
  const pair = createInMemoryTransportPair();
  return [pair.client, pair.server];
}
