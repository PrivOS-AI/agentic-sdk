/**
 * MCP Resource Manager
 * Manages resource discovery and access across MCP servers
 */

import type { McpResource, McpResourceContents } from '../../types/mcp.js';
import type { McpClientManager } from './mcp-client-manager.js';

/**
 * MCP Resource Manager
 * Provides unified interface for accessing resources from MCP servers
 */
export class McpResourceManager {
  private clientManager: McpClientManager;
  private resourceCache = new Map<string, McpResource[]>();
  private cacheEnabled = true;
  private cacheTtl = 60000; // 60 seconds

  constructor(clientManager: McpClientManager) {
    this.clientManager = clientManager;
  }

  /**
   * List all resources from all connected servers
   *
   * @param options - Options for listing resources
   * @returns Array of resources with server name prefixed
   */
  async listAllResources(options?: {
    /** Bypass cache and fetch fresh data */
    bypassCache?: boolean;
  }): Promise<Array<{ serverName: string; resource: McpResource }>> {
    const allResources: Array<{ serverName: string; resource: McpResource }> = [];

    // Get all ready servers
    const readyServers = this.clientManager.getReadyServers();

    for (const [serverName] of readyServers) {
      try {
        const resources = await this.listServerResources(serverName, options);

        for (const resource of resources) {
          allResources.push({
            serverName,
            resource,
          });
        }
      } catch (error) {
        // Log error but continue with other servers
        console.error(`[McpResourceManager] Error listing resources from ${serverName}:`, error);
      }
    }

    return allResources;
  }

  /**
   * List resources from a specific server
   *
   * @param serverName - Server name
   * @param options - Options for listing resources
   * @returns Array of resources
   */
  async listServerResources(
    serverName: string,
    options?: { bypassCache?: boolean }
  ): Promise<McpResource[]> {
    const cacheKey = `resources:${serverName}`;

    // Check cache first
    if (this.cacheEnabled && !options?.bypassCache) {
      const cached = this.resourceCache.get(cacheKey);
      if (cached) {
        return cached;
      }
    }

    // Fetch from server
    const resources = await this.clientManager.listResources(serverName);

    // Cache the result
    if (this.cacheEnabled) {
      this.resourceCache.set(cacheKey, resources);

      // Set cache expiration
      setTimeout(() => {
        this.resourceCache.delete(cacheKey);
      }, this.cacheTtl);
    }

    return resources;
  }

  /**
   * Read resource contents
   *
   * @param serverName - Server name
   * @param uri - Resource URI
   * @returns Resource contents
   */
  async readResource(serverName: string, uri: string): Promise<McpResourceContents> {
    return await this.clientManager.readResource(serverName, uri);
  }

  /**
   * Find resources by MIME type pattern
   *
   * @param mimeTypePattern - MIME type pattern (supports wildcards)
   * @returns Matching resources
   */
  async findResourcesByMimeType(mimeTypePattern: string): Promise<
    Array<{ serverName: string; resource: McpResource }>
  > {
    const allResources = await this.listAllResources();
    const pattern = new RegExp(mimeTypePattern.replace('*', '.*'));

    return allResources.filter(({ resource }) =>
      pattern.test(resource.mimeType || '')
    );
  }

  /**
   * Find resources by name pattern
   *
   * @param namePattern - Name pattern (supports wildcards)
   * @returns Matching resources
   */
  async findResourcesByName(namePattern: string): Promise<
    Array<{ serverName: string; resource: McpResource }>
  > {
    const allResources = await this.listAllResources();
    const pattern = new RegExp(namePattern.replace('*', '.*'), 'i');

    return allResources.filter(({ resource }) => pattern.test(resource.name));
  }

  /**
   * Get server name for a resource URI
   * Reverse lookup to find which server provides a resource
   *
   * @param uri - Resource URI
   * @returns Server name or undefined if not found
   */
  async getResourceServer(uri: string): Promise<string | undefined> {
    const allResources = await this.listAllResources();

    const match = allResources.find(({ resource }) => resource.uri === uri);

    return match?.serverName;
  }

  /**
   * Clear resource cache
   *
   * @param serverName - Optional server name to clear cache for specific server
   */
  clearCache(serverName?: string): void {
    if (serverName) {
      this.resourceCache.delete(`resources:${serverName}`);
    } else {
      this.resourceCache.clear();
    }
  }

  /**
   * Enable or disable resource caching
   *
   * @param enabled - Whether caching should be enabled
   */
  setCacheEnabled(enabled: boolean): void {
    this.cacheEnabled = enabled;
  }

  /**
   * Set cache TTL (time to live)
   *
   * @param ttl - Cache TTL in milliseconds
   */
  setCacheTtl(ttl: number): void {
    this.cacheTtl = ttl;
  }
}
