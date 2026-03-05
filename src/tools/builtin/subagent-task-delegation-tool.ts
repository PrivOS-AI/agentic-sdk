import type { ToolExecutorFunction } from '../tool-registry-manager.js';
import type { Options } from '../../types/options.js';
import type { UUID } from '../../types/messages.js';
import { spawnSubagent, isWithinNestingLimit, incrementNestingDepth, decrementNestingDepth } from '../../agents/subagent-execution-engine.js';

/**
 * Task tool: spawns subagent for task delegation
 *
 * This tool allows Claude to delegate tasks to specialized subagents.
 * Each subagent has its own system prompt, tool set, and optional model override.
 */
export const taskTool: (
  parentOptions: Options,
  parentToolUseId: UUID,
  abortSignal?: AbortSignal
) => ToolExecutorFunction = (
  parentOptions,
  parentToolUseId,
  abortSignal
) => async (input: unknown, _context) => {
  const { prompt, agent } = input as {
    prompt: string;
    agent?: string;
  };

  if (!prompt || typeof prompt !== 'string') {
    return {
      content: 'Error: prompt is required and must be a string',
      isError: true,
    };
  }

  // Check nesting depth to prevent infinite recursion
  if (!isWithinNestingLimit()) {
    return {
      content: `Error: Maximum subagent nesting depth (${5}) exceeded. Cannot spawn additional subagents.`,
      isError: true,
    };
  }

  // Increment nesting depth
  incrementNestingDepth();

  try {
    // Validate agent name if specified
    if (agent) {
      const agentDefinition = parentOptions.agents?.[agent];
      if (!agentDefinition) {
        decrementNestingDepth();
        return {
          content: `Error: Agent "${agent}" not found. Available agents: ${
            Object.keys(parentOptions.agents || {}).join(', ') || 'none'
          }`,
          isError: true,
        };
      }

      if (agentDefinition.disabled) {
        decrementNestingDepth();
        return {
          content: `Error: Agent "${agent}" is disabled`,
          isError: true,
        };
      }
    }

    // Spawn subagent
    const result = await spawnSubagent(
      prompt,
      agent,
      parentOptions,
      parentToolUseId,
      parentOptions.hooks,
      abortSignal
    );

    // Decrement nesting depth
    decrementNestingDepth();

    // Return result as tool output
    if (result.success) {
      return {
        content: result.result,
      };
    } else {
      return {
        content: `Subagent execution failed: ${result.error || result.result}`,
        isError: true,
      };
    }
  } catch (error) {
    // Decrement nesting depth on error
    decrementNestingDepth();

    const errorMessage = error instanceof Error ? error.message : String(error);
    return {
      content: `Error spawning subagent: ${errorMessage}`,
      isError: true,
    };
  }
};

/**
 * Tool definition factory for Task
 * Creates a tool definition with the executor bound to parent context
 */
export function createTaskToolDefinition(
  parentOptions: Options,
  parentToolUseId: UUID,
  abortSignal?: AbortSignal
) {
  return {
    name: 'task',
    description: 'Spawns a subagent to handle a task. Use this to delegate work to specialized agents with their own system prompts and tool sets.',
    inputSchema: {
      type: 'object',
      properties: {
        prompt: {
          type: 'string',
          description: 'The prompt/task to delegate to the subagent',
        },
        agent: {
          type: 'string',
          description: 'Optional agent name to spawn (e.g., "code-reviewer", "researcher"). If not specified, uses default subagent configuration.',
        },
      },
      required: ['prompt'],
    },
    execute: taskTool(parentOptions, parentToolUseId, abortSignal),
  };
}
