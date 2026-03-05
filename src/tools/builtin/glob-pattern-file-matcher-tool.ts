import { glob } from 'glob';
import type { ToolExecutorFunction } from '../tool-registry-manager.js';

/**
 * Glob tool: fast-glob pattern matching
 */
export const globTool: ToolExecutorFunction = async (input, context) => {
  const { pattern, path: basePath } = input as {
    pattern: string;
    path?: string;
  };

  if (!pattern || typeof pattern !== 'string') {
    return {
      content: 'Error: pattern is required and must be a string',
      isError: true,
    };
  }

  try {
    // Check if the base path exists
    const fs = await import('fs/promises');
    const targetPath = basePath || context.cwd;

    try {
      await fs.access(targetPath);
    } catch {
      // Path doesn't exist
      return {
        content: `Error: Directory does not exist: ${targetPath}`,
        isError: true,
      };
    }

    // Use glob to find matching files
    const files = await glob(pattern, {
      cwd: targetPath,
      absolute: false,
      nodir: true,
      windowsPathsNoEscape: true,
    });

    // Sort by modification time (most recent first)
    // Note: glob doesn't provide mtime by default, so we return sorted alphabetically for now
    // In a full implementation, we could stat each file to get mtime
    const sortedFiles = files.sort();

    if (sortedFiles.length === 0) {
      return {
        content: '(no matches)',
      };
    }

    return {
      content: sortedFiles.join('\n'),
    };
  } catch (error) {
    return {
      content: `Error: ${error instanceof Error ? error.message : String(error)}`,
      isError: true,
    };
  }
};

/**
 * Tool definition for Glob
 */
export const globToolDefinition = {
  name: 'glob',
  description: 'Fast file pattern matching using glob patterns. Returns matching file paths sorted alphabetically.',
  inputSchema: {
    type: 'object',
    properties: {
      pattern: {
        type: 'string',
        description: 'Glob pattern for matching files (e.g., "**/*.ts", "src/**/*.js")',
      },
      path: {
        type: 'string',
        description: 'Base directory for pattern matching (default: current working directory)',
      },
    },
    required: ['pattern'],
  },
  execute: globTool,
};
