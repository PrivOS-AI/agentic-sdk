import * as fs from 'node:fs/promises';
import * as path from 'node:path';
import { existsSync } from 'node:fs';
import type { ToolExecutorFunction } from '../tool-registry-manager.js';

/**
 * Read tool: fs.readFile with line numbers, offset/limit, image support
 */
export const readTool: ToolExecutorFunction = async (input, _context) => {
  const { file_path, offset, limit } = input as {
    file_path: string;
    offset?: number;
    limit?: number;
  };

  if (!file_path || typeof file_path !== 'string') {
    return {
      content: 'Error: file_path is required and must be a string',
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
    // Check if it's an image file by extension
    const imageExtensions = ['.png', '.jpg', '.jpeg', '.gif', '.webp', '.bmp', '.svg'];
    const ext = path.extname(absolutePath).toLowerCase();

    if (imageExtensions.includes(ext)) {
      // Read image as base64
      const buffer = await fs.readFile(absolutePath);
      const base64 = buffer.toString('base64');

      // Detect media type
      const mediaType = getMediaType(ext);

      return {
        content: `data:${mediaType};base64,${base64}`,
      };
    }

    // Read text file
    let content = await fs.readFile(absolutePath, 'utf-8');

    // Handle empty file
    if (!content || content.trim().length === 0) {
      return {
        content: '(empty file)',
      };
    }

    // Split into lines
    const lines = content.split('\n');

    // Apply offset/limit if specified
    // offset is 1-based, so convert to 0-based for array indexing
    let startLine = offset && offset > 0 ? offset - 1 : 0;
    let endLine = limit && limit > 0 ? startLine + limit : lines.length;

    // Clamp values
    startLine = Math.max(0, Math.min(startLine, lines.length));
    endLine = Math.max(startLine, Math.min(endLine, lines.length));

    // Extract lines and add line numbers (cat -n format)
    const selectedLines = lines.slice(startLine, endLine);
    const totalWidth = String(lines.length).length; // Pad based on total line count
    const numberedLines = selectedLines
      .map((line, idx) => {
        const lineNum = startLine + idx + 1;
        const paddedNum = String(lineNum).padStart(totalWidth, ' ');
        return `${paddedNum}\t${line}`;
      })
      .join('\n');

    return {
      content: numberedLines || '(empty file)',
    };
  } catch (error) {
    return {
      content: `Error reading file: ${error instanceof Error ? error.message : String(error)}`,
      isError: true,
    };
  }
};

/**
 * Get media type for image extension
 */
function getMediaType(ext: string): string {
  const mediaTypes: Record<string, string> = {
    '.png': 'image/png',
    '.jpg': 'image/jpeg',
    '.jpeg': 'image/jpeg',
    '.gif': 'image/gif',
    '.webp': 'image/webp',
    '.bmp': 'image/bmp',
    '.svg': 'image/svg+xml',
  };
  return mediaTypes[ext] || 'image/png';
}

/**
 * Tool definition for Read
 */
export const readToolDefinition = {
  name: 'read_file',
  description: 'Reads a file from the local filesystem. Supports text files with optional offset/limit for partial reads, and image files which are returned as base64 data URLs.',
  inputSchema: {
    type: 'object',
    properties: {
      file_path: {
        type: 'string',
        description: 'Absolute path to the file to read',
      },
      offset: {
        type: 'number',
        description: 'Line number to start reading from (1-based, default: 1)',
      },
      limit: {
        type: 'number',
        description: 'Maximum number of lines to read (default: all lines)',
      },
    },
    required: ['file_path'],
  },
  execute: readTool,
};
