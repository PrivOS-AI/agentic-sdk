# agentic-sdk

Native TypeScript SDK for Claude agents - drop-in replacement for @anthropic-ai/claude-agent-sdk

## Features

- 🚀 **Native TypeScript** - No CLI subprocess, direct API calls
- 📦 **98% smaller** - 408KB vs 77MB (no bundled binaries)
- ⚡ **Fast startup** - ~10ms vs ~500ms (no CLI spawn overhead)
- 🔧 **Full API parity** - Drop-in replacement with 396 tests verifying compatibility
- 🛠️ **All tools included** - Read, Write, Edit, Bash, Glob, Grep, WebSearch, WebFetch
- 🔌 **MCP support** - Model Context Protocol for extensible tools
- 🤖 **Subagents** - Multi-agent orchestration (parallel, sequential, DAG)
- 🪝 **Hook system** - Guardrails, audit logging, permission control
- 💾 **Session management** - Resume, fork, and persist conversations

## Installation

```bash
npm install agentic-sdk
```

## Quick Start

```typescript
import { query } from 'agentic-sdk';

for await (const message of query('What is 2 + 2?', {
  env: { ANTHROPIC_API_KEY: 'your-key' },
  permissionMode: 'bypassPermissions'
})) {
  if (message.type === 'text') {
    console.log(message.text);
  }
}
```

## Documentation

See [docs/](docs/) for complete documentation.

## License

MIT
