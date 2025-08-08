import { tool } from "ai";
import subMonths from "date-fns/subMonths";
import { z } from "zod";
import { createScopedLogger } from "@/utils/logger";
import { createGenerateText } from "@/utils/llms";
import type { EmailAccountWithAI } from "@/utils/llms/types";
import type { EmailForLLM } from "@/utils/types";
import { stringifyEmail } from "@/utils/stringify-email";
import { getTodayForLLM } from "@/utils/llms/helpers";
import { getModel } from "@/utils/llms/model";
import type { EmailProvider } from "@/utils/email/provider";
import { getEmailForLLM } from "@/utils/get-email-from-message";

const logger = createScopedLogger("reply-context-collector");

const resultSchema = z.object({
  notes: z
    .string()
    .describe("Any notes about the emails that may be helpful")
    .nullish(),
  relevantEmails: z
    .array(z.string())
    .describe(
      "Relevant emails and the user's responses. One question+answer per array item.",
    ),
});
type Result = z.infer<typeof resultSchema>;

const agentSystem = `You are an intelligent email assistant that gathers historical context from the user's email history to inform a later drafting step.

Your task is to:
1. Analyze the current email thread to understand the main topic, question, or request
2. Search through the user's email history to find similar conversations from the past 6 months
3. Collect and synthesize the most relevant findings
4. When you are done, CALL finalizeResults with your final results

You have access to these tools:
- searchEmails: Search for emails using queries to find relevant historical context
- finalizeResults: Finalize and return your results

Important guidelines:
- Perform as many searches as needed to confidently gather context, but be efficient
- Focus on emails that show how similar questions were answered before
- Only include information that directly helps a downstream drafting agent

When searching, use natural language queries that would find relevant emails. The search will look through the past 6 months automatically.

Example search queries:
- "order status" OR "shipment arrival" OR "tracking number"
- "refund" OR "return policy" OR "return window"
- "billing issue" OR "invoice question" OR "duplicate charge"
- "account access" OR "password reset" OR "2FA disabled"
- "API error" OR "500 errors" OR "database timeout"
- "enterprise pricing" OR "annual payment" OR "volume discount"`;

export async function aiCollectReplyContext({
  currentThread,
  emailAccount,
  emailProvider,
}: {
  currentThread: EmailForLLM[];
  emailAccount: EmailAccountWithAI;
  emailProvider: EmailProvider;
}): Promise<Result | null> {
  try {
    const sixMonthsAgo = subMonths(new Date(), 6);

    const threadSummary = currentThread
      .map((email) => `<email>${stringifyEmail(email, 1000)}</email>`)
      .join("\n");

    const prompt = `Current email thread to analyze:
<current_thread>
${threadSummary}
</current_thread>

User email: ${emailAccount.email}
${emailAccount.about ? `User context: ${emailAccount.about}` : ""}

${getTodayForLLM()}`;

    const modelOptions = getModel(emailAccount.user, "economy");

    const generateText = createGenerateText({
      userEmail: emailAccount.email,
      label: "Reply context collector",
      modelOptions,
    });

    let result: Result | null = null;

    await generateText({
      ...modelOptions,
      system: agentSystem,
      prompt,
      stopWhen: (result) =>
        result.steps.some((step) =>
          step.toolCalls?.some((call) => call.toolName === "finalizeResults"),
        ) || result.steps.length > 25,
      tools: {
        searchEmails: tool({
          description:
            "Search for emails in the user's history to find relevant context",
          inputSchema: z.object({
            query: z
              .string()
              .describe("Search query to find relevant emails in history"),
          }),
          execute: async ({ query }) => {
            logger.info("Searching emails", { query });
            try {
              const { messages } =
                await emailProvider.getMessagesWithPagination({
                  query,
                  maxResults: 20,
                  after: sixMonthsAgo,
                });

              const emails = messages.map((message) => {
                return getEmailForLLM(message, { maxLength: 2000 });
              });

              return emails;
            } catch (error) {
              const errorMessage =
                error instanceof Error ? error.message : "Unknown error";
              logger.error("Email search failed", {
                error,
                errorMessage,
                query,
              });
              return {
                success: false,
                error: errorMessage,
              };
            }
          },
        }),
        finalizeResults: tool({
          description:
            "Finalize and return your compiled results for downstream drafting",
          inputSchema: resultSchema,
          execute: async (finalResult) => {
            logger.info("Finalizing results", {
              notes: finalResult.notes,
              relevantEmails: finalResult.relevantEmails.length,
            });

            result = finalResult;

            return { success: true };
          },
        }),
      },
    });

    return result;
  } catch (error) {
    logger.error("Reply context collection failed", { error });
    return null;
  }
}
