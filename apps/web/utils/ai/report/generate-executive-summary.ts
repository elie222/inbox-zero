import { z } from "zod";
import { createGenerateObject } from "@/utils/llms";
import type { gmail_v1 } from "@googleapis/gmail";
import type { EmailAccountWithAI } from "@/utils/llms/types";
import type { EmailSummary } from "@/utils/ai/report/summarize-emails";
import { createScopedLogger } from "@/utils/logger";
import { getModel } from "@/utils/llms/model";

const logger = createScopedLogger("email-report-executive-summary");

const executiveSummarySchema = z.object({
  userProfile: z.object({
    persona: z
      .string()
      .describe(
        "1-5 word persona identification (e.g., 'Tech Startup Founder')",
      ),
    confidence: z
      .number()
      .min(0)
      .max(100)
      .describe("Confidence level in persona identification (0-100)"),
  }),
  topInsights: z
    .array(
      z.object({
        insight: z.string().describe("Key insight about user's email behavior"),
        priority: z
          .enum(["high", "medium", "low"])
          .describe("Priority level of this insight"),
        icon: z.string().describe("Single emoji representing this insight"),
      }),
    )
    .describe("3-5 most important findings from the analysis"),
  quickActions: z
    .array(
      z.object({
        action: z
          .string()
          .describe("Specific action the user can take immediately"),
        difficulty: z
          .enum(["easy", "medium", "hard"])
          .describe("How difficult this action is to implement"),
        impact: z
          .enum(["high", "medium", "low"])
          .describe("Expected impact of this action"),
      }),
    )
    .describe("4-6 immediate actions the user can take"),
});

export async function aiGenerateExecutiveSummary(
  emailSummaries: EmailSummary[],
  sentEmailSummaries: EmailSummary[],
  gmailLabels: gmail_v1.Schema$Label[],
  emailAccount: EmailAccountWithAI,
): Promise<z.infer<typeof executiveSummarySchema>> {
  const system = `You are a professional persona identification expert. Your primary task is to accurately identify the user's professional role based on their email patterns.

CRITICAL: The persona must be a specific, recognizable professional role that clearly identifies what this person does for work.

Examples of GOOD personas:
- "Startup Founder"
- "Software Developer" 
- "Real Estate Agent"
- "Marketing Manager"
- "Sales Executive"
- "Product Manager"
- "Consultant"
- "Teacher"
- "Lawyer"
- "Doctor"
- "Influencer"
- "Freelance Designer"

Examples of BAD personas (too vague):
- "Professional"
- "Business Person"
- "Tech Worker"
- "Knowledge Worker"

Focus on identifying the PRIMARY professional role based on email content, senders, and communication patterns.`;

  const prompt = `### Email Analysis Data

**Received Emails (${emailSummaries.length} emails):**
${emailSummaries
  .slice(0, 30)
  .map(
    (email, i) =>
      `${i + 1}. From: ${email.sender} | Subject: ${email.subject} | Category: ${email.category} | Summary: ${email.summary}`,
  )
  .join("\n")}

**Sent Emails (${sentEmailSummaries.length} emails):**
${sentEmailSummaries
  .slice(0, 15)
  .map(
    (email, i) =>
      `${i + 1}. To: ${email.sender} | Subject: ${email.subject} | Category: ${email.category} | Summary: ${email.summary}`,
  )
  .join("\n")}

**Current Gmail Labels:**
${gmailLabels.map((label) => `- ${label.name} (${label.messagesTotal || 0} emails)`).join("\n")}

---

**PERSONA IDENTIFICATION INSTRUCTIONS:**

Analyze the email patterns to identify the user's PRIMARY professional role:

1. **Look for role indicators:**
   - Who do they email? (clients, team members, investors, customers, etc.)
   - What topics dominate? (code reviews, property listings, campaign metrics, etc.)
   - What language/terminology is used? (technical terms, industry jargon, etc.)
   - What responsibilities are evident? (managing teams, closing deals, creating content, etc.)

2. **Common professional patterns:**
   - **Founder/CEO**: Investor emails, team management, strategic decisions, fundraising
   - **Developer**: Code reviews, technical discussions, GitHub notifications, deployment issues
   - **Sales**: CRM notifications, client outreach, deal discussions, quota tracking
   - **Marketing**: Campaign metrics, content creation, social media, analytics
   - **Real Estate**: Property listings, client communications, MLS notifications
   - **Consultant**: Client projects, proposals, expertise sharing, industry updates
   - **Teacher**: Student communications, educational content, institutional emails

3. **Confidence level:**
   - 90-100%: Very clear indicators, consistent patterns
   - 70-89%: Strong indicators, some ambiguity
   - 50-69%: Mixed signals, multiple possible roles
   - Below 50%: Unclear or insufficient data

Generate:
1. **Specific professional persona** (1-3 words max, e.g., "Software Developer", "Real Estate Agent")
2. **Confidence level** based on clarity of evidence
3. **Top insights** about their email behavior
4. **Quick actions** for immediate improvement`;

  logger.trace("Input", { system, prompt });

  const modelOptions = getModel(emailAccount.user);

  const generateObject = createGenerateObject({
    userEmail: emailAccount.email,
    label: "email-report-executive-summary",
    modelOptions,
  });

  const result = await generateObject({
    ...modelOptions,
    system,
    prompt,
    schema: executiveSummarySchema,
  });

  logger.trace("Output", result.object);

  return result.object;
}
