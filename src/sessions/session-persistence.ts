/**
 * Session persistence layer
 * Handles file I/O for session data with atomic writes
 */

import * as fs from 'node:fs/promises';
import * as path from 'node:path';
import * as os from 'node:os';
import type { SessionData } from '../types/sessions.js';
import type { UUID } from '../types/messages.js';

/**
 * Session file information
 */
export interface SessionFileInfo {
  sessionId: UUID;
  lastModified: number;
  fileSize: number;
}

/**
 * Get the default session directory
 * Creates directory if it doesn't exist
 */
export async function getSessionDir(customDir?: string): Promise<string> {
  const sessionDir = customDir || path.join(os.homedir(), '.claude', 'sessions');

  try {
    await fs.mkdir(sessionDir, { recursive: true, mode: 0o700 });
  } catch (error) {
    // Ignore error if directory already exists
    if ((error as NodeJS.ErrnoException).code !== 'EEXIST') {
      throw error;
    }
  }

  // Verify directory exists
  try {
    const stats = await fs.stat(sessionDir);
    if (!stats.isDirectory()) {
      throw new Error(`Session directory path exists but is not a directory: ${sessionDir}`);
    }
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
      throw new Error(`Session directory does not exist: ${sessionDir}`);
    }
    throw error;
  }

  return sessionDir;
}

/**
 * Get session file path
 */
export function getSessionPath(sessionDir: string, sessionId: UUID): string {
  return path.join(sessionDir, `${sessionId}.json`);
}

/**
 * Get temp session file path for atomic writes
 */
export function getTempSessionPath(sessionDir: string, sessionId: UUID): string {
  return path.join(sessionDir, `${sessionId}.json.tmp`);
}

/**
 * Save session data to disk with atomic write
 */
export async function saveSession(
  sessionId: UUID,
  data: SessionData,
  customDir?: string
): Promise<void> {
  const sessionDir = await getSessionDir(customDir);
  const sessionPath = getSessionPath(sessionDir, sessionId);
  const tempPath = getTempSessionPath(sessionDir, sessionId);

  try {
    // Write to temp file first
    const jsonData = JSON.stringify(data, null, 2);
    await fs.writeFile(tempPath, jsonData, { mode: 0o600, encoding: 'utf-8' });

    // Atomic rename
    await fs.rename(tempPath, sessionPath);
  } catch (error) {
    // Clean up temp file on error
    try {
      await fs.unlink(tempPath);
    } catch {
      // Ignore cleanup errors
    }
    throw error;
  }
}

/**
 * Load session data from disk
 */
export async function loadSession(
  sessionId: UUID,
  customDir?: string
): Promise<SessionData> {
  const sessionDir = await getSessionDir(customDir);
  const sessionPath = getSessionPath(sessionDir, sessionId);

  try {
    const jsonData = await fs.readFile(sessionPath, { encoding: 'utf-8' });
    const data = JSON.parse(jsonData) as SessionData;

    // Validate session data structure
    if (!data.sessionId || !data.messages || !Array.isArray(data.messages)) {
      throw new Error(`Invalid session data structure for session ${sessionId}`);
    }

    if (data.sessionId !== sessionId) {
      throw new Error(
        `Session ID mismatch: expected ${sessionId}, got ${data.sessionId}`
      );
    }

    return data;
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
      throw new Error(`Session not found: ${sessionId}`);
    }
    throw error;
  }
}

/**
 * Delete session from disk
 */
export async function deleteSession(
  sessionId: UUID,
  customDir?: string
): Promise<void> {
  const sessionDir = await getSessionDir(customDir);
  const sessionPath = getSessionPath(sessionDir, sessionId);

  try {
    await fs.unlink(sessionPath);
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
      // Session doesn't exist, consider it deleted
      return;
    }
    throw error;
  }
}

/**
 * List all session files in the session directory
 */
export async function listSessionFiles(
  customDir?: string
): Promise<SessionFileInfo[]> {
  const sessionDir = await getSessionDir(customDir);

  try {
    const files = await fs.readdir(sessionDir);

    const sessionFiles: SessionFileInfo[] = [];

    for (const file of files) {
      // Only process .json files (not .tmp files)
      if (!file.endsWith('.json') || file.endsWith('.json.tmp')) {
        continue;
      }

      try {
        const filePath = path.join(sessionDir, file);
        const stats = await fs.stat(filePath);

        // Extract session ID from filename
        const sessionId = file.replace('.json', '') as UUID;

        sessionFiles.push({
          sessionId,
          lastModified: stats.mtimeMs,
          fileSize: stats.size,
        });
      } catch (error) {
        // Skip files that can't be read
        continue;
      }
    }

    return sessionFiles;
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
      // Session directory doesn't exist yet
      return [];
    }
    throw error;
  }
}

/**
 * Check if a session exists
 */
export async function sessionExists(
  sessionId: UUID,
  customDir?: string
): Promise<boolean> {
  const sessionDir = await getSessionDir(customDir);
  const sessionPath = getSessionPath(sessionDir, sessionId);

  try {
    await fs.access(sessionPath);
    return true;
  } catch {
    return false;
  }
}

/**
 * Get current git branch (helper for session metadata)
 */
export async function getGitBranch(cwd?: string): Promise<string | undefined> {
  try {
    const { execSync } = await import('node:child_process');
    const branch = execSync('git rev-parse --abbrev-ref HEAD', {
      cwd: cwd || process.cwd(),
      encoding: 'utf-8',
      stdio: ['pipe', 'pipe', 'ignore'],
    }).trim();

    // Return undefined if HEAD (detached)
    return branch === 'HEAD' ? undefined : branch;
  } catch {
    // Not in a git repo or git not available
    return undefined;
  }
}

/**
 * List all sessions and return their full data
 * @param customDir - Optional custom session directory
 * @returns Array of all session data
 */
export async function listAllSessions(customDir?: string): Promise<SessionData[]> {
  const sessionFiles = await listSessionFiles(customDir);
  const sessions: SessionData[] = [];

  for (const file of sessionFiles) {
    try {
      const data = await loadSession(file.sessionId, customDir);
      sessions.push(data);
    } catch (error) {
      // Skip sessions that can't be loaded
      console.error(`Failed to load session ${file.sessionId}:`, error);
    }
  }

  return sessions;
}

