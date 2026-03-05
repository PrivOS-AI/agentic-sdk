/**
 * Tools module barrel export
 */

// Tool registry
export {
  ToolRegistryManager,
  type ToolDefinitionInterface,
  type ToolExecutorFunction,
} from './tool-registry-manager.js';

// Tool executor
export {
  executeToolUse,
  type ToolUseBlock,
  type ToolResultBlock,
  type HookCallbacks,
  type PermissionCheckerFunction,
  type ToolExecutorConfig,
} from './tool-execution-engine.js';

// Builtin tools registration
export {
  registerBuiltinTools,
  createBuiltinToolsRegistry,
} from './builtin/builtin-tools-registration.js';

// Individual tool definitions (for testing or direct use)
export { readToolDefinition } from './builtin/file-reader-with-line-numbers-tool.js';
export { writeToolDefinition } from './builtin/file-writer-with-directory-creation-tool.js';
export { editToolDefinition } from './builtin/string-replacement-file-editor-tool.js';
export { bashToolDefinition } from './builtin/command-executor-with-timeout-tool.js';
export { globToolDefinition } from './builtin/glob-pattern-file-matcher-tool.js';
export { grepToolDefinition } from './builtin/regex-content-search-tool.js';
export { webSearchToolDefinition } from './builtin/web-search-with-domain-filtering-tool.js';
export { webFetchToolDefinition } from './builtin/url-fetcher-with-html-conversion-tool.js';
export { askUserQuestionToolDefinition } from './builtin/interactive-user-prompt-tool.js';
export { createTaskToolDefinition } from './builtin/subagent-task-delegation-tool.js';
