import { z } from "zod";
import { createScopedLogger } from "@/utils/logger";
import { createGenerateText } from "@/utils/llms";
import type { EmailAccountWithAI } from "@/utils/llms/types";
import type { EmailForLLM } from "@/utils/types";
import { stringifyEmail } from "@/utils/stringify-email";
import { getTodayForLLM } from "@/utils/llms/helpers";
import { getModel } from "@/utils/llms/model";
import type { EmailProvider } from "@/utils/email/provider";

const logger = createScopedLogger("reply-context-collector");

const agentSystem = `You are an intelligent email assistant that gathers historical context from the user's email history to inform a later drafting step.

Your task is to:
1. Analyze the current email thread to understand the main topic, question, or request
2. Search through the user's email history to find similar conversations from the past 6 months
3. Collect and synthesize the most relevant findings
4. When you are done, CALL finalizeReport with your final synthesized report as plain text

You have access to these tools:
- searchEmails: Search for emails using queries to find relevant historical context
- finalizeReport: Finalize and return your compiled report as plain text

Important guidelines:
- Perform as many searches as needed to confidently gather context, but be efficient
- Focus on emails that show how similar questions were answered before
- Identify patterns in how the user typically responds to such requests
- Prioritize emails that contain substantive responses, not just acknowledgments
- Only include information that directly helps a downstream drafting agent
 - Prefer precedent answers to general support questions across customers; do not rely on this sender's specific past conversation because that's already processed by the drafting agent

Example queries (provider-agnostic, general support):
- "order status" OR "shipment arrival"
- "refund policy" OR "return policy"
- "billing issue" OR "invoice question"

When searching, use natural language queries that would find relevant emails. The search will look through the past 6 months automatically.`;

export async function aiCollectReplyContext({
  currentThread,
  emailAccount,
  emailProvider,
}: {
  currentThread: EmailForLLM[];
  emailAccount: EmailAccountWithAI;
  emailProvider: EmailProvider;
}): Promise<string | null> {
  try {
    // Get 6 months ago date for search filtering
    const sixMonthsAgo = new Date();
    sixMonthsAgo.setMonth(sixMonthsAgo.getMonth() - 6);

    const threadSummary = currentThread
      .map((email) => stringifyEmail(email, 1000))
      .join("\n---\n");

    const prompt = `Current email thread to analyze:
<current_thread>
${threadSummary}
</current_thread>

User email: ${emailAccount.email}
${emailAccount.about ? `User context: ${emailAccount.about}` : ""}

${getTodayForLLM()}

Please analyze this email thread and search through the email history to find relevant context that could help a downstream drafting agent.

Perform as many searches as needed for recall and coverage. When finished, call finalizeReport with a concise, well-structured report containing:
- A brief topic summary
- Key precedents (bulleted), with why they are relevant
- Notable user response patterns or preferences
- Any suggested data points or snippets to surface to the drafting agent.`;

    const modelOptions = getModel(emailAccount.user, "economy");

    const generateText = createGenerateText({
      userEmail: emailAccount.email,
      label: "Reply context collector",
      modelOptions,
    });

    let finalReport: string | null = null;

    await generateText({
      ...modelOptions,
      system: agentSystem,
      prompt,
      stopWhen: (result) =>
        result.steps.some((step) =>
          step.toolCalls?.some((call) => call.toolName === "finalizeReport"),
        ) || result.steps.length > 25,
      tools: {
        searchEmails: {
          description:
            "Search for emails in the user's history to find relevant context",
          inputSchema: z.object({
            query: z
              .string()
              .describe("Search query to find relevant emails in history"),
          }),
          execute: async ({ query, reasoning }) => {
            try {
              const { messages } =
                await emailProvider.getMessagesWithPagination({
                  query,
                  maxResults: 20,
                  after: sixMonthsAgo,
                });

              return messages;
            } catch (error) {
              logger.error("Email search failed", { error, query });
              return {
                success: false,
                error: "Failed to search emails",
                query,
                reasoning,
              };
            }
          },
        },
        finalizeReport: {
          description:
            "Finalize and return your compiled report as plain text for downstream drafting",
          inputSchema: z.object({
            report: z.string().describe("Final compiled report as plain text"),
          }),
          execute: async ({ report }) => {
            finalReport = report;

            return { success: true };
          },
        },
      },
    });

    return finalReport;
  } catch (error) {
    logger.error("Reply context collection failed", { error });
    return null;
  }
}
