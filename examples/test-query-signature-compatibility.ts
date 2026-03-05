#!/usr/bin/env node
/**
 * Test the new query() signature
 *
 * This test verifies that the new signature matches the reference SDK:
 * query({ prompt: string | AsyncIterable<SDKUserMessage>, options?: Options })
 */

import { query } from 'agentic-sdk';

async function testBasicString() {
  console.log('=== Test 1: Basic string prompt ===\n');

  try {
    for await (const message of query({
      prompt: 'What is 2+2?',
    })) {
      if (message.type === 'text') {
        console.log('Response:', message.text);
      }
    }
    console.log('✓ Test 1 passed\n');
  } catch (error) {
    console.error('✗ Test 1 failed:', error);
    process.exit(1);
  }
}

async function testStringWithOptions() {
  console.log('=== Test 2: String prompt with options ===\n');

  try {
    for await (const message of query({
      prompt: 'What is the capital of France?',
      options: {
        model: 'claude-opus-4-6',
        maxTurns: 5,
      },
    })) {
      if (message.type === 'text') {
        console.log('Response:', message.text);
      }
    }
    console.log('✓ Test 2 passed\n');
  } catch (error) {
    console.error('✗ Test 2 failed:', error);
    process.exit(1);
  }
}

async function testAsyncIterable() {
  console.log('=== Test 3: AsyncIterable<SDKUserMessage> prompt ===\n');

  try {
    // Create an async iterable of user messages
    async function* messageStream() {
      yield {
        type: 'user' as const,
        prompt: 'What is 3+3?',
      } as const;
      yield {
        type: 'user' as const,
        prompt: 'And what is 4+4?',
      } as const;
    }

    for await (const message of query({
      prompt: messageStream(),
    })) {
      if (message.type === 'text') {
        console.log('Response:', message.text);
      }
    }
    console.log('✓ Test 3 passed\n');
  } catch (error) {
    console.error('✗ Test 3 failed:', error);
    process.exit(1);
  }
}

async function main() {
  console.log('Testing new query() signature compatibility\n');
  console.log('='.repeat(50) + '\n');

  await testBasicString();
  await testStringWithOptions();
  await testAsyncIterable();

  console.log('='.repeat(50));
  console.log('\n✓ All tests passed!');
}

main().catch((error) => {
  console.error('Test suite failed:', error);
  process.exit(1);
});
