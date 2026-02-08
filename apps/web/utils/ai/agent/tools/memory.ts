import { tool, type InferUITool } from "ai";
import { z } from "zod";
import prisma from "@/utils/prisma";
import type { AgentToolContext } from "@/utils/ai/agent/types";

const updateAboutSchema = z.object({
  action: z
    .enum(["append", "replace"])
    .describe(
      "append: add a line to existing about text. replace: overwrite entirely.",
    ),
  content: z
    .string()
    .min(1)
    .max(2000)
    .describe("The fact or information to save"),
});

export const updateAboutTool = ({ emailAccountId, logger }: AgentToolContext) =>
  tool({
    description:
      "Save important facts about the user to persistent memory (preferences, role, company, communication style). These facts are included in every future conversation.",
    inputSchema: updateAboutSchema,
    execute: async ({ action, content }) => {
      const log = logger.with({ tool: "updateAbout" });
      log.info("Updating about field", { action });

      if (action === "replace") {
        await prisma.emailAccount.update({
          where: { id: emailAccountId },
          data: { about: content },
        });
        return { success: true, about: content };
      }

      // Atomic append avoids read-then-write race condition
      const result = await prisma.$queryRaw<{ about: string }[]>`
        UPDATE "EmailAccount"
        SET "about" = CASE
          WHEN "about" IS NULL OR "about" = '' THEN ${content}
          ELSE "about" || E'\n' || ${content}
        END
        WHERE "id" = ${emailAccountId}
        RETURNING "about"
      `;

      return { success: true, about: result[0].about };
    },
  });

export type UpdateAboutTool = InferUITool<ReturnType<typeof updateAboutTool>>;

const searchConversationsSchema = z.object({
  query: z
    .string()
    .min(1)
    .max(200)
    .describe("Search term to find in past conversations"),
  limit: z
    .number()
    .min(1)
    .max(20)
    .default(5)
    .describe("Maximum number of results to return"),
});

export const searchConversationsTool = ({
  emailAccountId,
  logger,
}: AgentToolContext) =>
  tool({
    description:
      "Search past conversations for context. Use when the user references something discussed before or when you need background for a decision.",
    inputSchema: searchConversationsSchema,
    execute: async ({ query, limit }) => {
      const log = logger.with({ tool: "searchConversations" });
      log.info("Searching conversations", { limit });
      log.trace("Search query", { query });

      const messages = await prisma.chatMessage.findMany({
        where: {
          chat: { emailAccountId },
          parts: { string_contains: query },
        },
        select: {
          id: true,
          role: true,
          parts: true,
          createdAt: true,
          chatId: true,
        },
        orderBy: { createdAt: "desc" },
        take: limit,
      });

      return {
        results: messages.map((msg) => ({
          chatId: msg.chatId,
          role: msg.role,
          snippet: extractSnippet(msg.parts, query),
          createdAt: msg.createdAt.toISOString(),
        })),
      };
    },
  });

export type SearchConversationsTool = InferUITool<
  ReturnType<typeof searchConversationsTool>
>;

function extractSnippet(
  parts: unknown,
  query: string,
  maxLength = 300,
): string {
  const text = typeof parts === "string" ? parts : JSON.stringify(parts);
  const lower = text.toLowerCase();
  const idx = lower.indexOf(query.toLowerCase());

  if (idx === -1) return text.slice(0, maxLength);

  const start = Math.max(0, idx - 100);
  const end = Math.min(text.length, idx + query.length + 200);
  const snippet = text.slice(start, end);
  return (start > 0 ? "..." : "") + snippet + (end < text.length ? "..." : "");
}
