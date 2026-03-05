/**
 * MCP Tool Helper
 * Provides tool() function for defining MCP tools with Zod schemas
 */

import type { SdkMcpToolDefinition } from '../../types/mcp.js';

/**
 * Zod schema type (supports both v3 and v4)
 */
interface ZodSchema {
  _def: Record<string, unknown>;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  parse: (data: any) => any;
}

/**
 * Convert Zod schema to JSON Schema
 * Supports both Zod v3 and v4
 */
function zodToJsonSchema(zodSchema: ZodSchema): Record<string, unknown> {
  // Try to get ZodErrorInfo for version detection
  const schema = zodSchema as unknown as Record<string, unknown>;

  // Check if zodToJsonSchema function is available
  if ('zodToJsonSchema' in schema && typeof schema.zodToJsonSchema === 'function') {
    return schema.zodToJsonSchema() as Record<string, unknown>;
  }

  // Manual conversion for common Zod types
  const def = zodSchema._def;
  const typeName = def.typeName as string;

  switch (typeName) {
    case 'ZodString':
      return { type: 'string' };
    case 'ZodNumber':
      return { type: 'number' };
    case 'ZodBoolean':
      return { type: 'boolean' };
    case 'ZodObject':
      return convertZodObject(def);
    case 'ZodArray':
      return convertZodArray(def);
    case 'ZodEnum':
      return {
        type: 'string',
        enum: (def.values as unknown[]),
      };
    case 'ZodOptional':
      return zodToJsonSchema(def.innerType as ZodSchema);
    case 'ZodDefault':
      return zodToJsonSchema(def.innerType as ZodSchema);
    case 'ZodNullable':
      return {
        anyOf: [
          zodToJsonSchema(def.innerType as ZodSchema),
          { type: 'null' },
        ],
      };
    case 'ZodUnion':
      return {
        anyOf: (def.options as unknown[]).map((opt: unknown) => zodToJsonSchema(opt as ZodSchema)),
      };
    case 'ZodLiteral':
      return {
        const: def.value,
      };
    default:
      // Fallback: treat as string
      return { type: 'string' };
  }
}

/**
 * Convert Zod object to JSON Schema
 */
function convertZodObject(
  def: Record<string, unknown>
): Record<string, unknown> {
  const shape = (def.shape as () => Record<string, ZodSchema>)();
  const properties: Record<string, unknown> = {};
  const required: string[] = [];

  for (const [key, value] of Object.entries(shape)) {
    properties[key] = zodToJsonSchema(value);

    // Check if field is optional
    const valueDef = value._def;
    const valueTypeName = valueDef.typeName as string;
    const isOptional =
      valueTypeName === 'ZodOptional' ||
      valueTypeName === 'ZodDefault' ||
      valueTypeName === 'ZodNullable';

    if (!isOptional) {
      required.push(key);
    }
  }

  return {
    type: 'object',
    properties,
    ...(required.length > 0 && { required }),
  };
}

/**
 * Convert Zod array to JSON Schema
 */
function convertZodArray(
  def: Record<string, unknown>
): Record<string, unknown> {
  const itemSchema = zodToJsonSchema(def.type as ZodSchema);

  return {
    type: 'array',
    items: itemSchema,
  };
}

/**
 * Tool annotation options
 */
export interface ToolAnnotations {
  /** Tool is read-only */
  readOnly?: boolean;
  /** Tool is destructive */
  destructive?: boolean;
  /** Tool has open world knowledge */
  openWorld?: boolean;
}

/**
 * Define an MCP tool with Zod schema
 *
 * @param name - Tool name
 * @param description - Tool description
 * @param inputSchema - Zod schema for input validation
 * @param handler - Tool handler function
 * @param extras - Optional extras including annotations
 *
 * @example
 * ```ts
 * import { z } from 'zod';
 * import { tool } from 'agentic-sdk';
 *
 * const myTool = tool(
 *   'my_tool',
 *   'Does something cool',
 *   z.object({
 *     input: z.string(),
 *     count: z.number().optional(),
 *   }),
 *   async (input) => {
 *     return { result: `Processed ${input.input}` };
 *   },
 *   {
 *     annotations: {
 *       readOnly: true,
 *     },
 *   }
 * );
 * ```
 */
export function tool<Schema extends ZodSchema>(
  name: string,
  description: string,
  inputSchema: Schema,
  handler: (input: ReturnType<Schema['parse']>) => Promise<unknown> | unknown,
  extras?: {
    annotations?: ToolAnnotations;
  }
): SdkMcpToolDefinition<Schema> {
  // Convert Zod schema to JSON Schema
  const jsonSchema = zodToJsonSchema(inputSchema);

  return {
    name,
    description,
    inputSchema: jsonSchema as unknown as Schema,
    handler: handler as (input: unknown) => Promise<unknown> | unknown,
    annotations: extras?.annotations,
  };
}
