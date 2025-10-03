import { z } from "zod";
import { createScopedLogger } from "@/utils/logger";
import { createGenerateObject } from "@/utils/llms";
import type { EmailForLLM } from "@/utils/types";
import type { EmailAccountWithAI } from "@/utils/llms/types";
import { sleep } from "@/utils/sleep";
import { getModel } from "@/utils/llms/model";
import { getEmailListPrompt } from "@/utils/ai/helpers";

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

${getEmailListPrompt({ messages: emails, messageMaxLength: 2000 })}

Return the analysis as a JSON array of objects.`;

  const modelOptions = getModel(emailAccount.user, "economy");

  const generateObject = createGenerateObject({
    userEmail: emailAccount.email,
    label: "email-report-summary-generation",
    modelOptions,
  });

  const result = await generateObject({
    ...modelOptions,
    system,
    prompt,
    schema: z.object({
      summaries: z
        .array(emailSummarySchema)
        .describe("Summaries of the emails"),
    }),
  });

  return result.object.summaries;
}
