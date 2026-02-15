import { type InferUITool, tool } from "ai";
import { z } from "zod";
import prisma from "@/utils/prisma";
import type { Logger } from "@/utils/logger";

export const searchMemoriesTool = ({
  email,
  emailAccountId,
  logger,
}: {
  email: string;
  emailAccountId: string;
  logger: Logger;
}) =>
  tool({
    description:
      "Search memories from previous conversations. Use this when you need context about past interactions, user preferences discussed before, or decisions made in earlier conversations.",
    inputSchema: z.object({
      query: z
        .string()
        .trim()
        .min(1)
        .max(300)
        .describe(
          "Search query to find relevant memories (e.g., 'newsletter rules', 'meeting preferences')",
        ),
    }),
    execute: async ({ query }) => {
      logger.trace("Tool call: search_memories", { email });

      const memories = await prisma.chatMemory.findMany({
        where: {
          emailAccountId,
          content: { contains: query, mode: "insensitive" },
        },
        orderBy: { createdAt: "desc" },
        take: 10,
        select: {
          content: true,
          createdAt: true,
        },
      });

      if (memories.length === 0) {
        return { memories: [], message: "No matching memories found." };
      }

      return {
        memories: memories.map((m) => ({
          content: m.content,
          date: m.createdAt.toISOString().split("T")[0],
        })),
      };
    },
  });

export type SearchMemoriesTool = InferUITool<
  ReturnType<typeof searchMemoriesTool>
>;

export const saveMemoryTool = ({
  email,
  emailAccountId,
  chatId,
  logger,
}: {
  email: string;
  emailAccountId: string;
  chatId?: string;
  logger: Logger;
}) =>
  tool({
    description:
      "Save a memory for future conversations. Use when the user asks you to remember something or when you identify a durable preference worth saving (e.g., workflow preferences, important contacts, inbox management style).",
    inputSchema: z.object({
      content: z
        .string()
        .trim()
        .min(1)
        .max(1000)
        .describe(
          "The memory content to save. Should be a clear, self-contained statement of the preference or fact.",
        ),
    }),
    execute: async ({ content }) => {
      logger.trace("Tool call: save_memory", { email });

      const existing = await prisma.chatMemory.findFirst({
        where: { emailAccountId, content },
        select: { id: true },
      });

      if (existing) {
        return { success: true, content, deduplicated: true };
      }

      await prisma.chatMemory.create({
        data: {
          content,
          chatId: chatId ?? null,
          emailAccountId,
        },
      });

      return { success: true, content };
    },
  });

export type SaveMemoryTool = InferUITool<ReturnType<typeof saveMemoryTool>>;
