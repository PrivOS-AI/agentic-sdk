import * as fs from 'fs/promises';
import * as path from 'path';

/**
 * Debug logger for agentic-sdk
 * Provides console and file logging with timestamps
 */
export class DebugLogger {
  private enabled: boolean;
  private filePath?: string;
  private fileHandle?: fs.FileHandle;
  private startTime: number;

  /**
   * Create a new debug logger
   * @param enabled - Whether debug logging is enabled
   * @param filePath - Optional file path to write logs to
   */
  constructor(enabled: boolean, filePath?: string) {
    this.enabled = enabled;
    this.filePath = filePath;
    this.startTime = Date.now();
  }

  /**
   * Initialize the logger (opens file handle if needed)
   */
  async init(): Promise<void> {
    if (!this.enabled || !this.filePath) {
      return;
    }

    try {
      // Ensure directory exists
      const dir = path.dirname(this.filePath);
      await fs.mkdir(dir, { recursive: true });

      // Open file in append mode
      this.fileHandle = await fs.open(this.filePath, 'a');
    } catch (error) {
      console.error('[DebugLogger] Failed to initialize file logging:', error);
      // Fallback to console only
      this.fileHandle = undefined;
    }
  }

  /**
   * Log a debug message
   * @param message - The message to log
   * @param data - Optional data to log (will be JSON stringified)
   */
  async log(message: string, data?: unknown): Promise<void> {
    if (!this.enabled) {
      return;
    }

    const timestamp = new Date().toISOString();
    const elapsed = Date.now() - this.startTime;
    const logEntry = this.formatLogEntry(timestamp, elapsed, 'DEBUG', message, data);

    // Write to console
    console.log(logEntry);

    // Write to file if configured
    if (this.fileHandle) {
      try {
        await this.fileHandle.write(logEntry + '\n');
      } catch (error) {
        console.error('[DebugLogger] Failed to write to log file:', error);
      }
    }
  }

  /**
   * Log an error message
   * @param message - The error message
   * @param error - Optional error object
   */
  async error(message: string, error?: Error): Promise<void> {
    if (!this.enabled) {
      return;
    }

    const timestamp = new Date().toISOString();
    const elapsed = Date.now() - this.startTime;
    const errorData = error ? {
      message: error.message,
      stack: error.stack,
      name: error.name,
    } : undefined;
    const logEntry = this.formatLogEntry(timestamp, elapsed, 'ERROR', message, errorData);

    // Write to console
    console.error(logEntry);

    // Write to file if configured
    if (this.fileHandle) {
      try {
        await this.fileHandle.write(logEntry + '\n');
      } catch (writeError) {
        console.error('[DebugLogger] Failed to write error to log file:', writeError);
      }
    }
  }

  /**
   * Format a log entry with timestamp and structured data
   */
  private formatLogEntry(
    timestamp: string,
    elapsed: number,
    level: string,
    message: string,
    data?: unknown
  ): string {
    const elapsedStr = `${elapsed.toFixed(0).padStart(6, '0')}ms`;
    const baseEntry = `[${timestamp}] [${elapsedStr}] [${level}] ${message}`;

    if (data !== undefined) {
      try {
        const dataStr = typeof data === 'string' ? data : JSON.stringify(data, null, 2);
        return `${baseEntry}\n${dataStr}`;
      } catch (error) {
        return `${baseEntry}\n[Cannot serialize data: ${error}]`;
      }
    }

    return baseEntry;
  }

  /**
   * Close the logger and release resources
   */
  async close(): Promise<void> {
    if (this.fileHandle) {
      try {
        await this.fileHandle.close();
        this.fileHandle = undefined;
      } catch (error) {
        console.error('[DebugLogger] Failed to close log file:', error);
      }
    }
  }

  /**
   * Check if debug logging is enabled
   */
  isEnabled(): boolean {
    return this.enabled;
  }
}
