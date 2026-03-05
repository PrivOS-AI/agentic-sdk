import type { ToolExecutorFunction } from '../tool-registry-manager.js';

/**
 * WebSearch tool: simplified implementation with configurable API
 */
export const webSearchTool: ToolExecutorFunction = async (input, _context) => {
  const { query, allowed_domains, blocked_domains } = input as {
    query: string;
    allowed_domains?: string[];
    blocked_domains?: string[];
  };

  if (!query || typeof query !== 'string') {
    return {
      content: 'Error: query is required and must be a string',
      isError: true,
    };
  }

  // Check for search API configuration
  const searchApiUrl = process.env.WEB_SEARCH_API_URL;

  if (!searchApiUrl) {
    // Use DuckDuckGo HTML search as fallback (no API key needed)
    // Matches Anthropic's web_search tool format
    try {
      const ddgUrl = `https://html.duckduckgo.com/html/?q=${encodeURIComponent(query)}`;
      const response = await fetch(ddgUrl, {
        headers: {
          'User-Agent': 'Mozilla/5.0 (compatible; AgenticSDK/1.0)',
        },
      });

      if (!response.ok) {
        throw new Error(`DuckDuckGo search failed: ${response.status}`);
      }

      const html = await response.text();

      // Parse search results from DuckDuckGo HTML
      const searchResults: Array<{ title: string; url: string }> = [];

      // Extract result links and titles
      const resultRegex = /<a[^>]*class="result__a"[^>]*href="([^"]*)"[^>]*>(.*?)<\/a>/g;

      let match;
      while ((match = resultRegex.exec(html)) !== null && searchResults.length < 10) {
        const url = match[1];
        const title = match[2].replace(/<[^>]*>/g, '').trim();

        // Clean up DuckDuckGo redirect URLs
        const cleanUrl = url.startsWith('/l/?uddg=')
          ? decodeURIComponent(url.substring(9).split('&')[0])
          : url;

        if (title && cleanUrl && !cleanUrl.includes('duckduckgo.com')) {
          searchResults.push({ title, url: cleanUrl });
        }
      }

      if (searchResults.length === 0) {
        return {
          content: `No search results found for "${query}". The search service may be temporarily unavailable.`,
        };
      }

      // Return in Anthropic-compatible format
      return {
        content: searchResults,
      };
    } catch (error) {
      return {
        content: `Web search failed: ${error instanceof Error ? error.message : String(error)}\n\nTo use a professional search API, set WEB_SEARCH_API_URL environment variable.\n\nQuery: ${query}`,
      };
    }
  }

  try {
    // Build search request
    const requestBody: Record<string, unknown> = {
      q: query,
      count: 10,
    };

    if (allowed_domains && allowed_domains.length > 0) {
      requestBody.allowed_domains = allowed_domains;
    }

    if (blocked_domains && blocked_domains.length > 0) {
      requestBody.blocked_domains = blocked_domains;
    }

    // Call search API
    const response = await fetch(searchApiUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        // Add API key header if configured
        ...(process.env.WEB_SEARCH_API_KEY && {
          Authorization: `Bearer ${process.env.WEB_SEARCH_API_KEY}`,
        }),
      },
      body: JSON.stringify(requestBody),
    });

    if (!response.ok) {
      throw new Error(`Search API returned error: ${response.status} ${response.statusText}`);
    }

    const data = await response.json();

    // Format results
    // The exact format depends on the search API, so we handle a common structure
    let results: string[] = [];

    if (data.results && Array.isArray(data.results)) {
      results = data.results.map((result: any) => {
        const title = result.title || result.titleText || '';
        const url = result.url || result.link || '';
        const snippet = result.snippet || result.description || '';

        return `- [${title}](${url})\n  ${snippet}`;
      });
    } else if (data.organic && Array.isArray(data.organic)) {
      // SERP API format
      results = data.organic.map((result: any) => {
        const title = result.title || '';
        const url = result.link || '';
        const snippet = result.snippet || '';

        return `- [${title}](${url})\n  ${snippet}`;
      });
    } else {
      // Fallback: return raw data
      return {
        content: JSON.stringify(data, null, 2),
      };
    }

    if (results.length === 0) {
      return {
        content: `No search results found for query: ${query}`,
      };
    }

    return {
      content: results.join('\n\n'),
    };
  } catch (error) {
    return {
      content: `Error performing web search: ${error instanceof Error ? error.message : String(error)}\n\nQuery: ${query}`,
      isError: true,
    };
  }
};

/**
 * Tool definition for WebSearch
 */
export const webSearchToolDefinition = {
  name: 'web_search',
  description: 'Searches the web for information using a configured search API. Requires WEB_SEARCH_API_URL environment variable. Optionally supports WEB_SEARCH_API_KEY for authentication.',
  inputSchema: {
    type: 'object',
    properties: {
      query: {
        type: 'string',
        description: 'Search query string',
        minLength: 2,
      },
      allowed_domains: {
        type: 'array',
        items: { type: 'string' },
        description: 'Only return results from these domains',
      },
      blocked_domains: {
        type: 'array',
        items: { type: 'string' },
        description: 'Exclude results from these domains',
      },
    },
    required: ['query'],
  },
  execute: webSearchTool,
};
