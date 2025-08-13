import { z } from "zod";
import { chatCompletionObject } from "@/utils/llms";
import type { EmailAccountWithAI } from "@/utils/llms/types";
import type { EmailSummary } from "@/utils/ai/report/summarize-emails";
import { createScopedLogger } from "@/utils/logger";

const logger = createScopedLogger("email-report-email-behavior");

const emailBehaviorSchema = z.object({
  timingPatterns: z.object({
    peakHours: z.array(z.string()).describe("Peak email activity hours"),
    responsePreference: z.string().describe("Preferred response timing"),
    frequency: z.string().describe("Overall email frequency"),
  }),
  contentPreferences: z.object({
    preferred: z
      .array(z.string())
      .describe("Types of emails user engages with"),
    avoided: z
      .array(z.string())
      .describe("Types of emails user typically ignores"),
  }),
  engagementTriggers: z
    .array(z.string())
    .describe("What prompts user to take action on emails"),
});

export async function aiAnalyzeEmailBehavior(
  emailSummaries: EmailSummary[],
  emailAccount: EmailAccountWithAI,
  sentEmailSummaries?: EmailSummary[],
) {
  const system = `You are an expert AI system that analyzes a user's email behavior to infer timing patterns, content preferences, and automation opportunities.

Focus on identifying patterns that can be automated and providing specific, actionable automation rules that would save time and improve email management efficiency.`;

  const prompt = `### Email Analysis Data

**Received Emails:**
${emailSummaries.map((email, i) => `${i + 1}. From: ${email.sender} | Subject: ${email.subject} | Category: ${email.category} | Summary: ${email.summary}`).join("\n")}

${
  sentEmailSummaries && sentEmailSummaries.length > 0
    ? `
**Sent Emails:**
${sentEmailSummaries.map((email, i) => `${i + 1}. To: ${email.sender} | Subject: ${email.subject} | Category: ${email.category} | Summary: ${email.summary}`).join("\n")}
`
    : ""
}

---

Analyze the email patterns and identify:
1. Timing patterns (when emails are most active, response preferences)
2. Content preferences (what types of emails they engage with vs avoid)
3. Engagement triggers (what prompts them to take action)
4. Specific automation opportunities with estimated time savings`;

  logger.trace("Input", { system, prompt });

  const result = await chatCompletionObject({
    userAi: emailAccount.user,
    system,
    prompt,
    schema: emailBehaviorSchema,
    userEmail: emailAccount.email,
    usageLabel: "email-report-email-behavior",
  });

  logger.trace("Output", result.object);

  return result.object;
}
