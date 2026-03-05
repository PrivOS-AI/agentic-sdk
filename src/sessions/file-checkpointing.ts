/**
 * File checkpointing manager
 * Captures file snapshots before modifications for rewind capability
 */

import * as fs from 'node:fs/promises';
import type { UUID } from '../types/messages.js';
import type { RewindFilesResult } from '../types/sessions.js';

/**
 * File checkpoint data
 */
export interface FileCheckpoint {
  /** Message ID when checkpoint was created */
  messageId: UUID;
  /** Map of file path to file content */
  files: Map<string, string>;
  /** Timestamp when checkpoint was created */
  timestamp: number;
}

/**
 * File checkpoint manager options
 */
export interface FileCheckpointingOptions {
  /** Maximum number of checkpoints to keep in memory */
  maxCheckpoints?: number;
  /** Whether to persist checkpoints to disk */
  persistToDisk?: boolean;
}

/**
 * File checkpoint manager class
 */
export class FileCheckpointManager {
  private checkpoints: Map<UUID, FileCheckpoint> = new Map();
  private messageIdToCheckpointId: Map<UUID, UUID> = new Map();
  private options: Required<FileCheckpointingOptions>;

  constructor(options: FileCheckpointingOptions = {}) {
    this.options = {
      maxCheckpoints: options.maxCheckpoints || 1000,
      persistToDisk: options.persistToDisk || false,
    };
  }

  /**
   * Create a checkpoint for a file before modification
   */
  async checkpointFile(
    filePath: string,
    messageId: UUID
  ): Promise<void> {
    // Get or create checkpoint for this message
    let checkpointId = this.messageIdToCheckpointId.get(messageId);
    let checkpoint: FileCheckpoint;

    if (checkpointId) {
      checkpoint = this.checkpoints.get(checkpointId)!;
    } else {
      checkpointId = messageId;
      checkpoint = {
        messageId,
        files: new Map(),
        timestamp: Date.now(),
      };
      this.checkpoints.set(checkpointId, checkpoint);
      this.messageIdToCheckpointId.set(messageId, checkpointId);
    }

    // Only checkpoint if file exists and not already checkpointed in this message
    if (checkpoint.files.has(filePath)) {
      return; // Already checkpointed in this message
    }

    try {
      const content = await fs.readFile(filePath, 'utf-8');
      checkpoint.files.set(filePath, content);
    } catch (error) {
      // File doesn't exist or can't be read - that's ok
      // We'll note it as empty string to indicate file didn't exist
      if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
        checkpoint.files.set(filePath, '');
      }
    }

    // Enforce max checkpoints
    this.enforceMaxCheckpoints();
  }

  /**
   * Create checkpoints for multiple files
   */
  async checkpointFiles(
    filePaths: string[],
    messageId: UUID
  ): Promise<void> {
    await Promise.all(
      filePaths.map((filePath) => this.checkpointFile(filePath, messageId))
    );
  }

  /**
   * Rewind files to their state at or before a specific message
   */
  async rewindFiles(
    messageId: UUID,
    options?: { dryRun?: boolean }
  ): Promise<RewindFilesResult> {
    const filesToRestore = new Map<string, string>();

    // Find all checkpoints at or before the message ID
    const checkpointIds = Array.from(this.checkpoints.keys()).filter((id) => {
      const checkpoint = this.checkpoints.get(id)!;
      return checkpoint.messageId === messageId;
    });

    if (checkpointIds.length === 0) {
      return {
        filesRestored: [],
        filesToRestore: [],
        count: 0,
      };
    }

    // Collect all files from these checkpoints
    for (const checkpointId of checkpointIds) {
      const checkpoint = this.checkpoints.get(checkpointId)!;
      for (const [filePath, content] of Array.from(checkpoint.files.entries())) {
        // Only add if not already present (later checkpoints override earlier ones)
        if (!filesToRestore.has(filePath)) {
          filesToRestore.set(filePath, content);
        }
      }
    }

    const filePaths = Array.from(filesToRestore.keys());

    if (options?.dryRun) {
      return {
        filesRestored: [],
        filesToRestore: filePaths,
        count: 0,
      };
    }

    // Restore files
    const restored: string[] = [];
    for (const [filePath, content] of Array.from(filesToRestore.entries())) {
      try {
        if (content === '') {
          // File didn't exist, delete it if it exists now
          try {
            await fs.unlink(filePath);
          } catch {
            // File doesn't exist, which is fine
          }
        } else {
          // Restore file content
          await fs.writeFile(filePath, content, 'utf-8');
        }
        restored.push(filePath);
      } catch (error) {
        // Log error but continue with other files
        console.error(`Failed to restore file ${filePath}:`, error);
      }
    }

    return {
      filesRestored: restored,
      filesToRestore: filePaths,
      count: restored.length,
    };
  }

  /**
   * Get all checkpoints
   */
  getCheckpoints(): Map<UUID, FileCheckpoint> {
    return new Map(this.checkpoints);
  }

  /**
   * Get checkpoints for a specific message
   */
  getCheckpointForMessage(messageId: UUID): FileCheckpoint | undefined {
    const checkpointId = this.messageIdToCheckpointId.get(messageId);
    if (checkpointId) {
      return this.checkpoints.get(checkpointId);
    }
    return undefined;
  }

  /**
   * Get all file paths that have been checkpointed
   */
  getCheckpointedFiles(): Set<string> {
    const files = new Set<string>();
    for (const checkpoint of Array.from(this.checkpoints.values())) {
      for (const filePath of Array.from(checkpoint.files.keys())) {
        files.add(filePath);
      }
    }
    return files;
  }

  /**
   * Clear all checkpoints
   */
  clearCheckpoints(): void {
    this.checkpoints.clear();
    this.messageIdToCheckpointId.clear();
  }

  /**
   * Clear checkpoints for a specific message
   */
  clearCheckpointsForMessage(messageId: UUID): void {
    const checkpointId = this.messageIdToCheckpointId.get(messageId);
    if (checkpointId) {
      this.checkpoints.delete(checkpointId);
      this.messageIdToCheckpointId.delete(messageId);
    }
  }

  /**
   * Get checkpoint statistics
   */
  getStats(): {
    totalCheckpoints: number;
    totalFiles: number;
    oldestCheckpoint: number | null;
    newestCheckpoint: number | null;
  } {
    let totalFiles = 0;
    let oldest: number | null = null;
    let newest: number | null = null;

    for (const checkpoint of Array.from(this.checkpoints.values())) {
      totalFiles += checkpoint.files.size;
      if (oldest === null || checkpoint.timestamp < oldest) {
        oldest = checkpoint.timestamp;
      }
      if (newest === null || checkpoint.timestamp > newest) {
        newest = checkpoint.timestamp;
      }
    }

    return {
      totalCheckpoints: this.checkpoints.size,
      totalFiles,
      oldestCheckpoint: oldest,
      newestCheckpoint: newest,
    };
  }

  /**
   * Serialize checkpoints to JSON (for session persistence)
   */
  serialize(): string {
    const serialized = Array.from(this.checkpoints.entries()).map(
      ([messageId, checkpoint]) => [
        messageId,
        {
          messageId: checkpoint.messageId,
          files: Array.from(checkpoint.files.entries()),
          timestamp: checkpoint.timestamp,
        },
      ]
    );

    return JSON.stringify(serialized);
  }

  /**
   * Deserialize checkpoints from JSON (for session resume)
   */
  static deserialize(data: string): FileCheckpointManager {
    const manager = new FileCheckpointManager();

    try {
      const parsed = JSON.parse(data) as Array<
        [UUID, { messageId: UUID; files: [string, string][]; timestamp: number }]
      >;

      for (const [checkpointId, checkpointData] of parsed) {
        const checkpoint: FileCheckpoint = {
          messageId: checkpointData.messageId,
          files: new Map(checkpointData.files),
          timestamp: checkpointData.timestamp,
        };

        manager.checkpoints.set(checkpointId, checkpoint);
        manager.messageIdToCheckpointId.set(
          checkpointData.messageId,
          checkpointId
        );
      }
    } catch (error) {
      console.error('Failed to deserialize file checkpoints:', error);
    }

    return manager;
  }

  /**
   * Enforce maximum number of checkpoints
   * Removes oldest checkpoints if limit exceeded
   */
  private enforceMaxCheckpoints(): void {
    if (this.checkpoints.size <= this.options.maxCheckpoints) {
      return;
    }

    // Sort checkpoints by timestamp (oldest first)
    const sortedCheckpoints = Array.from(this.checkpoints.entries()).sort(
      (a, b) => a[1].timestamp - b[1].timestamp
    );

    // Remove oldest checkpoints
    const toRemove = sortedCheckpoints.length - this.options.maxCheckpoints;
    for (let i = 0; i < toRemove; i++) {
      const [checkpointId, checkpoint] = sortedCheckpoints[i];
      this.checkpoints.delete(checkpointId);
      this.messageIdToCheckpointId.delete(checkpoint.messageId);
    }
  }
}
