import type { McpServerConfig } from './mcp.js';

/**
 * Model alias for agent definitions
 */
export type AgentModel = 'sonnet' | 'opus' | 'haiku' | 'inherit';

/**
 * Agent definition for subagent delegation
 */
export interface AgentDefinition {
  /** Agent name (identifier) */
  name: string;

  /** System prompt for this agent */
  prompt: string;

  /** Model to use (default: inherit) */
  model?: AgentModel;

  /** Maximum turns for this agent (default: inherit from parent) */
  maxTurns?: number;

  /** Allowed tools for this agent (default: inherit from parent) */
  tools?: string[];

  /** Disallowed tools for this agent */
  disallowedTools?: string[];

  /** MCP servers for this agent (default: inherit from parent) */
  mcpServers?: Record<string, McpServerConfig>;

  /** Description of what this agent does */
  description?: string;

  /** Whether this agent is disabled */
  disabled?: boolean;
}

/**
 * Agent info (metadata)
 */
export interface AgentInfo {
  /** Agent name */
  name: string;

  /** Agent description */
  description?: string;

  /** Model this agent uses */
  model: string;

  /** Number of tools available */
  toolCount: number;

  /** Whether agent is disabled */
  disabled: boolean;
}

/**
 * Agent MCP server specification
 */
export interface AgentMcpServerSpec {
  /** MCP server name */
  name: string;

  /** MCP server configuration */
  config: McpServerConfig;
}
