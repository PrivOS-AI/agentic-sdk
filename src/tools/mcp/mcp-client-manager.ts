/**
 * MCP Client Manager
 * Manages connections to external MCP servers
 */

import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import type {
  McpServerConfig,
  McpServerStatus,
  McpSdkServerConfigWithInstance,
  McpResource,
  McpResourceContents,
} from '../../types/mcp.js';
import { createTransport } from './mcp-transport-factory.js';

/**
 * Connected MCP server info
 */
interface ConnectedServer {
  name: string;
  config: McpServerConfig;
  client: Client;
  transport: unknown;
  status: 'connected' | 'disconnected' | 'connecting' | 'error';
  toolCount?: number;
  error?: string;
  enabled?: boolean;
}

/**
 * MCP client connection result
 */
interface ConnectionResult {
  serverName: string;
  success: boolean;
  tools: string[];
  error?: string;
}

/**
 * MCP Client Manager
 * Handles lifecycle of MCP server connections
 */
export class McpClientManager {
  private servers = new Map<string, ConnectedServer>();
  private connectionTimeout = 30000; // 30 seconds

  /**
   * Connect to an MCP server
   *
   * @param name - Server name
   * @param config - Server configuration
   * @returns Connection result with discovered tools
   */
  async connectServer(
    name: string,
    config: McpServerConfig
  ): Promise<ConnectionResult> {
    // Check if already connected
    const existing = this.servers.get(name);
    if (existing) {
      await this.disconnectServer(name);
    }

    try {
      // Create server entry with connecting status
      this.servers.set(name, {
        name,
        config,
        client: null as unknown as Client,
        transport: null,
        status: 'connecting',
        enabled: true,
      });

      // Create transport
      const [client, transport] = await createTransport(config);

      // Special handling for SDK servers
      if (config.type === 'sdk') {
        const sdkConfig = config as McpSdkServerConfigWithInstance;
        const sdkServer = sdkConfig._instance;

        if (sdkServer) {
          // Connect in-memory server
          const [clientTransport, serverTransport] = transport as [unknown, unknown];

          await client.connect(clientTransport as any);
          // Note: SDK server connect method may vary, this is a simplified version
          if (typeof (sdkServer as Record<string, unknown>).connect === 'function') {
            await ((sdkServer as Record<string, unknown>).connect as (transport: unknown) => Promise<void>)(serverTransport);
          }
        } else {
          throw new Error('SDK server instance not found');
        }
      } else {
        // Connect external server
        await this.connectWithTimeout(client, transport as any);
      }

      // Discover tools
      const toolsList = await this.discoverTools(client);

      // Update server entry
      this.servers.set(name, {
        name,
        config,
        client,
        transport,
        status: 'connected',
        toolCount: toolsList.length,
        enabled: true,
      });

      return {
        serverName: name,
        success: true,
        tools: toolsList.map((t) => t.name),
      };
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);

      // Update server entry with error status
      const existing = this.servers.get(name);
      if (existing) {
        this.servers.set(name, {
          ...existing,
          status: 'error',
          error: errorMessage,
        });
      }

      return {
        serverName: name,
        success: false,
        tools: [],
        error: errorMessage,
      };
    }
  }

  /**
   * Connect with timeout
   */
  private async connectWithTimeout(
    client: Client,
    transport: unknown
  ): Promise<void> {
    const timeoutPromise = new Promise<void>((_, reject) => {
      setTimeout(() => {
        reject(new Error('Connection timeout'));
      }, this.connectionTimeout);
    });

    const connectPromise = client.connect(transport as any);

    await Promise.race([connectPromise, timeoutPromise]);
  }

  /**
   * Discover tools from connected server
   */
  private async discoverTools(client: Client): Promise<
    Array<{
      name: string;
      description?: string;
      inputSchema: Record<string, unknown>;
    }>
  > {
    try {
      const response = await client.listTools();

      return response.tools.map((tool) => ({
        name: tool.name,
        description: tool.description,
        inputSchema: tool.inputSchema as Record<string, unknown>,
      }));
    } catch (error) {
      console.error('[McpClientManager] Failed to discover tools:', error);
      return [];
    }
  }

  /**
   * Disconnect from an MCP server
   *
   * @param name - Server name
   */
  async disconnectServer(name: string): Promise<void> {
    const server = this.servers.get(name);
    if (!server) {
      return;
    }

    try {
      await server.client.close();
    } catch (error) {
      console.error(`[McpClientManager] Error disconnecting ${name}:`, error);
    }

    this.servers.delete(name);
  }

  /**
   * Disconnect all servers
   */
  async disconnectAll(): Promise<void> {
    const disconnectPromises = Array.from(this.servers.keys()).map((name) =>
      this.disconnectServer(name)
    );

    await Promise.all(disconnectPromises);
  }

  /**
   * Reconnect to a server
   *
   * @param name - Server name
   */
  async reconnectServer(name: string): Promise<ConnectionResult> {
    const server = this.servers.get(name);
    if (!server) {
      return {
        serverName: name,
        success: false,
        tools: [],
        error: 'Server not found',
      };
    }

    await this.disconnectServer(name);
    return this.connectServer(name, server.config);
  }

  /**
   * Toggle server enabled state
   *
   * @param name - Server name
   * @param enabled - Whether server should be enabled
   */
  toggleServer(name: string, enabled: boolean): void {
    const server = this.servers.get(name);
    if (server) {
      this.servers.set(name, {
        ...server,
        enabled,
      });
    }
  }

  /**
   * Get server status for all servers
   */
  getServerStatus(): McpServerStatus[] {
    return Array.from(this.servers.values()).map(
      (server): McpServerStatus => ({
        name: server.name,
        status: server.enabled ? server.status : 'disconnected',
        toolCount: server.toolCount,
        error: server.error,
      })
    );
  }

  /**
   * Call a tool on a specific server
   *
   * @param serverName - Server name
   * @param toolName - Tool name
   * @param args - Tool arguments
   * @returns Tool result
   */
  async callTool(
    serverName: string,
    toolName: string,
    args: Record<string, unknown>
  ): Promise<unknown> {
    const server = this.servers.get(serverName);

    if (!server) {
      throw new Error(`Server not found: ${serverName}`);
    }

    if (!server.enabled || server.status !== 'connected') {
      throw new Error(`Server not connected: ${serverName}`);
    }

    try {
      const response = await server.client.callTool({
        name: toolName,
        arguments: args,
      });

      return response;
    } catch (error) {
      console.error(`[McpClientManager] Error calling tool ${toolName}:`, error);
      throw error;
    }
  }

  /**
   * Get connected server by name
   */
  getServer(name: string): ConnectedServer | undefined {
    return this.servers.get(name);
  }

  /**
   * Check if server is connected and enabled
   */
  isServerReady(name: string): boolean {
    const server = this.servers.get(name);
    return server !== undefined && (server.enabled ?? true) && server.status === 'connected';
  }

  /**
   * Get all connected and enabled servers
   */
  getReadyServers(): Map<string, ConnectedServer> {
    const ready = new Map<string, ConnectedServer>();

    for (const [name, server] of this.servers.entries()) {
      if (server.enabled && server.status === 'connected') {
        ready.set(name, server);
      }
    }

    return ready;
  }

  /**
   * List resources from a specific server
   *
   * @param serverName - Server name
   * @returns Array of available resources
   */
  async listResources(serverName: string): Promise<McpResource[]> {
    const server = this.servers.get(serverName);

    if (!server) {
      throw new Error(`Server not found: ${serverName}`);
    }

    if (!server.enabled || server.status !== 'connected') {
      throw new Error(`Server not connected: ${serverName}`);
    }

    try {
      const response = await server.client.listResources();

      return (response.resources || []).map(
        (resource: any): McpResource => ({
          uri: resource.uri,
          name: resource.name,
          description: resource.description,
          mimeType: resource.mimeType,
          metadata: resource.metadata,
        })
      );
    } catch (error: any) {
      // Check if error is due to method not supported
      if (error?.message?.includes('not supported') || error?.code === -32601) {
        // Resources not supported by this server
        return [];
      }

      console.error(`[McpClientManager] Error listing resources from ${serverName}:`, error);
      throw error;
    }
  }

  /**
   * Read resource contents from a specific server
   *
   * @param serverName - Server name
   * @param uri - Resource URI
   * @returns Resource contents
   */
  async readResource(serverName: string, uri: string): Promise<McpResourceContents> {
    const server = this.servers.get(serverName);

    if (!server) {
      throw new Error(`Server not found: ${serverName}`);
    }

    if (!server.enabled || server.status !== 'connected') {
      throw new Error(`Server not connected: ${serverName}`);
    }

    try {
      const response = await server.client.readResource({ uri });

      // Handle first content item
      const content = response.contents?.[0];

      if (!content) {
        throw new Error(`No content returned for resource: ${uri}`);
      }

      // Check content type (text or blob)
      const result: McpResourceContents = {
        uri,
        mimeType: content.mimeType,
      };

      if ('text' in content && content.text !== undefined) {
        result.text = content.text as string;
      }

      if ('blob' in content && content.blob !== undefined) {
        result.blob = content.blob as string;
      }

      return result;
    } catch (error) {
      console.error(`[McpClientManager] Error reading resource ${uri} from ${serverName}:`, error);
      throw error;
    }
  }
}
