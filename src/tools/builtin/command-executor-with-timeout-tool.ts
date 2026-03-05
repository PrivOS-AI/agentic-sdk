import { exec } from 'node:child_process';
import { promisify } from 'node:util';
import type { ToolExecutorFunction } from '../tool-registry-manager.js';

const execAsync = promisify(exec);

/**
 * Bash tool: child_process.exec with timeout
 */
export const bashTool: ToolExecutorFunction = async (input, context) => {
  const { command, timeout, run_in_background } = input as {
    command: string;
    timeout?: number;
    run_in_background?: boolean;
  };

  if (!command || typeof command !== 'string') {
    return {
      content: 'Error: command is required and must be a string',
      isError: true,
    };
  }

  // Default timeout: 120 seconds
  const timeoutMs = timeout && timeout > 0 ? timeout : 120000;

  try {
    if (run_in_background) {
      // For background processes, we still execute but note that it's running in background
      // In a full implementation, this would manage the process lifecycle
      const result = await execAsync(command, {
        timeout: timeoutMs,
        maxBuffer: 10 * 1024 * 1024, // 10MB buffer
        cwd: context.cwd, // Execute in the specified working directory
      });

      const output = [
        result.stdout || '',
        result.stderr || '',
      ].filter(Boolean).join('\n');

      return {
        content: output || '(no output)',
      };
    } else {
      // Normal execution
      const result = await execAsync(command, {
        timeout: timeoutMs,
        maxBuffer: 10 * 1024 * 1024, // 10MB buffer
        cwd: context.cwd, // Execute in the specified working directory
      });

      const output = [
        result.stdout || '',
        result.stderr || '',
      ].filter(Boolean).join('\n');

      return {
        content: output || '(no output)',
      };
    }
  } catch (error) {
    if (error && typeof error === 'object') {
      const err = error as {
        stdout?: string;
        stderr?: string;
        message?: string;
        killed?: boolean;
        signal?: string;
      };

      // Check if it was a timeout
      if (err.killed && err.signal === 'SIGTERM') {
        return {
          content: `Error: Command timed out after ${timeoutMs}ms`,
          isError: true,
        };
      }

      // Return stderr if available, otherwise message
      const output = [
        err.stdout || '',
        err.stderr || '',
      ].filter(Boolean).join('\n');

      return {
        content: output || err.message || 'Unknown error',
        isError: true,
      };
    }

    return {
      content: `Error: ${String(error)}`,
      isError: true,
    };
  }
};

/**
 * Tool definition for Bash
 */
export const bashToolDefinition = {
  name: 'bash',
  description: 'Executes a bash command in the shell. Commands run with a default timeout of 120 seconds. Captures stdout and stderr.',
  inputSchema: {
    type: 'object',
    properties: {
      command: {
        type: 'string',
        description: 'The bash command to execute',
      },
      timeout: {
        type: 'number',
        description: 'Timeout in milliseconds (default: 120000)',
      },
      description: {
        type: 'string',
        description: 'Optional description of what the command does',
      },
      run_in_background: {
        type: 'boolean',
        description: 'If true, runs the command in background mode (future enhancement)',
      },
    },
    required: ['command'],
  },
  execute: bashTool,
};
