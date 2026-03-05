import type { AgentDefinition } from '../types/agents.js';
import type { Options } from '../types/options.js';
import type { UUID } from '../types/messages.js';
import { query } from '../core/query.js';
import { resolveAgentDefinition, buildAgentOptions } from './agent-definition-resolver.js';
import { HookExecutor } from '../hooks/hook-execution-pipeline-with-timeout-and-regex-matching.js';
import { buildSubagentStartInput, buildSubagentStopInput } from '../hooks/hook-event-registry-and-type-guards.js';

/**
 * Subagent spawn result
 */
export interface SubagentResult {
  /** Result text from subagent */
  result: string;
  /** Duration in milliseconds */
  durationMs: number;
  /** Number of turns executed */
  numTurns: number;
  /** Total cost in USD */
  totalCostUsd: number;
  /** Whether subagent completed successfully */
  success: boolean;
  /** Error if subagent failed */
  error?: string;
}

/**
 * Spawn a subagent via recursive query() call
 *
 * Process:
 * 1. Resolve agent definition by name
 * 2. Fire SubagentStart hook
 * 3. Build subagent options from agent definition
 * 4. Call query() recursively
 * 5. Tag all messages with parent_tool_use_id
 * 6. Fire SubagentStop hook
 * 7. Return final result text
 *
 * @param taskPrompt - Task prompt for the subagent
 * @param agentName - Name of agent to spawn (optional, uses default if not specified)
 * @param parentOptions - Parent query options
 * @param parentToolUseId - Tool use ID from parent agent
 * @param hooks - Hook callbacks from parent
 * @param abortSignal - Abort signal for cancellation
 * @returns Subagent execution result
 */
export async function spawnSubagent(
  taskPrompt: string,
  agentName: string | undefined,
  parentOptions: Options,
  parentToolUseId: UUID,
  hooks?: Options['hooks'],
  abortSignal?: AbortSignal
): Promise<SubagentResult> {
  const startTime = Date.now();
  const hookExecutor = new HookExecutor(hooks);

  try {
    // Step 1: Resolve agent definition
    let agentDefinition: AgentDefinition | undefined;
    if (agentName) {
      agentDefinition = resolveAgentDefinition(agentName, parentOptions.agents);
      if (!agentDefinition) {
        throw new Error(`Agent not found or disabled: ${agentName}`);
      }
    }

    // Step 2: Fire SubagentStart hook
    if (hookExecutor.hasHooks('SubagentStart')) {
      const subagentStartInput = buildSubagentStartInput(
        agentName || 'default',
        taskPrompt,
        parentToolUseId
      );
      await hookExecutor.execute('SubagentStart', subagentStartInput, undefined, abortSignal);
    }

    // Step 3: Build subagent options
    let subagentOptions: Options;
    if (agentDefinition) {
      subagentOptions = buildAgentOptions(agentDefinition, parentOptions, taskPrompt);
    } else {
      // No agent specified - create default subagent with parent config
      subagentOptions = {
        ...parentOptions,
        sessionId: undefined, // Will generate new session ID
        abortController: undefined, // Will create new abort controller
      };
      delete subagentOptions.abortController;
    }

    // Step 4: Call query() recursively
    const subagentQuery = query({ prompt: taskPrompt, options: subagentOptions });

    // Collect all messages and extract final result
    let finalResult = '';
    let numTurns = 0;
    let totalCostUsd = 0;
    let success = false;
    let error: string | undefined;

    for await (const message of subagentQuery) {
      // Tag all messages with parent_tool_use_id
      if (message.session_id) {
        (message as any).parent_tool_use_id = parentToolUseId;
      }

      // Extract result information
      if (message.type === 'result') {
        if (message.subtype === 'success') {
          finalResult = message.result || 'Task completed';
          success = true;
          numTurns = message.num_turns;
          totalCostUsd = message.total_cost_usd;
        } else {
          finalResult = message.error?.message || 'Subagent execution failed';
          success = false;
          error = finalResult;
          numTurns = message.num_turns;
          totalCostUsd = message.total_cost_usd;
        }
      }

      // Note: In a full implementation, we would yield these messages
      // to the parent generator for streaming. For now, we collect them.
    }

    const durationMs = Date.now() - startTime;

    // Step 6: Fire SubagentStop hook
    if (hookExecutor.hasHooks('SubagentStop')) {
      const subagentStopInput = buildSubagentStopInput(
        agentName || 'default',
        parentToolUseId,
        finalResult,
        durationMs
      );
      await hookExecutor.execute('SubagentStop', subagentStopInput, undefined, abortSignal);
    }

    // Step 7: Return result
    return {
      result: finalResult,
      durationMs,
      numTurns,
      totalCostUsd,
      success,
      error,
    };
  } catch (error) {
    const durationMs = Date.now() - startTime;
    const errorMessage = error instanceof Error ? error.message : String(error);

    // Fire SubagentStop hook even on error
    if (hookExecutor.hasHooks('SubagentStop')) {
      const subagentStopInput = buildSubagentStopInput(
        agentName || 'default',
        parentToolUseId,
        errorMessage,
        durationMs
      );
      await hookExecutor.execute('SubagentStop', subagentStopInput, undefined, abortSignal);
    }

    return {
      result: errorMessage,
      durationMs,
      numTurns: 0,
      totalCostUsd: 0,
      success: false,
      error: errorMessage,
    };
  }
}

/**
 * Maximum nesting depth for subagents (prevents infinite recursion)
 */
export const MAX_SUBAGENT_DEPTH = 5;

/**
 * Track current nesting depth (module-level state)
 * In a production system, this would be part of a context object
 */
let currentNestingDepth = 0;

/**
 * Get current nesting depth
 */
export function getNestingDepth(): number {
  return currentNestingDepth;
}

/**
 * Increment nesting depth
 */
export function incrementNestingDepth(): number {
  return ++currentNestingDepth;
}

/**
 * Decrement nesting depth
 */
export function decrementNestingDepth(): number {
  return --currentNestingDepth;
}

/**
 * Reset nesting depth (for testing)
 */
export function resetNestingDepth(): void {
  currentNestingDepth = 0;
}

/**
 * Check if nesting depth is within limits
 */
export function isWithinNestingLimit(): boolean {
  return currentNestingDepth < MAX_SUBAGENT_DEPTH;
}
