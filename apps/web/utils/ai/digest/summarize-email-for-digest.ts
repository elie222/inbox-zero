import { z } from "zod";
import { chatCompletionObject } from "@/utils/llms";
import type { EmailAccountWithAI } from "@/utils/llms/types";
import { createScopedLogger } from "@/utils/logger";
import type { EmailForLLM } from "@/utils/types";
import { stringifyEmailSimple } from "@/utils/stringify-email";

const logger = createScopedLogger("summarize-email");

const schema = z.object({
  summary: z.string().nullish().describe("The summary of the email."),
});
export type AICheckResult = z.infer<typeof schema>;

export async function aiSummarizeEmailForDigest({
  emailAccount,
  messageToSummarize,
}: {
  emailAccount: EmailAccountWithAI;
  messageToSummarize: EmailForLLM;
}): Promise<AICheckResult> {
  // If messageToSummarize somehow is null/undefined, default to null.
  if (!messageToSummarize) return { summary: null };

  const userMessageForPrompt = messageToSummarize;

  const system = "You are an AI assistant that summarizes emails for a digest.";

  const prompt = `

Summarize the following email for inclusion in a daily digest email.
	•	Use a concise, professional format that is easy to scan.
	•	Choose the most appropriate output style:
	•	Use bullet points for general summaries with 2 ~ 4 key items.
	•	Use an HTML table (with width="100%") if the email includes any monetary values (e.g., $, €, £, R$).
	•	Use a plain text paragraph if neither bullet points nor a table makes sense.
	•	Highlight critical information using <strong> tags — such as amounts, dates, deadlines, quantities, order numbers, or payment methods.
	•	Do not highlight labels or descriptions — only highlight the actual values.
	•	Ensure tables are minimalist and email-friendly, with:
	•	Left-aligned header rows
	•	No unnecessary borders or visual clutter
	•	Only useful columns included (omit any unhelpful headers)
	•	Align the last column and its content to the right (especially for numeric or monetary values)
	•	Limit each summary to the essentials: no more than 4 bullet points or 5 table rows.
	•	Output must be clean, valid HTML, ready for direct use in an email client.

When summarizing receipts, invoices, or purchase confirmations:
	•	Always use a table layout, and include key fields like item, amount, date, and payment method.


<message>
${stringifyEmailSimple(userMessageForPrompt)}
</message>
`.trim();

  logger.trace("Input", { system, prompt });

  const aiResponse = await chatCompletionObject({
    userAi: emailAccount.user,
    system,
    prompt,
    schema,
    userEmail: emailAccount.email,
    usageLabel: "Summarize email",
  });

  logger.trace("Result", { response: aiResponse.object });

  return aiResponse.object as AICheckResult;
}
