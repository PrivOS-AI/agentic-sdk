/**
 * Session forking utilities
 * Helper functions for validating and creating forked sessions
 */

import type { UUID } from '../types/messages.js';
import type { SessionData } from '../types/sessions.js';
import {
  loadSession,
  sessionExists,
} from './session-persistence.js';

/**
 * Validate that a parent session exists and return its data
 * @param parentSessionId - Parent session ID to validate
 * @param sessionDir - Optional custom session directory
 * @returns Parent session data
 * @throws Error if parent session doesn't exist
 */
export async function validateParentSession(
  parentSessionId: UUID,
  sessionDir?: string
): Promise<SessionData> {
  if (!(await sessionExists(parentSessionId, sessionDir))) {
    throw new Error(`Parent session not found: ${parentSessionId}`);
  }

  return await loadSession(parentSessionId, sessionDir);
}

/**
 * Calculate fork depth for a new session
 * @param parentData - Parent session data
 * @returns Fork depth (parent depth + 1, or 1 if parent has no depth)
 */
export function calculateForkDepth(parentData: SessionData): number {
  const parentDepth = parentData.metadata.forkDepth ?? 0;
  return parentDepth + 1;
}

/**
 * Generate a title for a forked session
 * @param parentData - Parent session data
 * @param forkNumber - Fork number (for multiple forks from same parent)
 * @returns Generated title (or undefined if parent has no custom title)
 */
export function generateForkTitle(
  parentData: SessionData,
  forkNumber: number = 1
): string | undefined {
  // Only generate title if parent has a custom title
  if (!parentData.metadata.customTitle) {
    return undefined;
  }

  const baseTitle = parentData.metadata.customTitle;

  // If parent is already a fork, extract base title
  const baseTitleWithoutForkSuffix = baseTitle
    .replace(/\s*\(fork(?:\s+\d+)?\)\s*$/, '')
    .trim();

  // Append fork suffix
  if (forkNumber === 1) {
    return `${baseTitleWithoutForkSuffix} (fork)`;
  } else {
    return `${baseTitleWithoutForkSuffix} (fork ${forkNumber})`;
  }
}

/**
 * Deep copy messages array to prevent shared references
 * @param messages - Messages array to copy
 * @returns Deep copied messages array
 */
export function deepCopyMessages(messages: unknown[]): unknown[] {
  // Use structured clone for deep copy
  return structuredClone(messages);
}

/**
 * Validate fork chain to prevent circular references
 * Walks up the parent chain to detect cycles
 * @param sessionId - Session ID to validate
 * @param sessionDir - Optional custom session directory
 * @param visited - Set of visited session IDs (for recursion)
 * @param maxDepth - Maximum depth to traverse (default: 100)
 * @throws Error if circular reference detected or max depth exceeded
 */
export async function validateForkChain(
  sessionId: UUID,
  sessionDir?: string,
  visited: Set<UUID> = new Set(),
  maxDepth: number = 100
): Promise<void> {
  // Detect circular reference
  if (visited.has(sessionId)) {
    throw new Error(
      `Circular fork reference detected: session ${sessionId} appears multiple times in chain`
    );
  }

  // Detect excessive depth
  if (visited.size >= maxDepth) {
    throw new Error(
      `Fork depth exceeds maximum of ${maxDepth}. Possible circular reference or abuse.`
    );
  }

  // Mark as visited
  visited.add(sessionId);

  // Load session to get parent
  const exists = await sessionExists(sessionId, sessionDir);
  if (!exists) {
    throw new Error(`Session not found: ${sessionId}`);
  }

  const data = await loadSession(sessionId, sessionDir);

  // Recursively validate parent if exists
  if (data.metadata.parentSessionId) {
    await validateForkChain(
      data.metadata.parentSessionId,
      sessionDir,
      visited,
      maxDepth
    );
  }
}

/**
 * Count existing forks from a parent session
 * @param parentSessionId - Parent session ID
 * @param allSessions - All available sessions
 * @returns Number of existing forks
 */
export function countForksFromParent(
  parentSessionId: UUID,
  allSessions: SessionData[]
): number {
  return allSessions.filter(
    (s) => s.metadata.parentSessionId === parentSessionId
  ).length;
}

/**
 * Calculate session size in bytes
 * @param sessionData - Session data to measure
 * @returns Size in bytes
 */
export function calculateSessionSize(sessionData: SessionData): number {
  return JSON.stringify(sessionData).length;
}

/**
 * Maximum session size for forking (100MB)
 */
export const MAX_FORK_SESSION_SIZE = 100 * 1024 * 1024; // 100MB

/**
 * Validate session size before forking
 * @param sessionData - Session data to validate
 * @param maxSize - Maximum allowed size (default: MAX_FORK_SESSION_SIZE)
 * @throws Error if session size exceeds maximum
 */
export function validateSessionSize(
  sessionData: SessionData,
  maxSize: number = MAX_FORK_SESSION_SIZE
): void {
  const size = calculateSessionSize(sessionData);

  if (size > maxSize) {
    const sizeMB = (size / 1024 / 1024).toFixed(2);
    const maxMB = (maxSize / 1024 / 1024).toFixed(2);
    throw new Error(
      `Session size (${sizeMB}MB) exceeds maximum for forking (${maxMB}MB)`
    );
  }
}
