#!/usr/bin/env node
/**
 * Tool Filtering Example
 *
 * This example demonstrates how to restrict which tools the agent can use.
 */

import { query } from 'agentic-sdk';

async function main() {
  // Example 1: Allow only read-only tools
  console.log('=== Example 1: Read-only tools ===\n');

  for await (const message of query({
    prompt: 'List all TypeScript files in src/',
    options: {
      toolsAllowed: ['read_file', 'glob', 'grep'],
    },
  })) {
    if (message.type === 'text') {
      console.log(message.text);
    }
  }

  // Example 2: Disallow dangerous tools
  console.log('\n=== Example 2: No bash commands ===\n');

  for await (const message of query({
    prompt: 'Read the package.json file',
    options: {
      toolsDisallowed: ['bash', 'write_file', 'edit_file', 'restart'],
    },
  })) {
    if (message.type === 'text') {
      console.log(message.text);
    }
  }

  // Example 3: Allow specific MCP tools with glob pattern
  console.log('\n=== Example 3: Specific MCP tools ===\n');

  for await (const message of query({
    prompt: 'Check GitHub issues',
    options: {
      toolsAllowed: ['read_file', 'mcp__github__*'],
      mcpServers: {
        github: {
          type: 'stdio',
          command: 'npx',
          args: ['-y', '@modelcontextprotocol/server-github'],
        },
      },
    },
  })) {
    if (message.type === 'text') {
      console.log(message.text);
    }
  }
}

main().catch(console.error);
