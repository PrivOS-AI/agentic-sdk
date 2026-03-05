/**
 * Retry configuration and statistics types
 */

/**
 * Retry configuration options
 */
export interface RetryOptions {
  /** Maximum number of retry attempts (default: 3) */
  maxRetries?: number;

  /** Initial delay before first retry in milliseconds (default: 1000) */
  initialDelay?: number;

  /** Maximum delay between retries in milliseconds (default: 30000) */
  maxDelay?: number;

  /** Multiplier for exponential backoff (default: 2) */
  backoffMultiplier?: number;

  /** Whether to add random jitter to prevent thundering herd (default: true) */
  jitter?: boolean;

  /** Custom function to determine if an error is retryable */
  isRetryable?: (error: unknown) => boolean;
}

/**
 * Retry statistics
 */
export interface RetryStats {
  /** Number of retry attempts made */
  attempts: number;

  /** Total delay time in milliseconds across all retries */
  totalDelayMs: number;

  /** Whether the operation ultimately succeeded */
  succeeded: boolean;

  /** Final error if all retries exhausted */
  finalError?: Error;

  /** Array of errors from each attempt */
  errors: Array<{ attempt: number; error: unknown; delay: number }>;
}

/**
 * Default retry configuration
 */
export const DEFAULT_RETRY_OPTIONS: Required<RetryOptions> = {
  maxRetries: 3,
  initialDelay: 1000,
  maxDelay: 30000,
  backoffMultiplier: 2,
  jitter: true,
  isRetryable: () => false, // Will be overridden
};

/**
 * Check if an error is retryable
 * @param error - Error to check
 * @returns True if error is retryable
 */
export function isRetryableError(error: unknown): boolean {
  // Try to extract error status
  let status: number | undefined;
  let errorType: string | undefined;

  if (error && typeof error === 'object') {
    if ('status' in error) {
      status = error.status as number;
    }
    if ('type' in error) {
      errorType = error.type as string;
    }
    if ('error' in error && typeof error.error === 'object') {
      const nestedError = error.error as Record<string, unknown>;
      if ('status' in nestedError) {
        status = nestedError.status as number;
      }
      if ('type' in nestedError) {
        errorType = nestedError.type as string;
      }
    }
  }

  // Rate limit errors (429) - always retryable
  if (status === 429) {
    return true;
  }

  // Server errors (5xx) - retryable
  if (status && status >= 500 && status < 600) {
    return true;
  }

  // Network errors (ECONNRESET, ETIMEDOUT, ENOTFOUND)
  if (error instanceof Error) {
    const errorCode = (error as NodeJS.ErrnoException).code;
    if (
      errorCode === 'ECONNRESET' ||
      errorCode === 'ETIMEDOUT' ||
      errorCode === 'ENOTFOUND' ||
      errorCode === 'ECONNREFUSED' ||
      errorCode === 'EAI_AGAIN'
    ) {
      return true;
    }

    // Timeout errors
    if (error.message.includes('timeout') || error.message.includes('timed out')) {
      return true;
    }
  }

  // Specific error types
  if (errorType === 'rate_limit_error' || errorType === 'timeout_error') {
    return true;
  }

  // Model availability errors
  if (error instanceof Error && error.message.includes('overloaded')) {
    return true;
  }

  // Default: not retryable
  return false;
}
