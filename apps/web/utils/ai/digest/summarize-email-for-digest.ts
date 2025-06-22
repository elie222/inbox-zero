import type { z } from "zod";
import { chatCompletionObject } from "@/utils/llms";
import type { EmailAccountWithAI } from "@/utils/llms/types";
import { createScopedLogger } from "@/utils/logger";
import type { EmailForLLM } from "@/utils/types";
import { stringifyEmailSimple } from "@/utils/stringify-email";
import { DigestEmailSummarySchema as schema } from "@/app/api/resend/digest/validation";

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
}): Promise<AISummarizeResult> {
  // If messageToSummarize somehow is null/undefined, default to null.
  if (!messageToSummarize) return null;

  const userMessageForPrompt = messageToSummarize;

  const system = "You are an AI assistant that summarizes emails for a digest.";

  const prompt = `
Summarize the following email for inclusion in a daily digest email.
	* This email has already been categorized as: ${ruleName}.

Formatting rules:
	* If the email contains clearly extractable structured data — such as prices, totals, item names, event titles, dates, times, payment methods, or IDs — return a single object with an "entries" field: a list of 2 ~ 6 relevant "label" and "value" pairs.
	* Order the entries by importance: start with identifying details and end with totals or amounts (e.g. "Total", "Amount Paid").
	* Use short, clear labels and concise values. Example: { label: "Total", value: "$29.99" }.
	* Do not extract notes, summaries, bullet points, or general narrative information into structured fields.

Unstructured fallback:
	* If the email contains general updates, team notes, meeting summaries, announcements, or freeform text — and does not contain distinct extractable values — return a single 'summary' field with a plain-text paragraph instead.
	* Only return 'summary' if no clear structure fits. Do not force structure.

Style rules:
	* Output must be plain text only — no HTML, no tables.
	* Output only one field: either 'entries' or 'summary', never both.
	* Keep the content minimal, scannable, and clean.
<message>
${stringifyEmailSimple(userMessageForPrompt)}
</message>
`.trim();

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

    return aiResponse.object as AISummarizeResult;
  } catch (error) {
    logger.error("Failed to summarize email", { error });
    return { summary: undefined };
  }
}
