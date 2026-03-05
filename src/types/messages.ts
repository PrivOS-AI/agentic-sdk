import type { AgentInfo } from './agents.js';
import type { McpServerStatus } from './mcp.js';

/**
 * Message type from Anthropic SDK
 * Using any to avoid complex type mismatches with SDK internals
 * The actual SDK will validate at runtime
 */
export type AnthropicMessage = any;

/**
 * UUID branded type for message IDs
 */
export type UUID = string & { readonly __uuid: unique symbol };

/**
 * Tool use block from API response
 */
export interface ToolUseBlock {
  id: string;
  name: string;
  input: Record<string, unknown>;
}

/**
 * Tool execution result
 */
export interface ToolResult {
  tool_use_id: string;
  content: unknown;
  is_error?: boolean;
}

/**
 * Base message interface
 */
export interface BaseMessage {
  type: string;
  session_id?: UUID;
  parent_tool_use_id?: UUID;
}

/**
 * Assistant message with BetaMessage content from @anthropic-ai/sdk
 */
export interface SDKAssistantMessage extends BaseMessage {
  type: 'assistant';
  uuid?: UUID;
  message: AnthropicMessage;
}

/**
 * User message
 */
export interface SDKUserMessage extends BaseMessage {
  type: 'user';
  uuid?: UUID;
  prompt: string;
}

/**
 * User message replay (from session resume)
 */
export interface SDKUserMessageReplay extends BaseMessage {
  type: 'user_replay';
  uuid?: UUID;
  prompt: string;
}

/**
 * Result message subtypes
 */
export type SDKResultSuccessMessage = BaseMessage & {
  type: 'result';
  subtype: 'success';
  uuid?: UUID;
  result: string;
  duration_ms: number;
  duration_api_ms: number;
  num_turns: number;
  total_cost_usd: number;
  usage: {
    input_tokens: number;
    output_tokens: number;
    cache_creation_input_tokens?: number;
    cache_read_input_tokens?: number;
  };
  modelUsage?: Record<string, {
    input_tokens: number;
    output_tokens: number;
  }>;
  permission_denials?: number;
  structured_output?: unknown;
};

export type SDKResultErrorMessage = BaseMessage & {
  type: 'result';
  subtype:
    | 'error_max_iterations_exceeded'
    | 'error_api_error'
    | 'error_during_execution'
    | 'error_max_structured_output_retries'
    | 'error_user_interrupted'
    | 'error_budget_exceeded';
  uuid?: UUID;
  error: {
    message: string;
    details?: unknown;
  };
  duration_ms: number;
  num_turns: number;
  total_cost_usd: number;
};

export type SDKResultMessage = SDKResultSuccessMessage | SDKResultErrorMessage;

/**
 * System message subtypes
 */
export interface SDKSystemInitMessage extends BaseMessage {
  type: 'system';
  subtype: 'init';
  uuid?: UUID;
  session_id: UUID;
  cwd: string;
  model: string;
  permission_mode?: string;
  tools: string[];
  mcp_servers?: McpServerStatus[];
  agents?: AgentInfo[];
  available_models?: string[];
}

export type SDKSystemMessage = SDKSystemInitMessage;

/**
 * Partial assistant message (streaming events)
 */
export interface SDKPartialAssistantMessage extends BaseMessage {
  type: 'partial_assistant';
  uuid?: UUID;
  delta?: {
    type?: 'text' | 'tool_use' | 'thinking';
    text?: string;
    tool_use?: {
      id?: string;
      name?: string;
      input?: Record<string, unknown>;
    };
    thinking?: string;
  };
  index?: number;
}

/**
 * Compact boundary message
 */
export interface SDKCompactBoundaryMessage extends BaseMessage {
  type: 'compact_boundary';
  uuid?: UUID;
}

/**
 * Status message
 */
export interface SDKStatusMessage extends BaseMessage {
  type: 'status';
  uuid?: UUID;
  status: string;
  details?: unknown;
}

/**
 * Hook messages
 */
export interface SDKHookStartedMessage extends BaseMessage {
  type: 'hook_started';
  uuid?: UUID;
  hook_type: string;
  tool_name?: string;
  input?: unknown;
}

export interface SDKHookProgressMessage extends BaseMessage {
  type: 'hook_progress';
  uuid?: UUID;
  hook_type: string;
  progress: string;
}

export interface SDKHookResponseMessage extends BaseMessage {
  type: 'hook_response';
  hook_type: string;
  response: {
    systemMessage?: string;
    continue?: boolean;
    updatedInput?: Record<string, unknown>;
    hookSpecificOutput?: unknown;
  };
}

/**
 * Tool progress and summary messages
 */
export interface SDKToolProgressMessage extends BaseMessage {
  type: 'tool_progress';
  tool_name: string;
  progress: string;
}

export interface SDKToolUseSummaryMessage extends BaseMessage {
  type: 'tool_use_summary';
  tool_name: string;
  tool_use_id: UUID;
  input: Record<string, unknown>;
  result: unknown;
  duration_ms: number;
}

/**
 * Auth status message
 */
export interface SDKAuthStatusMessage extends BaseMessage {
  type: 'auth_status';
  status: 'authenticated' | 'unauthenticated';
  details?: unknown;
}

/**
 * Task notification messages
 */
export interface SDKTaskNotificationMessage extends BaseMessage {
  type: 'task_notification';
  notification: string;
  task_id?: string;
}

export interface SDKTaskStartedMessage extends BaseMessage {
  type: 'task_started';
  task_id: UUID;
  agent?: string;
  prompt: string;
}

export interface SDKTaskProgressMessage extends BaseMessage {
  type: 'task_progress';
  task_id: UUID;
  progress: string;
}

/**
 * Files persisted event
 */
export interface SDKFilesPersistedEvent extends BaseMessage {
  type: 'files_persisted';
  files: string[];
}

/**
 * Rate limit event
 */
export interface SDKRateLimitEvent extends BaseMessage {
  type: 'rate_limit';
  limit: number;
  remaining: number;
  reset_at?: string;
}

/**
 * Permission denial
 */
export interface SDKPermissionDenial extends BaseMessage {
  type: 'permission_denial';
  tool_name: string;
  reason: string;
  tool_use_id: UUID;
}

/**
 * Compatibility message types for @anthropic-ai/claude-agent-sdk
 * These provide a drop-in replacement experience
 */

/**
 * Simple text message - compatibility with original SDK
 */
export interface SDKTextMessage extends BaseMessage {
  type: 'text';
  text: string;
}

/**
 * Tool use message - compatibility with original SDK
 */
export interface SDKToolUseMessage extends BaseMessage {
  type: 'tool_use';
  name: string;
  input: Record<string, unknown>;
  tool_use_id?: string;
}

/**
 * Error message - compatibility with original SDK
 */
export interface SDKErrorMessage extends BaseMessage {
  type: 'error';
  error: string;
}

/**
 * Task completed message
 */
export interface SDKTaskCompletedMessage extends BaseMessage {
  type: 'task_completed';
  task_id: UUID;
}

/**
 * Task failed message
 */
export interface SDKTaskFailedMessage extends BaseMessage {
  type: 'task_failed';
  task_id: UUID;
  error: string;
}

/**
 * Task stopped message
 */
export interface SDKTaskStoppedMessage extends BaseMessage {
  type: 'task_stopped';
  task_id: UUID;
}

/**
 * Subagent tool use message
 */
export interface SDKSubagentToolUseMessage extends BaseMessage {
  type: 'subagent_tool_use';
  agent_name: string;
  tool_use_id: UUID;
}

/**
 * Prompt suggestion message
 */
export interface SDKPromptSuggestionMessage extends BaseMessage {
  type: 'prompt_suggestion';
  suggestions: string[];
}

/**
 * Local command output message
 */
export interface SDKLocalCommandOutputMessage extends BaseMessage {
  type: 'local_command_output';
  command: string;
  output: string;
  exitCode?: number;
  timestamp: number;
}

/**
 * Elicitation complete message
 */
export interface SDKElicitationCompleteMessage extends BaseMessage {
  type: 'elicitation_complete';
  elicitationId: string;
  serverName: string;
  action: 'accept' | 'decline' | 'cancel';
  content?: Record<string, unknown>;
}

/**
 * Union of all SDK message types (including compatibility types)
 */
export type SDKMessage =
  | SDKAssistantMessage
  | SDKUserMessage
  | SDKUserMessageReplay
  | SDKResultMessage
  | SDKSystemMessage
  | SDKPartialAssistantMessage
  | SDKCompactBoundaryMessage
  | SDKStatusMessage
  | SDKHookStartedMessage
  | SDKHookProgressMessage
  | SDKHookResponseMessage
  | SDKToolProgressMessage
  | SDKToolUseSummaryMessage
  | SDKAuthStatusMessage
  | SDKTaskNotificationMessage
  | SDKTaskStartedMessage
  | SDKTaskProgressMessage
  | SDKTaskCompletedMessage
  | SDKTaskFailedMessage
  | SDKTaskStoppedMessage
  | SDKFilesPersistedEvent
  | SDKRateLimitEvent
  | SDKPermissionDenial
  | SDKPromptSuggestionMessage
  | SDKLocalCommandOutputMessage
  | SDKElicitationCompleteMessage
  | SDKSubagentToolUseMessage
  | SDKTextMessage
  | SDKToolUseMessage
  | SDKErrorMessage;
