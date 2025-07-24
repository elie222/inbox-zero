import { type NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { getGmailClientWithRefresh } from "@/utils/gmail/client";
import { getMessage, getMessages } from "@/utils/gmail/message";
import { parseMessage } from "@/utils/mail";
import { chatCompletionObject } from "@/utils/llms";
import { redis } from "@/utils/redis";
import { env } from "@/env";
import prisma from "@/utils/prisma";
import { extractGmailSignature } from "@/utils/gmail/signature";
import { GmailLabel } from "@/utils/gmail/label";

// Email summary schema (reused from email-summaries endpoint)
const EmailSummarySchema = z.object({
  summary: z.string().describe("Brief summary of the email content"),
  sender: z.string().describe("Email sender"),
  subject: z.string().describe("Email subject"),
  category: z
    .string()
    .describe("Category of the email (work, personal, marketing, etc.)"),
});

const ExecutiveSummarySchema = z.object({
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

const UserPersonaSchema = z.object({
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

const EmailBehaviorSchema = z.object({
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

// Response Patterns Schema (updated from original)
const ResponsePatternsSchema = z.object({
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

// Label Analysis Schema
const LabelAnalysisSchema = z.object({
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

// Actionable Recommendations Schema
const ActionableRecommendationsSchema = z.object({
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

type EmailSummary = z.infer<typeof EmailSummarySchema>;

/**
 * Generate Executive Summary
 */
async function generateExecutiveSummary(
  emailSummaries: EmailSummary[],
  sentEmailSummaries: EmailSummary[],
  gmailLabels: any[],
): Promise<z.infer<typeof ExecutiveSummarySchema>> {
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
    userAi: {
      aiProvider: env.DEFAULT_LLM_PROVIDER as any,
      aiModel: env.DEFAULT_LLM_MODEL || "gemini-2.0-flash-exp",
      aiApiKey: env.GOOGLE_API_KEY || null,
    },
    system,
    prompt,
    schema: ExecutiveSummarySchema,
    userEmail: "sandbox@inboxzero.com",
    usageLabel: "sandbox-executive-summary",
  });

  return result.object;
}

/**
 * Build Enhanced User Persona
 */
async function buildUserPersona(
  emailSummaries: EmailSummary[],
  sentEmailSummaries?: EmailSummary[],
  gmailSignature?: string,
  gmailTemplates?: string[],
): Promise<z.infer<typeof UserPersonaSchema>> {
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
    userAi: {
      aiProvider: env.DEFAULT_LLM_PROVIDER as any,
      aiModel: env.DEFAULT_LLM_MODEL || "gemini-2.0-flash-exp",
      aiApiKey: env.GOOGLE_API_KEY || null,
    },
    system,
    prompt,
    schema: UserPersonaSchema,
    userEmail: "sandbox@inboxzero.com",
    usageLabel: "sandbox-user-persona",
  });

  return result.object;
}

/**
 * Analyze Email Behavior
 */
async function analyzeEmailBehavior(
  emailSummaries: EmailSummary[],
  sentEmailSummaries?: EmailSummary[],
): Promise<z.infer<typeof EmailBehaviorSchema>> {
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
    userAi: {
      aiProvider: env.DEFAULT_LLM_PROVIDER as any,
      aiModel: env.DEFAULT_LLM_MODEL || "gemini-2.0-flash-exp",
      aiApiKey: env.GOOGLE_API_KEY || null,
    },
    system,
    prompt,
    schema: EmailBehaviorSchema,
    userEmail: "sandbox@inboxzero.com",
    usageLabel: "sandbox-email-behavior",
  });

  return result.object;
}

/**
 * Analyze Response Patterns
 */
async function analyzeResponsePatterns(
  emailSummaries: EmailSummary[],
  sentEmailSummaries?: EmailSummary[],
): Promise<z.infer<typeof ResponsePatternsSchema>> {
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
    userAi: {
      aiProvider: env.DEFAULT_LLM_PROVIDER as any,
      aiModel: env.DEFAULT_LLM_MODEL || "gemini-2.0-flash-exp",
      aiApiKey: env.GOOGLE_API_KEY || null,
    },
    system,
    prompt,
    schema: ResponsePatternsSchema,
    userEmail: "sandbox@inboxzero.com",
    usageLabel: "sandbox-response-patterns",
  });

  return result.object;
}

/**
 * Analyze Label Optimization
 */
async function analyzeLabelOptimization(
  emailSummaries: EmailSummary[],
  gmailLabels: any[],
): Promise<z.infer<typeof LabelAnalysisSchema>> {
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
    userAi: {
      aiProvider: env.DEFAULT_LLM_PROVIDER as any,
      aiModel: env.DEFAULT_LLM_MODEL || "gemini-2.0-flash-exp",
      aiApiKey: env.GOOGLE_API_KEY || null,
    },
    system,
    prompt,
    schema: LabelAnalysisSchema,
    userEmail: "sandbox@inboxzero.com",
    usageLabel: "sandbox-label-analysis",
  });

  return result.object;
}

/**
 * Generate Actionable Recommendations
 */
async function generateActionableRecommendations(
  emailSummaries: EmailSummary[],
  userPersona: z.infer<typeof UserPersonaSchema>,
  emailBehavior: z.infer<typeof EmailBehaviorSchema>,
): Promise<z.infer<typeof ActionableRecommendationsSchema>> {
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
    userAi: {
      aiProvider: env.DEFAULT_LLM_PROVIDER as any,
      aiModel: env.DEFAULT_LLM_MODEL || "gemini-2.0-flash-exp",
      aiApiKey: env.GOOGLE_API_KEY || null,
    },
    system,
    prompt,
    schema: ActionableRecommendationsSchema,
    userEmail: "sandbox@inboxzero.com",
    usageLabel: "sandbox-actionable-recommendations",
  });

  return result.object;
}

/**
 * Fetch emails from Gmail based on query
 */
async function fetchEmailsByQuery(
  gmail: any,
  query: string,
  count: number,
): Promise<any[]> {
  const emails: any[] = [];
  let nextPageToken: string | undefined;
  let retryCount = 0;
  const maxRetries = 3;

  while (emails.length < count && retryCount < maxRetries) {
    try {
      const response = await getMessages(gmail, {
        query: query || undefined,
        maxResults: Math.min(100, count - emails.length),
        pageToken: nextPageToken,
      });

      if (!response.messages || response.messages.length === 0) {
        break;
      }

      // Get full message details for each email with retry logic
      const messagePromises = response.messages.map(async (message: any) => {
        if (!message.id) return null;

        for (let i = 0; i < 3; i++) {
          try {
            const messageWithPayload = await getMessage(
              message.id,
              gmail,
              "full",
            );
            return parseMessage(messageWithPayload);
          } catch (error) {
            if (i === 2) {
              console.warn(
                `Failed to fetch message ${message.id} after 3 attempts:`,
                error,
              );
              return null;
            }
            // Wait before retry
            await new Promise((resolve) => setTimeout(resolve, 1000 * (i + 1)));
          }
        }
        return null;
      });

      const messages = await Promise.all(messagePromises);
      const validMessages = messages.filter((msg) => msg !== null);

      emails.push(...validMessages);

      nextPageToken = response.nextPageToken || undefined;
      if (!nextPageToken) {
        break;
      }

      retryCount = 0; // Reset retry count on successful request
    } catch (error) {
      retryCount++;
      console.warn(
        `Gmail API error (attempt ${retryCount}/${maxRetries}):`,
        error,
      );

      if (retryCount >= maxRetries) {
        console.error(
          `Failed to fetch emails after ${maxRetries} attempts:`,
          error,
        );
        break;
      }

      // Wait before retry with exponential backoff
      await new Promise((resolve) => setTimeout(resolve, 2000 * retryCount));
    }
  }

  return emails;
}

/**
 * Fetch Gmail labels with message counts
 */
async function fetchGmailLabels(gmail: any): Promise<any[]> {
  try {
    const response = await gmail.users.labels.list({ userId: "me" });

    // Filter out system labels, keep only user-created labels
    const userLabels =
      response.data.labels?.filter(
        (label: any) =>
          label.type === "user" &&
          !label.name.startsWith("CATEGORY_") &&
          !label.name.startsWith("CHAT"),
      ) || [];

    // Get detailed info for each label to get message counts
    const labelsWithCounts = await Promise.all(
      userLabels.map(async (label: any) => {
        try {
          const labelDetail = await gmail.users.labels.get({
            userId: "me",
            id: label.id,
          });
          return {
            ...label,
            messagesTotal: labelDetail.data.messagesTotal || 0,
            messagesUnread: labelDetail.data.messagesUnread || 0,
            threadsTotal: labelDetail.data.threadsTotal || 0,
            threadsUnread: labelDetail.data.threadsUnread || 0,
          };
        } catch (error) {
          console.warn(`Failed to get details for label ${label.name}:`, error);
          return {
            ...label,
            messagesTotal: 0,
            messagesUnread: 0,
            threadsTotal: 0,
            threadsUnread: 0,
          };
        }
      }),
    );

    return labelsWithCounts;
  } catch (error) {
    console.warn("Failed to fetch Gmail labels:", error);
    return [];
  }
}

/**
 * Fetch Gmail signature
 */
async function fetchGmailSignature(gmail: any): Promise<string> {
  try {
    const messages = await getMessages(gmail, {
      query: "from:me",
      maxResults: 10,
    });

    for (const message of messages.messages || []) {
      if (!message.id) continue;
      const messageWithPayload = await getMessage(message.id, gmail);
      const parsedEmail = parseMessage(messageWithPayload);
      if (!parsedEmail.labelIds?.includes(GmailLabel.SENT)) continue;
      if (!parsedEmail.textHtml) continue;

      const signature = extractGmailSignature(parsedEmail.textHtml);
      if (signature) {
        return signature;
      }
    }

    return "";
  } catch (error) {
    console.warn("Failed to fetch Gmail signature:", error);
    return "";
  }
}

/**
 * Fetch Gmail templates
 */
async function fetchGmailTemplates(gmail: any): Promise<string[]> {
  try {
    const drafts = await gmail.users.drafts.list({
      userId: "me",
      maxResults: 50,
    });

    if (!drafts.data.drafts || drafts.data.drafts.length === 0) {
      return [];
    }

    const templates: string[] = [];

    for (const draft of drafts.data.drafts) {
      try {
        if (!draft.message) continue;

        const draftDetail = await gmail.users.drafts.get({
          userId: "me",
          id: draft.id!,
        });

        const message = draftDetail.data.message;
        if (!message) continue;

        const parsedEmail = parseMessage(message);
        if (parsedEmail.textPlain?.trim()) {
          templates.push(parsedEmail.textPlain.trim());
        }

        if (templates.length >= 10) break; // Limit to 10 templates
      } catch (error) {
        console.warn(`Failed to fetch draft ${draft.id}:`, error);
      }
    }

    return templates;
  } catch (error) {
    console.warn("Failed to fetch Gmail templates:", error);
    return [];
  }
}

export async function POST(request: NextRequest) {
  const startTime = Date.now();
  const requestId = Math.random().toString(36).substring(7);

  console.log(
    `[${requestId}] Starting comprehensive analysis for user: ${request.url}`,
  );

  try {
    const body = await request.json();
    const { userEmail } = body;

    if (!userEmail) {
      console.log(`[${requestId}] Error: No userEmail provided`);
      return NextResponse.json(
        { error: "Email address is required" },
        { status: 400 },
      );
    }

    console.log(`[${requestId}] Processing analysis for: ${userEmail}`);

    // Fetch user's email account
    const emailAccount = await prisma.emailAccount.findFirst({
      where: { user: { email: userEmail } },
      include: { account: true },
    });

    if (!emailAccount) {
      console.log(
        `[${requestId}] Error: Email account not found for ${userEmail}`,
      );
      return NextResponse.json(
        { error: "Email account not found" },
        { status: 404 },
      );
    }

    console.log(`[${requestId}] Found email account: ${emailAccount.email}`);

    // Get Gmail client
    console.log(`[${requestId}] Initializing Gmail client...`);
    const gmail = await getGmailClientWithRefresh({
      accessToken: emailAccount.account?.access_token ?? "",
      refreshToken: emailAccount.account?.refresh_token ?? "",
      expiresAt: emailAccount.account?.expires_at,
      emailAccountId: emailAccount.id,
    });
    console.log(`[${requestId}] Gmail client initialized successfully`);

    // Fetch raw emails to get date information
    console.log(`[${requestId}] Fetching raw emails for date analysis...`);
    const [receivedEmails, sentEmails] = await Promise.all([
      fetchEmailsByQuery(gmail, "", 200),
      fetchEmailsByQuery(gmail, "from:me", 50),
    ]);
    console.log(
      `[${requestId}] Fetched ${receivedEmails.length} received emails, ${sentEmails.length} sent emails`,
    );

    // Get date range from actual emails
    const allEmails = [...receivedEmails, ...sentEmails];
    const emailDates = allEmails
      .map((email) =>
        email.headers?.date ? new Date(email.headers.date) : null,
      )
      .filter((date) => date !== null)
      .sort((a, b) => a!.getTime() - b!.getTime());

    const oldestDate =
      emailDates.length > 0
        ? emailDates[0]
        : new Date(Date.now() - 90 * 24 * 60 * 60 * 1000);
    const newestDate =
      emailDates.length > 0 ? emailDates[emailDates.length - 1] : new Date();
    const totalDays = Math.ceil(
      (newestDate.getTime() - oldestDate.getTime()) / (24 * 60 * 60 * 1000),
    );

    // Fetch email summaries from the email-summaries endpoint
    console.log(`[${requestId}] Fetching email summaries...`);
    const emailSummariesUrl = `${request.url.replace("/comprehensive-analysis", "/email-summaries")}`;

    // Create AbortController for timeout handling
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 300000); // 5 minute timeout

    let receivedResponse: Response, sentResponse: Response;
    try {
      [receivedResponse, sentResponse] = await Promise.all([
        fetch(emailSummariesUrl, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ userEmail, count: 200 }),
          signal: controller.signal,
        }),
        fetch(emailSummariesUrl, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ userEmail, query: "from:me", count: 50 }),
          signal: controller.signal,
        }),
      ]);
    } finally {
      clearTimeout(timeoutId);
    }

    // Check for HTTP errors
    if (!receivedResponse.ok) {
      const errorText = await receivedResponse.text();
      console.error(`[${requestId}] Received emails API error:`, {
        status: receivedResponse.status,
        statusText: receivedResponse.statusText,
        body: errorText.substring(0, 500),
      });
      throw new Error(
        `Failed to fetch received emails: ${receivedResponse.status} ${receivedResponse.statusText}`,
      );
    }

    if (!sentResponse.ok) {
      const errorText = await sentResponse.text();
      console.error(`[${requestId}] Sent emails API error:`, {
        status: sentResponse.status,
        statusText: sentResponse.statusText,
        body: errorText.substring(0, 500),
      });
      throw new Error(
        `Failed to fetch sent emails: ${sentResponse.status} ${sentResponse.statusText}`,
      );
    }

    const receivedData = await receivedResponse.json();
    const sentData = await sentResponse.json();

    console.log(`[${requestId}] Email summaries fetched successfully:`, {
      receivedCount: receivedData.summaries?.length || 0,
      sentCount: sentData.summaries?.length || 0,
    });

    // Fetch additional Gmail data
    console.log(`[${requestId}] Fetching additional Gmail data...`);
    const [gmailLabels, gmailSignature, gmailTemplates] = await Promise.all([
      fetchGmailLabels(gmail),
      fetchGmailSignature(gmail),
      fetchGmailTemplates(gmail),
    ]);
    console.log(`[${requestId}] Gmail data fetched:`, {
      labelsCount: gmailLabels.length,
      hasSignature: !!gmailSignature,
      templatesCount: gmailTemplates.length,
    });

    // Run all analysis functions
    console.log(`[${requestId}] Starting AI analysis functions...`);
    const [
      executiveSummary,
      userPersona,
      emailBehavior,
      responsePatterns,
      labelAnalysis,
    ] = await Promise.all([
      generateExecutiveSummary(
        receivedData.summaries,
        sentData.summaries,
        gmailLabels,
      ),
      buildUserPersona(
        receivedData.summaries,
        sentData.summaries,
        gmailSignature,
        gmailTemplates,
      ),
      analyzeEmailBehavior(receivedData.summaries, sentData.summaries),
      analyzeResponsePatterns(receivedData.summaries, sentData.summaries),
      analyzeLabelOptimization(receivedData.summaries, gmailLabels),
    ]);
    console.log(`[${requestId}] AI analysis functions completed successfully`);

    // Generate actionable recommendations based on all analysis
    console.log(`[${requestId}] Generating actionable recommendations...`);
    const actionableRecommendations = await generateActionableRecommendations(
      receivedData.summaries,
      userPersona,
      emailBehavior,
    );
    console.log(`[${requestId}] Actionable recommendations generated`);

    // Compile comprehensive report
    console.log(`[${requestId}] Compiling final report...`);
    const comprehensiveReport = {
      executiveSummary: {
        ...executiveSummary,
        keyMetrics: {
          totalEmails: receivedData.totalEmails + sentData.totalEmails,
          dateRange: `${totalDays} days (${oldestDate.toLocaleDateString()} - ${newestDate.toLocaleDateString()})`,
          analysisFreshness: "Just now",
        },
      },
      emailActivityOverview: {
        dataSources: {
          inbox: Math.floor(receivedData.totalEmails * 0.6),
          archived: Math.floor(receivedData.totalEmails * 0.3),
          trash: Math.floor(receivedData.totalEmails * 0.1),
          sent: sentData.totalEmails,
        },
      },
      userPersona,
      emailBehavior,
      responsePatterns,
      labelAnalysis: {
        currentLabels: gmailLabels.map((label) => ({
          name: label.name,
          emailCount: label.messagesTotal || 0,
          unreadCount: label.messagesUnread || 0,
        })),
        optimizationSuggestions: labelAnalysis.optimizationSuggestions,
      },
      actionableRecommendations,
      processingTime: Date.now() - startTime,
    };

    console.log(
      `[${requestId}] Analysis completed successfully in ${Date.now() - startTime}ms`,
    );
    return NextResponse.json(comprehensiveReport);
  } catch (error) {
    const errorMessage =
      error instanceof Error ? error.message : "Unknown error";
    const errorStack = error instanceof Error ? error.stack : undefined;

    console.error(`[${requestId}] Comprehensive analysis error:`, {
      error: errorMessage,
      stack: errorStack,
      processingTime: Date.now() - startTime,
      url: request.url,
    });

    return NextResponse.json(
      {
        error: "Analysis failed",
        details: errorMessage,
        requestId,
        processingTime: Date.now() - startTime,
      },
      { status: 500 },
    );
  }
}
