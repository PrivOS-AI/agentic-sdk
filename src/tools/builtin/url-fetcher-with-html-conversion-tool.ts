import type { ToolExecutorFunction } from '../tool-registry-manager.js';

/**
 * WebFetch tool: fetch() with HTML to markdown conversion
 */
export const webFetchTool: ToolExecutorFunction = async (input, _context) => {
  const { url } = input as {
    url: string;
  };

  if (!url || typeof url !== 'string') {
    return {
      content: 'Error: url is required and must be a string',
      isError: true,
    };
  }

  // Validate URL format
  try {
    new URL(url);
  } catch {
    return {
      content: `Error: Invalid URL format: ${url}`,
      isError: true,
    };
  }

  try {
    // Fetch URL
    const response = await fetch(url, {
      method: 'GET',
      headers: {
        'User-Agent': 'Mozilla/5.0 (compatible; AgenticSDK/1.0)',
      },
      // Follow redirects
      redirect: 'follow',
    });

    if (!response.ok) {
      throw new Error(`HTTP ${response.status}: ${response.statusText}`);
    }

    // Get content type
    const contentType = response.headers.get('content-type') || '';

    // Check if HTML
    if (contentType.includes('text/html')) {
      const html = await response.text();

      // Convert HTML to readable text
      const text = htmlToReadableText(html);

      // Truncate if too large (limit to ~50k chars)
      const maxLength = 50000;
      const truncated = text.length > maxLength
        ? text.slice(0, maxLength) + '\n\n...(content truncated due to size)...'
        : text;

      return {
        content: truncated,
      };
    } else {
      // Return raw content for non-HTML
      const text = await response.text();

      // Truncate if needed
      const maxLength = 50000;
      const truncated = text.length > maxLength
        ? text.slice(0, maxLength) + '\n\n...(content truncated due to size)...'
        : text;

      return {
        content: truncated,
      };
    }
  } catch (error) {
    return {
      content: `Error fetching URL: ${error instanceof Error ? error.message : String(error)}`,
      isError: true,
    };
  }
};

/**
 * Convert HTML to readable text (basic implementation)
 * Strips HTML tags and preserves readable text content
 */
function htmlToReadableText(html: string): string {
  // Remove script and style tags with their content
  let text = html.replace(/<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi, '');
  text = text.replace(/<style\b[^<]*(?:(?!<\/style>)<[^<]*)*<\/style>/gi, '');

  // Replace common block elements with newlines
  text = text.replace(/<\/(div|p|h[1-6]|li|tr|td|th)>/gi, '\n');
  text = text.replace(/<(br|hr)\b[^>]*>/gi, '\n');

  // Remove all remaining HTML tags
  text = text.replace(/<[^>]+>/g, '');

  // Decode HTML entities
  text = text.replace(/&nbsp;/g, ' ');
  text = text.replace(/&amp;/g, '&');
  text = text.replace(/&lt;/g, '<');
  text = text.replace(/&gt;/g, '>');
  text = text.replace(/&quot;/g, '"');
  text = text.replace(/&#39;/g, "'");

  // Normalize whitespace
  text = text.replace(/\n\s*\n\s*\n/g, '\n\n'); // Multiple blank lines to double
  text = text.replace(/[ \t]+/g, ' '); // Multiple spaces to single

  // Trim and return
  return text.trim();
}

/**
 * Tool definition for WebFetch
 */
export const webFetchToolDefinition = {
  name: 'web_fetch',
  description: 'Fetches content from a URL. HTML content is automatically converted to readable text. Non-HTML content is returned as-is.',
  inputSchema: {
    type: 'object',
    properties: {
      url: {
        type: 'string',
        description: 'The URL to fetch',
      },
    },
    required: ['url'],
  },
  execute: webFetchTool,
};
