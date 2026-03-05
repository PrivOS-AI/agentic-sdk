/**
 * Model information
 */
export interface ModelInfo {
  /** Display name */
  name: string;

  /** Model identifier */
  model_id: string;

  /** Model capabilities */
  capabilities: string[];

  /** Pricing information */
  pricing: {
    input: number;
    output: number;
  };
}

/**
 * Account information
 */
export interface AccountInfo {
  /** API key source */
  apiKeySource: string;
}
