import { tool } from "ai";
import { z } from "zod";
import prisma from "@/utils/prisma";
import type { AgentMemoryType } from "@/generated/prisma";
import type { ToolCall } from "../types";
import type { Logger } from "@/utils/logger";

// Context for memory tools
export interface MemoryToolContext {
  agentConfigId: string;
  logger: Logger;
  recordToolCall: (call: Omit<ToolCall, "timestamp">) => void;
}

/**
 * Create the remember tool - stores information for future reference
 */
export const createRememberTool = (ctx: MemoryToolContext) =>
  tool({
    description:
      "Store a fact, preference, or context for future reference. Use this to remember important information about senders, patterns, or user preferences.",
    parameters: z.object({
      key: z
        .string()
        .describe(
          "A unique identifier for this memory (e.g., 'sender:john@example.com', 'preference:reply-style')",
        ),
      content: z.string().describe("What to remember"),
      type: z
        .enum(["FACT", "PREFERENCE", "CONTEXT"])
        .describe(
          "Type of memory: FACT (learned fact), PREFERENCE (user preference), CONTEXT (contextual info)",
        ),
    }),
    execute: async ({ key, content, type }) => {
      ctx.logger.info("Agent storing memory", { key, type });

      try {
        await prisma.agentMemory.upsert({
          where: {
            agentConfigId_key: {
              agentConfigId: ctx.agentConfigId,
              key,
            },
          },
          create: {
            agentConfigId: ctx.agentConfigId,
            key,
            content,
            type: type as AgentMemoryType,
          },
          update: {
            content,
            type: type as AgentMemoryType,
          },
        });

        ctx.recordToolCall({
          name: "remember",
          args: { key, type },
          result: { success: true },
        });

        return { success: true, message: `Stored memory: ${key}` };
      } catch (error) {
        const errorMsg =
          error instanceof Error ? error.message : "Failed to store memory";
        ctx.recordToolCall({
          name: "remember",
          args: { key, type },
          error: errorMsg,
        });
        return { success: false, error: errorMsg };
      }
    },
  });

/**
 * Create the recall tool - retrieves stored memories
 */
export const createRecallTool = (ctx: MemoryToolContext) =>
  tool({
    description:
      "Retrieve stored memories. Can search by key prefix or get all memories of a certain type.",
    parameters: z.object({
      key: z
        .string()
        .optional()
        .describe(
          "Specific key to recall, or prefix to search (e.g., 'sender:')",
        ),
      type: z
        .enum(["FACT", "PREFERENCE", "CONTEXT"])
        .optional()
        .describe("Filter by memory type"),
    }),
    execute: async ({ key, type }) => {
      ctx.logger.info("Agent recalling memories", { key, type });

      try {
        let memories: { key: string; content: string; type: string }[];

        if (key) {
          // Search by key or key prefix
          memories = await prisma.agentMemory.findMany({
            where: {
              agentConfigId: ctx.agentConfigId,
              key: { startsWith: key },
              ...(type && { type: type as AgentMemoryType }),
            },
            orderBy: { updatedAt: "desc" },
            take: 20,
          });
        } else if (type) {
          // Get all of a type
          memories = await prisma.agentMemory.findMany({
            where: {
              agentConfigId: ctx.agentConfigId,
              type: type as AgentMemoryType,
            },
            orderBy: { updatedAt: "desc" },
            take: 20,
          });
        } else {
          // Get recent memories
          memories = await prisma.agentMemory.findMany({
            where: { agentConfigId: ctx.agentConfigId },
            orderBy: { updatedAt: "desc" },
            take: 20,
          });
        }

        ctx.recordToolCall({
          name: "recall",
          args: { key, type },
          result: { count: memories.length },
        });

        if (memories.length === 0) {
          return { success: true, memories: [], message: "No memories found" };
        }

        return {
          success: true,
          memories: memories.map((m) => ({
            key: m.key,
            content: m.content,
            type: m.type,
          })),
        };
      } catch (error) {
        const errorMsg =
          error instanceof Error ? error.message : "Failed to recall memories";
        ctx.recordToolCall({
          name: "recall",
          args: { key, type },
          error: errorMsg,
        });
        return { success: false, error: errorMsg };
      }
    },
  });

/**
 * Create the forget tool - removes a memory
 */
export const createForgetTool = (ctx: MemoryToolContext) =>
  tool({
    description: "Remove a stored memory",
    parameters: z.object({
      key: z.string().describe("The key of the memory to forget"),
    }),
    execute: async ({ key }) => {
      ctx.logger.info("Agent forgetting memory", { key });

      try {
        await prisma.agentMemory.delete({
          where: {
            agentConfigId_key: {
              agentConfigId: ctx.agentConfigId,
              key,
            },
          },
        });

        ctx.recordToolCall({
          name: "forget",
          args: { key },
          result: { success: true },
        });

        return { success: true, message: `Forgot memory: ${key}` };
      } catch (error) {
        const errorMsg =
          error instanceof Error ? error.message : "Failed to forget memory";
        ctx.recordToolCall({
          name: "forget",
          args: { key },
          error: errorMsg,
        });
        return { success: false, error: errorMsg };
      }
    },
  });

/**
 * Get all memory tools
 */
export function getMemoryTools(ctx: MemoryToolContext) {
  return {
    remember: createRememberTool(ctx),
    recall: createRecallTool(ctx),
    forget: createForgetTool(ctx),
  };
}
