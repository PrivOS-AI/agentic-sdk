import type {
  ToolUseBlock,
  ToolResult,
} from '../types/messages.js';
import type {
  PermissionMode,
  CanUseTool,
} from '../types/permissions.js';
import type {
  HookCallbackMatcher,
  HookEvent,
} from '../types/hooks.js';
import {
  HookExecutor,
} from '../hooks/hook-execution-pipeline-with-timeout-and-regex-matching.js';
import {
  evaluatePermission,
  createPermissionDenialMessage,
  type PermissionEvaluationContext,
} from '../permissions/permission-evaluation-chain-with-hooks-and-callbacks.js';
import {
  buildPostToolUseInput,
  buildPostToolUseFailureInput,
} from '../hooks/hook-event-registry-and-type-guards.js';

/**
 * Tool executor configuration
 */
export interface ToolExecutorConfig {
  /** Hook callbacks for lifecycle events */
  hooks?: Partial<Record<HookEvent, HookCallbackMatcher[]>>;
  /** Permission mode */
  permissionMode?: PermissionMode;
  /** User-provided permission callback */
  canUseTool?: CanUseTool;
  /** Allowed tools (hard allow list) */
  allowedTools?: string[];
  /** Disallowed tools (hard deny list) */
  disallowedTools?: string[];
  /** Abort signal for cancellation */
  abortSignal?: AbortSignal;
  /** Callback when a tool execution starts */
  onToolStart?: (toolUse: ToolUseBlock) => void;
  /** Callback when a tool execution completes */
  onToolComplete?: (toolUse: ToolUseBlock, result: ToolResult) => void;
  /** Callback when a tool execution fails */
  onToolError?: (toolUse: ToolUseBlock, error: Error) => void;
}

/**
 * Tool executor - executes tools with permission checks and hooks
 */
export class ToolExecutor {
  private config: ToolExecutorConfig;
  private hookExecutor: HookExecutor;
  private permissionContext: PermissionEvaluationContext;

  constructor(config: ToolExecutorConfig = {}) {
    this.config = config;
    this.hookExecutor = new HookExecutor(config.hooks);
    this.permissionContext = {
      hooks: this.hookExecutor,
      permissionMode: config.permissionMode,
      canUseTool: config.canUseTool,
      allowedTools: config.allowedTools,
      disallowedTools: config.disallowedTools,
      abortSignal: config.abortSignal,
    };
  }

  /**
   * Execute a tool with permission checks and hooks
   * @param toolUse - Tool use block
   * @param toolHandler - Function that executes the actual tool
   * @returns Tool result
   */
  async executeTool(
    toolUse: ToolUseBlock,
    toolHandler: (name: string, input: Record<string, unknown>) => Promise<unknown>
  ): Promise<ToolResult> {
    const startTime = Date.now();
    let toolInput = { ...toolUse.input }; // Clone input to allow modification

    try {
      // Notify tool start
      if (this.config.onToolStart) {
        this.config.onToolStart(toolUse);
      }

      // Step 1: Evaluate permissions
      const permissionResult = await evaluatePermission(
        toolUse.name,
        toolInput,
        toolUse.id,
        this.permissionContext
      );

      if (!permissionResult.allow) {
        const denialMessage = createPermissionDenialMessage(
          toolUse.name,
          toolUse.id,
          permissionResult.reason || 'Permission denied',
          this.config.permissionMode
        );

        // Emit permission denial
        // TODO: Emit SDKPermissionDenial message

        return {
          tool_use_id: toolUse.id,
          content: denialMessage,
          is_error: true,
        };
      }

      // Use updated input if provided by hooks
      if (permissionResult.updatedInput) {
        toolInput = permissionResult.updatedInput;
      }

      // Step 2: Execute the tool
      const result = await toolHandler(toolUse.name, toolInput);
      const durationMs = Date.now() - startTime;

      // Step 3: Fire PostToolUse hooks
      if (this.hookExecutor.hasHooks('PostToolUse')) {
        const postInput = buildPostToolUseInput(
          toolUse.name,
          toolInput,
          toolUse.id as any,
          result,
          durationMs
        );

        try {
          await this.hookExecutor.execute('PostToolUse', postInput, toolUse.name, this.config.abortSignal);
        } catch (error) {
          console.error('[ToolExecutor] PostToolUse hook failed:', error);
          // Continue despite hook failure
        }
      }

      // Notify tool complete
      if (this.config.onToolComplete) {
        this.config.onToolComplete(toolUse, {
          tool_use_id: toolUse.id,
          content: result,
        });
      }

      return {
        tool_use_id: toolUse.id,
        content: result,
      };
    } catch (error) {
      const durationMs = Date.now() - startTime;
      const errorObj = error instanceof Error ? error : new Error(String(error));

      // Fire PostToolUseFailure hooks
      if (this.hookExecutor.hasHooks('PostToolUseFailure')) {
        const failureInput = buildPostToolUseFailureInput(
          toolUse.name,
          toolInput,
          toolUse.id as any,
          errorObj,
          durationMs
        );

        try {
          await this.hookExecutor.execute('PostToolUseFailure', failureInput, toolUse.name, this.config.abortSignal);
        } catch (hookError) {
          console.error('[ToolExecutor] PostToolUseFailure hook failed:', hookError);
          // Continue despite hook failure
        }
      }

      // Notify tool error
      if (this.config.onToolError) {
        this.config.onToolError(toolUse, errorObj);
      }

      return {
        tool_use_id: toolUse.id,
        content: errorObj.message,
        is_error: true,
      };
    }
  }

  /**
   * Execute multiple tools in parallel
   * @param toolUses - Array of tool use blocks
   * @param toolHandler - Function that executes the actual tool
   * @returns Array of tool results
   */
  async executeTools(
    toolUses: ToolUseBlock[],
    toolHandler: (name: string, input: Record<string, unknown>) => Promise<unknown>
  ): Promise<ToolResult[]> {
    const results = await Promise.all(
      toolUses.map(toolUse => this.executeTool(toolUse, toolHandler))
    );
    return results;
  }

  /**
   * Get the hook executor instance
   */
  getHookExecutor(): HookExecutor {
    return this.hookExecutor;
  }

  /**
   * Update permission mode
   */
  setPermissionMode(mode: PermissionMode): void {
    this.config.permissionMode = mode;
    this.permissionContext.permissionMode = mode;
  }

  /**
   * Update allowed tools list
   */
  setAllowedTools(tools: string[] | undefined): void {
    this.config.allowedTools = tools;
    this.permissionContext.allowedTools = tools;
  }

  /**
   * Update disallowed tools list
   */
  setDisallowedTools(tools: string[] | undefined): void {
    this.config.disallowedTools = tools;
    this.permissionContext.disallowedTools = tools;
  }
}
