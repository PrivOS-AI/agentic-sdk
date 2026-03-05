import Anthropic from '@anthropic-ai/sdk';
import type { AnthropicMessage, UUID, SDKMessage, SDKStatusMessage } from '../types/messages.js';
import type { ThinkingConfig } from '../types/options.js';
import type { HookCallbackMatcher, HookEvent } from '../types/hooks.js';
import { ConversationState } from './conversation-state.js';
import { TokenTracker } from './token-tracker.js';
import { ContextManager } from './context-manager.js';
import { HookExecutor } from '../hooks/hook-execution-pipeline-with-timeout-and-regex-matching.js';
import { buildSessionStartInput, buildStopInput, buildPreCompactInput } from '../hooks/hook-event-registry-and-type-guards.js';
import { ToolRegistryManager, type ToolContext } from '../tools/tool-registry-manager.js';
import { executeToolUse, type HookCallbacks, type PermissionCheckerFunction, type ToolUseBlock } from '../tools/tool-execution-engine.js';
import { RetryManager } from './retry-manager-with-exponential-backoff.js';


/**
 * Check if an error is retryable with a fallback model
 * Retryable: rate limits, server errors, model availability, network timeouts
 * Non-retryable: validation errors, authentication errors, permission errors
 */
function isRetryableError(error: unknown): boolean {
  // Try to extract error status
  let status: number | undefined;
  let errorType: string | undefined;

  if (error && typeof error === 'object') {
    // Check for API error with status code
    if ('status' in error) {
      status = error.status as number;
    }
    if ('type' in error) {
      errorType = error.type as string;
    }

    // Check for nested error property
    if ('error' in error) {
      const nestedError = (error as { error: unknown }).error;
      if (nestedError && typeof nestedError === 'object') {
        if ('status' in nestedError) {
          status = nestedError.status as number;
        }
        if ('type' in nestedError) {
          errorType = nestedError.type as string;
        }
      }
    }
  }

  // Check for specific error types
  if (errorType === 'error' || errorType === 'invalid_request_error') {
    // Validation errors - don't retry
    return false;
  }

  // Check HTTP status codes
  if (status) {
    // Retry on rate limits (429)
    if (status === 429) {
      return true;
    }

    // Retry on server errors (500, 502, 503, 504)
    if (status >= 500 && status < 600) {
      return true;
    }

    // Don't retry on client errors (except 429)
    if (status >= 400 && status < 500 && status !== 429) {
      return false;
    }
  }

  // Check error message for specific patterns
  const errorMessage = error instanceof Error ? error.message : String(error);

  // Retry on model availability issues
  if (
    errorMessage.includes('model not available') ||
    errorMessage.includes('model not found') ||
    errorMessage.includes('overloaded') ||
    errorMessage.includes('timeout')
  ) {
    return true;
  }

  // Don't retry on authentication/permission issues
  if (
    errorMessage.includes('authentication') ||
    errorMessage.includes('unauthorized') ||
    errorMessage.includes('forbidden') ||
    errorMessage.includes('permission') ||
    errorMessage.includes('invalid api key')
  ) {
    return false;
  }

  // Default: don't retry for unknown errors
  return false;
}

/**
 * Agentic loop configuration
 */
interface AgenticLoopConfig {
  apiKey: string;
  baseURL?: string;
  model: string;
  /** Fallback model to use if primary model fails */
  fallbackModel?: string;
  systemPrompt?: string;
  thinking?: ThinkingConfig;
  maxTurns: number;
  maxBudgetUsd?: number;
  abortSignal?: AbortSignal;
  allowedTools?: string[];
  disallowedTools?: string[];
  includePartialMessages: boolean;
  onMessage?: (message: AnthropicMessage) => void;
  /** Hook callbacks for lifecycle events */
  hooks?: Partial<Record<HookEvent, HookCallbackMatcher[]>>;
  /** Session ID for hook events */
  sessionId?: string;
  /** Tool registry for tool execution */
  toolRegistry?: ToolRegistryManager;
  /** Permission checker for tool use */
  checkPermissions?: PermissionCheckerFunction;
  /** Parent tool use ID for subagent tracking */
  parentToolUseId?: UUID;
  /** Tool execution context (cwd, sessionId, permissionMode) */
  toolContext?: ToolContext;
  /** Retry configuration for error recovery */
  retryOptions?: import('../types/retry.js').RetryOptions;
}

/**
 * Agentic loop result
 */
export interface AgenticLoopResult {
  success: boolean;
  reason?: 'completed' | 'interrupted' | 'error' | 'max_turns' | 'budget_exceeded';
  error?: Error;
  finalMessage?: AnthropicMessage;
}

/**
 * Core agentic loop implementation
 * Executes Claude agent with tool use loop
 */
export async function* agenticLoop(
  conversation: ConversationState,
  config: AgenticLoopConfig
): AsyncGenerator<AnthropicMessage | SDKMessage | AgenticLoopResult, unknown> {
  console.log('[AgenticLoop] FUNCTION ENTRY - agenticLoop called');

  const {
    apiKey,
    model,
    systemPrompt,
    thinking,
    maxTurns,
    maxBudgetUsd,
    abortSignal,
    includePartialMessages,
    onMessage,
  } = config;

  // Use authToken for custom base URLs, apiKey for official Anthropic API
  const isCustomBaseURL = config.baseURL && !config.baseURL.includes('api.anthropic.com');

  const client = new Anthropic({
    [isCustomBaseURL ? 'authToken' : 'apiKey']: apiKey,
    baseURL: config.baseURL,
    // @ts-ignore - Add beta parameter for web_search support
    dangerouslyAllowBrowser: config.baseURL ? false : undefined,
  });
  const tokenTracker = new TokenTracker();
  const contextManager = new ContextManager(model);
  const hookExecutor = new HookExecutor(config.hooks);
  let turns = 0;

  try {
    // Emit session started status
    yield {
      type: 'status',
      status: 'Session started',
      details: {
        model,
        maxTurns,
        maxBudgetUsd,
        systemPrompt: systemPrompt ? 'configured' : 'none',
        thinking: thinking ? 'enabled' : 'disabled',
      },
    } as SDKStatusMessage;

    // Fire SessionStart hook
    if (hookExecutor.hasHooks('SessionStart') && config.sessionId) {
      const sessionStartInput = buildSessionStartInput(config.sessionId as any, {
        model,
        maxTurns,
        maxBudgetUsd,
        systemPrompt,
        thinking,
      });
      await hookExecutor.execute('SessionStart', sessionStartInput, undefined, abortSignal);
    }
    console.log('[AgenticLoop] Starting agentic loop, maxTurns:', maxTurns);
    while (turns < maxTurns) {
      console.log('[AgenticLoop] Turn:', turns, 'of', maxTurns);
      // Check abort signal
      if (abortSignal?.aborted) {
        // Fire Stop hook on interruption
        if (hookExecutor.hasHooks('Stop')) {
          const stopInput = buildStopInput('interrupted');
          await hookExecutor.execute('Stop', stopInput, undefined, abortSignal);
        }

        return {
          success: false,
          reason: 'interrupted',
          error: new Error('Query interrupted by user'),
        };
      }

      // Check budget
      if (tokenTracker.isOverBudget(maxBudgetUsd)) {
        return {
          success: false,
          reason: 'budget_exceeded',
          error: new Error(`Budget exceeded: $${tokenTracker.getTotalCostUsd().toFixed(2)} / $${maxBudgetUsd?.toFixed(2)}`),
        };
      }

      // Check compaction
      if (contextManager.needsCompaction(conversation)) {
        // Fire PreCompact hook
        if (hookExecutor.hasHooks('PreCompact')) {
          const messageCount = conversation.getMessages().length;
          // Estimate tokens from message count (rough approximation: 1 message ~ 100 tokens average)
          const estimatedTokens = messageCount * 100;
          const preCompactInput = buildPreCompactInput(messageCount, estimatedTokens);
          await hookExecutor.execute('PreCompact', preCompactInput, undefined, abortSignal);
        } else {
          console.warn('[ContextManager] Conversation approaching context window limit');
        }
      }

      // Build request
      const messages = conversation.getMessages();
      const request: {
        model: string;
        messages: AnthropicMessage[];
        system?: string;
        thinking?: ThinkingConfig;
        max_tokens: number;
        tools?: Array<{
          name: string;
          description: string;
          input_schema: Record<string, unknown>;
        }>;
        betas?: string[];
      } = {
        model,
        messages,
        max_tokens: 4096,
      };

      if (systemPrompt) {
        request.system = systemPrompt;
      }

      if (thinking) {
        request.thinking = thinking;
      }

      // Add tools from tool registry
      if (config.toolRegistry) {
        const tools = config.toolRegistry.toFilteredAnthropicTools(
          config.allowedTools,
          config.disallowedTools
        );
        if (tools.length > 0) {
          request.tools = tools;
        }
      }

      // Detect server-side tools (tools with type like "web_search_20250305")
      // These tools are executed by the API, not locally
      const hasServerSideTools = request.tools?.some((tool: any) =>
        tool.type && typeof tool.type === 'string' && (
          tool.type.includes('web_search') ||
          tool.type.includes('computer') ||
          tool.type.includes('web_fetch')
        )
      );

      // Add betas parameter for server-side tool support
      if (hasServerSideTools) {
        // @ts-ignore - betas is not in standard types
        request.betas = ['web-search-2024-09-23', 'prompt-caching-2024-10-01'];
      }

      // Call API with fallback model support
      let response: AnthropicMessage;
      // let usedFallbackModel = false; // Reserved for future fallback model tracking

      try {
        if (includePartialMessages) {
          // Streaming mode
          // Note: Retry not applied to streaming mode to avoid complexity
          // Retry logic will only apply to non-streaming mode
          const stream = await client.messages.stream(request as any);

          for await (const event of stream) {
            if (event.type === 'content_block_delta') {
              const delta = event.delta as any;
              // Yield partial message with special marker
              const partialMessage = {
                role: 'assistant',
                content: [{
                  type: 'text',
                  text: delta?.text || '',
                }],
                _partial: true, // Marker for partial message
                _delta: delta, // Include full delta for tool_use/thinking
              } as AnthropicMessage;
              yield partialMessage;
            }
          }

          response = await stream.finalMessage();
        } else {
          // Non-streaming mode
          console.log('[AgenticLoop] Calling API with model:', model, 'request:', JSON.stringify(request).substring(0, 200));

          // Wrap API call with retry if configured
          const apiCall = async () => {
            return await client.messages.create(request as any);
          };

          let rawResponse;
          if (config.retryOptions) {
            // Create retry manager and execute with retry
            const retryManager = new RetryManager(config.retryOptions);
            const { result, stats } = await retryManager.executeWithRetry(apiCall);
            rawResponse = result;
            console.log(`[AgenticLoop] API call completed with ${stats.attempts} ${stats.attempts === 1 ? 'attempt' : 'attempts'}`);
          } else {
            // No retry, execute directly
            rawResponse = await apiCall();
          }

          console.log('[AgenticLoop] Raw API response:', JSON.stringify(rawResponse).substring(0, 300));

          // Transform OpenAI format to Anthropic format if needed
          if ('choices' in rawResponse) {
            console.log('[AgenticLoop] Detected OpenAI format, transforming to Anthropic format');
            const openaiResponse = rawResponse as any;
            const choice = openaiResponse.choices[0];
            const message = choice.message;

            // Build content array
            const content: any[] = [];

            // Add text content if present
            if (message.content) {
              content.push({
                type: 'text',
                text: message.content,
              });
            }

            // Add tool_use blocks if tool_calls present
            if (message.tool_calls && message.tool_calls.length > 0) {
              for (const toolCall of message.tool_calls) {
                content.push({
                  type: 'tool_use',
                  id: toolCall.id,
                  name: toolCall.function.name,
                  input: JSON.parse(toolCall.function.arguments),
                });
              }
            }

            response = {
              id: openaiResponse.id,
              type: 'message',
              role: message.role,
              content: content,
              model: openaiResponse.model,
              stop_reason: choice.finish_reason === 'tool_calls' ? 'tool_use' : choice.finish_reason,
              usage: openaiResponse.usage,
            } as any;
            console.log('[AgenticLoop] Transformed response:', JSON.stringify(response).substring(0, 300));
          } else {
            response = rawResponse;
          }
          console.log('[AgenticLoop] API response received, stop_reason:', response.stop_reason);
        }
      } catch (primaryError) {
        // Check if we should retry with fallback model
        if (config.fallbackModel && isRetryableError(primaryError)) {
          console.warn(
            `[AgenticLoop] Primary model "${model}" failed with retryable error:`,
            primaryError instanceof Error ? primaryError.message : String(primaryError)
          );
          console.log(`[AgenticLoop] Retrying with fallback model: ${config.fallbackModel}`);

          // Emit model fallback status
          yield {
            type: 'status',
            status: 'Switched to fallback model',
            details: {
              from: model,
              to: config.fallbackModel,
              reason: primaryError instanceof Error ? primaryError.message : String(primaryError),
            },
          } as SDKStatusMessage;

          // Update request with fallback model
          request.model = config.fallbackModel;
          // usedFallbackModel = true; // Reserved for future fallback model tracking

          try {
            if (includePartialMessages) {
              // Retry streaming with fallback model
              const stream = await client.messages.stream(request as any);

              for await (const event of stream) {
                if (event.type === 'content_block_delta') {
                  const delta = event.delta as any;
                  const partialMessage = {
                    role: 'assistant',
                    content: [{
                      type: 'text',
                      text: delta?.text || '',
                    }],
                    _partial: true,
                    _delta: delta,
                  } as AnthropicMessage;
                  yield partialMessage;
                }
              }

              response = await stream.finalMessage();
            } else {
              // Retry non-streaming with fallback model
              console.log(`[AgenticLoop] Retrying API call with fallback model: ${config.fallbackModel}`);
              let rawResponse = await client.messages.create(request as any);
              console.log('[AgenticLoop] Fallback model API response received');

              // Transform OpenAI format to Anthropic format if needed
              if ('choices' in rawResponse) {
                const openaiResponse = rawResponse as any;
                const choice = openaiResponse.choices[0];
                const message = choice.message;

                const content: any[] = [];
                if (message.content) {
                  content.push({ type: 'text', text: message.content });
                }
                if (message.tool_calls && message.tool_calls.length > 0) {
                  for (const toolCall of message.tool_calls) {
                    content.push({
                      type: 'tool_use',
                      id: toolCall.id,
                      name: toolCall.function.name,
                      input: JSON.parse(toolCall.function.arguments),
                    });
                  }
                }

                response = {
                  id: openaiResponse.id,
                  type: 'message',
                  role: message.role,
                  content: content,
                  model: openaiResponse.model,
                  stop_reason: choice.finish_reason === 'tool_calls' ? 'tool_use' : choice.finish_reason,
                  usage: openaiResponse.usage,
                } as any;
              } else {
                response = rawResponse;
              }
            }

            console.log(`[AgenticLoop] Successfully recovered using fallback model: ${config.fallbackModel}`);
          } catch (fallbackError) {
            // Fallback also failed, throw the original error
            console.error(
              `[AgenticLoop] Fallback model "${config.fallbackModel}" also failed:`,
              fallbackError instanceof Error ? fallbackError.message : String(fallbackError)
            );
            throw primaryError;
          }
        } else {
          // Either no fallback model or error is not retryable
          if (config.fallbackModel && !isRetryableError(primaryError)) {
            console.warn(
              `[AgenticLoop] Primary model failed but error is not retryable:`,
              primaryError instanceof Error ? primaryError.message : String(primaryError)
            );
          }
          throw primaryError;
        }
      }

      // Track usage
      if (response.usage) {
        tokenTracker.trackResponse(model, {
          input_tokens: response.usage.input_tokens,
          output_tokens: response.usage.output_tokens,
          cache_creation_input_tokens: response.usage.cache_creation_input_tokens,
          cache_read_input_tokens: response.usage.cache_read_input_tokens,
        });
      }

      // Add assistant message to conversation
      conversation.addAssistantMessage(response);
      yield response;

      // Call message callback
      if (onMessage) {
        onMessage(response);
      }

      // Check stop reason
      console.log('[AgenticLoop] Checking stop_reason:', response.stop_reason);
      if (response.stop_reason === 'end_turn') {
        // Fire Stop hook on completion
        if (hookExecutor.hasHooks('Stop')) {
          const stopInput = buildStopInput('completed');
          await hookExecutor.execute('Stop', stopInput, undefined, abortSignal);
        }

        return {
          success: true,
          reason: 'completed',
          finalMessage: response,
        };
      }

      if (response.stop_reason === 'tool_use') {
        console.log('[AgenticLoop] Tool use detected, extracting tool blocks');
        // Extract tool use blocks
        const toolUseBlocks = extractToolUseBlocks(response);
        console.log('[AgenticLoop] Extracted', toolUseBlocks.length, 'tool use blocks');

        if (toolUseBlocks.length === 0) {
          return {
            success: true,
            reason: 'completed',
            finalMessage: response,
          };
        }

        // Check if any tool is a server-side tool (web_search, computer, etc.)
        const hasServerSideTools = toolUseBlocks.some(toolUse =>
          toolUse.name === 'web_search' || toolUse.name === 'computer' || toolUse.name === 'web_fetch'
        );

        if (hasServerSideTools) {
          console.log('[AgenticLoop] Server-side tools detected:', toolUseBlocks.map(t => t.name));
          console.log('[AgenticLoop] Server-side tools detected, continuing conversation');
          // For server-side tools, add the assistant message to conversation and continue
          // The API will execute the tools and return results in the next response
          turns++;
          continue;
        }

        // Execute client-side tools
        console.log('[AgenticLoop] Executing client-side tools');
        const toolResults: Array<{
          tool_use_id: string;
          content: string | Array<unknown>;
          is_error?: boolean;
        }> = [];
        const observabilityMessages: SDKMessage[] = [];

        for (const toolUse of toolUseBlocks) {
          try {
            // Check if tool exists in registry
            const tool = config.toolRegistry?.get(toolUse.name);

            if (!tool) {
              toolResults.push({
                tool_use_id: toolUse.id,
                content: `Error: Tool not found: ${toolUse.name}`,
                is_error: true,
              });
              continue;
            }

            // Build hook callbacks
            const hookCallbacks: HookCallbacks = {
              onPreToolUse: async (input) => {
                if (hookExecutor.hasHooks('PreToolUse')) {
                  await hookExecutor.execute('PreToolUse', input, undefined, abortSignal);
                }
              },
              onPostToolUse: async (input) => {
                if (hookExecutor.hasHooks('PostToolUse')) {
                  await hookExecutor.execute('PostToolUse', input, undefined, abortSignal);
                }
              },
              onPostToolUseFailure: async (input) => {
                if (hookExecutor.hasHooks('PostToolUseFailure')) {
                  await hookExecutor.execute('PostToolUseFailure', input, undefined, abortSignal);
                }
              },
              onEmitMessage: async (message) => {
                // Collect observability messages (tool_progress, permission_denial)
                observabilityMessages.push(message);
              },
            };

            // Execute tool via executor
            const result = await executeToolUse(toolUse, tool, {
              hooks: hookCallbacks,
              checkPermissions: config.checkPermissions,
              parentToolUseId: config.parentToolUseId,
              toolContext: config.toolContext,
            });

            toolResults.push(result);
          } catch (error) {
            toolResults.push({
              tool_use_id: toolUse.id,
              content: error instanceof Error ? error.message : String(error),
              is_error: true,
            });
          }
        }

        // Yield observability messages (tool_progress, permission_denial)
        for (const obsMsg of observabilityMessages) {
          yield obsMsg;
        }

        // Add tool results to conversation
        conversation.addToolResults(toolResults);

        turns++;
        continue;
      }

      // Other stop reasons (max_tokens, stop_sequence)
      return {
        success: true,
        reason: 'completed',
        finalMessage: response,
      };
    }

    // Max turns reached
    return {
      success: false,
      reason: 'max_turns',
      error: new Error(`Maximum turns exceeded: ${maxTurns}`),
    };
  } catch (error) {
    // Log error for debugging
    console.error('[AgenticLoop] Error in agentic loop:', error);

    // Fire Stop hook on error
    if (hookExecutor.hasHooks('Stop')) {
      const stopInput = buildStopInput('error');
      await hookExecutor.execute('Stop', stopInput, undefined, abortSignal);
    }

    return {
      success: false,
      reason: 'error',
      error: error instanceof Error ? error : new Error(String(error)),
    };
  }
}

/**
 * Extract tool use blocks from assistant message
 */
function extractToolUseBlocks(message: AnthropicMessage): ToolUseBlock[] {
  const blocks: ToolUseBlock[] = [];

  if (message.content && Array.isArray(message.content)) {
    for (const block of message.content) {
      if (typeof block === 'object' && block !== null) {
        if (block.type === 'tool_use' && 'id' in block && 'name' in block) {
          blocks.push({
            id: String(block.id) as UUID,
            name: String(block.name),
            input: (block as { input: Record<string, unknown> }).input || {},
          });
        }
      }
    }
  }

  return blocks;
}
