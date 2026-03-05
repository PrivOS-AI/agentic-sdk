/**
 * Retry Manager with Exponential Backoff
 * Handles automatic retry with exponential backoff for transient errors
 */

import type { RetryOptions, RetryStats } from '../types/retry.js';
import { isRetryableError, DEFAULT_RETRY_OPTIONS } from '../types/retry.js';

/**
 * Retry Manager class
 * Manages retry logic with exponential backoff and jitter
 */
export class RetryManager {
  private config: Required<RetryOptions>;

  constructor(options?: RetryOptions) {
    this.config = {
      ...DEFAULT_RETRY_OPTIONS,
      ...options,
      isRetryable: options?.isRetryable || isRetryableError,
    };
  }

  /**
   * Execute an async function with retry logic
   *
   * @param fn - Async function to execute
   * @returns Result with retry statistics
   */
  async executeWithRetry<T>(
    fn: () => Promise<T>
  ): Promise<{ result: T; stats: RetryStats }> {
    const stats: RetryStats = {
      attempts: 0,
      totalDelayMs: 0,
      succeeded: false,
      errors: [],
    };

    let lastError: unknown;

    for (let attempt = 0; attempt <= this.config.maxRetries; attempt++) {
      stats.attempts = attempt + 1;

      try {
        const result = await fn();

        stats.succeeded = true;

        // Log success after retries
        if (attempt > 0) {
          console.log(
            `[RetryManager] Operation succeeded after ${attempt} ${attempt === 1 ? 'retry' : 'retries'} ` +
              `(total delay: ${stats.totalDelayMs}ms)`
          );
        }

        return { result, stats };
      } catch (error) {
        lastError = error;

        // Check if we should retry this error
        const canRetry = attempt < this.config.maxRetries && this.config.isRetryable(error);

        if (!canRetry) {
          // Either max retries reached or error is not retryable
          stats.finalError = error instanceof Error ? error : new Error(String(error));
          stats.errors.push({
            attempt: attempt + 1,
            error,
            delay: 0,
          });

          // Log non-retryable error or max retries reached
          if (!this.config.isRetryable(error)) {
            console.error(`[RetryManager] Non-retryable error:`, error);
          } else if (attempt >= this.config.maxRetries) {
            console.error(
              `[RetryManager] Max retries (${this.config.maxRetries}) reached. Last error:`,
              error
            );
          }

          break;
        }

        // Calculate delay for next retry
        const delay = this.calculateDelay(attempt);

        stats.totalDelayMs += delay;
        stats.errors.push({
          attempt: attempt + 1,
          error,
          delay,
        });

        // Log retry attempt
        console.warn(
          `[RetryManager] Attempt ${attempt + 1} failed. Retrying in ${delay}ms...`,
          error instanceof Error ? error.message : String(error)
        );

        // Wait before next retry
        await this.delay(delay);
      }
    }

    // All retries exhausted
    stats.finalError = lastError instanceof Error ? lastError : new Error(String(lastError));

    throw new RetryError('Operation failed after retries', stats, lastError);
  }

  /**
   * Calculate delay for retry attempt with exponential backoff and jitter
   *
   * @param attempt - Attempt number (0-indexed)
   * @returns Delay in milliseconds
   */
  private calculateDelay(attempt: number): number {
    // Exponential backoff: initialDelay * (backoffMultiplier ^ attempt)
    let delay = this.config.initialDelay * Math.pow(this.config.backoffMultiplier, attempt);

    // Cap at max delay
    delay = Math.min(delay, this.config.maxDelay);

    // Add jitter if enabled (±50% of delay)
    if (this.config.jitter) {
      const jitterAmount = delay * 0.5;
      const randomOffset = Math.random() * jitterAmount - (jitterAmount / 2);
      delay = delay + randomOffset;
    }

    return Math.floor(delay);
  }

  /**
   * Delay execution for specified milliseconds
   *
   * @param ms - Milliseconds to delay
   */
  private async delay(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }

  /**
   * Update retry configuration
   *
   * @param options - New retry options
   */
  updateConfig(options: Partial<RetryOptions>): void {
    this.config = {
      ...this.config,
      ...options,
    };
  }

  /**
   * Get current configuration
   */
  getConfig(): Required<RetryOptions> {
    return { ...this.config };
  }
}

/**
 * Retry Error
 * Thrown when all retry attempts are exhausted
 */
export class RetryError extends Error {
  public readonly stats: RetryStats;
  public readonly originalError: unknown;

  constructor(message: string, stats: RetryStats, originalError: unknown) {
    super(message);
    this.name = 'RetryError';
    this.stats = stats;
    this.originalError = originalError;
  }

  /**
   * Get summary of retry attempts
   */
  getSummary(): string {
    return (
      `Failed after ${this.stats.attempts} ${this.stats.attempts === 1 ? 'attempt' : 'attempts'} ` +
      `(${this.stats.totalDelayMs}ms total delay)`
    );
  }
}
