# Code Standards

## TypeScript Conventions

### Type Safety

- **Strict Mode**: Always use strict TypeScript settings
- **No Any Types**: Avoid `any` - use `unknown` with type guards if needed
- **Explicit Returns**: Explicit return types on public functions
- **Null Checks**: Enable strict null checks, use optional chaining (`?.`)

```typescript
// ✅ Good
async function executeTool(toolName: string, args: unknown): Promise<ToolResult> {
  // Implementation
}

// ❌ Bad
async function executeTool(toolName: any, args: any) {
  // Implementation
}
```

### Type Definitions

- **Interface vs Type**: Use `interface` for object shapes, `type` for unions/intersections
- **Readonly Types**: Use `readonly` for immutable data
- **Exported Types**: Export all public types from dedicated type files

```typescript
// ✅ Good - Interface for object shapes
export interface ToolCall {
  readonly name: string;
  readonly input: Record<string, unknown>;
}

// ✅ Good - Type for unions
export type ToolResult = string | { error: string };

// ❌ Bad - Using type for object shape
export type ToolCall = {
  name: string;
  input: Record<string, unknown>;
};
```

### Generics

- **Descriptive Names**: Use `T`, `TInput`, `TOutput` with clear semantic meaning
- **Constraints**: Use `extends` to constrain generics appropriately
- **Defaults**: Provide sensible defaults where appropriate

```typescript
// ✅ Good
async function executeTool<TResult = unknown>(
  toolName: string,
  args: unknown
): Promise<TResult> {
  // Implementation
}

// ❌ Bad
async function executeTool(a, b) {
  // Implementation
}
```

## File Naming

### kebab-case Convention

**All files must use kebab-case** (lowercase with hyphens).

```bash
# ✅ Good
src/core/agentic-loop.ts
src/tools/tool-executor.ts
src/agents/parallel-executor.ts

# ❌ Bad
src/core/agenticLoop.ts
src/tools/toolExecutor.ts
src/agents/ParallelExecutor.ts
```

### Descriptive Names

**Use long, self-documenting names** that describe the file's purpose.

```bash
# ✅ Good - Self-documenting
src/core/conversation-state-manager.ts
src/tools/permission-evaluation-chain.ts
src/agents/dag-execution-engine.ts

# ❌ Bad - Too terse
src/core/state.ts
src/tools/permissions.ts
src/agents/dag.ts
```

### Test Files

Test files use the same name with `.test.ts` suffix:

```bash
# Test file for src/core/agentic-loop.ts
tests/unit/core/agentic-loop.test.ts
```

## Code Organization

### File Size Limits

- **Maximum 200 lines per file**
- Split large files into focused modules
- Use composition over inheritance

### Module Structure

Each file should:

1. **Imports first**: Group imports (stdlib, external, internal)
2. **Types next**: Type definitions
3. **Constants**: Module-level constants
4. **Functions/Classes**: Main implementation
5. **Exports last**: Exported public API

```typescript
// ✅ Good file structure
// 1. Imports
import { readFile } from 'node:fs/promises';
import type { ToolCall } from './types/tool-call.js';

// 2. Types
interface ToolExecutionContext {
  sessionId: string;
  startTime: number;
}

// 3. Constants
const DEFAULT_TIMEOUT_MS = 30000;

// 4. Functions
async function executeTool(
  tool: ToolCall,
  context: ToolExecutionContext
): Promise<unknown> {
  // Implementation
}

// 5. Exports
export { executeTool, type ToolExecutionContext };
```

### Export Style

- **Named exports**: Use named exports (not default exports)
- **Barrel exports**: Use `index.ts` to re-export public APIs
- **Type exports**: Export types separately with `export type`

```typescript
// ✅ Good
export { executeTool, validateToolInput };
export type { ToolExecutionContext, ToolResult };

// ❌ Bad - Default export
export default {
  executeTool,
  validateToolInput
};
```

## Code Style

### Naming Conventions

- **Variables**: `camelCase`
- **Functions**: `camelCase`
- **Classes**: `PascalCase`
- **Constants**: `UPPER_SNAKE_CASE`
- **Types/Interfaces**: `PascalCase`
- **Private members**: `_camelCase` prefix

```typescript
// ✅ Good
const MAX_RETRIES = 3;

class ToolExecutor {
  private _cache: Map<string, unknown>;

  async executeTool(toolName: string): Promise<void> {
    // Implementation
  }
}

// ❌ Bad
const maxRetries = 3;

class toolExecutor {
  cache: Map<string, unknown>;
}
```

### Functions

- **Pure functions**: Prefer pure functions without side effects
- **Single responsibility**: Each function does one thing
- **Short functions**: Keep functions under 50 lines
- **Descriptive names**: Function names should describe what they do

```typescript
// ✅ Good
async function readFileContents(filePath: string): Promise<string> {
  const buffer = await readFile(filePath);
  return buffer.toString('utf-8');
}

// ❌ Bad - Does multiple things
async function processFile(filePath: string): Promise<string> {
  const buffer = await readFile(filePath);
  const content = buffer.toString('utf-8');
  // ... 50 more lines of logic
  return result;
}
```

### Error Handling

- **Explicit error types**: Define custom error classes
- **Error messages**: Descriptive, actionable error messages
- **Error propagation**: Propagate errors with context
- **Never swallow errors**: Always handle or propagate

```typescript
// ✅ Good
class ToolExecutionError extends Error {
  constructor(
    public readonly toolName: string,
    public readonly cause: unknown
  ) {
    super(`Failed to execute tool: ${toolName}`);
    this.name = 'ToolExecutionError';
  }
}

try {
  await executeTool(toolName, args);
} catch (error) {
  throw new ToolExecutionError(toolName, error);
}

// ❌ Bad - Swallows error
try {
  await executeTool(toolName, args);
} catch (error) {
  console.error(error);
  return null;
}
```

### Async/Await

- **Prefer async/await**: Over raw promises
- **Parallel execution**: Use `Promise.all()` for concurrent operations
- **Error handling**: Always wrap async operations in try/catch

```typescript
// ✅ Good
async function executeMultipleTools(tools: Tool[]): Promise<Result[]> {
  try {
    return await Promise.all(
      tools.map(tool => executeTool(tool))
    );
  } catch (error) {
    throw new ToolExecutionError('multiple tools', error);
  }
}

// ❌ Bad - No error handling
async function executeMultipleTools(tools: Tool[]): Promise<Result[]> {
  return Promise.all(
    tools.map(tool => executeTool(tool))
  );
}
```

## Comments & Documentation

### JSDoc Comments

**All public APIs must have JSDoc comments**:

```typescript
/**
 * Executes a tool with the given arguments.
 *
 * @param toolName - The name of the tool to execute
 * @param args - Arguments to pass to the tool
 * @returns Promise resolving to the tool result
 * @throws {ToolExecutionError} If tool execution fails
 * @example
 * ```ts
 * const result = await executeTool('read', { path: '/tmp/file.txt' });
 * ```
 */
async function executeTool(
  toolName: string,
  args: unknown
): Promise<ToolResult> {
  // Implementation
}
```

### Implementation Comments

- **Why, not what**: Explain why, not what the code does
- **Complex logic**: Comment non-obvious algorithms
- **TODO comments**: Mark incomplete work with `TODO:`

```typescript
// ✅ Good - Explains why
// Use exponential backoff to avoid overwhelming the API during outages
const delay = Math.min(1000 * Math.pow(2, attempt), 30000);
await sleep(delay);

// ❌ Bad - States what's obvious
// Set delay to 1000
const delay = 1000;

// ✅ Good - TODO with context
// TODO: Replace with proper streaming once API supports it
const response = await api.call();
```

## Testing Standards

### Test Structure

- **AAA Pattern**: Arrange, Act, Assert
- **Descriptive names**: Test names should describe the scenario
- **One assertion per test**: Prefer focused tests

```typescript
// ✅ Good
describe('executeTool', () => {
  it('should return tool result for valid tool call', async () => {
    // Arrange
    const toolCall = { name: 'read', input: { path: '/tmp/test.txt' } };

    // Act
    const result = await executeTool(toolCall);

    // Assert
    expect(result).toEqual({ success: true });
  });

  it('should throw ToolExecutionError for invalid tool name', async () => {
    // Arrange
    const toolCall = { name: 'invalid', input: {} };

    // Act & Assert
    await expect(executeTool(toolCall)).rejects.toThrow(ToolExecutionError);
  });
});
```

### Test Coverage

- **100% API surface**: All public APIs must have tests
- **Edge cases**: Test error conditions, boundary cases
- **Integration tests**: Test component interactions

## Import Order

Organize imports in this order:

1. Node.js built-ins (with `node:` prefix)
2. External packages
3. Internal imports (relative paths)
4. Type imports

```typescript
// ✅ Good
import { readFile } from 'node:fs/promises';
import { setTimeout } from 'node:timers/promises';

import { Anthropic } from '@anthropic-ai/sdk';

import { ToolCall } from './types/tool-call.js';
import { executeTool } from './tool-executor.js';

import type { ToolResult } from './types/tool-result.js';
```

## Security Standards

### Input Validation

- **Validate all inputs**: Never trust external input
- **Sanitize file paths**: Prevent path traversal attacks
- **Limit execution time**: Prevent infinite loops

```typescript
// ✅ Good - Validates file path
async function safeReadFile(filePath: string): Promise<string> {
  // Prevent path traversal
  const normalizedPath = normalize(filePath);
  if (normalizedPath.includes('..')) {
    throw new SecurityError('Invalid file path');
  }

  return await readFile(normalizedPath, 'utf-8');
}
```

### Sensitive Data

- **No API keys in code**: Use environment variables
- **Redact logs**: Don't log sensitive information
- **Secure defaults**: Default to most secure settings

```typescript
// ✅ Good
const apiKey = process.env.ANTHROPIC_API_KEY;
if (!apiKey) {
  throw new Error('ANTHROPIC_API_KEY environment variable is required');
}

// ❌ Bad - Hardcoded API key
const apiKey = 'sk-ant-xxx...';
```

## Performance Guidelines

### Optimization Principles

- **Avoid premature optimization**: Measure before optimizing
- **Use built-ins**: Prefer native Node.js APIs
- **Lazy loading**: Load modules only when needed
- **Caching**: Cache expensive operations

```typescript
// ✅ Good - Lazy loading
async function getToolExecutor() {
  const { ToolExecutor } = await import('./tool-executor.js');
  return new ToolExecutor();
}

// ✅ Good - Caching
const toolRegistryCache = new Map<string, Tool>();

function getTool(name: string): Tool {
  if (!toolRegistryCache.has(name)) {
    toolRegistryCache.set(name, loadTool(name));
  }
  return toolRegistryCache.get(name)!;
}
```

### Memory Management

- **Stream large data**: Don't load entire files into memory
- **Clear references**: Null out references when done
- **Limit cache size**: Use LRU caches for unbounded growth

```typescript
// ✅ Good - Streaming
async function processLargeFile(filePath: string): Promise<void> {
  const stream = createReadStream(filePath);
  for await (const chunk of stream) {
    await processChunk(chunk);
  }
}
```

## Git Commit Standards

### Commit Message Format

Follow conventional commits:

```
<type>(<scope>): <description>

[optional body]

[optional footer]
```

**Types**: `feat`, `fix`, `docs`, `style`, `refactor`, `test`, `chore`

**Examples**:
- `feat(tools): add web-search tool`
- `fix(core): handle timeout in agentic loop`
- `docs(readme): update installation instructions`

### Commit Quality

- **Atomic commits**: One logical change per commit
- **No WIP**: Don't commit work-in-progress code
- **Test before commit**: Ensure tests pass
- **No secrets**: Never commit API keys or sensitive data

## Code Review Standards

### Review Checklist

- [ ] Code follows style guide
- [ ] Functions have JSDoc comments
- [ ] Error handling is complete
- [ ] Tests cover new functionality
- [ ] No hardcoded secrets
- [ ] No obvious performance issues
- [ ] Naming is descriptive
- [ ] File is under 200 lines

### Review Process

1. **Self-review**: Review your own code before requesting review
2. **Automated checks**: Run linter and tests
3. **Peer review**: At least one approval required
4. **Address feedback**: Respond to all review comments
