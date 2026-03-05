/**
 * Agents module - subagent delegation system
 *
 * This module provides functionality for spawning and managing subagents
 * with isolated configurations, tool sets, and model overrides.
 */

export {
  resolveAgentDefinition,
  resolveModel,
  buildAgentOptions,
  getAvailableAgentNames,
} from './agent-definition-resolver.js';

export {
  spawnSubagent,
  getNestingDepth,
  incrementNestingDepth,
  decrementNestingDepth,
  resetNestingDepth,
  isWithinNestingLimit,
  MAX_SUBAGENT_DEPTH,
  type SubagentResult,
} from './subagent-execution-engine.js';
