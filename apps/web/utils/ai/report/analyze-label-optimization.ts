import { z } from "zod";
import { createGenerateObject } from "@/utils/llms";
import type { gmail_v1 } from "@googleapis/gmail";
import type { EmailAccountWithAI } from "@/utils/llms/types";
import type { EmailSummary } from "@/utils/ai/report/summarize-emails";
import { createScopedLogger } from "@/utils/logger";
import { getModel } from "@/utils/llms/model";

const logger = createScopedLogger("email-report-label-analysis");

const labelAnalysisSchema = z.object({
  optimizationSuggestions: z.array(
    z.object({
      type: z
        .enum(["create", "consolidate", "rename", "delete"])
        .describe("Type of optimization"),
      suggestion: z.string().describe("Specific suggestion"),
      reason: z.string().describe("Reason for this suggestion"),
      impact: z.enum(["high", "medium", "low"]).describe("Expected impact"),
    }),
  ),
});

export async function aiAnalyzeLabelOptimization(
  emailSummaries: EmailSummary[],
  emailAccount: EmailAccountWithAI,
  gmailLabels: gmail_v1.Schema$Label[],
): Promise<z.infer<typeof labelAnalysisSchema>> {
  const system = `You are a Gmail organization expert. Analyze the user's current labels and email patterns to suggest specific optimizations that will improve their email organization and workflow efficiency.

Focus on practical suggestions that will reduce email management time and improve organization.`;

  const prompt = `### Current Gmail Labels
${gmailLabels.map((label) => `- ${label.name}: ${label.messagesTotal || 0} emails, ${label.messagesUnread || 0} unread`).join("\n")}

### Email Content Analysis
${emailSummaries
  .slice(0, 30)
  .map(
    (email, i) =>
      `${i + 1}. From: ${email.sender} | Subject: ${email.subject} | Category: ${email.category} | Summary: ${email.summary}`,
  )
  .join("\n")}

---

Based on the current labels and email content, suggest specific optimizations:
1. Labels to create based on email patterns
2. Labels to consolidate that have overlapping purposes
3. Labels to rename for better clarity
4. Labels to delete that are unused or redundant

Each suggestion should include the reason and expected impact.`;

  logger.trace("Input", { system, prompt });

  const modelOptions = getModel(emailAccount.user, "economy");

  const generateObject = createGenerateObject({
    userEmail: emailAccount.email,
    label: "email-report-label-analysis",
    modelOptions,
  });

  const result = await generateObject({
    ...modelOptions,
    system,
    prompt,
    schema: labelAnalysisSchema,
  });

  logger.trace("Output", result.object);

  return result.object;
}
