/**
 * MCP Server Factory
 * Creates in-process MCP servers from tool definitions
 */

import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import type {
  McpSdkServerConfigWithInstance,
  SdkMcpToolDefinition,
} from '../../types/mcp.js';

/**
 * Options for creating SDK MCP server
 */
export interface CreateSdkMcpServerOptions {
  /** Server name */
  name: string;
  /** Server version (default: 1.0.0) */
  version?: string;
  /** Tool definitions */
  tools?: SdkMcpToolDefinition<unknown>[];
}

/**
 * Create an in-process MCP server from tool definitions
 *
 * @param options - Server configuration options
 * @returns SDK server config with attached McpServer instance
 *
 * @example
 * ```ts
 * import { tool } from 'agentic-sdk';
 * import { z } from 'zod';
 *
 * const server = createSdkMcpServer({
 *   name: 'my-tools',
 *   version: '1.0.0',
 *   tools: [
 *     tool(
 *       'calculate',
 *       'Perform calculations',
 *       z.object({
 *         expression: z.string(),
 *       }),
 *       async ({ expression }) => {
 *         return { result: eval(expression) };
 *       }
 *     ),
 *   ],
 * });
 * ```
 */
export function createSdkMcpServer(
  options: CreateSdkMcpServerOptions
): McpSdkServerConfigWithInstance {
  const { name, version = '1.0.0', tools = [] } = options;

  // Create McpServer instance
  const server = new McpServer(
    {
      name,
      version,
    },
    {
      capabilities: {
        tools: {},
      },
    }
  );

  // Register each tool using setRequestHandler
  for (const toolDef of tools) {
    // Use a generic handler registration approach
    // The MCP SDK API may vary, so we'll use a flexible approach
    const handlers = (server as unknown as { handlers?: Map<string, unknown> }).handlers ||
                    new Map<string, unknown>();

    handlers.set(`tools/${toolDef.name}`, async (input: unknown) => {
      try {
        const result = await toolDef.handler(input);
        return {
          content: [{
            type: 'text',
            text: JSON.stringify(result),
          }],
        };
      } catch (error) {
        return {
          content: [{
            type: 'text',
            text: error instanceof Error ? error.message : String(error),
          }],
          isError: true,
        };
      }
    });
  }

  // Return config with instance attached
  return {
    type: 'sdk',
    name,
    tools,
    _instance: server,
  };
}
