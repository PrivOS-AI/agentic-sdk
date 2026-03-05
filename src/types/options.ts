import type {
  HookCallbackMatcher,
  HookEvent,
} from './hooks.js';
import type {
  AgentDefinition,
} from './agents.js';
import type {
  McpServerConfig,
} from './mcp.js';
import type {
  CanUseTool,
  PermissionMode,
} from './permissions.js';
import type {
  SandboxSettings,
  SessionPersistence,
} from './sessions.js';
import type {
  RetryOptions,
} from './retry.js';

/**
 * Thinking configuration for extended thinking
 */
export type ThinkingConfig =
  | { type: 'disabled' }
  | { type: 'enabled'; budgetTokens?: number }
  | { type: 'adaptive' };

/**
 * Effort level for model response
 */
export type EffortLevel = 'low' | 'medium' | 'high' | 'max';

/**
 * MCP elicitation request for tool approval
 */
export interface ElicitationRequest {
  /** Tool name requiring approval */
  toolName: string;
  /** Tool description */
  description?: string;
  /** Server name if MCP tool */
  serverName?: string;
  /** Request timestamp */
  timestamp: number;
}

/**
 * MCP elicitation result
 */
export interface ElicitationResult {
  /** Whether the tool was approved */
  approved: boolean;
  /** Optional message or reason */
  message?: string;
}

/**
 * Main options interface for query()
 * Matches @anthropic-ai/claude-agent-sdk public API
 */
export interface Options {
  /** AbortController for interrupting the query */
  abortController?: AbortController;

  /** List of allowed tool names (supports glob patterns like "mcp__github__*") */
  allowedTools?: string[];

  /** List of disallowed tool names */
  disallowedTools?: string[];

  /** Callback for permission evaluation per tool */
  canUseTool?: CanUseTool;

  /** Model to use (default: from env or claude-opus-4-6) */
  model?: string;

  /** Fallback model if primary fails */
  fallbackModel?: string;

  /** Maximum budget in USD (default: infinity) */
  maxBudgetUsd?: number;

  /** Maximum number of turns (default: 50) */
  maxTurns?: number;

  /** Extended thinking configuration */
  thinking?: ThinkingConfig;

  /** Effort level (maps to thinking config) */
  effort?: EffortLevel;

  /** MCP server configurations */
  mcpServers?: Record<string, McpServerConfig>;

  /** Hook callbacks for lifecycle events */
  hooks?: Partial<Record<HookEvent, HookCallbackMatcher[]>>;

  /** Agent definitions for subagent delegation */
  agents?: Record<string, AgentDefinition>;

  /** System prompt (string or preset name) */
  systemPrompt?: string;

  /** Resume from existing session ID */
  resume?: string;

  /** Session ID for this query */
  sessionId?: string;

  /** Fork from existing session */
  forkSession?: string;

  /** Session persistence configuration */
  persistSession?: SessionPersistence;

  /** Output format for structured output */
  outputFormat?: {
    type: 'json';
    schema: Record<string, unknown>;
  };

  /** Include partial messages during streaming */
  includePartialMessages?: boolean;

  /** Sandbox settings (not used in native SDK, kept for compatibility) */
  sandbox?: SandboxSettings;

  /** Environment variables (overrides process.env) */
  env?: Record<string, string>;

  /** Working directory for file operations */
  cwd?: string;

  /** Enable file checkpointing for rewindFiles() */
  enableFileCheckpointing?: boolean;

  /** Permission mode */
  permissionMode?: PermissionMode;

  /** Silence mode - suppress output messages */
  silence?: boolean;

  /** Skills to preload (skill names without leading slash) */
  skills?: string[];

  // ========== MISSING OPTIONS - 19 Total ==========

  /** Additional directories to allow file access beyond cwd */
  // TODO: Implement directory access control logic
  additionalDirectories?: string[];

  /** Main thread agent to use for query processing */
  // TODO: Implement main thread agent selection
  agent?: string;

  /** Continue previous session automatically */
  // TODO: Implement automatic session continuation
  continue?: boolean;

  /** Resume session at specific message ID (selective resume) */
  // TODO: Implement selective resume at message
  resumeSessionAt?: string;

  /** Built-in tools filter (array or preset) */
  // TODO: Implement tool filtering by preset
  tools?: string[] | { type: 'preset'; preset: 'claude_code' };

  /** Runtime executable path (e.g., custom Node.js version) */
  // TODO: Implement custom runtime selection
  executable?: string;

  /** Arguments to pass to the runtime executable */
  // TODO: Implement runtime argument passing
  executableArgs?: string[];

  /** Extra CLI arguments for Claude Code */
  // TODO: Implement extra CLI argument forwarding
  extraArgs?: string[];

  /** Spawn Claude Code as separate process instead of in-process */
  // TODO: Implement process spawning mode
  spawnClaudeCodeProcess?: boolean;

  /** Enable beta features (experimental) */
  // TODO: Implement beta feature flags
  betas?: string[];

  /** Plugins to load (experimental plugin system) */
  // TODO: Implement plugin loading system
  plugins?: string[];

  /** Enable debug mode with verbose logging */
  // TODO: Implement debug logging
  debug?: boolean;

  /** Write debug output to file */
  // TODO: Implement debug file logging
  debugFile?: string;

  /** Handle stderr output line by line */
  // TODO: Implement stderr stream handling
  stderr?: (line: string) => void;

  /** Handle MCP elicitation requests (tool approval prompts) */
  // TODO: Implement MCP elicitation callback
  onElicitation?: (elicitation: ElicitationRequest) => Promise<ElicitationResult>;

  /** Use strict MCP configuration validation */
  // TODO: Implement strict MCP config validation
  strictMcpConfig?: boolean;

  /** Setting sources to load configuration from */
  // TODO: Implement setting source prioritization
  settingSources?: ('user' | 'project' | 'local')[];

  /** Skip permission prompts (dangerous - use with caution) */
  // TODO: Implement permission bypass logic
  allowDangerouslySkipPermissions?: boolean;

  /** Custom tool name to use in permission prompts */
  // TODO: Implement custom permission prompt tool name
  permissionPromptToolName?: string;

  /** Enable prompt suggestions in UI */
  // TODO: Implement prompt suggestions feature
  promptSuggestions?: boolean;

  /** Retry configuration for error recovery */
  retryOptions?: RetryOptions;
}

/**
 * Information about an available skill (invoked via /command syntax)
 */
export interface SlashCommand {
  /** Skill name (without the leading slash) */
  name: string;
  /** Description of what the skill does */
  description: string;
  /** Hint for skill arguments (e.g., "<file>") */
  argumentHint: string;
}

/**
 * Skill metadata parsed from SKILL.md frontmatter
 */
export interface SkillMetadata {
  /** Skill name in hyphen-case */
  name: string;
  /** Description of what the skill does */
  description: string;
  /** License applied to the skill */
  license?: string;
  /** Pre-approved tools for this skill */
  allowedTools?: string[];
  /** Additional metadata properties */
  metadata?: Record<string, string>;
}
