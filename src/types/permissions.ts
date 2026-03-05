import type { UUID } from './messages.js';

/**
 * Permission modes
 */
export type PermissionMode =
  | 'default'
  | 'acceptEdits'
  | 'bypassPermissions'
  | 'plan'
  | 'dontAsk'
  | 'never'
  | 'auto';

/**
 * Permission result
 */
export interface PermissionResult {
  /** Whether to allow the tool use */
  allow: boolean;
  /** Updated tool input (if modified by hooks) */
  updatedInput?: Record<string, unknown>;
  /** Reason for denial */
  reason?: string;
}

/**
 * Permission update event
 */
export type PermissionUpdate =
  | { type: 'mode_changed'; mode: PermissionMode }
  | { type: 'tool_denied'; toolName: string; reason: string }
  | { type: 'tool_allowed'; toolName: string };

/**
 * Callback for permission evaluation per tool
 */
export type CanUseTool = (
  toolName: string,
  input: Record<string, unknown>
) => PermissionResult | Promise<PermissionResult>;

/**
 * Permission denial details
 */
export interface PermissionDenial {
  tool_name: string;
  tool_use_id: UUID;
  reason: string;
  permission_mode?: PermissionMode;
}
