/**
 * Parallel Agent Executor
 * Executes multiple agents simultaneously and aggregates results
 */

import type { Options } from '../types/options.js';
import type { UUID } from '../types/messages.js';
import type {
  ParallelAgentConfig,
  ParallelExecutionResult,
  AgentExecutionResult,
} from '../types/orchestration.js';
import { spawnSubagent } from './subagent-execution-engine.js';

/**
 * Execute multiple agents in parallel
 *
 * @param configs - Array of agent configurations
 * @param parentOptions - Parent query options
 * @param parentToolUseId - Parent tool use ID
 * @returns Parallel execution result
 */
export async function executeAgentsInParallel(
  configs: ParallelAgentConfig[],
  parentOptions: Options,
  parentToolUseId: UUID
): Promise<ParallelExecutionResult> {
  const startTime = Date.now();
  const results: AgentExecutionResult[] = [];
  let failedCount = 0;

  // Execute all agents in parallel
  const promises = configs.map(async (config) => {
    try {
      // Check for timeout
      if (config.timeout) {
        // Create abort signal with timeout
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), config.timeout);

        try {
          const subagentResult = await spawnSubagent(
            config.task,
            typeof config.agent === 'string' ? config.agent : undefined,
            parentOptions,
            parentToolUseId,
            undefined, // hooks
            controller.signal
          );

          clearTimeout(timeoutId);

          return {
            agent: typeof config.agent === 'string' ? config.agent : 'custom',
            result: subagentResult.result,
            durationMs: Date.now() - startTime,
            numTurns: subagentResult.numTurns,
            totalCostUsd: subagentResult.totalCostUsd || 0,
            success: true,
          };
        } catch (error) {
          clearTimeout(timeoutId);
          throw error;
        }
      } else {
        // No timeout
        const subagentResult = await spawnSubagent(
          config.task,
          typeof config.agent === 'string' ? config.agent : undefined,
          parentOptions,
          parentToolUseId
        );

        return {
          agent: typeof config.agent === 'string' ? config.agent : 'custom',
          result: subagentResult.result,
          durationMs: Date.now() - startTime,
          numTurns: subagentResult.numTurns,
          totalCostUsd: subagentResult.totalCostUsd || 0,
          success: true,
        };
      }
    } catch (error) {
      // Handle error based on continueOnError flag
      if (!config.continueOnError) {
        throw error;
      }

      // Return error result but don't fail entire operation
      return {
        agent: typeof config.agent === 'string' ? config.agent : 'custom',
        result: '',
        durationMs: Date.now() - startTime,
        numTurns: 0,
        totalCostUsd: 0,
        success: false,
        error: error instanceof Error ? error.message : String(error),
      };
    }
  });

  // Wait for all agents to complete
  const settledResults = await Promise.allSettled(promises);

  // Process results
  for (const settled of settledResults) {
    if (settled.status === 'fulfilled') {
      results.push(settled.value);
      if (!settled.value.success) {
        failedCount++;
      }
    } else {
      // A promise was rejected (continueOnError was false)
      // Re-throw the first rejection
      throw settled.reason;
    }
  }

  const totalDurationMs = Date.now() - startTime;
  const totalCostUsd = results.reduce((sum, r) => sum + r.totalCostUsd, 0);
  const success = failedCount === 0 && results.length > 0;

  return {
    results,
    success,
    totalDurationMs,
    totalCostUsd,
    failedCount,
  };
}
