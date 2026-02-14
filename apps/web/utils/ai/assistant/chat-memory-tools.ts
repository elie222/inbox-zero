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
