import type { ToolDefinitionInterface, ToolContext } from './tool-registry-manager.js';
import type { PreToolUseInput, PostToolUseInput, PostToolUseFailureInput } from '../types/hooks.js';
import type { UUID, SDKToolProgressMessage, SDKPermissionDenial } from '../types/messages.js';

/**
 * Tool use block from Anthropic API
 */
export interface ToolUseBlock {
  id: UUID;
  name: string;
  input: Record<string, unknown>;
}

/**
 * Tool result content block
 */
export interface ToolResultBlock {
  tool_use_id: string;
  content: string | Array<unknown>;
  is_error?: boolean;
}

/**
 * Hook callback types
 */
export interface HookCallbacks {
  onPreToolUse?: (input: PreToolUseInput) => Promise<void>;
  onPostToolUse?: (input: PostToolUseInput) => Promise<void>;
  onPostToolUseFailure?: (input: PostToolUseFailureInput) => Promise<void>;
  /** Callback for emitting observability messages */
  onEmitMessage?: (message: SDKToolProgressMessage | SDKPermissionDenial) => Promise<void>;
}

/**
 * Permission checker function
 */
export type PermissionCheckerFunction = (
  toolName: string,
  input: Record<string, unknown>
) => Promise<{ allowed: boolean; reason?: string }>;

/**
 * Tool execution engine configuration
 */
export interface ToolExecutorConfig {
  hooks?: HookCallbacks;
  checkPermissions?: PermissionCheckerFunction;
  defaultTimeoutMs?: number;
  parentToolUseId?: UUID;
  /** Tool execution context (cwd, sessionId, permissionMode) */
  toolContext?: ToolContext;
}

/**
 * Execute a tool use with validation, hooks, and permission checks
 */
export async function executeToolUse(
  toolUse: ToolUseBlock,
  tool: ToolDefinitionInterface,
  config: ToolExecutorConfig = {}
): Promise<ToolResultBlock> {
  const { hooks, checkPermissions, defaultTimeoutMs = 120000 } = config;

  try {
    // Emit tool started message
    if (hooks?.onEmitMessage) {
      await hooks.onEmitMessage({
        type: 'tool_progress',
        tool_name: toolUse.name,
        progress: 'started',
      } as SDKToolProgressMessage);
    }

    // Run PreToolUse hook
    if (hooks?.onPreToolUse) {
      await hooks.onPreToolUse({
        type: 'PreToolUse',
        toolName: toolUse.name,
        toolInput: toolUse.input,
        toolUseId: toolUse.id as UUID,
      });
    }

    // Check permissions
    if (checkPermissions) {
      const permission = await checkPermissions(toolUse.name, toolUse.input);
      if (!permission.allowed) {
        const error = permission.reason || `Permission denied for tool: ${toolUse.name}`;

        // Emit permission denial message
        if (hooks?.onEmitMessage) {
          await hooks.onEmitMessage({
            type: 'permission_denial',
            tool_name: toolUse.name,
            reason: error,
            tool_use_id: toolUse.id as UUID,
          } as SDKPermissionDenial);
        }

        // Run PostToolUseFailure hook
        if (hooks?.onPostToolUseFailure) {
          await hooks.onPostToolUseFailure({
            type: 'PostToolUseFailure',
            toolName: toolUse.name,
            toolInput: toolUse.input,
            toolUseId: toolUse.id as UUID,
            error: new Error(error),
            durationMs: 0,
          });
        }

        return {
          tool_use_id: toolUse.id,
          content: error,
          is_error: true,
        };
      }
    }

    // Execute tool with timeout
    const startTime = Date.now();

    // Prepare tool context (required for all tool executors)
    const toolContext = config.toolContext || {
      cwd: process.cwd(),
      sessionId: 'unknown',
      permissionMode: 'default',
    };

    const result = await executeWithTimeout(
      () => tool.execute(toolUse.input, toolContext),
      defaultTimeoutMs
    );
    const durationMs = Date.now() - startTime;

    // Emit tool completed message
    if (hooks?.onEmitMessage) {
      await hooks.onEmitMessage({
        type: 'tool_progress',
        tool_name: toolUse.name,
        progress: 'completed',
      } as SDKToolProgressMessage);
    }

    // Run PostToolUse hook
    if (hooks?.onPostToolUse) {
      await hooks.onPostToolUse({
        type: 'PostToolUse',
        toolName: toolUse.name,
        toolInput: toolUse.input,
        toolUseId: toolUse.id as UUID,
        result: result.content,
        durationMs,
      });
    }

    return {
      tool_use_id: toolUse.id,
      content: result.content,
      is_error: result.isError,
    };
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    const durationMs = 0;

    // Emit tool failed message
    if (hooks?.onEmitMessage) {
      await hooks.onEmitMessage({
        type: 'tool_progress',
        tool_name: toolUse.name,
        progress: 'failed',
      } as SDKToolProgressMessage);
    }

    // Run PostToolUseFailure hook
    if (hooks?.onPostToolUseFailure) {
      await hooks.onPostToolUseFailure({
        type: 'PostToolUseFailure',
        toolName: toolUse.name,
        toolInput: toolUse.input,
        toolUseId: toolUse.id as UUID,
        error: error instanceof Error ? error : new Error(errorMessage),
        durationMs,
      });
    }

    return {
      tool_use_id: toolUse.id,
      content: errorMessage,
      is_error: true,
    };
  }
}

/**
 * Execute function with timeout
 */
async function executeWithTimeout<T>(
  fn: () => Promise<T>,
  timeoutMs: number
): Promise<T> {
  let timeoutHandle: NodeJS.Timeout | undefined;

  const timeoutPromise = new Promise<never>((_, reject) => {
    timeoutHandle = setTimeout(() => {
      reject(new Error(`Tool execution timeout after ${timeoutMs}ms`));
    }, timeoutMs);
  });

  try {
    return await Promise.race([fn(), timeoutPromise]);
  } finally {
    if (timeoutHandle) {
      clearTimeout(timeoutHandle);
    }
  }
}
