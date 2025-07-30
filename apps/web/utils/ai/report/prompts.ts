import { z } from "zod";
import { createScopedLogger } from "@/utils/logger";
import { chatCompletionObject } from "@/utils/llms";
import type { gmail_v1 } from "@googleapis/gmail";
import type { ParsedMessage } from "@/utils/types";
import type { EmailAccountWithAI } from "@/utils/llms/types";
import { sleep } from "@/utils/sleep";

const logger = createScopedLogger("email-report-prompts");

export type EmailSummary = {
  summary: string;
  sender: string;
  subject: string;
  category: string;
};

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

const userPersonaSchema = z.object({
  professionalIdentity: z.object({
    persona: z.string().describe("Professional persona identification"),
    supportingEvidence: z
      .array(z.string())
      .describe("Evidence supporting this persona identification"),
  }),
  currentPriorities: z
    .array(z.string())
    .describe("Current professional priorities based on email content"),
});

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

const actionableRecommendationsSchema = z.object({
  immediateActions: z.array(
    z.object({
      action: z.string().describe("Specific action to take"),
      difficulty: z
        .enum(["easy", "medium", "hard"])
        .describe("Implementation difficulty"),
      impact: z.enum(["high", "medium", "low"]).describe("Expected impact"),
      timeRequired: z.string().describe("Time required (e.g., '5 minutes')"),
    }),
  ),
  shortTermImprovements: z.array(
    z.object({
      improvement: z.string().describe("Improvement to implement"),
      timeline: z.string().describe("When to implement (e.g., 'This week')"),
      expectedBenefit: z.string().describe("Expected benefit"),
    }),
  ),
  longTermStrategy: z.array(
    z.object({
      strategy: z.string().describe("Strategic initiative"),
      description: z.string().describe("Detailed description"),
      successMetrics: z.array(z.string()).describe("How to measure success"),
    }),
  ),
});

export async function generateExecutiveSummary(
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

  const result = await chatCompletionObject({
    userAi: emailAccount.user,
    system,
    prompt,
    schema: executiveSummarySchema,
    userEmail: emailAccount.email,
    usageLabel: "email-report-executive-summary",
  });

  return result.object;
}

export async function buildUserPersona(
  emailSummaries: EmailSummary[],
  emailAccount: EmailAccountWithAI,
  sentEmailSummaries?: EmailSummary[],
  gmailSignature?: string,
  gmailTemplates?: string[],
): Promise<z.infer<typeof userPersonaSchema>> {
  const system = `You are a highly skilled AI analyst tasked with generating a focused professional persona of a user based on their email activity.

Analyze the email summaries, signatures, and templates to identify:
1. Professional identity with supporting evidence
2. Current professional priorities based on email content

Focus on understanding the user's role and what they're currently focused on professionally.`;

  const prompt = `### Input Data

**Received Email Summaries:**  
${emailSummaries.map((summary, index) => `Email ${index + 1} Summary: ${summary.summary} (Category: ${summary.category})`).join("\n")}

${
  sentEmailSummaries && sentEmailSummaries.length > 0
    ? `
**Sent Email Summaries:**
${sentEmailSummaries.map((summary, index) => `Sent ${index + 1} Summary: ${summary.summary} (Category: ${summary.category})`).join("\n")}
`
    : ""
}

**User's Signature:**  
${gmailSignature || "[No signature data available – analyze based on email content only]"}

${
  gmailTemplates && gmailTemplates.length > 0
    ? `
**User's Gmail Templates:**
${gmailTemplates.map((template, index) => `Template ${index + 1}: ${template}`).join("\n")}
`
    : ""
}

---

Analyze the data and identify:
1. **Professional Identity**: What is their role and what evidence supports this?
2. **Current Priorities**: What are they focused on professionally based on email content?`;

  const result = await chatCompletionObject({
    userAi: emailAccount.user,
    system,
    prompt,
    schema: userPersonaSchema,
    userEmail: emailAccount.email,
    usageLabel: "email-report-user-persona",
  });

  return result.object;
}

export async function analyzeEmailBehavior(
  emailSummaries: EmailSummary[],
  emailAccount: EmailAccountWithAI,
  sentEmailSummaries?: EmailSummary[],
): Promise<z.infer<typeof emailBehaviorSchema>> {
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

  const result = await chatCompletionObject({
    userAi: emailAccount.user,
    system,
    prompt,
    schema: emailBehaviorSchema,
    userEmail: emailAccount.email,
    usageLabel: "email-report-email-behavior",
  });

  return result.object;
}

export async function analyzeResponsePatterns(
  emailSummaries: EmailSummary[],
  emailAccount: EmailAccountWithAI,
  sentEmailSummaries?: EmailSummary[],
): Promise<z.infer<typeof responsePatternsSchema>> {
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

  const result = await chatCompletionObject({
    userAi: emailAccount.user,
    system,
    prompt,
    schema: responsePatternsSchema,
    userEmail: emailAccount.email,
    usageLabel: "email-report-response-patterns",
  });

  return result.object;
}

export async function analyzeLabelOptimization(
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

  const result = await chatCompletionObject({
    userAi: emailAccount.user,
    system,
    prompt,
    schema: labelAnalysisSchema,
    userEmail: emailAccount.email,
    usageLabel: "email-report-label-analysis",
  });

  return result.object;
}

export async function generateActionableRecommendations(
  emailSummaries: EmailSummary[],
  emailAccount: EmailAccountWithAI,
  userPersona: z.infer<typeof userPersonaSchema>,
): Promise<z.infer<typeof actionableRecommendationsSchema>> {
  const system = `You are an email productivity consultant. Based on the comprehensive email analysis, create specific, actionable recommendations that the user can implement to improve their email workflow.

Organize recommendations by timeline (immediate, short-term, long-term) and include specific implementation details and expected benefits.`;

  const prompt = `### Analysis Summary

**User Persona:** ${userPersona.professionalIdentity.persona}
**Current Priorities:** ${userPersona.currentPriorities.join(", ")}
**Email Volume:** ${emailSummaries.length} emails analyzed

---

Create actionable recommendations in three categories:
1. **Immediate Actions** (can be done today): 4-6 specific actions with time requirements
2. **Short-term Improvements** (this week): 3-4 improvements with timelines and benefits  
3. **Long-term Strategy** (ongoing): 2-3 strategic initiatives with success metrics

Focus on practical, implementable solutions that improve email organization and workflow efficiency.`;

  const result = await chatCompletionObject({
    userAi: emailAccount.user,
    system,
    prompt,
    schema: actionableRecommendationsSchema,
    userEmail: emailAccount.email,
    usageLabel: "email-report-actionable-recommendations",
  });

  return result.object;
}

/**
 * Summarize emails for analysis
 */
export async function summarizeEmails(
  emails: ParsedMessage[],
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
  emails: ParsedMessage[],
  emailAccount: EmailAccountWithAI,
  batchNumber: number,
  totalBatches: number,
): Promise<EmailSummary[]> {
  const emailTexts = emails.map((email) => {
    const sender = email.headers?.from || "Unknown";
    const subject = email.headers?.subject || "No subject";
    const content = email.textPlain || email.textHtml || "";

    return `From: ${sender}\nSubject: ${subject}\nContent: ${content.substring(0, 1000)}`;
  });

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

${emailTexts.join("\n\n---\n\n")}

Return the analysis as a JSON array with objects containing: summary, sender, subject, category.`;

  logger.trace("Input", { system, prompt });

  const result = await chatCompletionObject({
    userAi: emailAccount.user,
    system,
    prompt,
    schema: z.array(
      z.object({
        summary: z.string().describe("Brief summary of the email content"),
        sender: z.string().describe("Email sender"),
        subject: z.string().describe("Email subject"),
        category: z
          .string()
          .describe("Category of the email (work, personal, marketing, etc.)"),
      }),
    ),
    userEmail: emailAccount.email,
    usageLabel: "email-report-summary-generation",
  });

  logger.trace("processEmailBatch: result", { response: result.object });

  return result.object;
}
