import * as fs from 'node:fs/promises';
import * as path from 'node:path';
import { existsSync } from 'node:fs';
import type { ToolExecutorFunction } from '../tool-registry-manager.js';

/**
 * Edit tool: string replacement in files
 */
export const editTool: ToolExecutorFunction = async (input, _context) => {
  const { file_path, old_string, new_string, replace_all } = input as {
    file_path: string;
    old_string: string;
    new_string: string;
    replace_all?: boolean;
  };

  if (!file_path || typeof file_path !== 'string') {
    return {
      content: 'Error: file_path is required and must be a string',
      isError: true,
    };
  }

  if (old_string === undefined || old_string === null) {
    return {
      content: 'Error: old_string is required',
      isError: true,
    };
  }

  if (new_string === undefined || new_string === null) {
    return {
      content: 'Error: new_string is required',
      isError: true,
    };
  }

  // Resolve to absolute path
  const absolutePath = path.resolve(file_path);

  // Check if file exists
  if (!existsSync(absolutePath)) {
    return {
      content: `Error: File not found: ${file_path}`,
      isError: true,
    };
  }

  try {
    // Read file content
    const content = await fs.readFile(absolutePath, 'utf-8');

    // Check if old_string exists
    if (!content.includes(old_string)) {
      return {
        content: `Error: old_string not found in file. The edit tool requires the old_string to be unique within the file unless replace_all is true.`,
        isError: true,
      };
    }

    // Count occurrences using exact string matching (not regex)
    let occurrences = 0;
    let index = 0;
    while ((index = content.indexOf(old_string, index)) !== -1) {
      occurrences++;
      index += old_string.length;
    }

    // Perform replacement
    const newContent = replace_all
      ? content.split(old_string).join(new_string)
      : content.replace(old_string, new_string);

    // Write back
    await fs.writeFile(absolutePath, newContent, 'utf-8');

    // Generate diff-style confirmation
    const replacementCount = replace_all ? occurrences : 1;
    const result = `Successfully replaced ${replacementCount} occurrence(s) in ${file_path}`;

    return {
      content: result,
    };
  } catch (error) {
    return {
      content: `Error editing file: ${error instanceof Error ? error.message : String(error)}`,
      isError: true,
    };
  }
};

/**
 * Tool definition for Edit
 */
export const editToolDefinition = {
  name: 'edit_file',
  description: 'Performs exact string replacements in a file. Requires the old_string to be unique within the file unless replace_all is specified as true.',
  inputSchema: {
    type: 'object',
    properties: {
      file_path: {
        type: 'string',
        description: 'Absolute path to the file to modify',
      },
      old_string: {
        type: 'string',
        description: 'The exact string to replace. Must be unique in the file unless replace_all is true.',
      },
      new_string: {
        type: 'string',
        description: 'The replacement string',
      },
      replace_all: {
        type: 'boolean',
        description: 'If true, replaces all occurrences of old_string. Default: false',
      },
    },
    required: ['file_path', 'old_string', 'new_string'],
  },
  execute: editTool,
};
