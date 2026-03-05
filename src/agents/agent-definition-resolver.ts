import type { AgentDefinition, AgentModel } from '../types/agents.js';
import type { Options } from '../types/options.js';
import { v4 as uuidv4 } from 'uuid';

/**
 * Default model IDs for model aliases
 */
const DEFAULT_MODEL_IDS = {
  sonnet: 'claude-sonnet-4-6',
  opus: 'claude-opus-4-6',
  haiku: 'claude-haiku-4-5-20251001',
} as const;

/**
 * Resolve agent definition by name from options.agents
 *
 * @param agentName - Name of the agent to resolve
 * @param agents - Record of agent definitions from options
 * @returns Agent definition or undefined if not found
 */
export function resolveAgentDefinition(
  agentName: string,
  agents?: Record<string, AgentDefinition>
): AgentDefinition | undefined {
  if (!agents) {
    return undefined;
  }

  // Direct lookup by name
  const agent = agents[agentName];
  if (agent) {
    // Check if agent is disabled
    if (agent.disabled) {
      return undefined;
    }
    return agent;
  }

  return undefined;
}

/**
 * Resolve model alias to full model ID
 *
 * Priority:
 * 1. Environment variable (ANTHROPIC_DEFAULT_{MODEL}_MODEL)
 * 2. Default model ID constant
 * 3. Parent model (if "inherit")
 *
 * @param modelAlias - Model alias to resolve
 * @param parentModel - Parent agent's model (for "inherit")
 * @returns Full model ID
 */
export function resolveModel(
  modelAlias?: AgentModel,
  parentModel?: string
): string {
  // If no alias specified, inherit from parent
  if (!modelAlias || modelAlias === 'inherit') {
    return parentModel || DEFAULT_MODEL_IDS.opus;
  }

  // Check environment variable first
  const envVarName = `ANTHROPIC_DEFAULT_${modelAlias.toUpperCase()}_MODEL`;
  const envModel = process.env[envVarName];
  if (envModel) {
    return envModel;
  }

  // Fall back to default model ID
  return DEFAULT_MODEL_IDS[modelAlias] || parentModel || DEFAULT_MODEL_IDS.opus;
}

/**
 * Build agent options by merging agent definition with parent options
 *
 * Override properties:
 * - systemPrompt (from agent.prompt)
 * - allowedTools (from agent.tools)
 * - disallowedTools (from agent.disallowedTools)
 * - model (from agent.model, resolved)
 * - maxTurns (from agent.maxTurns)
 *
 * Inherit properties:
 * - hooks
 * - permissionMode
 * - canUseTool
 * - env
 * - cwd
 * - mcpServers (merge with agent.mcpServers)
 *
 * @param definition - Agent definition
 * @param parentOptions - Parent query options
 * @param taskPrompt - Task prompt for the subagent
 * @returns Merged options for subagent
 */
export function buildAgentOptions(
  definition: AgentDefinition,
  parentOptions: Options,
  _taskPrompt: string
): Options {
  // Resolve model
  const parentModel = parentOptions.model || DEFAULT_MODEL_IDS.opus;
  const model = resolveModel(definition.model, parentModel);

  // Start with parent options as base
  const agentOptions: Options = {
    ...parentOptions,

    // Override with agent-specific settings
    systemPrompt: definition.prompt || parentOptions.systemPrompt,
    model,

    // Tool restrictions
    allowedTools: definition.tools,
    disallowedTools: definition.disallowedTools,

    // Max turns
    maxTurns: definition.maxTurns || parentOptions.maxTurns || 50,

    // Generate new session ID for subagent
    sessionId: uuidv4(),

    // Inherit parent's permission settings
    permissionMode: parentOptions.permissionMode,
    canUseTool: parentOptions.canUseTool,

    // Inherit environment and working directory
    env: parentOptions.env,
    cwd: parentOptions.cwd,

    // Merge MCP servers (agent servers override parent servers)
    mcpServers: {
      ...parentOptions.mcpServers,
      ...definition.mcpServers,
    },

    // Inherit hooks
    hooks: parentOptions.hooks,
  };

  // Remove abortController to create new one for subagent
  delete agentOptions.abortController;

  return agentOptions;
}

/**
 * Get list of available agent names from options
 *
 * @param agents - Record of agent definitions
 * @returns Array of available (non-disabled) agent names
 */
export function getAvailableAgentNames(
  agents?: Record<string, AgentDefinition>
): string[] {
  if (!agents) {
    return [];
  }

  return Object.entries(agents)
    .filter(([_, definition]) => !definition.disabled)
    .map(([name, _]) => name);
}
