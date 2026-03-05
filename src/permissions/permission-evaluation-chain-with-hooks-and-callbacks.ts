import type {
  PermissionMode,
  PermissionResult,
  CanUseTool,
} from '../types/permissions.js';
import type {
  PreToolUseInput,
} from '../types/hooks.js';
import {
  evaluatePermissionMode,
} from './permission-mode-evaluation-for-all-five-modes.js';
import {
  HookExecutor,
} from '../hooks/hook-execution-pipeline-with-timeout-and-regex-matching.js';

/**
 * Permission evaluation context
 */
export interface PermissionEvaluationContext {
  /** Hook executor instance */
  hooks?: HookExecutor;
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
}

/**
 * Evaluate permission for tool use
 * Implements the full permission chain:
 * 1. Check allowedTools/disallowedTools (hard filter)
 * 2. Run PreToolUse hooks
 * 3. If hook decided: return that decision
 * 4. Evaluate permission mode
 * 5. If mode says "ask" and canUseTool provided: call it
 * 6. If mode says "ask" and no callback: default deny
 *
 * @param toolName - Tool name
 * @param toolInput - Tool input parameters
 * @param toolUseId - Tool use ID
 * @param context - Permission evaluation context
 * @returns Permission result
 */
export async function evaluatePermission(
  toolName: string,
  toolInput: Record<string, unknown>,
  toolUseId: string,
  context: PermissionEvaluationContext
): Promise<PermissionResult> {
  const {
    hooks,
    permissionMode = 'default',
    canUseTool,
    allowedTools,
    disallowedTools,
    abortSignal,
  } = context;

  // Step 1: Check disallowedTools first (hard deny)
  if (disallowedTools && disallowedTools.length > 0) {
    if (matchesToolList(toolName, disallowedTools)) {
      return {
        allow: false,
        reason: `Tool "${toolName}" is in disallowed tools list`,
      };
    }
  }

  // Track if tool is in allowedTools, but don't return early
  // Let hooks run first, they can override the decision
  const isInAllowedList = allowedTools && allowedTools.length > 0 && matchesToolList(toolName, allowedTools);
  const hasAllowedList = allowedTools && allowedTools.length > 0;

  // Step 2: Check allowedTools (hard allow) - but only if no hooks
  if (!hooks || !hooks.hasHooks('PreToolUse')) {
    if (hasAllowedList) {
      if (isInAllowedList) {
        return { allow: true };
      }
      // If allowedTools is specified, deny everything else
      return {
        allow: false,
        reason: `Tool "${toolName}" is not in allowed tools list`,
      };
    }
  }

  // Step 3: Run PreToolUse hooks
  let hookOverrideDecision: 'allow' | 'deny' | 'ask' | null = null;
  if (hooks && hooks.hasHooks('PreToolUse')) {
    const hookInput: PreToolUseInput = {
      type: 'PreToolUse',
      toolName,
      toolInput,
      toolUseId: toolUseId as any, // Cast to UUID type
    };

    try {
      const hookResults = await hooks.execute('PreToolUse', hookInput, toolName, abortSignal);

      // Check for permission decisions from hooks
      for (const result of hookResults) {
        // If hook provided updatedInput, use it
        if (result.updatedInput) {
          toolInput = result.updatedInput;
        }

        if (result.permissionDecision) {
          switch (result.permissionDecision) {
            case 'deny':
              return {
                allow: false,
                reason: `Denied by PreToolUse hook`,
                updatedInput: toolInput,
              };
            case 'allow':
              return {
                allow: true,
                updatedInput: toolInput,
              };
            case 'ask':
              // Continue to next evaluation step, but keep the updated input
              hookOverrideDecision = 'ask';
              break;
          }
        }
      }
    } catch (error) {
      console.error('[PermissionEvaluator] Hook execution failed:', error);
      // Continue with default permission evaluation
    }
  }

  // Step 4: If hooks didn't make a decision, check allowedTools
  if (hookOverrideDecision !== 'ask' && hasAllowedList) {
    if (isInAllowedList) {
      return { allow: true, updatedInput: toolInput };
    }
    // If allowedTools is specified, deny everything else
    return {
      allow: false,
      reason: `Tool "${toolName}" is not in allowed tools list`,
      updatedInput: toolInput,
    };
  }

  // Step 3: Run PreToolUse hooks
  if (hooks && hooks.hasHooks('PreToolUse')) {
    const hookInput: PreToolUseInput = {
      type: 'PreToolUse',
      toolName,
      toolInput,
      toolUseId: toolUseId as any, // Cast to UUID type
    };

    try {
      const hookResults = await hooks.execute('PreToolUse', hookInput, toolName, abortSignal);

      // Check for permission decisions from hooks
      for (const result of hookResults) {
        // If hook provided updatedInput, use it
        if (result.updatedInput) {
          toolInput = result.updatedInput;
        }

        if (result.permissionDecision) {
          switch (result.permissionDecision) {
            case 'deny':
              return {
                allow: false,
                reason: `Denied by PreToolUse hook`,
                updatedInput: toolInput,
              };
            case 'allow':
              return {
                allow: true,
                updatedInput: toolInput,
              };
            case 'ask':
              // Continue to next evaluation step, but keep the updated input
              break;
          }
        }
      }
    } catch (error) {
      console.error('[PermissionEvaluator] Hook execution failed:', error);
      // Continue with default permission evaluation
    }
  }

  // Step 5: Evaluate permission mode
  const modeDecision = evaluatePermissionMode(permissionMode, toolName);

  // Step 6: Handle mode decision
  switch (modeDecision) {
    case 'allow':
      return { allow: true, updatedInput: toolInput };

    case 'deny':
      return {
        allow: false,
        reason: `Denied by permission mode: ${permissionMode}`,
      };

    case 'ask':
      // Step 7: Call canUseTool callback if provided
      if (canUseTool) {
        try {
          const callbackResult = await canUseTool(toolName, toolInput);
          return {
            ...callbackResult,
            updatedInput: callbackResult.updatedInput || toolInput,
          };
        } catch (error) {
          console.error('[PermissionEvaluator] canUseTool callback failed:', error);
          return {
            allow: false,
            reason: `Permission check failed: ${error instanceof Error ? error.message : String(error)}`,
          };
        }
      }

      // No callback provided - default deny
      return {
        allow: false,
        reason: `Tool "${toolName}" requires permission but no callback provided`,
      };
  }
}

/**
 * Check if tool name matches any pattern in the list
 * Supports exact matches and glob patterns (*)
 */
function matchesToolList(toolName: string, toolList: string[]): boolean {
  const normalizedTool = toolName.toLowerCase();

  for (const pattern of toolList) {
    const normalizedPattern = pattern.toLowerCase();

    // Exact match
    if (normalizedPattern === normalizedTool) {
      return true;
    }

    // Glob pattern match (simple * wildcard)
    if (normalizedPattern.includes('*')) {
      const regexPattern = normalizedPattern
        .split('*')
        .map(part => part.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')) // Escape regex chars
        .join('.*');
      const regex = new RegExp(`^${regexPattern}$`, 'i');
      if (regex.test(normalizedTool)) {
        return true;
      }
    }
  }

  return false;
}

/**
 * Create permission denial message for SDK
 */
export function createPermissionDenialMessage(
  toolName: string,
  toolUseId: string,
  reason: string,
  permissionMode?: PermissionMode
): string {
  return JSON.stringify({
    type: 'permission_denial',
    tool_name: toolName,
    tool_use_id: toolUseId,
    reason,
    permission_mode: permissionMode,
  });
}
