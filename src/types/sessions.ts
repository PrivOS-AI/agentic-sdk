import type { UUID } from './messages.js';

/**
 * Session persistence configuration
 */
export type SessionPersistence =
  | 'auto'
  | 'never'
  | {
      /** Custom session directory */
      dir?: string;
      /** Whether to persist file checkpoints */
      persistFileCheckpoints?: boolean;
    };

/**
 * SDK session information
 */
export interface SDKSessionInfo {
  /** Session ID */
  sessionId: UUID;

  /** Session summary (first prompt) */
  summary: string;

  /** Custom title */
  customTitle?: string;

  /** Creation timestamp */
  createdAt: number;

  /** Last modified timestamp */
  lastModified: number;

  /** File size in bytes */
  fileSize: number;

  /** Git branch at time of session */
  gitBranch?: string;

  /** Number of messages in session */
  messageCount: number;

  /** Total turns in session */
  turnCount: number;

  /** Total cost in USD */
  totalCostUsd: number;

  /** Model used */
  model: string;

  /** Working directory */
  cwd?: string;

  /** Parent session ID (if this is a fork) */
  parentSessionId?: UUID;

  /** When this session was forked (timestamp) */
  forkedAt?: number;

  /** Fork depth (0 = root session, 1 = first fork, etc.) */
  forkDepth?: number;
}

/**
 * Session data (persisted format)
 */
export interface SessionData {
  /** Session ID */
  sessionId: UUID;

  /** Messages array */
  messages: unknown[];

  /** Session metadata */
  metadata: {
    summary: string;
    customTitle?: string;
    gitBranch?: string;
    model: string;
    cwd?: string;
    /** Parent session ID (if this is a fork) */
    parentSessionId?: UUID;
    /** When this session was forked (timestamp) */
    forkedAt?: number;
    /** Fork depth (0 = root session, 1 = first fork, etc.) */
    forkDepth?: number;
  };

  /** Creation timestamp */
  createdAt: number;

  /** Last updated timestamp */
  updatedAt: number;

  /** Usage statistics */
  usage: {
    totalCostUsd: number;
    turnCount: number;
  };
}

/**
 * Rewind files result
 */
export interface RewindFilesResult {
  /** Files that were restored */
  filesRestored: string[];

  /** Files that would be restored (dry run) */
  filesToRestore: string[];

  /** Number of files restored */
  count: number;
}

/**
 * Sandbox settings (kept for compatibility, not used in native SDK)
 */
export interface SandboxSettings {
  /** Whether sandbox is enabled */
  enabled?: boolean;

  /** Sandbox type */
  type?: 'local' | 'remote';

  /** Sandbox endpoint */
  endpoint?: string;
}
