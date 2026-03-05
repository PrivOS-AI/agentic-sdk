/**
 * agentic-sdk - Native TypeScript SDK for Claude agents
 * Drop-in replacement for @anthropic-ai/claude-agent-sdk
 */

import type { UUID } from './types/messages.js';

// Re-export all types except hook type guards to avoid conflicts
export {
  UUID,
  BaseMessage,
  SDKAssistantMessage,
  SDKUserMessage,
  SDKUserMessageReplay,
  SDKResultSuccessMessage,
  SDKResultErrorMessage,
  SDKResultMessage,
  SDKSystemInitMessage,
  SDKSystemMessage,
  SDKPartialAssistantMessage,
  SDKCompactBoundaryMessage,
  SDKStatusMessage,
  SDKHookStartedMessage,
  SDKHookProgressMessage,
  SDKHookResponseMessage,
  SDKToolProgressMessage,
  SDKToolUseSummaryMessage,
  SDKAuthStatusMessage,
  SDKTaskNotificationMessage,
  SDKTaskStartedMessage,
  SDKTaskProgressMessage,
  SDKFilesPersistedEvent,
  SDKRateLimitEvent,
  SDKPermissionDenial,
  SDKPromptSuggestionMessage,
  SDKMessage,
} from './types/index.js';

// Options
export type {
  Options,
  ThinkingConfig,
  EffortLevel,
  SlashCommand,
} from './types/options.js';

// Hooks - types and runtime type guards
export type {
  HookEvent,
  HookCallback,
  HookCallbackMatcher,
  BaseHookInput,
  PreToolUseInput,
  PostToolUseInput,
  PostToolUseFailureInput,
  UserPromptSubmitInput,
  StopInput,
  SessionStartInput,
  SessionEndInput,
  SubagentStartInput,
  SubagentStopInput,
  PreCompactInput,
  PermissionRequestInput,
  NotificationInput,
  SetupInput,
  TeammateIdleInput,
  TaskCompletedInput,
  ConfigChangeInput,
  WorktreeCreateInput,
  WorktreeRemoveInput,
  HookInput,
  HookJSONOutput,
} from './types/hooks.js';

// Hook type guards (runtime functions)
export {
  isPreToolUseInput,
  isPostToolUseInput,
  isPostToolUseFailureInput,
} from './types/hooks.js';

// Permissions
export type {
  PermissionMode,
  PermissionResult,
  PermissionUpdate,
  CanUseTool,
  PermissionDenial,
} from './types/permissions.js';

// MCP types
export type {
  McpStdioServerConfig,
  McpSSEServerConfig,
  McpHttpServerConfig,
  McpSdkServerConfig,
  McpSdkServerConfigWithInstance,
  McpServerConfig,
  SdkMcpToolDefinition,
  McpServerStatus,
  McpResource,
  McpResourceContents,
  McpResourceSubscription,
} from './types/mcp.js';

// MCP runtime function
export { toAnthropicTool } from './types/mcp.js';

// Agents
export type {
  AgentModel,
  AgentDefinition,
  AgentInfo,
  AgentMcpServerSpec,
} from './types/agents.js';

// Sessions
export type {
  SessionPersistence,
  SDKSessionInfo,
  SessionData,
  RewindFilesResult,
  SandboxSettings,
} from './types/sessions.js';

// Orchestration
export type {
  ParallelAgentConfig,
  ParallelExecutionResult,
  AgentExecutionResult,
  SequentialAgentConfig,
  SequentialResult,
  DependencyNode,
  DependencyGraphResult,
} from './types/orchestration.js';

// Re-export hooks
export * from './hooks/index.js';

// Re-export permissions
export * from './permissions/index.js';

// Re-export tools
export * from './tools/index.js';

// Main query function (implemented in Phase 2)
export { query, Query } from './core/query.js';
export type { QueryParams } from './core/query.js';

// Skill loader
export { SkillLoader, createSkillLoader } from './core/skill-loader-for-discovering-and-loading-skills-from-disk.js';
export { SkillInvoker, createSkillInvoker } from './core/skill-invoker-for-detecting-and-executing-slash-commands.js';

// Import type for listSessions
import type { SDKSessionInfo } from './types/index.js';

// Re-export MCP functions from Phase 5
export { tool, createSdkMcpServer } from './tools/mcp/index.js';

/**
 * List all sessions
 * Returns session metadata sorted by last modified time
 */
export async function listSessions(
  options?: { dir?: string; limit?: number }
): Promise<SDKSessionInfo[]> {
  const { listSessionFiles } = await import('./sessions/session-persistence.js');
  const { loadSession } = await import('./sessions/session-persistence.js');

  // List all session files
  const sessionFiles = await listSessionFiles(options?.dir);

  // Load session data for each file
  const sessionsPromises = sessionFiles.map(async (fileInfo) => {
    try {
      const data = await loadSession(fileInfo.sessionId, options?.dir);

      const sessionInfo: SDKSessionInfo = {
        sessionId: data.sessionId,
        summary: data.metadata.summary,
        customTitle: data.metadata.customTitle,
        createdAt: data.createdAt,
        lastModified: data.updatedAt,
        fileSize: fileInfo.fileSize,
        gitBranch: data.metadata.gitBranch,
        messageCount: data.messages.length,
        turnCount: data.usage.turnCount,
        totalCostUsd: data.usage.totalCostUsd,
        model: data.metadata.model,
        cwd: data.metadata.cwd,
        parentSessionId: data.metadata.parentSessionId,
        forkedAt: data.metadata.forkedAt,
        forkDepth: data.metadata.forkDepth,
      };

      return sessionInfo;
    } catch (error) {
      // Skip sessions that can't be loaded
      return null;
    }
  });

  const results = await Promise.all(sessionsPromises);
  const sessions = results.filter((s): s is SDKSessionInfo => s !== null);

  // Sort by last modified (newest first)
  sessions.sort((a, b) => b.lastModified - a.lastModified);

  // Apply limit
  if (options?.limit && options.limit > 0) {
    return sessions.slice(0, options.limit);
  }

  return sessions;
}

/**
 * Fork an existing session
 * Creates a new session with a copy of the parent's conversation history
 *
 * @param parentSessionId - ID of session to fork
 * @param options - Fork options
 * @returns New session ID
 *
 * @example
 * ```typescript
 * import { forkSession } from 'agentic-sdk';
 *
 * const newSessionId = await forkSession('parent-session-id', {
 *   customTitle: 'My experiment branch',
 * });
 * ```
 */
export async function forkSession(
  parentSessionId: string,
  options?: {
    dir?: string;
    customTitle?: string;
  }
): Promise<string> {
  const { SessionManager } = await import('./sessions/session-manager.js');

  const manager = new SessionManager({
    sessionDir: options?.dir,
  });

  // Resume parent session to validate it exists
  await manager.resumeSession(parentSessionId as UUID);

  // Fork the session
  const newSessionId = await manager.forkSession(parentSessionId as UUID, {
    customTitle: options?.customTitle,
  });

  return newSessionId;
}

/**
 * Session fork tree node
 */
export interface SessionForkNode {
  /** Session ID */
  sessionId: UUID;
  /** Session summary */
  summary: string;
  /** Custom title */
  customTitle?: string;
  /** Creation timestamp */
  createdAt: number;
  /** Last modified timestamp */
  lastModified: number;
  /** Child forks */
  children: SessionForkNode[];
}

/**
 * Get fork tree for a session
 * Returns hierarchical view of session and its forks
 *
 * @param rootSessionId - Root session ID to build tree from
 * @param options - Tree options
 * @returns Fork tree or null if session not found
 *
 * @example
 * ```typescript
 * import { getSessionForkTree } from 'agentic-sdk';
 *
 * const tree = await getSessionForkTree('root-session-id');
 * console.log('Root:', tree?.summary);
 * console.log('Forks:', tree?.children.length);
 * ```
 */
export async function getSessionForkTree(
  rootSessionId: string,
  options?: { dir?: string }
): Promise<SessionForkNode | null> {
  const sessions = await listSessions(options);
  const sessionMap = new Map(sessions.map((s) => [s.sessionId, s]));

  function buildTree(sessionId: UUID): SessionForkNode | null {
    const session = sessionMap.get(sessionId);
    if (!session) return null;

    const children = sessions
      .filter((s) => s.parentSessionId === sessionId)
      .map((child) => buildTree(child.sessionId))
      .filter((node): node is SessionForkNode => node !== null);

    return {
      sessionId: session.sessionId,
      summary: session.summary,
      customTitle: session.customTitle,
      createdAt: session.createdAt,
      lastModified: session.lastModified,
      children,
    };
  }

  return buildTree(rootSessionId as UUID);
}

// Agent orchestration functions
/**
 * Execute multiple agents in parallel
 * All agents run simultaneously and results are aggregated
 *
 * @param configs - Array of agent configurations
 * @param parentOptions - Parent query options
 * @param parentToolUseId - Parent tool use ID
 * @returns Parallel execution result
 *
 * @example
 * ```typescript
 * import { executeAgentsInParallel, query } from 'agentic-sdk';
 *
 * const result = await query('Analyze from multiple perspectives');
 * const parallelResult = await executeAgentsInParallel([
 *   { agent: 'researcher', task: 'Find data' },
 *   { agent: 'analyst', task: 'Analyze trends' },
 *   { agent: 'writer', task: 'Summarize findings' }
 * ], result.options, result.parentToolUseId);
 * ```
 */
export async function executeAgentsInParallel(
  configs: import('./types/orchestration.js').ParallelAgentConfig[],
  parentOptions: import('./types/options.js').Options,
  parentToolUseId: import('./types/messages.js').UUID
): Promise<import('./types/orchestration.js').ParallelExecutionResult> {
  const { executeAgentsInParallel: execParallel } = await import('./agents/parallel-agent-executor.js');
  return execParallel(configs, parentOptions, parentToolUseId);
}

/**
 * Execute agents in sequence
 * Each agent receives the previous agent's output
 *
 * @param configs - Array of agent configurations
 * @param parentOptions - Parent query options
 * @param parentToolUseId - Parent tool use ID
 * @returns Sequential execution result
 *
 * @example
 * ```typescript
 * import { executeAgentsSequentially, query } from 'agentic-sdk';
 *
 * const result = await query('Start a multi-stage process');
 * const sequentialResult = await executeAgentsSequentially([
 *   { agent: 'collector', task: 'Gather data' },
 *   { agent: 'analyzer', task: 'Analyze: ${prev.result}' },
 *   { agent: 'writer', task: 'Write report on: ${prev.result}' }
 * ], result.options, result.parentToolUseId);
 * ```
 */
export async function executeAgentsSequentially(
  configs: import('./types/orchestration.js').SequentialAgentConfig[],
  parentOptions: import('./types/options.js').Options,
  parentToolUseId: import('./types/messages.js').UUID
): Promise<import('./types/orchestration.js').SequentialResult> {
  const { executeAgentsSequentially: execSequential } = await import('./agents/sequential-agent-orchestrator.js');
  return execSequential(configs, parentOptions, parentToolUseId);
}

/**
 * Execute agents based on dependency graph (DAG)
 * Executes tasks in dependency order using topological sort
 *
 * @param nodes - Dependency nodes
 * @param parentOptions - Parent query options
 * @param parentToolUseId - Parent tool use ID
 * @returns Dependency graph execution result
 *
 * @example
 * ```typescript
 * import { executeAgentGraph, query } from 'agentic-sdk';
 *
 * const result = await query('Execute complex workflow');
 * const graphResult = await executeAgentGraph([
 *   { id: 'A', agent: 'collector', task: 'Fetch data', dependsOn: [] },
 *   { id: 'B', agent: 'processor', task: 'Process: ${A.result}', dependsOn: ['A'] },
 *   { id: 'C', agent: 'validator', task: 'Validate: ${A.result}', dependsOn: ['A'] },
 *   { id: 'D', agent: 'reporter', task: 'Report: ${B.result} and ${C.result}', dependsOn: ['B', 'C'] }
 * ], result.options, result.parentToolUseId);
 * ```
 */
export async function executeAgentGraph(
  nodes: import('./types/orchestration.js').DependencyNode[],
  parentOptions: import('./types/options.js').Options,
  parentToolUseId: import('./types/messages.js').UUID
): Promise<import('./types/orchestration.js').DependencyGraphResult> {
  const { executeAgentGraph: execGraph } = await import('./agents/agent-dependency-graph-executor-with-topological-sort.js');
  return execGraph(nodes, parentOptions, parentToolUseId);
}
