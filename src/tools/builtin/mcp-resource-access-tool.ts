/**
 * MCP Resource Access Tool
 * Built-in tool for agents to access MCP resources
 */

import type { SdkMcpToolDefinition } from '../../types/mcp.js';
import type { McpResourceManager } from '../mcp/mcp-resource-manager.js';

/**
 * Create MCP resource access tool definitions
 *
 * @param resourceManager - MCP resource manager instance
 * @returns Array of tool definitions
 */
export function createMcpResourceAccessTools(
  resourceManager: McpResourceManager
): SdkMcpToolDefinition<Record<string, unknown>>[] {
  return [
    {
      name: 'list_mcp_resources',
      description: 'List all available MCP resources from connected servers. Returns resource metadata including URIs, names, descriptions, and MIME types.',
      inputSchema: {
        type: 'object',
        properties: {
          serverName: {
            type: 'string',
            description: 'Optional: Filter resources by server name. If not provided, lists resources from all servers.',
          },
          mimeType: {
            type: 'string',
            description: 'Optional: Filter resources by MIME type pattern (supports wildcards, e.g., "text/*" or "application/json").',
          },
          namePattern: {
            type: 'string',
            description: 'Optional: Filter resources by name pattern (supports wildcards).',
          },
          bypassCache: {
            type: 'boolean',
            description: 'Optional: Bypass cache and fetch fresh data from servers.',
          },
        },
      },
      handler: async (input: unknown) => {
        const args = input as {
          serverName?: string;
          mimeType?: string;
          namePattern?: string;
          bypassCache?: boolean;
        };

        try {
          let resources: Array<{ serverName: string; resource: { uri: string; name: string; description?: string; mimeType?: string } }>;

          if (args.serverName) {
            // List resources from specific server
            const serverResources = await resourceManager.listServerResources(args.serverName, {
              bypassCache: args.bypassCache,
            });

            resources = serverResources.map((resource) => ({
              serverName: args.serverName!,
              resource,
            }));
          } else {
            // List all resources
            resources = await resourceManager.listAllResources({
              bypassCache: args.bypassCache,
            });
          }

          // Apply filters
          let filtered = resources;

          if (args.mimeType) {
            const pattern = new RegExp(args.mimeType.replace('*', '.*'));
            filtered = filtered.filter(({ resource }) =>
              pattern.test(resource.mimeType || '')
            );
          }

          if (args.namePattern) {
            const pattern = new RegExp(args.namePattern.replace('*', '.*'), 'i');
            filtered = filtered.filter(({ resource }) => pattern.test(resource.name));
          }

          return {
            success: true,
            count: filtered.length,
            resources: filtered.map(({ serverName, resource }) => ({
              serverName,
              uri: resource.uri,
              name: resource.name,
              description: resource.description,
              mimeType: resource.mimeType,
            })),
          };
        } catch (error: any) {
          return {
            success: false,
            error: error?.message || 'Failed to list MCP resources',
          };
        }
      },
    },

    {
      name: 'read_mcp_resource',
      description: 'Read the contents of an MCP resource by URI. Returns the resource data in text or binary format.',
      inputSchema: {
        type: 'object',
        properties: {
          uri: {
            type: 'string',
            description: 'Resource URI to read. Must be a valid URI from list_mcp_resources.',
          },
          serverName: {
            type: 'string',
            description: 'Optional: Server name where the resource is located. If not provided, will auto-detect server from URI.',
          },
        },
        required: ['uri'],
      },
      handler: async (input: unknown) => {
        const args = input as { uri: string; serverName?: string };

        try {
          let serverName = args.serverName;

          // Auto-detect server if not provided
          if (!serverName) {
            serverName = await resourceManager.getResourceServer(args.uri);

            if (!serverName) {
              return {
                success: false,
                error: `Resource not found: ${args.uri}. Please check the URI with list_mcp_resources first.`,
              };
            }
          }

          // Read resource contents
          const contents = await resourceManager.readResource(serverName, args.uri);

          // Return contents with metadata
          const result: {
            success: boolean;
            uri: string;
            serverName: string;
            mimeType?: string;
            text?: string;
            blob?: string;
            size?: number;
          } = {
            success: true,
            uri: contents.uri,
            serverName,
            mimeType: contents.mimeType,
          };

          if (contents.text !== undefined) {
            result.text = contents.text;
            result.size = contents.text.length;
          }

          if (contents.blob !== undefined) {
            result.blob = contents.blob;
            result.size = contents.blob.length;
          }

          return result;
        } catch (error: any) {
          return {
            success: false,
            uri: args.uri,
            serverName: args.serverName,
            error: error?.message || 'Failed to read MCP resource',
          };
        }
      },
    },
  ];
}
