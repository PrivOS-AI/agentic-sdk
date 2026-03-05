/**
 * Session manager
 * Handles session CRUD operations: create, resume, fork, and save
 */

import { v4 as uuidv4 } from 'uuid';
import type { UUID } from '../types/messages.js';
import type {
  SessionData,
  SDKSessionInfo,
  SessionPersistence,
} from '../types/sessions.js';
import {
  saveSession,
  loadSession,
  deleteSession,
  sessionExists,
  getGitBranch,
  listAllSessions,
} from './session-persistence.js';
import {
  validateParentSession,
  calculateForkDepth,
  generateForkTitle,
  deepCopyMessages,
  validateForkChain,
  countForksFromParent,
  validateSessionSize,
} from './session-forking-utils.js';

/**
 * Session manager options
 */
export interface SessionManagerOptions {
  /** Custom session directory */
  sessionDir?: string;
  /** Whether to persist file checkpoints */
  persistFileCheckpoints?: boolean;
}

/**
 * Session manager class
 */
export class SessionManager {
  private currentSessionId: UUID | null = null;
  private sessionData: SessionData | null = null;
  private options: SessionManagerOptions;

  constructor(options: SessionManagerOptions = {}) {
    this.options = options;
  }

  /**
   * Create a new session
   */
  async createSession(initialState?: {
    prompt?: string;
    model?: string;
    cwd?: string;
    customTitle?: string;
  }): Promise<UUID> {
    const sessionId = uuidv4() as UUID;
    const now = Date.now();
    const gitBranch = initialState?.cwd
      ? await getGitBranch(initialState.cwd)
      : undefined;

    const sessionData: SessionData = {
      sessionId,
      messages: [],
      metadata: {
        summary: initialState?.prompt || '',
        customTitle: initialState?.customTitle,
        gitBranch,
        model: initialState?.model || 'claude-opus-4-6',
        cwd: initialState?.cwd,
      },
      createdAt: now,
      updatedAt: now,
      usage: {
        totalCostUsd: 0,
        turnCount: 0,
      },
    };

    this.currentSessionId = sessionId;
    this.sessionData = sessionData;

    // Auto-save on creation
    await this.saveCurrentState();

    return sessionId;
  }

  /**
   * Resume an existing session
   */
  async resumeSession(sessionId: UUID): Promise<SessionData> {
    if (!(await sessionExists(sessionId, this.options.sessionDir))) {
      throw new Error(`Session not found: ${sessionId}`);
    }

    const data = await loadSession(sessionId, this.options.sessionDir);

    this.currentSessionId = sessionId;
    this.sessionData = data;

    return data;
  }

  /**
   * Fork an existing session
   * Creates a copy with a new session ID and tracks parent-child relationship
   * @param sessionId - Parent session ID to fork
   * @param options - Optional custom title for the fork
   * @returns New forked session ID
   */
  async forkSession(
    sessionId: UUID,
    options?: { customTitle?: string }
  ): Promise<UUID> {
    // Validate parent session exists and get data
    const parentData = await validateParentSession(
      sessionId,
      this.options.sessionDir
    );

    // Validate session size before forking
    validateSessionSize(parentData);

    // Validate fork chain (no circular references)
    await validateForkChain(sessionId, this.options.sessionDir);

    // Calculate fork depth
    const forkDepth = calculateForkDepth(parentData);

    // Get all sessions to count existing forks
    const allSessions = await listAllSessions(this.options.sessionDir);
    const forkNumber = countForksFromParent(sessionId, allSessions) + 1;

    // Generate fork title (if not provided)
    const forkTitle =
      options?.customTitle || generateForkTitle(parentData, forkNumber);

    // Create new session ID
    const newSessionId = uuidv4() as UUID;
    const now = Date.now();

    // Deep copy messages to prevent shared references
    const copiedMessages = deepCopyMessages(parentData.messages);

    // Create forked session data with enhanced metadata
    const forkedData: SessionData = {
      ...parentData,
      sessionId: newSessionId,
      messages: copiedMessages,
      metadata: {
        ...parentData.metadata,
        customTitle: forkTitle || parentData.metadata.customTitle,
        parentSessionId: sessionId, // Track parent relationship
        forkedAt: now, // Track when fork was created
        forkDepth, // Track fork depth
      },
      createdAt: now,
      updatedAt: now,
      usage: {
        ...parentData.usage,
      },
    };

    // Save forked session
    await saveSession(newSessionId, forkedData, this.options.sessionDir);

    // Switch to forked session
    this.currentSessionId = newSessionId;
    this.sessionData = forkedData;

    return newSessionId;
  }

  /**
   * Save current session state
   */
  async saveCurrentState(
    messages?: unknown[],
    metadata?: Partial<SessionData['metadata']>,
    usage?: Partial<SessionData['usage']>
  ): Promise<void> {
    if (!this.currentSessionId || !this.sessionData) {
      throw new Error('No active session to save');
    }

    // Update session data with provided values
    if (messages) {
      this.sessionData.messages = messages;
    }

    if (metadata) {
      Object.assign(this.sessionData.metadata, metadata);
    }

    if (usage) {
      Object.assign(this.sessionData.usage, usage);
    }

    this.sessionData.updatedAt = Date.now();

    await saveSession(
      this.currentSessionId,
      this.sessionData,
      this.options.sessionDir
    );
  }

  /**
   * Get current session ID
   */
  getCurrentSessionId(): UUID | null {
    return this.currentSessionId;
  }

  /**
   * Get current session data
   */
  getCurrentSessionData(): SessionData | null {
    return this.sessionData;
  }

  /**
   * Get session info for a specific session
   */
  async getSessionInfo(sessionId: UUID): Promise<SDKSessionInfo> {
    const data = await loadSession(sessionId, this.options.sessionDir);

    return this.toSDKSessionInfo(data);
  }

  /**
   * Delete current session
   */
  async deleteCurrentSession(): Promise<void> {
    if (!this.currentSessionId) {
      throw new Error('No active session to delete');
    }

    await deleteSession(this.currentSessionId, this.options.sessionDir);

    this.currentSessionId = null;
    this.sessionData = null;
  }

  /**
   * Get session lineage (chain of parent sessions)
   * Returns array of session IDs from root to current session
   * @param sessionId - Session ID to get lineage for
   * @returns Array of session IDs in order from root to current
   */
  async getSessionLineage(sessionId: UUID): Promise<UUID[]> {
    const lineage: UUID[] = [];
    let currentId: UUID | undefined = sessionId;

    while (currentId) {
      lineage.push(currentId);

      const data = await loadSession(currentId, this.options.sessionDir);
      currentId = data.metadata.parentSessionId;

      // Prevent infinite loops
      if (lineage.length > 1000) {
        throw new Error('Session lineage exceeds maximum depth of 1000');
      }
    }

    // Reverse to get root -> current order
    return lineage.reverse();
  }

  /**
   * Convert SessionData to SDKSessionInfo
   */
  private toSDKSessionInfo(data: SessionData): SDKSessionInfo {
    return {
      sessionId: data.sessionId,
      summary: data.metadata.summary,
      customTitle: data.metadata.customTitle,
      createdAt: data.createdAt,
      lastModified: data.updatedAt,
      fileSize: JSON.stringify(data).length,
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
  }
}

/**
 * Parse session persistence configuration
 */
export function parseSessionPersistence(
  config: SessionPersistence = 'auto'
): {
  enabled: boolean;
  sessionDir?: string;
  persistFileCheckpoints: boolean;
} {
  if (config === 'never') {
    return {
      enabled: false,
      persistFileCheckpoints: false,
    };
  }

  if (config === 'auto') {
    return {
      enabled: true,
      persistFileCheckpoints: false,
    };
  }

  return {
    enabled: true,
    sessionDir: config.dir,
    persistFileCheckpoints: config.persistFileCheckpoints || false,
  };
}

/**
 * Generate session summary from first prompt
 */
export function generateSessionSummary(prompt: string, maxLength = 100): string {
  // Remove leading/trailing whitespace
  let summary = prompt.trim();

  // Truncate if too long
  if (summary.length > maxLength) {
    summary = summary.substring(0, maxLength - 3) + '...';
  }

  // Replace newlines with spaces
  summary = summary.replace(/\s+/g, ' ');

  return summary;
}
