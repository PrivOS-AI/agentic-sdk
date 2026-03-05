import type { UUID } from '../types/messages.js';
import type { Options, ThinkingConfig, EffortLevel, SlashCommand } from '../types/options.js';
import type {
  SDKMessage,
  AnthropicMessage,
  SDKPartialAssistantMessage,
  SDKUserMessage,
  SDKSystemMessage,
  SDKResultMessage,
  SDKResultSuccessMessage,
  SDKTextMessage,
  SDKToolUseMessage,
} from '../types/messages.js';
import type { McpServerConfig, McpServerStatus } from '../types/mcp.js';
import type { AgentInfo } from '../types/agents.js';
import type { ModelInfo, AccountInfo } from '../types/model-and-account-info-types.js';
import type { PermissionEvaluationContext } from '../permissions/permission-evaluation-chain-with-hooks-and-callbacks.js';
import type { PermissionMode } from '../types/permissions.js';
import type { RewindFilesResult } from '../types/sessions.js';
import { ConversationState } from './conversation-state.js';
import { agenticLoop, AgenticLoopResult } from './agentic-loop.js';
import { TokenTracker } from './token-tracker.js';
import { McpClientManager } from '../tools/mcp/mcp-client-manager.js';
import { ToolRegistryManager } from '../tools/tool-registry-manager.js';
import { evaluatePermission } from '../permissions/permission-evaluation-chain-with-hooks-and-callbacks.js';
import { FileCheckpointManager } from '../sessions/file-checkpointing.js';
// import { DebugLogger } from './debug-logger-with-console-and-file-logging-support.js'; // Reserved for future debug logging
import { v4 as uuidv4 } from 'uuid';
import { registerBuiltinTools } from '../tools/builtin/builtin-tools-registration.js';
import { SkillLoader } from './skill-loader-for-discovering-and-loading-skills-from-disk.js';
import { SkillInvoker } from './skill-invoker-for-detecting-and-executing-slash-commands.js';

/**
 * Query class - main entry point for agentic SDK
 * Implements AsyncGenerator<SDKMessage> interface
 */
export class Query implements AsyncGenerator<SDKMessage, void, unknown> {
  private abortController: AbortController;
  private conversation: ConversationState;
  private tokenTracker: TokenTracker;
  private options: Options;
  private sessionId: UUID;
  private generator: AsyncGenerator<SDKMessage, void, unknown> | null = null;
  private startTime: number = 0;
  private apiStartTime: number = 0;
  private mcpManager: McpClientManager;
  private toolRegistry: ToolRegistryManager;
  private permissionContext: PermissionEvaluationContext;
  private fileCheckpointManager: FileCheckpointManager;
  private inputStreamQueue: AsyncIterable<SDKMessage>[] = [];
  private parentToolUseId?: UUID;
  private runningSubagents: Map<UUID, AbortController> = new Map();
  private skillLoader: SkillLoader;
  private skillInvoker: SkillInvoker;
  // private debugLogger?: DebugLogger; // Reserved for future debug logging

  constructor(
    prompt: string | AsyncIterable<SDKUserMessage>,
    options: Options = {},
    parentToolUseId?: UUID
  ) {
    this.abortController = options.abortController || new AbortController();
    this.options = this.normalizeOptions(options);
    this.sessionId = (this.options.sessionId || uuidv4()) as UUID;
    this.conversation = new ConversationState();
    this.tokenTracker = new TokenTracker();
    this.mcpManager = new McpClientManager();
    this.toolRegistry = new ToolRegistryManager();
    this.fileCheckpointManager = new FileCheckpointManager({
      maxCheckpoints: 1000,
      persistToDisk: false,
    });
    this.permissionContext = {
      permissionMode: this.options.permissionMode || 'default',
      canUseTool: this.options.canUseTool,
      allowedTools: this.options.allowedTools,
      disallowedTools: this.options.disallowedTools,
      abortSignal: this.abortController.signal,
    };
    this.parentToolUseId = parentToolUseId;
    this.skillLoader = new SkillLoader(undefined, this.options.cwd);
    this.skillInvoker = new SkillInvoker(this.skillLoader, this.options.cwd);

    // Register built-in tools
    registerBuiltinTools(
      this.toolRegistry,
      this.options,
      this.parentToolUseId,
      this.abortController.signal
    );

    // Handle different prompt types
    if (typeof prompt === 'string') {
      // String prompt - add as user message (will be processed for slash commands in generator)
      this.conversation.addUserMessage(prompt);
    } else {
      // AsyncIterable<SDKUserMessage> - store for multi-turn streaming input
      this.inputStreamQueue.push(prompt as AsyncIterable<SDKMessage>);
    }

    // Don't create generator in constructor - create it on first iteration
    // this.generator = this.createGenerator();
  }

  /**
   * Normalize options - map effort to thinking config if needed
   */
  private normalizeOptions(options: Options): Options {
    const normalized = { ...options };

    // If effort is specified but no explicit thinking config, map effort to thinking
    if (options.effort && !options.thinking) {
      normalized.thinking = this.mapEffortToThinking(options.effort);
    }

    return normalized;
  }

  /**
   * Map effort level to thinking config
   */
  private mapEffortToThinking(effort: EffortLevel): ThinkingConfig {
    switch (effort) {
      case 'low':
        return { type: 'disabled' };
      case 'medium':
        return { type: 'enabled', budgetTokens: 4000 };
      case 'high':
        return { type: 'enabled', budgetTokens: 16000 };
      case 'max':
        return { type: 'adaptive' };
      default:
        return { type: 'disabled' };
    }
  }

  /**
   * AsyncGenerator interface implementation
   */
  async next(): Promise<IteratorResult<SDKMessage, void>> {
    if (!this.generator) {
      return { done: true, value: undefined };
    }
    return this.generator.next();
  }

  async return(): Promise<IteratorResult<SDKMessage, void>> {
    if (!this.generator) {
      return { done: true, value: undefined };
    }
    return this.generator.return();
  }

  async throw(error: unknown): Promise<IteratorResult<SDKMessage, void>> {
    if (!this.generator) {
      return { done: true, value: undefined };
    }
    return this.generator.throw(error);
  }

  /**
   * AsyncIterable interface
   * Returns self to make Query directly iterable
   */
  [Symbol.asyncIterator](): AsyncGenerator<SDKMessage, void, unknown> {
    console.log('[Query] [Symbol.asyncIterator] called');
    // Create generator on first use
    if (!this.generator) {
      console.log('[Query] Creating generator on first iteration');
      this.generator = this.createGenerator();
    }
    return this.generator;
  }

  /**
   * Interrupt the query
   * Uses AbortController to signal cancellation
   */
  async interrupt(): Promise<void> {
    if (!this.abortController.signal.aborted) {
      this.abortController.abort();
    }
  }

  /**
   * Close the query and cleanup resources
   * Idempotent - safe to call multiple times
   */
  async close(): Promise<void> {
    // Abort any running operations
    if (!this.abortController.signal.aborted) {
      this.abortController.abort();
    }

    // Disconnect all MCP servers
    try {
      await this.mcpManager.disconnectAll();
    } catch (error) {
      console.error('[Query] Error disconnecting MCP servers:', error);
    }

    // Clear file checkpoints
    this.fileCheckpointManager.clearCheckpoints();

    // Close generator
    if (this.generator) {
      try {
        await this.generator.return();
      } catch (error) {
        // Generator may already be closed
      }
      this.generator = null;
    }
  }

  /**
   * Set model for next turn
   * Takes effect on next API call (not mid-stream)
   */
  async setModel(model?: string): Promise<void> {
    if (!model) {
      // If no model specified, reset to default
      this.options.model = 'claude-opus-4-6';
      return;
    }

    // Validate model name against known models
    const availableModels = TokenTracker.getAvailableModels();
    if (!availableModels.includes(model)) {
      console.warn(`[Query] Unknown model: ${model}. Available: ${availableModels.join(', ')}`);
    }

    this.options.model = model;
    this.permissionContext.permissionMode = this.options.permissionMode;
  }

  /**
   * Set max thinking tokens
   * Controls the budget for extended thinking mode
   */
  async setMaxThinkingTokens(maxThinkingTokens: number | null): Promise<void> {
    if (maxThinkingTokens === null) {
      // Disable thinking
      this.options.thinking = { type: 'disabled' };
    } else {
      // Set custom thinking budget
      this.options.thinking = { type: 'enabled', budgetTokens: maxThinkingTokens };
    }
  }

  /**
   * Set permission mode dynamically
   * Takes effect on next tool execution
   */
  async setPermissionMode(mode: PermissionMode): Promise<void> {
    this.options.permissionMode = mode;
    this.permissionContext.permissionMode = mode;
  }

  /**
   * Get initialization result
   * Returns full initialization metadata
   */
  async initializationResult(): Promise<{
    commands: string[];
    agents: AgentInfo[];
    output_style: string;
    available_output_styles: string[];
    models: ModelInfo[];
    account: AccountInfo;
  }> {
    return {
      commands: [], // No slash commands in this SDK
      agents: await this.supportedAgents(),
      output_style: this.options.outputFormat?.type === 'json' ? 'json' : 'text',
      available_output_styles: ['text', 'json'],
      models: await this.supportedModels(),
      account: await this.accountInfo(),
    };
  }

  /**
   * Get supported models
   * Returns static list of known Claude models with metadata
   */
  async supportedModels(): Promise<ModelInfo[]> {
    return TokenTracker.getAvailableModels().map((model) => ({
      name: model,
      model_id: model,
      capabilities: ['text', 'tool_use'],
      pricing: TokenTracker.getModelPricing(model),
    }));
  }

  /**
   * Get account info
   * Returns account metadata from API key
   */
  async accountInfo(): Promise<AccountInfo> {
    // Check if API key is from options or environment
    if (this.options.env?.ANTHROPIC_API_KEY || this.options.env?.ANTHROPIC_AUTH_TOKEN) {
      return {
        apiKeySource: 'options.env',
      };
    }

    if (process.env.ANTHROPIC_API_KEY || process.env.ANTHROPIC_AUTH_TOKEN) {
      return {
        apiKeySource: 'process.env',
      };
    }

    return {
      apiKeySource: 'none',
    };
  }

  /**
   * Get supported agents
   * Returns list of defined agent metadata
   */
  async supportedAgents(): Promise<AgentInfo[]> {
    if (!this.options.agents) {
      return [];
    }

    return Object.entries(this.options.agents).map(([name, definition]) => ({
      name,
      description: definition.description,
      model: definition.model === 'inherit' ? (this.options.model || 'claude-opus-4-6') : (definition.model || 'claude-opus-4-6'),
      toolCount: definition.tools?.length || 0,
      disabled: definition.disabled || false,
    }));
  }

  /**
   * Get MCP server status
   */
  async mcpServerStatus(): Promise<McpServerStatus[]> {
    return this.mcpManager.getServerStatus();
  }

  /**
   * Set MCP servers
   */
  async setMcpServers(servers: Record<string, McpServerConfig>): Promise<void> {
    // Disconnect all existing servers
    await this.mcpManager.disconnectAll();

    // Connect to new servers
    for (const [name, config] of Object.entries(servers)) {
      try {
        const result = await this.mcpManager.connectServer(name, config);

        if (result.success) {
          // Register discovered tools
          const server = this.mcpManager.getServer(name);
          if (server) {
            for (const toolName of result.tools) {
              this.toolRegistry.register({
                name: `mcp__${name}__${toolName}`,
                description: `MCP tool ${toolName} from server ${name}`,
                inputSchema: {},
                execute: async (input) => {
                  const result = await this.mcpManager.callTool(name, toolName, input);
                  return {
                    content: JSON.stringify(result),
                  };
                },
              });
            }
          }
        }
      } catch (error) {
        console.error(`[Query] Failed to connect to MCP server ${name}:`, error);
      }
    }
  }

  /**
   * Reconnect MCP server
   */
  async reconnectMcpServer(name: string): Promise<void> {
    await this.mcpManager.reconnectServer(name);
  }

  /**
   * Toggle MCP server
   */
  async toggleMcpServer(serverName: string, enabled: boolean): Promise<void> {
    this.mcpManager.toggleServer(serverName, enabled);
  }

  /**
   * Get the list of available skills for the current session
   */
  async supportedCommands(): Promise<SlashCommand[]> {
    return await this.skillLoader.getSlashCommands();
  }

  /**
   * Process a user message and transform slash commands into skill invocations
   */
  async processUserMessage(message: string): Promise<string> {
    const result = await this.skillInvoker.processMessage(message);

    if (result) {
      // Slash command detected and processed
      return result.message;
    }

    // No slash command, return original message
    return message;
  }

  /**
   * Stream additional input for multi-turn conversations
   * Accepts follow-up prompts and feeds them into the conversation
   */
  async streamInput(stream: AsyncIterable<SDKMessage>): Promise<void> {
    // Add to input queue for processing
    this.inputStreamQueue.push(stream);

    // The generator will pick up these messages in the next iteration
  }

  /**
   * Stop a specific subagent task
   * Aborts the subagent's AbortController to cancel execution
   */
  async stopTask(taskId: UUID): Promise<void> {
    const abortController = this.runningSubagents.get(taskId);
    if (abortController) {
      abortController.abort();
      this.runningSubagents.delete(taskId);
    } else {
      console.warn(`[Query] stopTask(${taskId}): No running subagent found with this ID`);
    }
  }

  /**
   * Rewind files to their state at a specific message
   * Uses file checkpointing to restore file contents
   */
  async rewindFiles(messageId: UUID, options?: { dryRun?: boolean }): Promise<RewindFilesResult> {
    return this.fileCheckpointManager.rewindFiles(messageId, options);
  }

  /**
   * Create internal generator
   */
  private async* createGenerator(): AsyncGenerator<SDKMessage, void, unknown> {
    process.stderr.write('[Query] createGenerator: ENTRY POINT\n');
    try {
      this.startTime = Date.now();

      console.log('[Query] createGenerator: Starting generator');

      // Initialize MCP servers if configured
    if (this.options.mcpServers && Object.keys(this.options.mcpServers).length > 0) {
      for (const [name, config] of Object.entries(this.options.mcpServers)) {
        try {
          const result = await this.mcpManager.connectServer(name, config);

          if (result.success) {
            // Register discovered tools with mcp__ prefix
            const server = this.mcpManager.getServer(name);
            if (server) {
              // Discover tools with full schemas
              const client = server.client;
              const toolsList = await client.listTools();

              for (const tool of toolsList.tools) {
                this.toolRegistry.register({
                  name: `mcp__${name}__${tool.name}`,
                  description: tool.description || `MCP tool ${tool.name} from server ${name}`,
                  inputSchema: tool.inputSchema as Record<string, unknown>,
                  execute: async (input) => {
                    const result = await this.mcpManager.callTool(name, tool.name, input);
                    return {
                      content: JSON.stringify(result),
                    };
                  },
                });
              }
            }
          }
        } catch (error) {
          console.error(`[Query] Failed to connect to MCP server ${name}:`, error);
        }
      }
    }

    // Process initial user message for slash commands (if prompt was a string)
    const messages = this.conversation.getMessages();
    if (messages.length > 0) {
      const firstMessage = messages[0];
      if (firstMessage.role === 'user') {
        const content = Array.isArray(firstMessage.content)
          ? firstMessage.content.map((c: any) => (typeof c === 'string' ? c : c.text)).join('')
          : String(firstMessage.content);

        const processed = await this.processUserMessage(content);

        // Replace the first message with processed version
        this.conversation = new ConversationState();
        this.conversation.addUserMessage(processed);
      }
    }

    // Handle AsyncIterable prompt input
    if (this.inputStreamQueue.length > 0 && this.inputStreamQueue[0]) {
      const inputStream = this.inputStreamQueue[0];
      try {
        for await (const message of inputStream) {
          if (message.type === 'user') {
            // Add user message to conversation
            const promptText = (message as SDKUserMessage).prompt;
            const processed = await this.processUserMessage(promptText);
            this.conversation.addUserMessage(processed);
          }
        }
      } catch (error) {
        console.error('[Query] Error processing input stream:', error);
        yield this.createErrorMessage(`Failed to process input stream: ${error instanceof Error ? error.message : String(error)}`);
        return;
      }
      // Clear the input stream queue after processing
      this.inputStreamQueue = [];
    }

    // Emit system init message
    yield await this.createSystemInitMessage();

    // Get API key - support both ANTHROPIC_API_KEY and ANTHROPIC_AUTH_TOKEN
    const apiKey = this.options.env?.ANTHROPIC_API_KEY ||
                   this.options.env?.ANTHROPIC_AUTH_TOKEN ||
                   process.env.ANTHROPIC_API_KEY ||
                   process.env.ANTHROPIC_AUTH_TOKEN ||
                   '';

    if (!apiKey) {
      yield this.createErrorMessage('No API key provided');
      return;
    }

    this.apiStartTime = Date.now();

    // Run agentic loop
    const loop = agenticLoop(this.conversation, {
      apiKey,
      baseURL: this.options.env?.ANTHROPIC_BASE_URL as string || process.env.ANTHROPIC_BASE_URL,
      model: this.options.model || 'claude-opus-4-6',
      fallbackModel: this.options.fallbackModel,
      systemPrompt: this.options.systemPrompt,
      thinking: this.options.thinking,
      maxTurns: this.options.maxTurns || 50,
      maxBudgetUsd: this.options.maxBudgetUsd,
      abortSignal: this.abortController.signal,
      allowedTools: this.options.allowedTools,
      disallowedTools: this.options.disallowedTools,
      includePartialMessages: this.options.includePartialMessages || false,
      toolRegistry: this.toolRegistry,
      checkPermissions: async (toolName, input) => {
        const result = await evaluatePermission(
          toolName,
          input,
          '00000000-0000-0000-0000-000000000000' as UUID,
          this.permissionContext
        );
        return { allowed: result.allow, reason: result.reason };
      },
      parentToolUseId: this.parentToolUseId,
      toolContext: {
        cwd: this.options.cwd || process.cwd(),
        sessionId: this.sessionId,
        permissionMode: this.options.permissionMode || 'default',
      },
    });

    console.log('[Query] About to iterate through agentic loop, loop object:', loop);
    // Yield messages from loop
    let finalResult: AgenticLoopResult | null = null;
    for await (const message of loop) {
      // Check if this is a partial message (streaming delta)
      if (message && typeof message === 'object' && '_partial' in message) {
        // Extract delta and emit as partial message
        const delta = (message as any)._delta;
        const partialMessage: SDKPartialAssistantMessage = {
          type: 'partial_assistant',
          session_id: this.sessionId,
          delta: {
            type: delta?.type,
            text: delta?.text,
            tool_use: delta?.tool_use,
            thinking: delta?.thinking,
          },
        };

        // Add parent_tool_use_id if this is a subagent
        if (this.parentToolUseId) {
          partialMessage.parent_tool_use_id = this.parentToolUseId;
        }

        yield partialMessage;
      } else if (message && typeof message === 'object' && 'type' in message) {
        const msgType = (message as any).type;

        // Check if this is an SDKMessage (status, tool_progress, permission_denial, etc.)
        if (msgType === 'status' || msgType === 'tool_progress' || msgType === 'permission_denial') {
          // Yield SDKMessage directly with session_id
          const sdkMsg = message as SDKMessage;
          if (!sdkMsg.session_id) {
            sdkMsg.session_id = this.sessionId;
          }
          if (this.parentToolUseId) {
            sdkMsg.parent_tool_use_id = this.parentToolUseId;
          }
          yield sdkMsg;
        } else if (msgType === 'assistant' || (message as any).role === 'assistant') {
          // Convert AnthropicMessage to SDKMessage
          const sdkMessage: SDKMessage = {
            type: 'assistant',
            message,
            session_id: this.sessionId,
          };

          // Add parent_tool_use_id if this is a subagent
          if (this.parentToolUseId) {
            sdkMessage.parent_tool_use_id = this.parentToolUseId;
          }

          // Also emit compatibility messages for original SDK format
          yield* this.emitCompatibilityMessages(message as AnthropicMessage);

          yield sdkMessage;
        } else {
          // This might be AgenticLoopResult
          finalResult = message as AgenticLoopResult;
        }
      } else {
        // Store final result when loop completes
        finalResult = message as AgenticLoopResult;
      }
    }

    // Emit result message
    if (finalResult) {
      yield this.createResultMessage(finalResult);
    }
    } catch (error) {
      console.error('[Query] Generator error:', error);
      yield this.createErrorMessage(error instanceof Error ? error.message : String(error));
    }
  }

  /**
   * Emit compatibility messages for original SDK format
   * Transforms assistant messages into text/tool_use messages
   */
  private async* emitCompatibilityMessages(anthropicMessage: AnthropicMessage): AsyncGenerator<SDKMessage> {
    if (!anthropicMessage.content || !Array.isArray(anthropicMessage.content)) {
      return;
    }

    for (const block of anthropicMessage.content) {
      if (typeof block !== 'object' || block === null) continue;

      // Emit text messages
      if (block.type === 'text' && 'text' in block) {
        yield {
          type: 'text',
          text: String(block.text),
          session_id: this.sessionId,
        } as SDKTextMessage;
      }

      // Emit tool_use messages with normalized names
      if (block.type === 'tool_use' && 'name' in block && 'id' in block) {
        const toolName = String(block.name);
        // Normalize tool name: capitalize first letter (e.g., glob -> Glob)
        const normalizedName = toolName.charAt(0).toUpperCase() + toolName.slice(1);

        yield {
          type: 'tool_use',
          name: normalizedName,
          input: (block as { input: Record<string, unknown> }).input || {},
          tool_use_id: String(block.id),
          session_id: this.sessionId,
        } as SDKToolUseMessage;
      }
    }
  }

  /**
   * Create system init message
   */
  private async createSystemInitMessage(): Promise<SDKSystemMessage> {
    const tools = this.toolRegistry.toFilteredAnthropicTools(
      this.options.allowedTools,
      this.options.disallowedTools
    );

    // Build agent info from options.agents
    const agents: AgentInfo[] = [];
    if (this.options.agents) {
      for (const [name, definition] of Object.entries(this.options.agents)) {
        if (!definition.disabled) {
          agents.push({
            name,
            description: definition.description,
            model: definition.model || 'inherit',
            toolCount: definition.tools?.length || 0,
            disabled: definition.disabled || false,
          });
        }
      }
    }

    return {
      type: 'system',
      subtype: 'init',
      session_id: this.sessionId,
      cwd: this.options.cwd || process.cwd(),
      model: this.options.model || 'claude-opus-4-6',
      permission_mode: this.options.permissionMode,
      tools: tools.map((t) => t.name),
      mcp_servers: await this.mcpServerStatus(),
      agents,
    };
  }

  /**
   * Create error result message
   */
  private createErrorMessage(error: string): SDKResultMessage {
    return {
      type: 'result',
      subtype: 'error_during_execution',
      error: { message: error },
      duration_ms: Date.now() - this.startTime,
      num_turns: 0,
      total_cost_usd: 0,
    };
  }

  /**
   * Validate structured output against JSON Schema
   * Returns validated data or throws error
   */
  private validateStructuredOutput(data: unknown, schema: Record<string, unknown>): unknown {
    // Basic JSON Schema validation
    // For full validation, consider using ajv or similar library
    try {
      // Ensure data is an object
      if (typeof data !== 'object' || data === null) {
        throw new Error('Structured output must be an object');
      }

      // If schema has type property, validate it
      if (schema.type) {
        const schemaType = schema.type;
        if (schemaType === 'object' && (typeof data !== 'object' || data === null)) {
          throw new Error('Expected object');
        }
        if (schemaType === 'array' && !Array.isArray(data)) {
          throw new Error('Expected array');
        }
        if (schemaType === 'string' && typeof data !== 'string') {
          throw new Error('Expected string');
        }
        if (schemaType === 'number' && typeof data !== 'number') {
          throw new Error('Expected number');
        }
        if (schemaType === 'boolean' && typeof data !== 'boolean') {
          throw new Error('Expected boolean');
        }
      }

      // If schema has required properties, validate them
      if (schema.properties && typeof data === 'object' && data !== null) {
        const required = schema.required as string[] | undefined;
        if (required) {
          for (const prop of required) {
            if (!(prop in data)) {
              throw new Error(`Missing required property: ${prop}`);
            }
          }
        }
      }

      return data;
    } catch (error) {
      throw new Error(`Structured output validation failed: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  /**
   * Extract JSON from assistant message
   * Handles markdown code blocks and plain JSON
   */
  private extractJsonFromMessage(message: AnthropicMessage): unknown {
    if (!message.content || !Array.isArray(message.content)) {
      throw new Error('No content in message');
    }

    // Find text content
    const textBlocks = message.content.filter((block: any) => block.type === 'text');

    if (textBlocks.length === 0) {
      throw new Error('No text content in message');
    }

    // Combine all text blocks
    const combinedText = textBlocks.map((block: any) => block.text).join('\n');

    // Try to extract JSON from markdown code blocks
    const jsonCodeBlockMatch = combinedText.match(/```(?:json)?\s*(\{[\s\S]*?\})\s*```/);
    if (jsonCodeBlockMatch) {
      return JSON.parse(jsonCodeBlockMatch[1]);
    }

    // Try to parse entire content as JSON
    try {
      return JSON.parse(combinedText);
    } catch {
      throw new Error('Could not extract valid JSON from message');
    }
  }

  /**
   * Create final result message
   */
  private createResultMessage(result: AgenticLoopResult): SDKResultMessage {
    const duration = Date.now() - this.startTime;
    const apiDuration = this.apiStartTime ? Date.now() - this.apiStartTime : 0;

    // Handle error cases
    if (!result.success) {
      let subtype: SDKResultMessage['subtype'];
      if (result.reason === 'interrupted') {
        subtype = 'error_user_interrupted';
      } else if (result.reason === 'max_turns') {
        subtype = 'error_max_iterations_exceeded';
      } else if (result.reason === 'budget_exceeded') {
        subtype = 'error_budget_exceeded';
      } else {
        subtype = 'error_during_execution';
      }

      return {
        type: 'result',
        subtype,
        error: {
          message: result.error?.message || 'Query failed',
          details: result.reason,
        },
        duration_ms: duration,
        num_turns: this.tokenTracker.getTotalTurns(),
        total_cost_usd: this.tokenTracker.getTotalCostUsd(),
      };
    }

    // Extract result text from final message
    let resultText = '';
    let structuredOutput: unknown = undefined;

    if (result.finalMessage) {
      // Extract text content
      if (result.finalMessage.content && Array.isArray(result.finalMessage.content)) {
        const textBlocks = result.finalMessage.content.filter((block: any) => block.type === 'text');
        resultText = textBlocks.map((block: any) => block.text).join('\n');
      }

      // Handle structured output if configured
      if (this.options.outputFormat?.type === 'json' && this.options.outputFormat.schema) {
        try {
          const jsonData = this.extractJsonFromMessage(result.finalMessage);
          structuredOutput = this.validateStructuredOutput(jsonData, this.options.outputFormat.schema);
          resultText = JSON.stringify(structuredOutput, null, 2);
        } catch (error) {
          // Structured output validation failed
          console.error('[Query] Structured output validation failed:', error);
          // Return error result
          return {
            type: 'result',
            subtype: 'error_max_structured_output_retries',
            error: {
              message: `Structured output validation failed: ${error instanceof Error ? error.message : String(error)}`,
            },
            duration_ms: duration,
            num_turns: this.tokenTracker.getTotalTurns(),
            total_cost_usd: this.tokenTracker.getTotalCostUsd(),
          };
        }
      }
    }

    // Build success result
    const successResult: SDKResultSuccessMessage = {
      type: 'result',
      subtype: 'success',
      result: resultText,
      duration_ms: duration,
      duration_api_ms: apiDuration,
      num_turns: this.tokenTracker.getTotalTurns(),
      total_cost_usd: this.tokenTracker.getTotalCostUsd(),
      usage: {
        input_tokens: 0, // TODO: Extract from result
        output_tokens: 0,
      },
      modelUsage: this.tokenTracker.getModelUsage(),
    };

    // Add structured output if present
    if (structuredOutput !== undefined) {
      successResult.structured_output = structuredOutput;
    }

    return successResult;
  }
}

/**
 * Query function parameters
 * Drop-in replacement for @anthropic-ai/claude-agent-sdk
 */
export interface QueryParams {
  /** User prompt as string or async iterable of messages for multi-turn streaming */
  prompt: string | AsyncIterable<SDKUserMessage>;
  /** Optional query configuration */
  options?: Options;
}

/**
 * Main query function
 * Drop-in replacement for @anthropic-ai/claude-agent-sdk
 *
 * Supports BOTH signatures:
 * 1. query(prompt, options) - Original SDK signature
 * 2. query({ prompt, options }) - Object signature (for backwards compatibility)
 */
export async function* query(
  promptOrParams: string | AsyncIterable<SDKUserMessage> | QueryParams,
  options?: Options
): AsyncGenerator<SDKMessage, void, unknown> {
  process.stderr.write('[query function] ENTRY POINT\n');

  let prompt: string | AsyncIterable<SDKUserMessage>;
  let opts: Options;

  // Detect which signature is being used
  if (typeof promptOrParams === 'object' && 'prompt' in promptOrParams) {
    // Object signature: query({ prompt, options })
    prompt = promptOrParams.prompt;
    opts = promptOrParams.options || {};
  } else {
    // Positional signature: query(prompt, options)
    prompt = promptOrParams;
    opts = options || {};
  }

  const q = new Query(prompt, opts);
  console.log('[query function] Created Query object, about to yield*');
  yield* q[Symbol.asyncIterator]();
  console.log('[query function] Finished yielding');
}
