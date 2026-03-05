import * as fs from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { glob } from 'glob';
import type { ToolExecutorFunction } from '../tool-registry-manager.js';

/**
 * Grep tool: regex content search
 */
export const grepTool: ToolExecutorFunction = async (input, context) => {
  const {
    pattern,
    path: searchPath,
    glob: globPattern,
    output_mode = 'content',
    context: contextLines,
    head_limit: headLimit,
    multiline,
  } = input as {
    pattern: string;
    path?: string;
    glob?: string;
    output_mode?: 'content' | 'files_with_matches' | 'count';
    context?: number;
    head_limit?: number;
    multiline?: boolean;
  };

  if (!pattern || typeof pattern !== 'string') {
    return {
      content: 'Error: pattern is required and must be a string',
      isError: true,
    };
  }

  try {
    // Determine which files to search
    let filesToSearch: string[] = [];

    if (searchPath && existsSync(searchPath)) {
      // Search in specific file
      filesToSearch = [searchPath];
    } else if (globPattern) {
      // Search files matching glob pattern
      filesToSearch = await glob(globPattern, {
        cwd: context.cwd,
        absolute: false,
        nodir: true,
      });
    } else {
      return {
        content: 'Error: must provide either path (for single file) or glob (for pattern matching)',
        isError: true,
      };
    }

    // Compile regex
    const regexFlags = multiline ? 'gm' : 'g';
    let regex: RegExp;
    try {
      regex = new RegExp(pattern, regexFlags);
    } catch (error) {
      return {
        content: `Error: Invalid regex pattern: ${error instanceof Error ? error.message : String(error)}`,
        isError: true,
      };
    }

    // Search files
    const results: Array<{
      file: string;
      matches: Array<{
        line: number;
        content: string;
      }>;
      count: number;
    }> = [];

    for (const file of filesToSearch) {
      try {
        const content = await fs.readFile(file, 'utf-8');
        const lines = content.split('\n');

        const matches: Array<{ line: number; content: string }> = [];
        let count = 0;

        // Search line by line (for line numbers)
        if (output_mode === 'content') {
          for (let i = 0; i < lines.length; i++) {
            const line = lines[i];
            if (regex.test(line)) {
              matches.push({ line: i + 1, content: line });
              count++;
            }
            regex.lastIndex = 0; // Reset regex for next line
          }
        } else if (output_mode === 'files_with_matches') {
          // Just check if pattern exists anywhere in file
          if (regex.test(content)) {
            matches.push({ line: 1, content: '(match found)' });
            count = 1;
          }
        } else if (output_mode === 'count') {
          // Count all matches
          const matchArray = content.match(regex);
          count = matchArray ? matchArray.length : 0;
        }

        if (matches.length > 0 || count > 0) {
          results.push({ file, matches, count });
        }
      } catch (error) {
        // Skip files that can't be read
        continue;
      }
    }

    // Format output
    if (output_mode === 'files_with_matches') {
      const files = results.map((r) => r.file).join('\n');
      return {
        content: files || '(no matches)',
      };
    }

    if (output_mode === 'count') {
      const counts = results.map((r) => `${r.file}: ${r.count}`).join('\n');
      return {
        content: counts || '(no matches)',
      };
    }

    // Default: content mode with line numbers
    const outputLines: string[] = [];
    let totalMatches = 0;

    for (const result of results) {
      for (const match of result.matches) {
        if (headLimit && totalMatches >= headLimit) {
          break;
        }

        // Add context lines if specified
        if (contextLines && contextLines > 0) {
          const startLine = Math.max(0, match.line - contextLines - 1);
          const endLine = Math.min(
            result.matches.length - 1,
            match.line + contextLines - 1
          );

          for (let i = startLine; i <= endLine; i++) {
            if (i < result.matches.length) {
              const prefix = i === match.line - 1 ? '>' : '-';
              outputLines.push(`${prefix} ${result.file}:${result.matches[i].line}:${result.matches[i].content}`);
            }
          }
        } else {
          outputLines.push(`${result.file}:${match.line}:${match.content}`);
        }

        totalMatches++;
      }

      if (headLimit && totalMatches >= headLimit) {
        outputLines.push(`(showing first ${headLimit} matches)`);
        break;
      }
    }

    return {
      content: outputLines.length > 0 ? outputLines.join('\n') : '(no matches)',
    };
  } catch (error) {
    return {
      content: `Error: ${error instanceof Error ? error.message : String(error)}`,
      isError: true,
    };
  }
};

/**
 * Tool definition for Grep
 */
export const grepToolDefinition = {
  name: 'grep',
  description: 'Search file contents using regex patterns. Supports output modes: content (with line numbers), files_with_matches, or count.',
  inputSchema: {
    type: 'object',
    properties: {
      pattern: {
        type: 'string',
        description: 'Regular expression pattern to search for',
      },
      path: {
        type: 'string',
        description: 'Path to a single file to search (use glob for multiple files)',
      },
      glob: {
        type: 'string',
        description: 'Glob pattern to search multiple files (e.g., "**/*.ts")',
      },
      output_mode: {
        type: 'string',
        enum: ['content', 'files_with_matches', 'count'],
        description: 'Output format: content shows matches with line numbers, files_with_matches lists matching files, count shows match counts per file',
      },
      context: {
        type: 'number',
        description: 'Number of context lines to show around matches (content mode only)',
      },
      head_limit: {
        type: 'number',
        description: 'Maximum number of matches to return',
      },
      multiline: {
        type: 'boolean',
        description: 'Enable multiline mode for pattern matching',
      },
    },
    required: ['pattern'],
  },
  execute: grepTool,
};
