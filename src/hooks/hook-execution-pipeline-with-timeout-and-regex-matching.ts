import type {
  HookEvent,
  HookCallbackMatcher,
  HookInput,
  HookJSONOutput,
} from '../types/hooks.js';

/**
 * Default timeout for hook execution (60 seconds)
 */
const DEFAULT_HOOK_TIMEOUT = 60000;

/**
 * Hook executor - runs hooks with timeout and regex matching support
 */
export class HookExecutor {
  private hooks: Partial<Record<HookEvent, HookCallbackMatcher[]>>;

  constructor(hooks: Partial<Record<HookEvent, HookCallbackMatcher[]>> = {}) {
    this.hooks = hooks;
  }

  /**
   * Execute hooks for a specific event
   * @param event - Hook event type
   * @param input - Hook input data
   * @param toolName - Tool name for regex matching (optional)
   * @param abortSignal - AbortSignal for cancellation
   * @returns Array of hook outputs
   */
  async execute(
    event: HookEvent,
    input: HookInput,
    toolName?: string,
    abortSignal?: AbortSignal
  ): Promise<HookJSONOutput[]> {
    const matchers = this.hooks[event];
    if (!matchers || matchers.length === 0) {
      return [];
    }

    const results: HookJSONOutput[] = [];

    for (const matcher of matchers) {
      // Check regex matcher if provided and toolName is available
      if (matcher.matcher && toolName) {
        if (!matcher.matcher.test(toolName)) {
          continue; // Skip this matcher if regex doesn't match
        }
      }

      // Execute all hooks in this matcher
      for (const hook of matcher.hooks) {
        try {
          const result = await this.executeHookWithTimeout(
            hook,
            input,
            matcher.timeout || DEFAULT_HOOK_TIMEOUT,
            abortSignal
          );
          results.push(result);
        } catch (error) {
          // Log hook error but continue pipeline
          console.error(
            `[HookExecutor] Hook execution failed for ${event}:`,
            error instanceof Error ? error.message : String(error)
          );
          // Add error result to maintain result order
          results.push({
            hookSpecificOutput: {
              error: error instanceof Error ? error.message : String(error),
            },
          });
        }
      }
    }

    return results;
  }

  /**
   * Execute a single hook with timeout
   */
  private async executeHookWithTimeout(
    hook: (input: HookInput, signal?: AbortSignal) => Promise<HookJSONOutput>,
    input: HookInput,
    timeout: number,
    abortSignal?: AbortSignal
  ): Promise<HookJSONOutput> {
    // Create abort controller for timeout
    const timeoutController = new AbortController();
    const timeoutId = setTimeout(() => timeoutController.abort(), timeout);

    // Combine signals - abort if either signal is triggered
    const combinedSignal = this.combineSignals(abortSignal, timeoutController.signal);

    try {
      const result = await hook(input, combinedSignal);
      return result;
    } finally {
      clearTimeout(timeoutId);
    }
  }

  /**
   * Combine multiple abort signals
   */
  private combineSignals(...signals: (AbortSignal | undefined)[]): AbortSignal | undefined {
    const validSignals = signals.filter((s): s is AbortSignal => s !== undefined);

    if (validSignals.length === 0) {
      return undefined;
    }

    if (validSignals.length === 1) {
      return validSignals[0];
    }

    // Multiple signals - create a combined controller
    const combinedController = new AbortController();

    for (const signal of validSignals) {
      if (signal.aborted) {
        combinedController.abort();
        break;
      }

      signal.addEventListener('abort', () => {
        combinedController.abort();
      }, { once: true });
    }

    return combinedController.signal;
  }

  /**
   * Check if any hooks are registered for an event
   */
  hasHooks(event: HookEvent): boolean {
    const matchers = this.hooks[event];
    return matchers !== undefined && matchers.length > 0;
  }

  /**
   * Get all registered events
   */
  getRegisteredEvents(): HookEvent[] {
    return Object.keys(this.hooks) as HookEvent[];
  }
}
