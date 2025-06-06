import { z } from "zod";
import { chatCompletionObject } from "@/utils/llms";
import type { EmailAccountWithAI } from "@/utils/llms/types";
import { createScopedLogger } from "@/utils/logger";
import type { EmailForLLM } from "@/utils/types";
import { stringifyEmailSimple } from "@/utils/stringify-email";
import { DigestEmailSummarySchema as schema } from "@/app/api/resend/digest/validation";

const logger = createScopedLogger("summarize-digest-email");

export type AICheckResult = z.infer<typeof schema>;

export async function aiSummarizeEmailForDigest({
  ruleNames,
  emailAccount,
  messageToSummarize,
}: {
  ruleNames: string[];
  emailAccount: EmailAccountWithAI;
  messageToSummarize: EmailForLLM;
}): Promise<AICheckResult> {
  // If messageToSummarize somehow is null/undefined, default to null.
  if (!messageToSummarize) return null;

  const userMessageForPrompt = messageToSummarize;

  const system = "You are an AI assistant that summarizes emails for a digest.";

  const prompt = `
Summarize the following email for inclusion in a daily digest email.
	•	This email has already been categorized. Use the provided categories: ${ruleNames.join(", ")}.

Formatting rules:
	•	If the email contains structured or extractable data (e.g. amounts, dates, event names, order numbers), return an object with an 'entries' field: a list of 2 ~ 6 important 'label' and 'value' pairs.
  •	Order the entries by relevance: start with contextual or identifying information, and always place financial totals or final key amounts (e.g. 'Total', 'Amount Paid', 'Amount Due') at the end.
	•	Use short, descriptive labels and clear values. Example: { 'label': 'Total', 'value': '$19.99' }.
	•	Do not include unnecessary or repetitive fields.
	•	If the email does not contain structured data, return a 'summary' field with a short plain-text paragraph instead.
	•	Never return both 'entries' and 'summary' — choose only one.

Style and output rules:
	•	Output must be plain text only — no HTML, no tables.
	•	Be concise and clear. The final output should be clean, minimal, and easy to read in a plain text email.

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
