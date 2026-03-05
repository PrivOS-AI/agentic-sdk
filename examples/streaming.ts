#!/usr/bin/env node
/**
 * Streaming Example
 *
 * This example demonstrates streaming with partial messages.
 * As the model generates text, you'll see it character by character.
 */

import { query } from 'agentic-sdk';

async function main() {
  const prompt = 'Write a haiku about programming';

  console.log(`Query: ${prompt}\n`);
  console.log('Response: ');

  try {
    const result = query({
      prompt,
      options: {
        includePartialMessages: true,
      },
    });

    for await (const message of result) {
      if (message.type === 'text') {
        if (message.index !== undefined) {
          // Partial message - stream character by character
          process.stdout.write(message.text);
        } else {
          // Final complete message
          console.log('\n' + message.text);
        }
      }
    }
  } catch (error) {
    console.error('\nQuery failed:', error);
    process.exit(1);
  }
}

main();
