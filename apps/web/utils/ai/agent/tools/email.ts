import { tool, type InferUITool } from "ai";
import { z } from "zod";
import { createEmailProvider } from "@/utils/email/provider";
import { getEmailForLLM } from "@/utils/get-email-from-message";
import type {
  AgentToolContext,
  AgentToolContextWithEmail,
} from "@/utils/ai/agent/types";

const searchEmailsSchema = z.object({
  query: z.string().min(1).describe("Search query (Gmail-style syntax)"),
  maxResults: z
    .number()
    .int()
    .min(1)
    .max(20)
    .optional()
    .describe("Max results to return (1-20)"),
  pageToken: z.string().optional().describe("Pagination token from last call"),
  before: z
    .string()
    .datetime()
    .optional()
    .describe("Only results before this ISO date"),
  after: z
    .string()
    .datetime()
    .optional()
    .describe("Only results after this ISO date"),
});

export const searchEmailsTool = ({
  emailAccountId,
  provider,
  logger,
}: AgentToolContext) =>
  tool({
    description: "Search inbox with a query",
    inputSchema: searchEmailsSchema,
    execute: async ({ query, maxResults, pageToken, before, after }) => {
      const log = logger.with({ tool: "searchEmails" });
      log.info("Searching emails", { maxResults, hasPageToken: !!pageToken });
      log.trace("Search query", { query, before, after });
      const emailProvider = await createEmailProvider({
        emailAccountId,
        provider,
        logger: log,
      });

      const { messages, nextPageToken } =
        await emailProvider.getMessagesWithPagination({
          query,
          maxResults: maxResults ?? 10,
          pageToken,
          before: before ? new Date(before) : undefined,
          after: after ? new Date(after) : undefined,
        });

      return {
        query,
        count: messages.length,
        nextPageToken,
        messages: messages.map((message) => ({
          id: message.id,
          threadId: message.threadId,
          from: message.headers.from,
          to: message.headers.to,
          subject: message.headers.subject,
          snippet: message.snippet,
          date: message.date,
          hasAttachments: (message.attachments?.length ?? 0) > 0,
        })),
      };
    },
  });

export type SearchEmailsTool = InferUITool<ReturnType<typeof searchEmailsTool>>;

const getEmailSchema = z.object({
  maxLength: z
    .number()
    .int()
    .min(500)
    .max(12_000)
    .optional()
    .describe("Max length of email content (500-12000)"),
});

export const getEmailTool = ({
  emailAccountId,
  provider,
  emailId,
  logger,
}: AgentToolContextWithEmail) =>
  tool({
    description: "Read the current email content",
    inputSchema: getEmailSchema,
    execute: async ({ maxLength }) => {
      const log = logger.with({ tool: "getEmail" });
      log.info("Fetching email content");
      log.trace("Email ID", { emailId });

      const emailProvider = await createEmailProvider({
        emailAccountId,
        provider,
        logger: log,
      });

      const message = await emailProvider.getMessage(emailId);

      return {
        email: getEmailForLLM(message, {
          maxLength: maxLength ?? 5000,
        }),
        threadId: message.threadId,
        labels: message.labelIds ?? [],
      };
    },
  });

export type GetEmailTool = InferUITool<ReturnType<typeof getEmailTool>>;
