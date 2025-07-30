import { z } from "zod";
import { createScopedLogger } from "@/utils/logger";
import { chatCompletionObject } from "@/utils/llms";
import type { EmailForLLM } from "@/utils/types";
import type { EmailAccountWithAI } from "@/utils/llms/types";
import { sleep } from "@/utils/sleep";
import { stringifyEmail } from "@/utils/stringify-email";

const logger = createScopedLogger("email-report-summarize-emails");

const emailSummarySchema = z.object({
  summary: z.string().describe("Brief summary of the email content"),
  sender: z.string().describe("Email sender"),
  subject: z.string().describe("Email subject"),
  category: z
    .string()
    .describe("Category of the email (work, personal, marketing, etc.)"),
});
export type EmailSummary = z.infer<typeof emailSummarySchema>;

export async function aiSummarizeEmails(
  emails: EmailForLLM[],
  emailAccount: EmailAccountWithAI,
): Promise<EmailSummary[]> {
  if (emails.length === 0) {
    logger.warn("No emails to summarize, returning empty array");
    return [];
  }

  const batchSize = 15;
  const results: EmailSummary[] = [];

  for (let i = 0; i < emails.length; i += batchSize) {
    const batch = emails.slice(i, i + batchSize);
    const batchNumber = Math.floor(i / batchSize) + 1;
    const totalBatches = Math.ceil(emails.length / batchSize);

    const batchResults = await processEmailBatch(
      batch,
      emailAccount,
      batchNumber,
      totalBatches,
    );
    results.push(...batchResults);

    if (i + batchSize < emails.length) {
      await sleep(1000);
    }
  }

  return results;
}

async function processEmailBatch(
  emails: EmailForLLM[],
  emailAccount: EmailAccountWithAI,
  batchNumber: number,
  totalBatches: number,
): Promise<EmailSummary[]> {
  const system = `You are an assistant that processes user emails to extract their core meaning for later analysis.

For each email, write a **factual summary of 3–5 sentences** that clearly describes:
- The main topic or purpose of the email  
- What the sender wants, requests, or informs  
- Any relevant secondary detail (e.g., urgency, timing, sender role, or context)  
- Optional: mention tools, platforms, or projects if they help clarify the email's purpose

**Important Rules:**
- Be objective. Do **not** speculate, interpret intent, or invent details.
- Summarize only what is in the actual content of the email.
- Use professional and concise language.
- **Include** marketing/newsletter emails **only if** they reflect the user's professional interests (e.g., product updates, industry news, job boards).
- **Skip** irrelevant promotions, spam, or generic sales offers (e.g., holiday deals, coupon codes).`;

  const prompt = `
**Input Emails (Batch ${batchNumber} of ${totalBatches}):**

${emails.map((email) => `<email>${stringifyEmail(email, 2000)}</email>`).join("\n")}

Return the analysis as a JSON array of objects.`;

  logger.trace("Input", { system, prompt });

  const result = await chatCompletionObject({
    userAi: emailAccount.user,
    system,
    prompt,
    schema: z.object({
      summaries: z
        .array(emailSummarySchema)
        .describe("Summaries of the emails"),
    }),
    userEmail: emailAccount.email,
    usageLabel: "email-report-summary-generation",
    modelType: "economy",
  });

  logger.trace("Output", { result: result.object.summaries });

  return result.object.summaries;
}
