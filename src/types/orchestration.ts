/**
 * Agent orchestration type definitions
 * Types for parallel, sequential, and DAG-based agent execution
 */

import type { AgentDefinition } from './agents.js';

/**
 * Parallel agent execution configuration
 */
export interface ParallelAgentConfig {
  /** Agent name or definition */
  agent: string | AgentDefinition;

  /** Task prompt for this agent */
  task: string;

  /** Optional timeout in milliseconds */
  timeout?: number;

  /** Continue on error (default: false) */
  continueOnError?: boolean;
}

/**
 * Result from single agent execution
 */
export interface AgentExecutionResult {
  /** Agent name */
  agent: string;

  /** Task result text */
  result: string;

  /** Execution time in milliseconds */
  durationMs: number;

  /** Number of turns executed */
  numTurns: number;

  /** Total cost in USD */
  totalCostUsd: number;

  /** Success flag */
  success: boolean;

  /** Error if failed */
  error?: string;
}

/**
 * Result from parallel execution
 */
export interface ParallelExecutionResult {
  /** Results from all agents */
  results: AgentExecutionResult[];

  /** Overall success (all agents succeeded) */
  success: boolean;

  /** Total execution time */
  totalDurationMs: number;

  /** Total cost across all agents */
  totalCostUsd: number;

  /** Number of failed agents */
  failedCount: number;
}

/**
 * Sequential agent orchestration configuration
 */
export interface SequentialAgentConfig {
  /** Agent name or definition */
  agent: string | AgentDefinition;

  /** Task prompt (can reference previous results with ${prev.result}) */
  task: string;

  /** Optional timeout */
  timeout?: number;

  /** Continue on error (default: false) */
  continueOnError?: boolean;

  /** Conditional execution based on previous result */
  condition?: (prevResult: AgentExecutionResult) => boolean;
}

/**
 * Sequential orchestration result
 */
export interface SequentialResult {
  /** Results from each agent in sequence */
  steps: AgentExecutionResult[];

  /** Overall success */
  success: boolean;

  /** Total execution time */
  totalDurationMs: number;

  /** Total cost */
  totalCostUsd: number;

  /** Index of step that failed (if any) */
  failedAt?: number;
}

/**
 * Agent dependency node
 */
export interface DependencyNode {
  /** Node identifier */
  id: string;

  /** Agent configuration */
  agent: string | AgentDefinition;

  /** Task prompt */
  task: string;

  /** Dependencies (node IDs that must complete first) */
  dependsOn: string[];

  /** Timeout */
  timeout?: number;

  /** Continue on error */
  continueOnError?: boolean;
}

/**
 * Dependency graph execution result
 */
export interface DependencyGraphResult {
  /** Results from all nodes */
  results: Map<string, AgentExecutionResult>;

  /** Overall success */
  success: boolean;

  /** Execution order (node IDs) */
  executionOrder: string[];

  /** Total duration */
  totalDurationMs: number;

  /** Total cost */
  totalCostUsd: number;

  /** Failed nodes */
  failedNodes: string[];
}
