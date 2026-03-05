/**
 * Sequential Agent Orchestrator
 * Executes agents in sequence, passing output from one to the next
 */

import type { Options } from '../types/options.js';
import type { UUID } from '../types/messages.js';
import type {
  SequentialAgentConfig,
  SequentialResult,
  AgentExecutionResult,
} from '../types/orchestration.js';
import { spawnSubagent } from './subagent-execution-engine.js';

/**
 * Execute agents in sequence
 *
 * @param configs - Array of agent configurations
 * @param parentOptions - Parent query options
 * @param parentToolUseId - Parent tool use ID
 * @returns Sequential execution result
 */
export async function executeAgentsSequentially(
  configs: SequentialAgentConfig[],
  parentOptions: Options,
  parentToolUseId: UUID
): Promise<SequentialResult> {
  const startTime = Date.now();
  const steps: AgentExecutionResult[] = [];
  let failedAt: number | undefined;

  for (let i = 0; i < configs.length; i++) {
    const config = configs[i];

    // Check conditional execution if defined
    if (config.condition && i > 0) {
      const prevResult = steps[i - 1];
      if (!config.condition(prevResult)) {
        // Skip this step
        continue;
      }
    }

    // Interpolate task with previous result
    let task = config.task;
    if (i > 0 && steps.length > 0) {
      const prevResult = steps[i - 1];
      task = interpolateTask(task, prevResult);
    }

    try {
      const subagentResult = await spawnSubagent(
        task,
        typeof config.agent === 'string' ? config.agent : undefined,
        parentOptions,
        parentToolUseId
      );

      const stepResult: AgentExecutionResult = {
        agent: typeof config.agent === 'string' ? config.agent : 'custom',
        result: subagentResult.result,
        durationMs: Date.now() - startTime,
        numTurns: subagentResult.numTurns,
        totalCostUsd: subagentResult.totalCostUsd || 0,
        success: true,
      };

      steps.push(stepResult);
    } catch (error) {
      const stepResult: AgentExecutionResult = {
        agent: typeof config.agent === 'string' ? config.agent : 'custom',
        result: '',
        durationMs: Date.now() - startTime,
        numTurns: 0,
        totalCostUsd: 0,
        success: false,
        error: error instanceof Error ? error.message : String(error),
      };

      steps.push(stepResult);

      // Check if we should continue on error
      if (!config.continueOnError) {
        failedAt = i;
        break;
      }
    }
  }

  const totalDurationMs = Date.now() - startTime;
  const finalCostUsd = steps.reduce((sum, s) => sum + s.totalCostUsd, 0);
  const success = failedAt === undefined && steps.some(s => s.success);

  return {
    steps,
    success,
    totalDurationMs,
    totalCostUsd: finalCostUsd,
    failedAt,
  };
}

/**
 * Interpolate task template with previous result
 * Supports ${prev.result}, ${prev.agent}, ${prev.error}
 *
 * @param task - Task template
 * @param prevResult - Previous agent result
 * @returns Interpolated task string
 */
function interpolateTask(task: string, prevResult: AgentExecutionResult): string {
  return task
    .replace(/\$\{prev\.result\}/g, prevResult.result)
    .replace(/\$\{prev\.agent\}/g, prevResult.agent)
    .replace(/\$\{prev\.error\}/g, prevResult.error || 'no error');
}
