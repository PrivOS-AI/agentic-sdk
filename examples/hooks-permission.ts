#!/usr/bin/env node
/**
 * Hooks and Permissions Example
 *
 * This example demonstrates using hooks to implement custom permission logic.
 */

import { query } from 'agentic-sdk';

async function main() {
  console.log('=== Hooks Example: Block Dangerous Commands ===\n');

  const prompt = 'List all files in the current directory';

  for await (const message of query({
    prompt,
    options: {
      hooks: {
        PreToolUse: [
          {
            // Apply this hook only to bash commands
            matcher: /bash.*/,

            hooks: [
              async (input) => {
                const command = input.input.command as string;

                console.log(`[Hook] Checking bash command: ${command}`);

                // Block dangerous commands
                const dangerousPatterns = [
                  'rm -rf',
                  'rm -fr',
                  'dd if=',
                  ':(){:|:&};:', // fork bomb
                  'mkfs',
                  'format',
                ];

                for (const pattern of dangerousPatterns) {
                  if (command.includes(pattern)) {
                    console.log(`[Hook] BLOCKED dangerous command: ${pattern}`);
                    return {
                      permissionDecision: 'deny',
                      updatedInput: input.input,
                    };
                  }
                }

                console.log('[Hook] Command allowed');
                return {
                  permissionDecision: 'allow',
                  updatedInput: input.input,
                };
              },
            ],

            timeout: 5000, // 5 second timeout for hook execution
          },
        ],
      },

      permissionMode: 'default',
    },
  })) {
    if (message.type === 'text') {
      console.log(message.text);
    } else if (message.type === 'tool_use') {
      console.log(`[Tool: ${message.name}]`);
    } else if (message.type === 'permission_denial') {
      console.log(`[Permission Denied] ${message.reason}`);
    }
  }

  console.log('\n=== Example 2: Log All Tool Usage ===\n');

  for await (const message of query({
    prompt: 'Read package.json',
    options: {
      hooks: {
        PreToolUse: [
          {
            hooks: [
              async (input) => {
                console.log(`[LOG] Tool: ${input.toolName}, Input: ${JSON.stringify(input.input)}`);
                return {};
              },
            ],
          },
        ],
        PostToolUse: [
          {
            hooks: [
              async (input) => {
                console.log(`[LOG] Tool ${input.toolName} completed`);
                return {};
              },
            ],
          },
        ],
      },
    },
  })) {
    if (message.type === 'text') {
      console.log(message.text);
    }
  }
}

main().catch(console.error);
