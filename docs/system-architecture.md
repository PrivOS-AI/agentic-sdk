# System Architecture

## Overview

agentic-sdk implements a modular, event-driven architecture for Claude AI agents. The system is built around a core agentic loop with pluggable tools, hooks, and orchestration patterns.

## Core Components

```
┌─────────────────────────────────────────────────────────────┐
│                         API Layer                           │
│                      (query.ts)                             │
└───────────────────────────┬─────────────────────────────────┘
                            │
┌───────────────────────────▼─────────────────────────────────┐
│                    Agentic Loop                              │
│                  (agentic-loop.ts)                           │
│  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐      │
│  │ Conversation │  │  Token       │  │   Retry      │      │
│  │   State      │  │  Tracker     │  │   Manager    │      │
│  └──────────────┘  └──────────────┘  └──────────────┘      │
└───────────────────────────┬─────────────────────────────────┘
                            │
        ┌───────────────────┼───────────────────┐
        │                   │                   │
┌───────▼────────┐  ┌──────▼────────┐  ┌───────▼────────┐
│  Tool System   │  │  Hook System  │  │  Permission    │
│                │  │               │  │    System      │
│ - Registry     │  │ - 18 Events   │  │ - Modes        │
│ - Executor     │  │ - Pipeline    │  │ - Evaluation   │
│ - Built-ins    │  │ - Timeouts    │  │ - Cache        │
└───────┬────────┘  └──────┬────────┘  └───────┬────────┘
        │                   │                   │
        └───────────────────┼───────────────────┘
                            │
┌───────────────────────────▼─────────────────────────────────┐
│                  Subagent Orchestration                       │
│     (subagent-execution-engine.ts)                           │
│  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐      │
│  │  Parallel    │  │  Sequential  │  │     DAG      │      │
│  │  Executor    │  │  Executor    │  │  Executor    │      │
│  └──────────────┘  └──────────────┘  └──────────────┘      │
└─────────────────────────────────────────────────────────────┘
                            │
┌───────────────────────────▼─────────────────────────────────┐
│              Session Management                              │
│  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐      │
│  │   Manager    │  │ Persistence  │  │   Forking    │      │
│  └──────────────┘  └──────────────┘  └──────────────┘      │
└─────────────────────────────────────────────────────────────┘
                            │
┌───────────────────────────▼─────────────────────────────────┐
│              MCP Integration                                 │
│         (mcp-tools.ts)                                       │
└─────────────────────────────────────────────────────────────┘
```

## Agentic Loop Flow

### Main Query Flow

```
User Query
    │
    ▼
┌─────────────────────┐
│  1. Validate Input  │
│  - Check permissions│
│  - Load session     │
└──────────┬──────────┘
           │
           ▼
┌─────────────────────┐
│  2. Pre-Query Hooks │
│  - beforeQuery      │
│  - beforeAnthropic  │
└──────────┬──────────┘
           │
           ▼
┌─────────────────────┐
│  3. Call Anthropic  │
│  - Send messages    │
│  - Stream response  │
└──────────┬──────────┘
           │
           ▼
┌─────────────────────┐
│  4. Process Content │
│  - Tool use blocks  │
│  - Text blocks      │
└──────────┬──────────┘
           │
           ▼
      Tool Calls?
           │
     ┌─────┴─────┐
     │Yes        │ No
     ▼           ▼
┌──────────┐  ┌─────────────┐
│ 5. Exec  │  │ 7. Stream   │
│    Tools │  │    Response │
└─────┬────┘  └──────┬──────┘
      │             │
      ▼             ▼
┌──────────┐  ┌─────────────┐
│ 6. Tool  │  │ 8. Post-    │
│  Hooks   │  │    Query    │
└─────┬────┘  └──────┬──────┘
      │             │
      └──────┬──────┘
             │
             ▼
       Loop Back to 3
       (with tool results)
```

### Component Responsibilities

**`agentic-loop.ts`**: Main loop orchestration
- Maintains conversation state
- Processes streaming responses
- Coordinates tool execution
- Handles retries

**`conversation-state.ts`**: State management
- Tracks message history
- Manages context window
- Handles state transitions

**`token-tracker.ts`**: Usage tracking
- Counts input/output tokens
- Calculates costs
- Reports usage

**`retry-manager.ts`**: Retry logic
- Exponential backoff
- Max retry enforcement
- Error classification

## Tool System

### Tool Registry

```typescript
interface Tool {
  name: string;
  description: string;
  inputSchema: JSONSchema;
  executor: (args: unknown) => Promise<unknown>;
}

class ToolRegistry {
  private tools = new Map<string, Tool>();

  register(tool: Tool): void;
  get(name: string): Tool | undefined;
  list(): Tool[];
  validate(name: string, args: unknown): boolean;
}
```

### Tool Execution Flow

```
Tool Call Request
    │
    ▼
┌─────────────────────┐
│ 1. Validate Tool    │
│    - Check exists   │
│    - Validate args  │
└──────────┬──────────┘
           │
           ▼
┌─────────────────────┐
│ 2. Check Permission │
│    - Permission mode│
│    - User approval  │
└──────────┬──────────┘
           │
           ▼
┌─────────────────────┐
│ 3. Execute Tool     │
│    - Built-in tools │
│    - MCP tools      │
│    - Custom tools   │
└──────────┬──────────┘
           │
           ▼
┌─────────────────────┐
│ 4. Format Result    │
│    - Serialize      │
│    - Error handling │
└──────────┬──────────┘
           │
           ▼
      Return Result
```

### Built-in Tools

| Tool | Purpose | Key Features |
|------|---------|--------------|
| `read` | Read file contents | Encoding detection, size limits |
| `write` | Write files | Atomic writes, directory creation |
| `edit` | Edit files with diff | Line-based edits, conflict detection |
| `bash` | Execute shell commands | Timeout, stdout/stderr capture |
| `glob` | File pattern matching | Recursive, fast-glob implementation |
| `grep` | Search file contents | Regex support, context lines |
| `web-search` | Web search | Provider-agnostic interface |
| `web-fetch` | Fetch web pages | HTTP client, HTML parsing |
| `completion` | Code completion | LSP integration |
| `uri` | URI scheme identification | Protocol detection |

### MCP Integration

```
MCP Server
    │
    ▼
┌─────────────────────┐
│ 1. Connect to Server│
│    - stdio/HTTP     │
│    - Authentication │
└──────────┬──────────┘
           │
           ▼
┌─────────────────────┐
│ 2. List Tools       │
│    - Call tools/list│
│    - Cache schemas  │
└──────────┬──────────┘
           │
           ▼
┌─────────────────────┐
│ 3. Wrap MCP Tools   │
│    - Create wrappers│
│    - Register in    │
│      ToolRegistry   │
└──────────┬──────────┘
           │
           ▼
┌─────────────────────┐
│ 4. Execute via MCP  │
│    - Call tools/call│
│    - Handle errors  │
└──────────┬──────────┘
           │
           ▼
      Return Result
```

## Permission System

### Permission Modes

```typescript
enum PermissionMode {
  AUTO = 'auto',       // Allow all tool calls
  GRANT = 'grant',     // Pre-approved tools only
  MANUAL = 'manual'    // Interactive approval
}
```

### Evaluation Flow

```
Tool Call
    │
    ▼
┌─────────────────────┐
│ 1. Check Mode       │
│    - auto → allow   │
│    - grant → check  │
│    - manual → prompt│
└──────────┬──────────┘
           │
           ▼
┌─────────────────────┐
│ 2. Evaluate Chain   │
│    - Tool whitelist │
│    - Path rules     │
│    - User grants    │
└──────────┬──────────┘
           │
           ▼
┌─────────────────────┐
│ 3. Cache Decision   │
│    - Store result   │
│    - TTL expiration │
└──────────┬──────────┘
           │
           ▼
      Decision
```

### Permission Evaluation Chain

```typescript
class PermissionEvaluationChain {
  private evaluators: PermissionEvaluator[];

  async evaluate(request: PermissionRequest): Promise<PermissionResult> {
    for (const evaluator of evaluators) {
      const result = await evaluator.evaluate(request);
      if (!result.allowed) {
        return result; // Early exit on denial
      }
    }
    return { allowed: true };
  }
}
```

## Hook System

### Hook Events (18 Total)

**Query Lifecycle**:
- `beforeQuery` - Before query starts
- `beforeAnthropic` - Before Anthropic API call
- `afterAnthropic` - After Anthropic API response
- `afterQuery` - After query completes

**Tool Lifecycle**:
- `beforeTool` - Before tool execution
- `afterTool` - After tool execution
- `toolError` - On tool error

**Agent Lifecycle**:
- `beforeAgent` - Before subagent spawn
- `afterAgent` - After subagent completes
- `agentError` - On subagent error

**Session Lifecycle**:
- `beforeSessionSave` - Before session persistence
- `afterSessionSave` - After session persistence
- `beforeSessionLoad` - Before session load
- `afterSessionLoad` - After session load

**Permission Lifecycle**:
- `beforePermission` - Before permission check
- `afterPermission` - After permission decision
- `permissionDenied` - On permission denial

### Hook Pipeline

```
Hook Event Triggered
    │
    ▼
┌─────────────────────┐
│ 1. Find Matching    │
│    Hooks            │
│    - By event name  │
│    - By regex       │
└──────────┬──────────┘
           │
           ▼
┌─────────────────────┐
│ 2. Execute Hooks    │
│    - Parallel if    │
│      possible       │
│    - Timeout per    │
│      hook           │
└──────────┬──────────┘
           │
           ▼
┌─────────────────────┐
│ 3. Handle Errors    │
│    - Log errors     │
│    - Continue/abort │
└──────────┬──────────┘
           │
           ▼
      Continue Flow
```

### Hook Registration

```typescript
interface Hook {
  event: string;
  handler: (context: HookContext) => Promise<void> | void;
  pattern?: RegExp;
  timeout?: number;
}

agent.registerHook({
  event: 'beforeTool',
  pattern: /bash|write/,
  handler: async (ctx) => {
    // Guardrail logic
  },
  timeout: 5000
});
```

## Session Management

### Session Lifecycle

```
Create Session
    │
    ▼
┌─────────────────────┐
│ 1. Initialize State │
│    - Create ID      │
│    - Setup hooks    │
│    - Load tools     │
└──────────┬──────────┘
           │
           ▼
┌─────────────────────┐
│ 2. Execute Queries  │
│    - Track changes  │
│    - Build history  │
└──────────┬──────────┘
           │
           ▼
┌─────────────────────┐
│ 3. Persist Session  │
│    - Save to disk   │
│    - Create         │
│      checkpoint     │
└──────────┬──────────┘
           │
           ▼
      Fork/Resume
```

### Persistence Strategy

```typescript
interface SessionState {
  id: string;
  createdAt: number;
  updatedAt: number;
  messages: Message[];
  context: Record<string, unknown>;
  metadata: SessionMetadata;
}

class SessionPersistence {
  async save(session: SessionState): Promise<void> {
    const filePath = this.getSessionPath(session.id);
    await writeFile(filePath, JSON.stringify(session, null, 2));
  }

  async load(sessionId: string): Promise<SessionState> {
    const filePath = this.getSessionPath(sessionId);
    const content = await readFile(filePath, 'utf-8');
    return JSON.parse(content);
  }
}
```

### Session Forking

```
Original Session (A)
    │
    ▼
┌─────────────────────┐
│ 1. Clone State      │
│    - Copy messages  │
│    - Copy context   │
└──────────┬──────────┘
           │
           ▼
┌─────────────────────┐
│ 2. Create Branch    │
│    - New ID         │
│    - Parent ref     │
└──────────┬──────────┘
           │
           ▼
┌─────────────────────┐
│ 3. Isolate Changes  │
│    - Independent    │
│      state          │
│    - No shared refs │
└──────────┬──────────┘
           │
           ▼
    Forked Session (B)
```

## Subagent Orchestration

### Parallel Execution

```
                    ┌─────────────────────────────────────┐
                    │         Parallel Executor            │
                    └──────────────┬──────────────────────┘
                                   │
           ┌───────────────────────┼───────────────────────┐
           │                       │                       │
           ▼                       ▼                       ▼
    ┌──────────┐            ┌──────────┐            ┌──────────┐
    │ Subagent │            │ Subagent │            │ Subagent │
    │    A     │            │    B     │            │    C     │
    └─────┬────┘            └─────┬────┘            └─────┬────┘
          │                      │                      │
          └───────────────────────┼──────────────────────┘
                                 │
                                 ▼
                         ┌───────────────┐
                         │  Aggregator   │
                         │  (Collect all │
                         │   results)    │
                         └───────┬───────┘
                                 │
                                 ▼
                           Combined Result
```

### Sequential Execution

```
                    ┌─────────────────────────────────────┐
                    │        Sequential Executor           │
                    └──────────────┬──────────────────────┘
                                   │
                                   ▼
                          ┌──────────────┐
                          │  Subagent A  │
                          └──────┬───────┘
                                 │
                                 ▼
                          ┌──────────────┐
                          │  Subagent B  │
                          │  (gets A's   │
                          │   output)    │
                          └──────┬───────┘
                                 │
                                 ▼
                          ┌──────────────┐
                          │  Subagent C  │
                          │  (gets B's   │
                          │   output)    │
                          └──────┬───────┘
                                 │
                                 ▼
                           Final Result
```

### DAG Execution

```
                    ┌─────────────────────────────────────┐
                    │           DAG Executor               │
                    └──────────────┬──────────────────────┘
                                   │
            ┌──────────────────────┼──────────────────────┐
            │                      │                      │
            ▼                      ▼                      ▼
     ┌──────────┐            ┌──────────┐            ┌──────────┐
     │   Task   │            │   Task   │            │   Task   │
     │    A     │            │    B     │            │    C     │
     └─────┬────┘            └─────┬────┘            └─────┬────┘
           │                      │                      │
           └──────────┬─────────────┘                      │
                      │                                    │
                      ▼                                    │
                ┌──────────┐                               │
                │   Task   │                               │
                │    D     │◄──────────────────────────────┘
                │ (needs A,B)
                └─────┬────┘
                      │
                      ▼
                ┌──────────┐
                │   Task   │
                │    E     │◄──────┐
                │(needs D,C)       │
                └─────┬────┘       │
                      │            │
                      ▼            │
                ┌──────────┐       │
                │   Task   │       │
                │    F     │◄──────┘
                │(needs E  │
                │   only)  │
                └─────┬────┘
                      │
                      ▼
                Final Result
```

### Execution Engine

```typescript
class SubagentExecutionEngine {
  async execute(
    config: SubagentConfig
  ): Promise<SubagentResult> {
    switch (config.pattern) {
      case 'parallel':
        return this.parallelExecutor.execute(config);
      case 'sequential':
        return this.sequentialExecutor.execute(config);
      case 'dag':
        return this.dagExecutor.execute(config);
    }
  }
}
```

## Error Handling

### Error Types

```typescript
class AgenticError extends Error {
  constructor(message: string, public readonly code: string) {
    super(message);
    this.name = 'AgenticError';
  }
}

class ToolExecutionError extends AgenticError { }
class PermissionDeniedError extends AgenticError { }
class SessionPersistenceError extends AgenticError { }
class MCPConnectionError extends AgenticError { }
```

### Error Recovery

```
Error Occurred
    │
    ▼
┌─────────────────────┐
│ 1. Classify Error   │
│    - Retryable?     │
│    - Fatal?         │
└──────────┬──────────┘
           │
           ▼
    Retryable?
           │
     ┌─────┴─────┐
     │Yes        │ No
     ▼           ▼
┌──────────┐  ┌─────────────┐
│ 2. Retry │  │ 3. Propagate│
│    with  │  │    Error    │
│  backoff │  │             │
└─────┬────┘  └──────┬──────┘
      │             │
      ▼             ▼
  Max Retries?   Throw Error
      │
  ┌───┴────┐
  │Yes     │ No
  ▼        ▼
Throw   Continue
```

## Performance Optimizations

### Startup Time (~10ms)

1. **Lazy Loading**: Defer tool initialization
2. **Minimal Dependencies**: Only essential packages
3. **Tree Shaking**: Optimizable module structure
4. **Caching**: Cache expensive operations

### Memory Efficiency

1. **Streaming**: Stream large responses
2. **LRU Caches**: Limit cache sizes
3. **Weak References**: Allow garbage collection
4. **Object Pooling**: Reuse objects where possible

### Execution Speed

1. **Parallel Tool Execution**: Execute independent tools concurrently
2. **Permission Caching**: Cache permission decisions
3. **Schema Validation**: Fast validation libraries
4. **Connection Pooling**: Reuse HTTP connections

## Security Architecture

### Input Validation

```
External Input
    │
    ▼
┌─────────────────────┐
│ 1. Type Validation  │
│    - Schema check   │
│    - Type coercion  │
└──────────┬──────────┘
           │
           ▼
┌─────────────────────┐
│ 2. Path Validation  │
│    - Normalize      │
│    - Sandbox check  │
└──────────┬──────────┘
           │
           ▼
┌─────────────────────┐
│ 3. Permission Check │
│    - Mode evaluation│
│    - User approval  │
└──────────┬──────────┘
           │
           ▼
┌─────────────────────┐
│ 4. Rate Limiting    │
│    - Per-tool limits│
│    - Global limits  │
└──────────┬──────────┘
           │
           ▼
     Execute Tool
```

### Sandboxing

- **Bash Tool**: Timeout, command whitelist
- **File Tools**: Path sandbox, size limits
- **Network Tools**: URL validation, timeout
- **MCP Tools**: Schema validation, resource limits

### Secrets Management

- **Environment Variables**: Never hardcode secrets
- **Redaction**: Redact secrets from logs
- **Secure Storage**: Use system secret stores
- **Rotation**: Support credential rotation

## Testing Architecture

### Test Layers

```
┌─────────────────────────────────────┐
│   Drop-in Replacement Tests         │
│   (396 tests - API parity)          │
└──────────────┬──────────────────────┘
               │
┌──────────────▼──────────────────────┐
│   Unit Tests                        │
│   (Component-level)                 │
└──────────────┬──────────────────────┘
               │
┌──────────────▼──────────────────────┐
│   Integration Tests                 │
│   (End-to-end flows)                │
└─────────────────────────────────────┘
```

### Test Coverage

- **API Surface**: 100% (all public APIs)
- **Tool Execution**: All built-in tools
- **Permission Modes**: All three modes
- **Hook Events**: All 18 events
- **Session Operations**: Create, save, load, fork
- **Orchestration**: Parallel, sequential, DAG
- **Error Scenarios**: All error paths

## Deployment Considerations

### Serverless Optimizations

- **Cold Starts**: ~10ms initialization
- **Bundle Size**: 408KB for fast deployments
- **Stateless Design**: Session persistence for statefulness
- **Timeout Handling**: Configurable timeouts

### Edge Computing

- **No Native Dependencies**: Pure JS/TS
- **Small Bundle**: Fits edge platform limits
- **Fast Execution**: Minimal CPU usage
- **Streaming Support**: Efficient data handling

### Background Processes

- **Graceful Shutdown**: SIGTERM handling
- **Health Checks**: Health endpoint support
- **Logging**: Structured logging
- **Monitoring**: Metrics export
