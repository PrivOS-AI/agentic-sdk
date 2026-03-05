import type {
  HookEvent,
  HookInput,
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
} from '../types/hooks.js';
import type { UUID } from '../types/messages.js';

/**
 * All 18 hook event types
 */
export const HOOK_EVENTS: HookEvent[] = [
  'PreToolUse',
  'PostToolUse',
  'PostToolUseFailure',
  'UserPromptSubmit',
  'Stop',
  'SessionStart',
  'SessionEnd',
  'SubagentStart',
  'SubagentStop',
  'PreCompact',
  'PermissionRequest',
  'Notification',
  'Setup',
  'TeammateIdle',
  'TaskCompleted',
  'ConfigChange',
  'WorktreeCreate',
  'WorktreeRemove',
];

/**
 * Build PreToolUse hook input
 */
export function buildPreToolUseInput(
  toolName: string,
  toolInput: Record<string, unknown>,
  toolUseId: UUID
): PreToolUseInput {
  return {
    type: 'PreToolUse',
    toolName,
    toolInput,
    toolUseId,
  };
}

/**
 * Build PostToolUse hook input
 */
export function buildPostToolUseInput(
  toolName: string,
  toolInput: Record<string, unknown>,
  toolUseId: UUID,
  result: unknown,
  durationMs: number
): PostToolUseInput {
  return {
    type: 'PostToolUse',
    toolName,
    toolInput,
    toolUseId,
    result,
    durationMs,
  };
}

/**
 * Build PostToolUseFailure hook input
 */
export function buildPostToolUseFailureInput(
  toolName: string,
  toolInput: Record<string, unknown>,
  toolUseId: UUID,
  error: Error,
  durationMs: number
): PostToolUseFailureInput {
  return {
    type: 'PostToolUseFailure',
    toolName,
    toolInput,
    toolUseId,
    error,
    durationMs,
  };
}

/**
 * Build UserPromptSubmit hook input
 */
export function buildUserPromptSubmitInput(prompt: string): UserPromptSubmitInput {
  return {
    type: 'UserPromptSubmit',
    prompt,
  };
}

/**
 * Build Stop hook input
 */
export function buildStopInput(reason: 'completed' | 'interrupted' | 'error'): StopInput {
  return {
    type: 'Stop',
    reason,
  };
}

/**
 * Build SessionStart hook input
 */
export function buildSessionStartInput(
  sessionId: UUID,
  options: Record<string, unknown>
): SessionStartInput {
  return {
    type: 'SessionStart',
    sessionId,
    options,
  };
}

/**
 * Build SessionEnd hook input
 */
export function buildSessionEndInput(
  sessionId: UUID,
  durationMs: number
): SessionEndInput {
  return {
    type: 'SessionEnd',
    sessionId,
    durationMs,
  };
}

/**
 * Build SubagentStart hook input
 */
export function buildSubagentStartInput(
  agentName: string,
  prompt: string,
  parentToolUseId: UUID
): SubagentStartInput {
  return {
    type: 'SubagentStart',
    agentName,
    prompt,
    parentToolUseId,
  };
}

/**
 * Build SubagentStop hook input
 */
export function buildSubagentStopInput(
  agentName: string,
  parentToolUseId: UUID,
  result: string,
  durationMs: number
): SubagentStopInput {
  return {
    type: 'SubagentStop',
    agentName,
    parentToolUseId,
    result,
    durationMs,
  };
}

/**
 * Build PreCompact hook input
 */
export function buildPreCompactInput(
  messageCount: number,
  tokenCount: number
): PreCompactInput {
  return {
    type: 'PreCompact',
    messageCount,
    tokenCount,
  };
}

/**
 * Build PermissionRequest hook input
 */
export function buildPermissionRequestInput(
  toolName: string,
  toolInput: Record<string, unknown>
): PermissionRequestInput {
  return {
    type: 'PermissionRequest',
    toolName,
    toolInput,
  };
}

/**
 * Build Notification hook input
 */
export function buildNotificationInput(notification: string): NotificationInput {
  return {
    type: 'Notification',
    notification,
  };
}

/**
 * Build Setup hook input
 */
export function buildSetupInput(options: Record<string, unknown>): SetupInput {
  return {
    type: 'Setup',
    options,
  };
}

/**
 * Build TeammateIdle hook input
 */
export function buildTeammateIdleInput(
  agentName: string,
  idleTimeMs: number
): TeammateIdleInput {
  return {
    type: 'TeammateIdle',
    agentName,
    idleTimeMs,
  };
}

/**
 * Build TaskCompleted hook input
 */
export function buildTaskCompletedInput(
  taskId: UUID,
  result: string
): TaskCompletedInput {
  return {
    type: 'TaskCompleted',
    taskId,
    result,
  };
}

/**
 * Build ConfigChange hook input
 */
export function buildConfigChangeInput(
  key: string,
  oldValue: unknown,
  newValue: unknown
): ConfigChangeInput {
  return {
    type: 'ConfigChange',
    key,
    oldValue,
    newValue,
  };
}

/**
 * Build WorktreeCreate hook input
 */
export function buildWorktreeCreateInput(path: string): WorktreeCreateInput {
  return {
    type: 'WorktreeCreate',
    path,
  };
}

/**
 * Build WorktreeRemove hook input
 */
export function buildWorktreeRemoveInput(path: string): WorktreeRemoveInput {
  return {
    type: 'WorktreeRemove',
    path,
  };
}

/**
 * Type guard: Check if input is PreToolUse
 */
export function isPreToolUseInput(input: HookInput): input is PreToolUseInput {
  return input.type === 'PreToolUse';
}

/**
 * Type guard: Check if input is PostToolUse
 */
export function isPostToolUseInput(input: HookInput): input is PostToolUseInput {
  return input.type === 'PostToolUse';
}

/**
 * Type guard: Check if input is PostToolUseFailure
 */
export function isPostToolUseFailureInput(input: HookInput): input is PostToolUseFailureInput {
  return input.type === 'PostToolUseFailure';
}

/**
 * Type guard: Check if input is UserPromptSubmit
 */
export function isUserPromptSubmitInput(input: HookInput): input is UserPromptSubmitInput {
  return input.type === 'UserPromptSubmit';
}

/**
 * Type guard: Check if input is Stop
 */
export function isStopInput(input: HookInput): input is StopInput {
  return input.type === 'Stop';
}

/**
 * Type guard: Check if input is SessionStart
 */
export function isSessionStartInput(input: HookInput): input is SessionStartInput {
  return input.type === 'SessionStart';
}

/**
 * Type guard: Check if input is SessionEnd
 */
export function isSessionEndInput(input: HookInput): input is SessionEndInput {
  return input.type === 'SessionEnd';
}

/**
 * Type guard: Check if input is SubagentStart
 */
export function isSubagentStartInput(input: HookInput): input is SubagentStartInput {
  return input.type === 'SubagentStart';
}

/**
 * Type guard: Check if input is SubagentStop
 */
export function isSubagentStopInput(input: HookInput): input is SubagentStopInput {
  return input.type === 'SubagentStop';
}

/**
 * Type guard: Check if input is PreCompact
 */
export function isPreCompactInput(input: HookInput): input is PreCompactInput {
  return input.type === 'PreCompact';
}

/**
 * Type guard: Check if input is PermissionRequest
 */
export function isPermissionRequestInput(input: HookInput): input is PermissionRequestInput {
  return input.type === 'PermissionRequest';
}

/**
 * Type guard: Check if input is Notification
 */
export function isNotificationInput(input: HookInput): input is NotificationInput {
  return input.type === 'Notification';
}

/**
 * Type guard: Check if input is Setup
 */
export function isSetupInput(input: HookInput): input is SetupInput {
  return input.type === 'Setup';
}

/**
 * Type guard: Check if input is TeammateIdle
 */
export function isTeammateIdleInput(input: HookInput): input is TeammateIdleInput {
  return input.type === 'TeammateIdle';
}

/**
 * Type guard: Check if input is TaskCompleted
 */
export function isTaskCompletedInput(input: HookInput): input is TaskCompletedInput {
  return input.type === 'TaskCompleted';
}

/**
 * Type guard: Check if input is ConfigChange
 */
export function isConfigChangeInput(input: HookInput): input is ConfigChangeInput {
  return input.type === 'ConfigChange';
}

/**
 * Type guard: Check if input is WorktreeCreate
 */
export function isWorktreeCreateInput(input: HookInput): input is WorktreeCreateInput {
  return input.type === 'WorktreeCreate';
}

/**
 * Type guard: Check if input is WorktreeRemove
 */
export function isWorktreeRemoveInput(input: HookInput): input is WorktreeRemoveInput {
  return input.type === 'WorktreeRemove';
}
