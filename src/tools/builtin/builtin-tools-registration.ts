import type { Options } from '../../types/options.js';
import type { UUID } from '../../types/messages.js';
import { ToolRegistryManager } from '../tool-registry-manager.js';
import type { ToolDefinitionInterface } from '../tool-registry-manager.js';
import { readToolDefinition } from './file-reader-with-line-numbers-tool.js';
import { writeToolDefinition } from './file-writer-with-directory-creation-tool.js';
import { editToolDefinition } from './string-replacement-file-editor-tool.js';
import { bashToolDefinition } from './command-executor-with-timeout-tool.js';
import { globToolDefinition } from './glob-pattern-file-matcher-tool.js';
import { grepToolDefinition } from './regex-content-search-tool.js';
import { webSearchToolDefinition } from './web-search-with-domain-filtering-tool.js';
import { webFetchToolDefinition } from './url-fetcher-with-html-conversion-tool.js';
import { askUserQuestionToolDefinition } from './interactive-user-prompt-tool.js';
import { createTaskToolDefinition } from './subagent-task-delegation-tool.js';

/**
 * Register all built-in tools with the registry
 * Task tool is registered separately as it requires parent context
 *
 * @param registry - Tool registry to register tools with
 * @param parentOptions - Optional parent query options for task tool
 * @param parentToolUseId - Optional parent tool use ID for task tool
 * @param abortSignal - Optional abort signal for task tool
 * @param _mcpResourceManager - Reserved for future MCP resource tool integration
 */
export function registerBuiltinTools(
  registry: ToolRegistryManager,
  parentOptions?: Options,
  parentToolUseId?: UUID,
  abortSignal?: AbortSignal,
  _mcpResourceManager?: unknown
): void {
  const builtinTools: ToolDefinitionInterface[] = [
    // File system tools
    readToolDefinition,
    writeToolDefinition,
    editToolDefinition,

    // Execution tools
    bashToolDefinition,

    // Search tools
    globToolDefinition,
    grepToolDefinition,

    // Web tools
    webSearchToolDefinition,
    webFetchToolDefinition,

    // Interaction tools
    askUserQuestionToolDefinition,
  ];

  registry.registerMany(builtinTools);

  // Register task tool if parent context is provided
  if (parentOptions && parentToolUseId) {
    const taskToolDefinition = createTaskToolDefinition(
      parentOptions,
      parentToolUseId,
      abortSignal
    );
    registry.register(taskToolDefinition);
  }

  // Note: MCP resource tools will be integrated in future updates
  // The _mcpResourceManager parameter is reserved for this purpose
}

/**
 * Create a new registry with all built-in tools registered
 * Task tool requires parent context and should be registered separately
 *
 * @param parentOptions - Optional parent query options for task tool
 * @param parentToolUseId - Optional parent tool use ID for task tool
 * @param abortSignal - Optional abort signal for task tool
 * @param _mcpResourceManager - Reserved for future MCP resource tool integration
 */
export function createBuiltinToolsRegistry(
  parentOptions?: Options,
  parentToolUseId?: UUID,
  abortSignal?: AbortSignal,
  _mcpResourceManager?: unknown
): ToolRegistryManager {
  const registry = new ToolRegistryManager();
  registerBuiltinTools(registry, parentOptions, parentToolUseId, abortSignal, _mcpResourceManager);
  return registry;
}
