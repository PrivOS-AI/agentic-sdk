import * as readline from 'node:readline';
import type { ToolExecutorFunction } from '../tool-registry-manager.js';

/**
 * AskUserQuestion tool: readline stdin/stdout prompts
 */
export const askUserQuestionTool: ToolExecutorFunction = async (input, _context) => {
  const { question, options } = input as {
    question: string;
    options?: Array<{ label: string; value: string; description?: string }>;
  };

  if (!question || typeof question !== 'string') {
    return {
      content: 'Error: question is required and must be a string',
      isError: true,
    };
  }

  try {
    // Create readline interface
    const rl = readline.createInterface({
      input: process.stdin,
      output: process.stdout,
    });

    let answer: string;

    if (options && options.length > 0) {
      // Multiple choice mode
      console.log(`\n${question}\n`);

      for (let i = 0; i < options.length; i++) {
        const option = options[i];
        const desc = option.description ? ` - ${option.description}` : '';
        console.log(`  [${i + 1}] ${option.label}${desc}`);
      }

      answer = await new Promise<string>((resolve) => {
        rl.question('\nSelect option (number): ', (input) => {
          const index = parseInt(input.trim(), 10) - 1;
          if (index >= 0 && index < options.length) {
            resolve(options[index].value);
          } else {
            resolve(input.trim());
          }
        });
      });
    } else {
      // Open-ended question mode
      answer = await new Promise<string>((resolve) => {
        rl.question(`${question}: `, (input) => {
          resolve(input.trim());
        });
      });
    }

    rl.close();

    return {
      content: answer,
    };
  } catch (error) {
    return {
      content: `Error: ${error instanceof Error ? error.message : String(error)}`,
      isError: true,
    };
  }
};

/**
 * Tool definition for AskUserQuestion
 */
export const askUserQuestionToolDefinition = {
  name: 'ask_user_question',
  description: 'Prompts the user for input via stdin/stdout. Supports both open-ended questions and multiple choice options.',
  inputSchema: {
    type: 'object',
    properties: {
      question: {
        type: 'string',
        description: 'The question to ask the user',
      },
      options: {
        type: 'array',
        items: {
          type: 'object',
          properties: {
            label: {
              type: 'string',
              description: 'Display label for the option',
            },
            value: {
              type: 'string',
              description: 'Value to return if this option is selected',
            },
            description: {
              type: 'string',
              description: 'Optional additional description',
            },
          },
          required: ['label', 'value'],
        },
        description: 'Array of options for multiple choice (if omitted, asks open-ended question)',
      },
    },
    required: ['question'],
  },
  execute: askUserQuestionTool,
};
