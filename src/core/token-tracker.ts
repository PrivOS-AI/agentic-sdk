/**
 * Model pricing per million tokens (USD)
 * Updated for Claude 4.6 models
 */
export interface ModelPricing {
  input: number;
  output: number;
}

const MODEL_PRICING: Record<string, ModelPricing> = {
  'claude-opus-4-6': { input: 5, output: 25 },
  'claude-sonnet-4-6': { input: 3, output: 15 },
  'claude-haiku-4-5-20251001': { input: 1, output: 5 },
  'claude-3-5-opus-20241022': { input: 3, output: 15 },
  'claude-3-5-sonnet-20241022': { input: 3, output: 15 },
  'claude-3-5-haiku-20241022': { input: 0.8, output: 4 },
  'claude-3-opus-20240229': { input: 15, output: 75 },
  'claude-3-sonnet-20240229': { input: 3, output: 15 },
  'claude-3-haiku-20240307': { input: 0.25, output: 1.25 },
};

/**
 * Token usage per turn
 */
export interface TurnUsage {
  input_tokens: number;
  output_tokens: number;
  cache_creation_input_tokens?: number;
  cache_read_input_tokens?: number;
}

/**
 * Model usage summary
 */
export interface ModelUsage {
  input_tokens: number;
  output_tokens: number;
  cost_usd: number;
}

/**
 * Token and cost tracking for agentic loop
 */
export class TokenTracker {
  private totalCostUsd: number = 0;
  private totalTurns: number = 0;
  private modelUsage: Map<string, ModelUsage> = new Map();
  private currentTurnCost: number = 0;

  /**
   * Track usage from a single API response
   */
  trackResponse(model: string, usage: TurnUsage): void {
    const pricing = MODEL_PRICING[model] || MODEL_PRICING['claude-sonnet-4-6'];

    const inputCost = (usage.input_tokens / 1_000_000) * pricing.input;
    const outputCost = (usage.output_tokens / 1_000_000) * pricing.output;
    const cacheCreationCost = usage.cache_creation_input_tokens
      ? (usage.cache_creation_input_tokens / 1_000_000) * pricing.input
      : 0;
    const cacheReadCost = usage.cache_read_input_tokens
      ? (usage.cache_read_input_tokens / 1_000_000) * pricing.input * 0.1 // 90% discount for cache reads
      : 0;

    const turnCost = inputCost + outputCost + cacheCreationCost + cacheReadCost;
    this.currentTurnCost = turnCost;
    this.totalCostUsd += turnCost;
    this.totalTurns += 1;

    // Track per-model usage
    if (!this.modelUsage.has(model)) {
      this.modelUsage.set(model, {
        input_tokens: 0,
        output_tokens: 0,
        cost_usd: 0,
      });
    }

    const modelStats = this.modelUsage.get(model)!;
    modelStats.input_tokens += usage.input_tokens;
    modelStats.output_tokens += usage.output_tokens;
    modelStats.cost_usd += turnCost;
  }

  /**
   * Get total cost in USD
   */
  getTotalCostUsd(): number {
    return this.totalCostUsd;
  }

  /**
   * Get total number of turns
   */
  getTotalTurns(): number {
    return this.totalTurns;
  }

  /**
   * Get current turn cost
   */
  getCurrentTurnCost(): number {
    return this.currentTurnCost;
  }

  /**
   * Check if over budget
   */
  isOverBudget(maxBudgetUsd?: number): boolean {
    if (maxBudgetUsd === undefined) {
      return false;
    }
    return this.totalCostUsd > maxBudgetUsd;
  }

  /**
   * Get per-model usage summary
   */
  getModelUsage(): Record<string, ModelUsage> {
    return Object.fromEntries(this.modelUsage);
  }

  /**
   * Reset tracker state
   */
  reset(): void {
    this.totalCostUsd = 0;
    this.totalTurns = 0;
    this.currentTurnCost = 0;
    this.modelUsage.clear();
  }

  /**
   * Get pricing for a model
   */
  static getModelPricing(model: string): ModelPricing {
    return MODEL_PRICING[model] || MODEL_PRICING['claude-sonnet-4-6'];
  }

  /**
   * Get all available models
   */
  static getAvailableModels(): string[] {
    return Object.keys(MODEL_PRICING);
  }
}
