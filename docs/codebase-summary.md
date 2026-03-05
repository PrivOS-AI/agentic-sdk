# Codebase Summary

## Project Structure

```
agentic-sdk/
├── src/
│   ├── core/              # Core agent loop and orchestration
│   ├── types/             # TypeScript type definitions
│   ├── tools/             # Tool registry and built-in tools
│   ├── permissions/       # Permission evaluation system
│   ├── sessions/          # Session persistence and management
│   ├── hooks/             # Hook execution pipeline
│   ├── agents/            # Subagent orchestration
│   └── index.ts           # Main entry point
├── tests/
│   ├── drop-in-replacement/  # API parity tests (396 tests)
│   ├── unit/                  # Unit tests
│   └── examples/              # Example usage files
├── docs/                  # This documentation
├── package.json
└── tsconfig.json
```

## Module Responsibilities

### `src/core/` - Core Agent Loop

**Purpose**: Manages the main agentic loop, conversation state, and request processing.

**Key Files**:

- **`agentic-loop.ts`**: Main agent execution loop
  - Processes user messages
  - Orchestrates tool calls
  - Handles response streaming
  - Manages conversation flow

- **`query.ts`**: Main query entry point
  - Public API for agent queries
  - Request validation and setup
  - Response formatting

- **`conversation-state.ts`**: Conversation state management
  - Message history tracking
  - State transitions
  - Context window management

- **`token-tracker.ts`**: Token usage tracking
  - Input/output token counting
  - Cost calculation
  - Usage reporting

- **`retry-manager.ts`**: Retry logic with exponential backoff
  - Failed request handling
  - Retry policy enforcement
  - Error recovery

### `src/types/` - Type Definitions

**Purpose**: Comprehensive TypeScript types for the entire SDK.

**Key Files**:

- **`messages.ts`**: Message types
  - User, assistant, system message types
  - Content blocks (text, image, tool use, tool result)
  - Message conversion utilities

- **`options.ts`**: Configuration options
  - Agent initialization options
  - Tool configuration
  - Permission settings

- **`hooks.ts`**: Hook system types
  - 18 hook event types
  - Hook handler signatures
  - Hook context types

- **`permissions.ts`**: Permission system types
  - Permission modes (auto, grant, manual)
  - Permission evaluation results
  - Permission request types

- **`mcp.ts`**: MCP integration types
  - MCP server configuration
  - MCP tool schemas
  - MCP client types

- **`agents.ts`**: Subagent types
  - Orchestration patterns (parallel, sequential, DAG)
  - Subagent configuration
  - Execution results

- **`sessions.ts`**: Session management types
  - Session state
  - Persistence options
  - Fork configuration

### `src/tools/` - Tool System

**Purpose**: Tool registry, execution, and built-in tool implementations.

**Key Files**:

- **`tool-registry.ts`**: Central tool registry
  - Tool registration
  - Tool discovery
  - Tool validation

- **`tool-executor.ts`**: Tool execution engine
  - Executes tool calls
  - Handles tool errors
  - Formats tool results

- **`tools/`**: Built-in tool implementations
  - `read.ts`: Read file contents
  - `write.ts`: Write files
  - `edit.ts`: Edit files with diff/replace
  - `bash.ts`: Execute shell commands
  - `glob.ts`: File pattern matching
  - `grep.ts`: Search file contents
  - `web-search.ts`: Web search (via provider)
  - `web-fetch.ts`: Fetch web pages
  - `completion.ts`: Auto-completion
  - `uri.ts`: URI scheme identification
  - `mcp-tool.ts`: MCP tool wrapper

### `src/permissions/` - Permission System

**Purpose**: Evaluate and enforce permission policies.

**Key Files**:

- **`permission-evaluation-chain.ts`**: Permission evaluation pipeline
  - Chain of responsibility pattern
  - Multiple evaluators
  - Caching for performance

- **`permission-mode-evaluation.ts`**: Permission mode logic
  - Auto mode: Allow all
  - Grant mode: Pre-approved tools
  - Manual mode: Interactive approval

### `src/sessions/` - Session Management

**Purpose**: Persist, resume, and fork agent conversations.

**Key Files**:

- **`session-manager.ts`**: Session lifecycle management
  - Create sessions
  - Save/load sessions
  - Fork sessions

- **`persistence.ts`**: Session persistence
  - File-based storage
  - Serialization/deserialization
  - Checkpoint management

- **`forking.ts`**: Session forking
  - Branch conversations
  - Isolate state
  - Merge changes

### `src/hooks/` - Hook System

**Purpose**: Execute hook handlers at key lifecycle events.

**Key Files**:

- **`hook-execution-pipeline.ts`**: Hook orchestration
  - Hook registration
  - Hook execution with timeout
  - Regex pattern matching for hooks
  - 18 hook events supported

### `src/agents/` - Subagent Orchestration

**Purpose**: Execute subagents with complex orchestration patterns.

**Key Files**:

- **`subagent-execution-engine.ts`**: Subagent runner
  - Spawn subagents
  - Collect results
  - Handle failures

- **`parallel-executor.ts`**: Parallel execution
  - Concurrent subagent runs
  - Result aggregation
  - Error handling

- **`sequential-executor.ts`**: Sequential execution
  - Ordered subagent runs
  - Pass context between agents
  - Chain of agents

- **`dag-executor.ts`**: DAG execution
  - Directed acyclic graph patterns
  - Dependency resolution
  - Topological execution

## Test Structure

### `tests/drop-in-replacement/` - API Parity Tests

**Purpose**: Verify 100% compatibility with official SDK.

**Test Files** (11 files, 396 tests total):

1. `agent.test.ts` - Core agent functionality
2. `tools.test.ts` - All built-in tools
3. `permissions.test.ts` - Permission system
4. `hooks.test.ts` - Hook events
5. `sessions.test.ts` - Session management
6. `mcp.test.ts` - MCP integration
7. `subagents.test.ts` - Subagent orchestration
8. `types.test.ts` - Type compatibility
9. `errors.test.ts` - Error handling
10. `retries.test.ts` - Retry logic
11. `examples.test.ts` - Example usage

### `tests/unit/` - Unit Tests

**Purpose**: Test individual components in isolation.

**Coverage**:

- Core loop components
- Tool registry and execution
- Permission evaluation
- Session persistence
- Hook pipeline
- Orchestration executors

### `tests/examples/` - Example Files

**Purpose**: Demonstrate SDK usage patterns.

**Examples**:

- Basic agent usage
- Tool usage
- Subagent orchestration
- Session management
- MCP integration
- Custom hooks

## Key Design Patterns

1. **Chain of Responsibility**: Permission evaluation, hook execution
2. **Strategy Pattern**: Orchestration executors (parallel, sequential, DAG)
3. **Registry Pattern**: Tool registry, hook registry
4. **Builder Pattern**: Agent configuration
5. **Observer Pattern**: Hook system
6. **Facade Pattern**: Simplified public API

## Dependencies

### Production Dependencies

- **@anthropic-ai/sdk**: Anthropic API client
- **@modelcontextprotocol/sdk**: MCP integration
- **execa**: Process execution for Bash tool
- **glob**: File globbing
- **fast-glob**: Fast glob implementation

### Dev Dependencies

- **typescript**: TypeScript compiler
- **vitest**: Test runner
- **eslint**: Linting
- **prettier**: Code formatting

## File Naming Conventions

- **kebab-case**: All source files use kebab-case
- **Descriptive names**: Long, self-documenting names preferred
- **Test files**: `*.test.ts` suffix
- **Type files**: `*.ts` in `src/types/`

## Code Organization Principles

1. **Separation of Concerns**: Each module has a single, well-defined responsibility
2. **Dependency Injection**: Components accept dependencies rather than creating them
3. **Type Safety**: Comprehensive TypeScript types throughout
4. **Error Handling**: Explicit error types and propagation
5. **Testing**: Every module has corresponding tests
6. **Documentation**: JSDoc comments on all public APIs
