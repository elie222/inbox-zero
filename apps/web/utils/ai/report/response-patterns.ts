import { z } from "zod";
import { createGenerateObject } from "@/utils/llms";
import type { EmailSummary } from "@/utils/ai/report/summarize-emails";
import type { EmailAccountWithAI } from "@/utils/llms/types";
import { createScopedLogger } from "@/utils/logger";
import { getModel } from "@/utils/llms/model";

const logger = createScopedLogger("email-report-response-patterns");

const responsePatternsSchema = z.object({
  commonResponses: z.array(
    z.object({
      pattern: z.string().describe("Description of the response pattern"),
      example: z.string().describe("Example of this type of response"),
      frequency: z
        .number()
        .describe("Percentage of responses using this pattern"),
      triggers: z
        .array(z.string())
        .describe("What types of emails trigger this response"),
    }),
  ),
  suggestedTemplates: z.array(
    z.object({
      templateName: z.string().describe("Name of the email template"),
      template: z.string().describe("The actual email template text"),
      useCase: z.string().describe("When to use this template"),
    }),
  ),
  categoryOrganization: z.array(
    z.object({
      category: z.string().describe("Email category name"),
      description: z
        .string()
        .describe("What types of emails belong in this category"),
      emailCount: z
        .number()
        .describe("Estimated number of emails in this category"),
      priority: z
        .enum(["high", "medium", "low"])
        .describe("Priority level for this category"),
    }),
  ),
});

export async function aiAnalyzeResponsePatterns(
  emailSummaries: EmailSummary[],
  emailAccount: EmailAccountWithAI,
  sentEmailSummaries?: EmailSummary[],
) {
  const system = `You are an expert email behavior analyst. Your task is to identify common response patterns and suggest email categorization and templates based on the user's email activity.

Focus on practical, actionable insights for email management including reusable templates and smart categorization.

IMPORTANT: When creating email categories, avoid meaningless or generic categories such as:
- "Other", "Unknown", "Unclear", "Miscellaneous"
- "Personal" (too generic and meaningless)
- "Unclear Content/HTML Code", "HTML Content", "Raw Content"
- "General", "Random", "Various"

Only suggest categories that are meaningful and provide clear organizational value. If an email doesn't fit into a meaningful category, don't create a category for it.`;

  const prompt = `### Input Data

**Received Email Summaries:**  
${emailSummaries.map((summary, index) => `Email ${index + 1}: ${summary.summary} (Category: ${summary.category})`).join("\n")}

${
  sentEmailSummaries && sentEmailSummaries.length > 0
    ? `
**Sent Email Summaries (User's Response Patterns):**
${sentEmailSummaries.map((summary, index) => `Sent ${index + 1}: ${summary.summary} (Category: ${summary.category})`).join("\n")}
`
    : ""
}

---

Analyze the data and identify:
1. Common response patterns the user uses with examples and frequency
2. Suggested email templates that would save time
3. Email categorization strategy with volume estimates and priorities

For email categorization, create simple, practical categories based on actual email content. Examples of good categories:
- "Work", "Finance", "Meetings", "Marketing", "Support", "Sales"
- "Projects", "Billing", "Team", "Clients", "Products", "Services"
- "Administrative", "Technical", "Legal", "HR", "Operations"

Only suggest categories that are meaningful and provide clear organizational value. If emails don't fit into meaningful categories, don't create categories for them.`;

  logger.trace("Input", { system, prompt });

  const modelOptions = getModel(emailAccount.user);

  const generateObject = createGenerateObject({
    userEmail: emailAccount.email,
    label: "email-report-response-patterns",
    modelOptions,
  });

  const result = await generateObject({
    ...modelOptions,
    system,
    prompt,
    schema: responsePatternsSchema,
  });

  logger.trace("Output", result.object);

  return result.object;
}
