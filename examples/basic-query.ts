#!/usr/bin/env node
/**
 * Basic Query Example
 *
 * This example demonstrates the simplest way to use agentic-sdk.
 * Just import query() and pass a prompt.
 */

import { query } from 'agentic-sdk';

async function main() {
  const prompt = 'What is the capital of France?';

  console.log(`Query: ${prompt}\n`);

  try {
    for await (const message of query({ prompt })) {
      switch (message.type) {
        case 'text':
          console.log(message.text);
          break;
        case 'tool_use':
          console.log(`[Tool: ${message.name}]`);
          break;
        case 'error':
          console.error(`[Error: ${message.error}]`);
          break;
      }
    }
  } catch (error) {
    console.error('Query failed:', error);
    process.exit(1);
  }
}

main();
