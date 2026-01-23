import type { z } from "zod";
import type { ChatToolContext } from "./chat";

/**
 * MCP tool definition for plugins.
 * Similar to chatTools but specifically for MCP protocol exposure.
 * Requires mcp:expose capability (verified plugins only).
 */
export interface PluginMcpTool<TParams = unknown, TResult = unknown> {
  /** Human-readable description of the tool */
  description: string;

  /** Zod schema for tool parameters */
  parameters: z.ZodSchema<TParams>;

  /** Execute the tool with given parameters */
  execute: (params: TParams, ctx: ChatToolContext) => Promise<TResult>;
}

/** Map of tool name to tool definition */
export type PluginMcpTools = Record<string, PluginMcpTool>;
