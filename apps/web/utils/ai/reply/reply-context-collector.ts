import { tool } from "ai";
import subMonths from "date-fns/subMonths";
import { z } from "zod";
import { createScopedLogger } from "@/utils/logger";
import { createGenerateText } from "@/utils/llms";
import type { EmailAccountWithAI } from "@/utils/llms/types";
import type { EmailForLLM } from "@/utils/types";
import { getTodayForLLM } from "@/utils/ai/helpers";
import { getModel } from "@/utils/llms/model";
import type { EmailProvider } from "@/utils/email/types";
import { getEmailForLLM } from "@/utils/get-email-from-message";
import { captureException } from "@/utils/error";
import { getEmailListPrompt, getUserInfoPrompt } from "@/utils/ai/helpers";

const logger = createScopedLogger("reply-context-collector");

const resultSchema = z.object({
  notes: z
    .string()
    .describe("Any notes about the emails that may be helpful")
    .nullish(),
  relevantEmails: z
    .array(z.string())
    .describe(
      "Past email conversations from search results that could help draft the response. Leave empty if no relevant past emails found.",
    ),
});
export type ReplyContextCollectorResult = z.infer<typeof resultSchema>;

const agentSystem = `You are an intelligent email assistant that gathers historical context from the user's email history to inform a later drafting step.

Your task is to:
1. Analyze the current email thread to understand the main topic, question, or request
2. Search through the user's email history to find similar conversations from the past 6 months
3. Collect and synthesize the most relevant findings from your searches
4. When you are done, CALL finalizeResults with your final results

You have access to these tools:
- searchEmails: Search for emails using queries to find relevant historical context
- finalizeResults: Finalize and return your results

CRITICAL GUIDELINES:
- The current email thread is already provided to the drafting agent - DO NOT include it in relevantEmails
- The relevantEmails array should ONLY contain past emails found through your searches that could help draft a response
- If no relevant past emails are found through searching, leave the relevantEmails array empty
- Perform as many searches as needed to confidently gather context, but be efficient
- Focus on emails that show how similar questions were answered before
- Only include information that directly helps a downstream drafting agent

When searching, use natural language queries that would find relevant emails. The search will look through the past 6 months automatically.

Search Tips:
- The search looks for EXACT text matches in emails
- IMPORTANT: Try simpler queries if you don't get results for your first search
- Try the subject line first if it contains the main topic

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
}): Promise<ReplyContextCollectorResult | null> {
  try {
    const sixMonthsAgo = subMonths(new Date(), 6);

    const prompt = `Current email thread to analyze:

<thread>
${getEmailListPrompt({ messages: currentThread, messageMaxLength: 1000 })}
</thread>

${getUserInfoPrompt({ emailAccount })}

${getTodayForLLM()}`;

    const modelOptions = getModel(emailAccount.user, "economy");

    const generateText = createGenerateText({
      userEmail: emailAccount.email,
      label: "Reply context collector",
      modelOptions,
    });

    let result: ReplyContextCollectorResult | null = null;

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

              logger.info("Found emails", { emails: emails.length });
              // logger.trace("Found emails", { emails });

              return emails;
            } catch (error) {
              const errorMessage =
                error instanceof Error ? error.message : "Unknown error";
              logger.error("Email search failed", {
                error,
                errorMessage,
                query,
                emailProvider: emailProvider.name,
                afterDate: sixMonthsAgo.toISOString(),
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
              relevantEmails: finalResult.relevantEmails.length,
            });
            logger.trace("Finalizing results", {
              notes: finalResult.notes,
              relevantEmails: finalResult.relevantEmails,
            });

            result = finalResult;

            return { success: true };
          },
        }),
      },
    });

    return result;
  } catch (error) {
    logger.error("Reply context collection failed", {
      email: emailAccount.email,
      error,
    });
    captureException(error, {
      extra: {
        scope: "reply-context-collector",
        email: emailAccount.email,
        userId: emailAccount.userId,
      },
    });
    return null;
  }
}
