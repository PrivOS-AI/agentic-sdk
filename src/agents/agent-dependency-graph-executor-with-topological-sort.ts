/**
 * Agent Dependency Graph Executor
 * Executes agents based on DAG dependencies using topological sort
 */

import type { Options } from '../types/options.js';
import type { UUID } from '../types/messages.js';
import type {
  DependencyNode,
  DependencyGraphResult,
  AgentExecutionResult,
} from '../types/orchestration.js';
import { spawnSubagent } from './subagent-execution-engine.js';

/**
 * Execute agents based on dependency graph (DAG)
 *
 * @param nodes - Dependency nodes
 * @param parentOptions - Parent query options
 * @param parentToolUseId - Parent tool use ID
 * @returns Dependency graph execution result
 */
export async function executeAgentGraph(
  nodes: DependencyNode[],
  parentOptions: Options,
  parentToolUseId: UUID
): Promise<DependencyGraphResult> {
  const startTime = Date.now();
  const results = new Map<string, AgentExecutionResult>();
  const failedNodes: string[] = [];

  // Build adjacency list (dependents) and in-degree count
  const inDegree = new Map<string, number>();
  const dependentsList = new Map<string, string[]>(); // node -> list of nodes that depend on it
  const nodeMap = new Map<string, DependencyNode>();

  // Initialize all nodes in the maps
  for (const node of nodes) {
    nodeMap.set(node.id, node);
    inDegree.set(node.id, node.dependsOn.length);
    dependentsList.set(node.id, []);
  }

  // Build dependents list (reverse graph)
  for (const node of nodes) {
    for (const depId of node.dependsOn) {
      const dependents = dependentsList.get(depId) || [];
      dependents.push(node.id);
      dependentsList.set(depId, dependents);
    }
  }

  // Topological sort with Kahn's algorithm
  const executionOrder: string[] = [];
  const queue: string[] = [];

  // Find all nodes with no dependencies
  for (const [nodeId, degree] of inDegree) {
    if (degree === 0) {
      queue.push(nodeId);
    }
  }

  // Early cycle detection: if queue is empty but there are nodes with no way to start
  // (all nodes have dependencies), there's definitely a cycle
  if (queue.length === 0 && nodeMap.size > 0) {
    throw new Error('Circular dependency detected in agent graph');
  }

  // Execute in topological order

  while (queue.length > 0) {
    // Process all nodes in current level in parallel
    const currentLevel = [...queue];
    queue.length = 0; // Clear queue
    executionOrder.push(...currentLevel);

    // Execute all nodes in current level in parallel
    const levelPromises = currentLevel.map(async (nodeId) => {
      const node = nodeMap.get(nodeId)!;

      try {
        // Check for timeout
        if (node.timeout) {
          const controller = new AbortController();
          const timeoutId = setTimeout(() => controller.abort(), node.timeout);

          try {
            const subagentResult = await spawnSubagent(
              node.task,
              typeof node.agent === 'string' ? node.agent : undefined,
              parentOptions,
              parentToolUseId,
              undefined,
              controller.signal
            );

            clearTimeout(timeoutId);

            const result: AgentExecutionResult = {
              agent: nodeId,
              result: subagentResult.result,
              durationMs: Date.now() - startTime,
              numTurns: subagentResult.numTurns,
              totalCostUsd: subagentResult.totalCostUsd || 0,
              success: true,
            };

            results.set(nodeId, result);
            return { nodeId, success: true };
          } catch (error) {
            clearTimeout(timeoutId);
            throw error;
          }
        } else {
          // No timeout
          const subagentResult = await spawnSubagent(
            node.task,
            typeof node.agent === 'string' ? node.agent : undefined,
            parentOptions,
            parentToolUseId
          );

          const result: AgentExecutionResult = {
            agent: nodeId,
            result: subagentResult.result,
            durationMs: Date.now() - startTime,
            numTurns: subagentResult.numTurns,
            totalCostUsd: subagentResult.totalCostUsd || 0,
            success: true,
          };

          results.set(nodeId, result);
          return { nodeId, success: true };
        }
      } catch (error) {
        const result: AgentExecutionResult = {
          agent: nodeId,
          result: '',
          durationMs: Date.now() - startTime,
          numTurns: 0,
          totalCostUsd: 0,
          success: false,
          error: error instanceof Error ? error.message : String(error),
        };

        results.set(nodeId, result);

        // Check if we should continue on error
        if (!node.continueOnError) {
          failedNodes.push(nodeId);
          return { nodeId, success: false };
        }

        // With continueOnError, treat as success for dependency purposes
        failedNodes.push(nodeId);
        return { nodeId, success: true };
      }
    });

    // Wait for all nodes in current level to complete
    const levelResults = await Promise.allSettled(levelPromises);

    // Process dependencies for next level
    for (const settled of levelResults) {
      if (settled.status === 'fulfilled') {
        const { nodeId, success } = settled.value;

        // Only process dependencies if node succeeded
        if (success) {
          // Decrement in-degree for dependent nodes
          const dependents = dependentsList.get(nodeId) || [];
          for (const dependentId of dependents) {
            const currentDegree = inDegree.get(dependentId) || 0;
            inDegree.set(dependentId, currentDegree - 1);

            // If in-degree reaches 0, add to queue
            if (currentDegree - 1 === 0) {
              queue.push(dependentId);
            }
          }
        }
      }
    }

    // Check for cycles (if not all nodes processed)
    if (queue.length === 0 && executionOrder.length < nodeMap.size) {
      throw new Error('Circular dependency detected in agent graph');
    }
  }

  const totalDurationMs = Date.now() - startTime;
  const totalCostUsd = Array.from(results.values()).reduce((sum, r) => sum + r.totalCostUsd, 0);
  const success = failedNodes.length === 0 && results.size === nodeMap.size;

  return {
    results,
    success,
    executionOrder,
    totalDurationMs,
    totalCostUsd,
    failedNodes,
  };
}
