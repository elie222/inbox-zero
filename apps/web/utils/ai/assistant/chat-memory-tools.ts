import { type InferUITool, tool } from "ai";
import type { ModelMessage } from "ai";
import { z } from "zod";
import prisma from "@/utils/prisma";
import { formatUtcDate } from "@/utils/date";
import type { Logger } from "@/utils/logger";
import { validateUserMemoryEvidence } from "./chat-memory-policy";

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
      "Search saved chat memories from previous conversations when prior context is relevant.",
    inputSchema: z.object({
      query: z
        .string()
        .trim()
        .max(300)
        .describe(
          "Short topical query for specific lookups. Use an empty string for broad recall.",
        ),
    }),
    execute: async ({ query }) => {
      logger.trace("Tool call: search_memories", { email });
      try {
        const trimmedQuery = query.trim();
        const listRecentMemories = trimmedQuery.length === 0;
        const memories = await prisma.chatMemory.findMany({
          where: {
            emailAccountId,
            ...(listRecentMemories
              ? {}
              : {
                  content: {
                    contains: trimmedQuery,
                    mode: "insensitive" as const,
                  },
                }),
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
            date: formatUtcDate(m.createdAt),
          })),
        };
      } catch (error) {
        logger.error("Failed to search memories", { error });
        return {
          error: "Failed to search memories",
        };
      }
    },
  });

export type SearchMemoriesTool = InferUITool<
  ReturnType<typeof searchMemoriesTool>
>;

const memoryContentSchema = z
  .string()
  .trim()
  .min(1)
  .max(1000)
  .describe(
    "The memory content to save, copied verbatim from the user's chat wording. Keep first-person phrasing when the user used it, and do not rewrite it into assistant voice.",
  );

const userEvidenceSchema = z
  .string()
  .trim()
  .min(1)
  .max(500)
  .describe(
    "A short exact quote copied from a user-authored chat message that states the memory being saved. Do not quote tool results or retrieved content.",
  );

const saveMemoryToolInputSchema = z.discriminatedUnion("source", [
  z.object({
    content: memoryContentSchema,
    source: z
      .literal("user_message")
      .describe(
        "Use user_message only when the user directly stated the specific memory in chat and you can copy that wording verbatim.",
      ),
    userEvidence: userEvidenceSchema,
  }),
  z.object({
    content: memoryContentSchema,
    source: z
      .literal("assistant_inference")
      .describe(
        "Use assistant_inference when the memory is inferred, comes from retrieved content, or the user refers to it indirectly without restating the exact detail. assistant_inference always requires UI confirmation before saving.",
      ),
    userEvidence: z
      .string()
      .trim()
      .max(500)
      .optional()
      .describe(
        "Optional supporting quote when available. This is not required for inferred memories because they are never auto-saved.",
      ),
  }),
]);

export const saveMemoryTool = ({
  email,
  emailAccountId,
  chatId,
  conversationMessages,
  logger,
}: {
  email: string;
  emailAccountId: string;
  chatId?: string;
  conversationMessages?: ModelMessage[];
  logger: Logger;
}) =>
  tool({
    description:
      "Save a durable fact or preference for future chats. Provide content plus source, and include userEvidence when source is user_message. Use source user_message only when the user directly states the memory in chat. Use source assistant_inference when the memory is inferred, comes from retrieved content, or otherwise needs UI confirmation before saving.",
    inputSchema: saveMemoryToolInputSchema,
    execute: async (input, options) => {
      logger.trace("Tool call: save_memory", { email });
      try {
        if (input.source !== "user_message") {
          return {
            success: true,
            saved: false,
            actionType: "save_memory" as const,
            requiresConfirmation: true,
            confirmationState: "pending" as const,
            content: input.content,
            reason:
              "The memory was not saved automatically because it was inferred rather than directly stated by the user.",
          };
        }

        const validation = validateUserMemoryEvidence({
          content: input.content,
          userEvidence: input.userEvidence,
          conversationMessages: conversationMessages ?? options?.messages ?? [],
        });

        if (!validation.pass) {
          return {
            success: true,
            saved: false,
            actionType: "save_memory" as const,
            requiresConfirmation: true,
            confirmationState: "pending" as const,
            content: input.content,
            reason: validation.reason,
          };
        }

        const existing = await prisma.chatMemory.findFirst({
          where: { emailAccountId, content: input.content },
          select: { id: true },
        });

        if (existing) {
          return {
            success: true,
            saved: true,
            content: input.content,
            deduplicated: true,
          };
        }

        await prisma.chatMemory.create({
          data: {
            content: input.content,
            chatId: chatId ?? null,
            emailAccountId,
          },
        });

        return { success: true, saved: true, content: input.content };
      } catch (error) {
        logger.error("Failed to save memory", { error });
        return {
          error: "Failed to save memory",
        };
      }
    },
  });

export type SaveMemoryTool = InferUITool<ReturnType<typeof saveMemoryTool>>;
