import { tool } from "ai";
import { z } from "zod";
import prisma from "@/utils/prisma";
import type { EmailProvider } from "@/utils/email/types";
import type { ToolCall } from "../types";
import type { Logger } from "@/utils/logger";
import { extractEmailAddress } from "@/utils/email";

// Context for context tools
export interface ContextToolContext {
  provider: EmailProvider;
  emailAccountId: string;
  logger: Logger;
  recordToolCall: (call: Omit<ToolCall, "timestamp">) => void;
}

/**
 * Create the get labels tool - lists available labels
 */
export const createGetLabelsTool = (ctx: ContextToolContext) =>
  tool({
    description: "Get all available labels/folders in the mailbox",
    parameters: z.object({}),
    execute: async () => {
      ctx.logger.info("Agent getting labels");

      try {
        const labels = await ctx.provider.getLabels();

        ctx.recordToolCall({
          name: "getLabels",
          args: {},
          result: { count: labels.length },
        });

        return {
          success: true,
          labels: labels.map((l) => ({
            id: l.id,
            name: l.name,
            type: l.type,
          })),
        };
      } catch (error) {
        const errorMsg =
          error instanceof Error ? error.message : "Failed to get labels";
        ctx.recordToolCall({
          name: "getLabels",
          args: {},
          error: errorMsg,
        });
        return { success: false, error: errorMsg };
      }
    },
  });

/**
 * Create the get sender history tool - gets info about previous emails from sender
 */
export const createGetSenderHistoryTool = (ctx: ContextToolContext) =>
  tool({
    description:
      "Get information about previous emails from a sender, including how many emails and when the last one was",
    parameters: z.object({
      senderEmail: z.string().describe("The sender's email address"),
    }),
    execute: async ({ senderEmail }) => {
      ctx.logger.info("Agent getting sender history", { senderEmail });

      try {
        const email = extractEmailAddress(senderEmail);

        // Get email count and last email date from our database
        const stats = await prisma.emailMessage.aggregate({
          where: {
            emailAccountId: ctx.emailAccountId,
            from: email,
          },
          _count: true,
          _max: { date: true },
        });

        // Get newsletter/sender info if exists
        const senderInfo = await prisma.newsletter.findUnique({
          where: {
            email_emailAccountId: {
              email,
              emailAccountId: ctx.emailAccountId,
            },
          },
          select: {
            status: true,
            category: { select: { name: true } },
          },
        });

        ctx.recordToolCall({
          name: "getSenderHistory",
          args: { senderEmail: email },
          result: { emailCount: stats._count },
        });

        return {
          success: true,
          senderEmail: email,
          emailCount: stats._count,
          lastEmailDate: stats._max.date?.toISOString() || null,
          status: senderInfo?.status || null,
          category: senderInfo?.category?.name || null,
        };
      } catch (error) {
        const errorMsg =
          error instanceof Error
            ? error.message
            : "Failed to get sender history";
        ctx.recordToolCall({
          name: "getSenderHistory",
          args: { senderEmail },
          error: errorMsg,
        });
        return { success: false, error: errorMsg };
      }
    },
  });

/**
 * Create the get knowledge tool - retrieves from knowledge base
 */
export const createGetKnowledgeTool = (ctx: ContextToolContext) =>
  tool({
    description:
      "Search the knowledge base for relevant information (e.g., FAQs, policies, templates)",
    parameters: z.object({
      query: z
        .string()
        .optional()
        .describe("Search term (searches titles and content)"),
      title: z
        .string()
        .optional()
        .describe("Get a specific knowledge entry by title"),
    }),
    execute: async ({ query, title }) => {
      ctx.logger.info("Agent searching knowledge base", { query, title });

      try {
        let results: { title: string; content: string }[];

        if (title) {
          // Get specific entry
          const entry = await prisma.knowledge.findUnique({
            where: {
              emailAccountId_title: {
                emailAccountId: ctx.emailAccountId,
                title,
              },
            },
          });
          results = entry ? [entry] : [];
        } else if (query) {
          // Search by query
          results = await prisma.knowledge.findMany({
            where: {
              emailAccountId: ctx.emailAccountId,
              OR: [
                { title: { contains: query, mode: "insensitive" } },
                { content: { contains: query, mode: "insensitive" } },
              ],
            },
            take: 5,
          });
        } else {
          // Get all entries
          results = await prisma.knowledge.findMany({
            where: { emailAccountId: ctx.emailAccountId },
            take: 10,
          });
        }

        ctx.recordToolCall({
          name: "getKnowledge",
          args: { query, title },
          result: { count: results.length },
        });

        if (results.length === 0) {
          return {
            success: true,
            entries: [],
            message: "No knowledge entries found",
          };
        }

        return {
          success: true,
          entries: results.map((r) => ({
            title: r.title,
            content: r.content,
          })),
        };
      } catch (error) {
        const errorMsg =
          error instanceof Error
            ? error.message
            : "Failed to search knowledge base";
        ctx.recordToolCall({
          name: "getKnowledge",
          args: { query, title },
          error: errorMsg,
        });
        return { success: false, error: errorMsg };
      }
    },
  });

/**
 * Get all context tools
 */
export function getContextTools(ctx: ContextToolContext) {
  return {
    getLabels: createGetLabelsTool(ctx),
    getSenderHistory: createGetSenderHistoryTool(ctx),
    getKnowledge: createGetKnowledgeTool(ctx),
  };
}
