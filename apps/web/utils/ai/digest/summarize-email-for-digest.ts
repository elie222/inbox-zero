import { z } from "zod";
import { chatCompletionObject } from "@/utils/llms";
import type { EmailAccountWithAI } from "@/utils/llms/types";
import { createScopedLogger } from "@/utils/logger";
import type { EmailForLLM } from "@/utils/types";
import { stringifyEmailSimple } from "@/utils/stringify-email";

export const schema = z.union([
  z.object({
    entries: z
      .array(
        z.object({
          label: z.string().describe("The label of the summarized item"),
          value: z.string().describe("The value of the summarized item"),
        }),
      )
      .nullish()
      .describe("An array of items summarizing the email content"),
  }),
  z.object({
    summary: z.string().nullish().describe("A summary of the email content"),
  }),
]);

const logger = createScopedLogger("summarize-digest-email");

export type AISummarizeResult = z.infer<typeof schema>;

export async function aiSummarizeEmailForDigest({
  ruleName,
  emailAccount,
  messageToSummarize,
}: {
  ruleName: string;
  emailAccount: EmailAccountWithAI;
  messageToSummarize: EmailForLLM;
}): Promise<AISummarizeResult | null> {
  // If messageToSummarize somehow is null/undefined, default to null.
  if (!messageToSummarize) return null;

  const userMessageForPrompt = messageToSummarize;

  const system = `You are an AI assistant that summarizes emails for a daily digest email. 
You must return a valid JSON object with exactly one of these structures:

1. For structured data (prices, totals, item names, event titles, dates, times, payment methods, IDs):
   {"entries": [{"label": "Field Name", "value": "Field Value"}]}

2. For unstructured content (general updates, team notes, meeting summaries, announcements):
   {"summary": "Plain text summary paragraph"}

3. If the email is not worth summarizing or is spam:
   null

Summarize the following email for inclusion in a daily digest email.

RULES:
- If the email contains structured data (prices, totals, item names, event titles, dates, times, payment methods, IDs), return an "entries" array with 2-6 label/value pairs.
- Order entries by importance: start with identifying details, end with totals/amounts.
- Use short, clear labels and concise values.
- If the email contains general updates, team notes, meeting summaries, or announcements without distinct extractable values, return a "summary" field with a plain-text paragraph.
- If the email is spam, promotional content, or not worth summarizing, return null.
- Return ONLY valid JSON - no HTML, no tables, no explanatory text.

Return a valid JSON object with either "entries" array, "summary" string, or null.
`;

  const prompt = `
<email_content>
${stringifyEmailSimple(userMessageForPrompt)}
</email_content>

This email has already been categorized as: ${ruleName}.`;

  logger.trace("Input", { system, prompt });

  try {
    const aiResponse = await chatCompletionObject({
      userAi: emailAccount.user,
      system,
      prompt,
      schema,
      userEmail: emailAccount.email,
      usageLabel: "Summarize email",
    });

    logger.trace("Result", { response: aiResponse.object });

    return aiResponse.object;
  } catch (error) {
    logger.error("Failed to summarize email", { error });

    return {
      summary: undefined,
    };
  }
}
