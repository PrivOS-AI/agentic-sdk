/**
 * Tool execution context - runtime information passed to all tool executors
 */
export interface ToolContext {
  /** Current working directory for file operations */
  cwd: string;
  /** Session ID for tracking */
  sessionId: string;
  /** Permission mode for the current session */
  permissionMode: string;
}

/**
 * Tool execution function
 * Receives tool input and execution context
 */
export type ToolExecutorFunction = (
  input: Record<string, unknown>,
  context: ToolContext
) => Promise<{
  content: string | Array<unknown>;
  isError?: boolean;
}>;

/**
 * Tool definition with JSON Schema input validation
 */
export interface ToolDefinitionInterface {
  name: string;
  description: string;
  inputSchema: Record<string, unknown>;
  execute: ToolExecutorFunction;
}

/**
 * Tool registry for registration, lookup, and filtering
 */
export class ToolRegistryManager {
  private tools: Map<string, ToolDefinitionInterface> = new Map();

  /**
   * Register a tool
   */
  register(tool: ToolDefinitionInterface): void {
    if (this.tools.has(tool.name)) {
      throw new Error(`Tool already registered: ${tool.name}`);
    }
    this.tools.set(tool.name, tool);
  }

  /**
   * Register multiple tools
   */
  registerMany(tools: ToolDefinitionInterface[]): void {
    for (const tool of tools) {
      this.register(tool);
    }
  }

  /**
   * Get a tool by name
   */
  get(name: string): ToolDefinitionInterface | undefined {
    return this.tools.get(name);
  }

  /**
   * Check if a tool exists
   */
  has(name: string): boolean {
    return this.tools.has(name);
  }

  /**
   * Get all registered tools
   */
  getAll(): ToolDefinitionInterface[] {
    return Array.from(this.tools.values());
  }

  /**
   * Get filtered tools based on allowed/disallowed lists
   * Supports glob patterns (e.g., mcp__github__*)
   */
  getFiltered(allowed?: string[], disallowed?: string[]): ToolDefinitionInterface[] {
    let tools = this.getAll();

    // Apply disallowed filter first
    if (disallowed && disallowed.length > 0) {
      tools = tools.filter((tool) => {
        return !disallowed.some((pattern) => this.matchesPattern(tool.name, pattern));
      });
    }

    // Apply allowed filter
    if (allowed && allowed.length > 0) {
      tools = tools.filter((tool) => {
        return allowed.some((pattern) => this.matchesPattern(tool.name, pattern));
      });
    }

    return tools;
  }

  /**
   * Convert tools to Anthropic API format
   */
  toAnthropicTools(): Array<{
    name: string;
    description: string;
    input_schema: Record<string, unknown>;
  }> {
    return this.getAll().map((tool) => ({
      name: tool.name,
      description: tool.description,
      input_schema: tool.inputSchema,
    }));
  }

  /**
   * Convert filtered tools to Anthropic API format
   */
  toFilteredAnthropicTools(allowed?: string[], disallowed?: string[]): Array<{
    name: string;
    description: string;
    input_schema: Record<string, unknown>;
  }> {
    return this.getFiltered(allowed, disallowed).map((tool) => ({
      name: tool.name,
      description: tool.description,
      input_schema: tool.inputSchema,
    }));
  }

  /**
   * Check if tool name matches a pattern (supports glob wildcards)
   */
  private matchesPattern(name: string, pattern: string): boolean {
    // Handle glob wildcards (* and ?)
    if (pattern.includes('*') || pattern.includes('?')) {
      const regex = new RegExp(
        '^' + pattern.replace(/\*/g, '.*').replace(/\?/g, '.') + '$'
      );
      return regex.test(name);
    }
    return name === pattern;
  }

  /**
   * Unregister a tool
   */
  unregister(name: string): boolean {
    return this.tools.delete(name);
  }

  /**
   * Clear all tools
   */
  clear(): void {
    this.tools.clear();
  }

  /**
   * Get tool count
   */
  get size(): number {
    return this.tools.size;
  }
}
