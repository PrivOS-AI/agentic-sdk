import type { UUID } from './messages.js';

/**
 * All 18 hook event types
 */
export type HookEvent =
  | 'PreToolUse'
  | 'PostToolUse'
  | 'PostToolUseFailure'
  | 'UserPromptSubmit'
  | 'Stop'
  | 'SessionStart'
  | 'SessionEnd'
  | 'SubagentStart'
  | 'SubagentStop'
  | 'PreCompact'
  | 'PermissionRequest'
  | 'Notification'
  | 'Setup'
  | 'TeammateIdle'
  | 'TaskCompleted'
  | 'ConfigChange'
  | 'WorktreeCreate'
  | 'WorktreeRemove';

/**
 * Hook callback signature
 */
export interface HookCallback {
  (
    input: HookInput,
    signal?: AbortSignal
  ): Promise<HookJSONOutput>;
}

/**
 * Hook callback matcher with optional regex filter
 */
export interface HookCallbackMatcher {
  /** Optional regex to match tool names */
  matcher?: RegExp;
  /** Array of hook callbacks to execute */
  hooks: HookCallback[];
  /** Timeout in milliseconds (default: 60000) */
  timeout?: number;
}

/**
 * Base hook input
 */
export interface BaseHookInput {
  type: HookEvent;
}

/**
 * PreToolUse hook input
 */
export interface PreToolUseInput extends BaseHookInput {
  type: 'PreToolUse';
  toolName: string;
  toolInput: Record<string, unknown>;
  toolUseId: UUID;
}

/**
 * PostToolUse hook input
 */
export interface PostToolUseInput extends BaseHookInput {
  type: 'PostToolUse';
  toolName: string;
  toolInput: Record<string, unknown>;
  toolUseId: UUID;
  result: unknown;
  durationMs: number;
}

/**
 * PostToolUseFailure hook input
 */
export interface PostToolUseFailureInput extends BaseHookInput {
  type: 'PostToolUseFailure';
  toolName: string;
  toolInput: Record<string, unknown>;
  toolUseId: UUID;
  error: Error;
  durationMs: number;
}

/**
 * UserPromptSubmit hook input
 */
export interface UserPromptSubmitInput extends BaseHookInput {
  type: 'UserPromptSubmit';
  prompt: string;
}

/**
 * Stop hook input
 */
export interface StopInput extends BaseHookInput {
  type: 'Stop';
  reason: 'completed' | 'interrupted' | 'error';
}

/**
 * SessionStart hook input
 */
export interface SessionStartInput extends BaseHookInput {
  type: 'SessionStart';
  sessionId: UUID;
  options: Record<string, unknown>;
}

/**
 * SessionEnd hook input
 */
export interface SessionEndInput extends BaseHookInput {
  type: 'SessionEnd';
  sessionId: UUID;
  durationMs: number;
}

/**
 * SubagentStart hook input
 */
export interface SubagentStartInput extends BaseHookInput {
  type: 'SubagentStart';
  agentName: string;
  prompt: string;
  parentToolUseId: UUID;
}

/**
 * SubagentStop hook input
 */
export interface SubagentStopInput extends BaseHookInput {
  type: 'SubagentStop';
  agentName: string;
  parentToolUseId: UUID;
  result: string;
  durationMs: number;
}

/**
 * PreCompact hook input
 */
export interface PreCompactInput extends BaseHookInput {
  type: 'PreCompact';
  messageCount: number;
  tokenCount: number;
}

/**
 * PermissionRequest hook input
 */
export interface PermissionRequestInput extends BaseHookInput {
  type: 'PermissionRequest';
  toolName: string;
  toolInput: Record<string, unknown>;
}

/**
 * Notification hook input
 */
export interface NotificationInput extends BaseHookInput {
  type: 'Notification';
  notification: string;
}

/**
 * Setup hook input
 */
export interface SetupInput extends BaseHookInput {
  type: 'Setup';
  options: Record<string, unknown>;
}

/**
 * TeammateIdle hook input
 */
export interface TeammateIdleInput extends BaseHookInput {
  type: 'TeammateIdle';
  agentName: string;
  idleTimeMs: number;
}

/**
 * TaskCompleted hook input
 */
export interface TaskCompletedInput extends BaseHookInput {
  type: 'TaskCompleted';
  taskId: UUID;
  result: string;
}

/**
 * ConfigChange hook input
 */
export interface ConfigChangeInput extends BaseHookInput {
  type: 'ConfigChange';
  key: string;
  oldValue: unknown;
  newValue: unknown;
}

/**
 * WorktreeCreate hook input
 */
export interface WorktreeCreateInput extends BaseHookInput {
  type: 'WorktreeCreate';
  path: string;
}

/**
 * WorktreeRemove hook input
 */
export interface WorktreeRemoveInput extends BaseHookInput {
  type: 'WorktreeRemove';
  path: string;
}

/**
 * Union of all hook input types
 */
export type HookInput =
  | PreToolUseInput
  | PostToolUseInput
  | PostToolUseFailureInput
  | UserPromptSubmitInput
  | StopInput
  | SessionStartInput
  | SessionEndInput
  | SubagentStartInput
  | SubagentStopInput
  | PreCompactInput
  | PermissionRequestInput
  | NotificationInput
  | SetupInput
  | TeammateIdleInput
  | TaskCompletedInput
  | ConfigChangeInput
  | WorktreeCreateInput
  | WorktreeRemoveInput;

/**
 * Hook JSON output structure
 */
export interface HookJSONOutput {
  /** Optional system message to inject */
  systemMessage?: string;
  /** Whether to continue execution */
  continue?: boolean;
  /** Updated tool input (for PreToolUse) */
  updatedInput?: Record<string, unknown>;
  /** Hook-specific output data */
  hookSpecificOutput?: Record<string, unknown>;
  /** Permission decision (for PreToolUse) */
  permissionDecision?: 'allow' | 'deny' | 'ask';
}

/**
 * Type guards for hook inputs
 */
export function isPreToolUseInput(input: HookInput): input is PreToolUseInput {
  return input.type === 'PreToolUse';
}

export function isPostToolUseInput(input: HookInput): input is PostToolUseInput {
  return input.type === 'PostToolUse';
}

export function isPostToolUseFailureInput(input: HookInput): input is PostToolUseFailureInput {
  return input.type === 'PostToolUseFailure';
}
