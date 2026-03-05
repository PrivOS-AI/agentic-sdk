#!/usr/bin/env node
/**
 * Custom MCP Server Example
 *
 * This example demonstrates creating an in-process MCP server
 * with custom tools defined in TypeScript.
 */

import { query, tool, createSdkMcpServer } from 'agentic-sdk';

async function main() {
  // Define custom tools
  const weatherTool = tool({
    name: 'get_weather',
    description: 'Get current weather for a city',
    inputSchema: {
      type: 'object',
      properties: {
        city: {
          type: 'string',
          description: 'City name',
        },
      },
      required: ['city'],
    },
    execute: async ({ city }) => {
      // Simulate weather API call
      const conditions = ['sunny', 'cloudy', 'rainy', 'snowy'];
      const condition = conditions[Math.floor(Math.random() * conditions.length)];
      const temp = Math.floor(Math.random() * 30) + 10; // 10-40°C

      return {
        content: `Weather in ${city}: ${temp}°C, ${condition}`,
      };
    },
  });

  const timeTool = tool({
    name: 'get_current_time',
    description: 'Get current time in a specific timezone',
    inputSchema: {
      type: 'object',
      properties: {
        timezone: {
          type: 'string',
          description: 'Timezone (e.g., "America/New_York")',
          default: 'UTC',
        },
      },
    },
    execute: async ({ timezone = 'UTC' }) => {
      const now = new Date();
      const timeString = now.toLocaleString('en-US', { timeZone: timezone });

      return {
        content: `Current time in ${timezone}: ${timeString}`,
      };
    },
  });

  // Create in-process MCP server
  const customServer = createSdkMcpServer('custom-tools', [
    weatherTool,
    timeTool,
  ]);

  // Use custom tools in query
  console.log('=== Custom MCP Server Example ===\n');

  for await (const message of query({
    prompt: 'What is the weather like in Tokyo and what time is it there?',
    options: {
      mcpServers: {
        custom: customServer,
      },
    },
  })) {
    if (message.type === 'text') {
      console.log(message.text);
    } else if (message.type === 'tool_use') {
      console.log(`[Using tool: ${message.name}]`);
    }
  }
}

main().catch(console.error);
