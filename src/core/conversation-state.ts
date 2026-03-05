import type { AnthropicMessage } from '../types/messages.js';

/**
 * Conversation state manager
 * Handles message array management for agentic loop
 */
export class ConversationState {
  private messages: AnthropicMessage[] = [];

  /**
   * Add a user message to the conversation
   */
  addUserMessage(content: string): void {
    this.messages.push({
      role: 'user',
      content: [{ type: 'text', text: content }],
    });
  }

  /**
   * Add an assistant message to the conversation
   */
  addAssistantMessage(message: AnthropicMessage): void {
    this.messages.push(message);
  }

  /**
   * Add tool results to the conversation
   */
  addToolResults(results: Array<{
    tool_use_id: string;
    content: string | Array<unknown>;
    is_error?: boolean;
  }>): void {
    this.messages.push({
      role: 'user',
      content: results.map((r) => ({
        type: 'tool_result',
        tool_use_id: r.tool_use_id,
        content: r.content,
        is_error: r.is_error || false,
      })),
    });
  }

  /**
   * Get current conversation messages
   */
  getMessages(): AnthropicMessage[] {
    return [...this.messages];
  }

  /**
   * Get message count
   */
  getMessageCount(): number {
    return this.messages.length;
  }

  /**
   * Compact conversation by summarizing early messages
   * Returns number of messages compacted
   */
  compact(summarizedMessage: string): number {
    if (this.messages.length <= 6) {
      return 0;
    }

    // Keep first 2 messages and last 4 messages
    // Compact messages in between (from index 2 to length - 4)
    const toCompact = this.messages.length - 6; // -2 (first) -4 (last)

    this.messages.splice(2, toCompact);
    this.messages.splice(2, 0, {
      role: 'user',
      content: [{
        type: 'text',
        text: `[Previous conversation compacted - ${toCompact} messages summarized] ${summarizedMessage}`,
      }],
    });

    return toCompact;
  }

  /**
   * Reset conversation state
   */
  reset(): void {
    this.messages = [];
  }

  /**
   * Clone conversation state
   */
  clone(): ConversationState {
    const cloned = new ConversationState();
    cloned.messages = [...this.messages];
    return cloned;
  }
}
