import * as fs from 'node:fs/promises';
import * as path from 'node:path';
import type { ToolExecutorFunction } from '../tool-registry-manager.js';

/**
 * Write tool: fs.writeFile with directory creation
 */
export const writeTool: ToolExecutorFunction = async (input, _context) => {
  const { file_path, content } = input as {
    file_path: string;
    content: string;
  };

  if (!file_path || typeof file_path !== 'string') {
    return {
      content: 'Error: file_path is required and must be a string',
      isError: true,
    };
  }

  if (content === undefined || content === null) {
    return {
      content: 'Error: content is required',
      isError: true,
    };
  }

  try {
    // Resolve to absolute path
    const absolutePath = path.resolve(file_path);

    // Create parent directories if they don't exist
    const directory = path.dirname(absolutePath);
    await fs.mkdir(directory, { recursive: true });

    // Write file
    await fs.writeFile(absolutePath, String(content), 'utf-8');

    return {
      content: `Successfully wrote file: ${file_path}`,
    };
  } catch (error) {
    return {
      content: `Error writing file: ${error instanceof Error ? error.message : String(error)}`,
      isError: true,
    };
  }
};

/**
 * Tool definition for Write
 */
export const writeToolDefinition = {
  name: 'write_file',
  description: 'Writes content to a file, creating parent directories if they do not exist. Overwrites existing files.',
  inputSchema: {
    type: 'object',
    properties: {
      file_path: {
        type: 'string',
        description: 'Absolute path to the file to write',
      },
      content: {
        type: 'string',
        description: 'Content to write to the file',
      },
    },
    required: ['file_path', 'content'],
  },
  execute: writeTool,
};
