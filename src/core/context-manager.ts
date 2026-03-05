import { ConversationState } from './conversation-state.js';

/**
 * Context window sizes for different models
 */
const CONTEXT_WINDOWS: Record<string, number> = {
  'claude-opus-4-6': 200_000,
  'claude-sonnet-4-6': 200_000,
  'claude-haiku-4-5-20251001': 200_000,
  'claude-3-5-opus-20241022': 200_000,
  'claude-3-5-sonnet-20241022': 200_000,
  'claude-3-5-haiku-20241022': 200_000,
  'claude-3-opus-20240229': 200_000,
  'claude-3-sonnet-20240229': 200_000,
  'claude-3-haiku-20240307': 200_000,
};

/**
 * Default context window if model not found
 */
const DEFAULT_CONTEXT_WINDOW = 200_000;

/**
 * Threshold for triggering compaction (80% of context window)
 */
const COMPACTION_THRESHOLD = 0.8;

/**
 * Estimate token count for text (rough approximation: 1 token ≈ 4 chars)
 */
function estimateTokens(text: string): number {
  return Math.ceil(text.length / 4);
}

/**
 * Estimate tokens in a message
 */
function estimateMessageTokens(message: unknown): number {
  if (typeof message === 'string') {
    return estimateTokens(message);
  }

  if (typeof message === 'object' && message !== null) {
    let total = 0;
    for (const value of Object.values(message)) {
      if (typeof value === 'string') {
        total += estimateTokens(value);
      } else if (Array.isArray(value)) {
        total += estimateMessageTokens(value);
      } else if (typeof value === 'object' && value !== null) {
        total += estimateMessageTokens(value);
      }
    }
    return total;
  }

  return 0;
}

/**
 * Context window management with auto-compaction
 */
export class ContextManager {
  private model: string;
  private contextWindow: number;
  private compactionThreshold: number;

  constructor(model: string, threshold: number = COMPACTION_THRESHOLD) {
    this.model = model;
    this.contextWindow = CONTEXT_WINDOWS[model] || DEFAULT_CONTEXT_WINDOW;
    this.compactionThreshold = threshold;
  }

  /**
   * Estimate current token count in conversation
   */
  estimateConversationTokens(conversation: ConversationState): number {
    const messages = conversation.getMessages();
    let total = 0;

    for (const message of messages) {
      total += estimateMessageTokens(message);
    }

    return total;
  }

  /**
   * Check if compaction is needed
   */
  needsCompaction(conversation: ConversationState): boolean {
    const estimated = this.estimateConversationTokens(conversation);
    const threshold = this.contextWindow * this.compactionThreshold;
    return estimated > threshold;
  }

  /**
   * Get context window size for current model
   */
  getContextWindow(): number {
    return this.contextWindow;
  }

  /**
   * Get compaction threshold
   */
  getCompactionThreshold(): number {
    return this.contextWindow * this.compactionThreshold;
  }

  /**
   * Get current model
   */
  getModel(): string {
    return this.model;
  }

  /**
   * Update model
   */
  setModel(model: string): void {
    // Update context window based on new model
    this.model = model;
    this.contextWindow = CONTEXT_WINDOWS[model] || DEFAULT_CONTEXT_WINDOW;
  }

  /**
   * Get available context for next response
   */
  getAvailableContext(conversation: ConversationState): number {
    const used = this.estimateConversationTokens(conversation);
    return Math.max(0, this.contextWindow - used);
  }
}
