import { type NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { getGmailClientWithRefresh } from "@/utils/gmail/client";
import { getMessage, getMessages } from "@/utils/gmail/message";
import { parseMessage } from "@/utils/mail";
import { chatCompletionObject } from "@/utils/llms";
import { redis } from "@/utils/redis";
import { env } from "@/env";
import prisma from "@/utils/prisma";

const EmailSummarySchema = z.object({
  summary: z.string().describe("Brief summary of the email content"),
  sender: z.string().describe("Email sender"),
  subject: z.string().describe("Email subject"),
  category: z
    .string()
    .describe("Category of the email (work, personal, marketing, etc.)"),
});

type EmailSummary = z.infer<typeof EmailSummarySchema>;

const SummarizeRequestSchema = z.object({
  userEmail: z.string().email(),
  query: z.string().optional().default(""), // Gmail query (e.g., "from:me", "label:work")
  count: z.number().min(1).max(200).optional().default(50),
  forceRefresh: z.boolean().optional().default(false),
  batchSize: z.number().min(10).max(50).optional().default(20),
});

const SummarizeResponseSchema = z.object({
  summaries: z.array(EmailSummarySchema),
  totalEmails: z.number(),
  cached: z.boolean(),
  query: z.string(),
  processingTime: z.number(),
});

const BATCH_SUMMARY_EXPIRATION = 60 * 60 * 24;

/**
 * Generate cache key for email batch
 */
function getBatchSummaryKey(query: string, count: number): string {
  return `sandbox:email-summary:${query}:${count}`;
}

/**
 * Get cached batch summary from Redis
 */
async function getBatchSummary(
  query: string,
  count: number,
): Promise<EmailSummary[] | null> {
  const key = getBatchSummaryKey(query, count);
  return redis.get<EmailSummary[]>(key);
}

/**
 * Save batch summary to Redis cache
 */
async function saveBatchSummary(
  summaries: EmailSummary[],
  query: string,
  count: number,
): Promise<void> {
  const key = getBatchSummaryKey(query, count);
  await redis.set(key, summaries, { ex: BATCH_SUMMARY_EXPIRATION });
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

  while (emails.length < count) {
    const response = await getMessages(gmail, {
      query: query || undefined,
      maxResults: Math.min(100, count - emails.length),
      pageToken: nextPageToken,
    });

    if (!response.messages || response.messages.length === 0) {
      break;
    }

    // Get full message details for each email
    const messagePromises = response.messages.map(async (message: any) => {
      if (!message.id) return null;
      try {
        const messageWithPayload = await getMessage(message.id, gmail, "full");
        return parseMessage(messageWithPayload);
      } catch (error) {
        console.warn(`Failed to fetch message ${message.id}:`, error);
        return null;
      }
    });

    const messages = await Promise.all(messagePromises);
    const validMessages = messages.filter((msg) => msg !== null);

    emails.push(...validMessages);

    nextPageToken = response.nextPageToken || undefined;
    if (!nextPageToken) {
      break;
    }
  }

  return emails;
}

/**
 * Summarize a batch of emails using AI
 */
async function summarizeEmailBatch(
  emails: any[],
  query: string,
  forceRefresh = false,
): Promise<EmailSummary[]> {
  // Check cache first (unless force refresh is requested)
  if (!forceRefresh) {
    const cachedSummaries = await getBatchSummary(query, emails.length);
    if (cachedSummaries) {
      return cachedSummaries;
    }
  }

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
- **Skip** irrelevant promotions, spam, or generic sales offers (e.g., holiday deals, coupon codes).

---
`;

  const prompt = `
**Input Emails:**

${emailTexts.join("\n\n---\n\n")}

Return the analysis as a JSON array with objects containing: summary, sender, subject, category.`;

  const result = await chatCompletionObject({
    userAi: {
      aiProvider: env.DEFAULT_LLM_PROVIDER as any,
      aiModel: env.DEFAULT_LLM_MODEL || "gemini-2.0-flash-exp",
      aiApiKey: env.GOOGLE_API_KEY || null,
    },
    system,
    prompt,
    schema: z.array(EmailSummarySchema),
    userEmail: "sandbox@inboxzero.com",
    usageLabel: "sandbox-email-summary-generation",
  });

  const summaries = result.object;

  // Cache the results
  await saveBatchSummary(summaries, query, emails.length);

  return summaries;
}

/**
 * Process emails in batches and summarize
 */
async function processEmailBatches(
  emails: any[],
  query: string,
  batchSize: number,
  forceRefresh: boolean,
): Promise<EmailSummary[]> {
  const allSummaries: EmailSummary[] = [];

  for (let i = 0; i < emails.length; i += batchSize) {
    const batch = emails.slice(i, i + batchSize);
    const batchSummaries = await summarizeEmailBatch(
      batch,
      query,
      forceRefresh,
    );
    allSummaries.push(...batchSummaries);
  }

  return allSummaries;
}

export async function POST(request: NextRequest) {
  const startTime = Date.now();
  const requestId = Math.random().toString(36).substring(7);

  console.log(`[${requestId}] Starting email summarization: ${request.url}`);

  try {
    // Parse and validate request
    const body = await request.json();
    const { userEmail, query, count, forceRefresh, batchSize } =
      SummarizeRequestSchema.parse(body);

    console.log(`[${requestId}] Processing request:`, {
      userEmail,
      query,
      count,
      forceRefresh,
      batchSize,
    });

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
      accessToken: emailAccount.account?.access_token!,
      refreshToken: emailAccount.account?.refresh_token!,
      expiresAt: emailAccount.account?.expires_at,
      emailAccountId: emailAccount.id,
    });
    console.log(`[${requestId}] Gmail client initialized successfully`);

    // Fetch emails based on query
    console.log(
      `[${requestId}] Fetching emails with query: "${query}", count: ${count}`,
    );
    const emails = await fetchEmailsByQuery(gmail, query, count);
    console.log(`[${requestId}] Fetched ${emails.length} emails`);

    if (emails.length === 0) {
      console.log(`[${requestId}] No emails found for query: "${query}"`);
      return NextResponse.json({
        summaries: [],
        totalEmails: 0,
        cached: false,
        query,
        processingTime: Date.now() - startTime,
      });
    }

    // Check if we can use cached results
    let cached = false;
    if (!forceRefresh) {
      console.log(`[${requestId}] Checking cache for query: "${query}"`);
      const cachedSummaries = await getBatchSummary(query, emails.length);
      if (cachedSummaries) {
        cached = true;
        console.log(`[${requestId}] Using cached results`);
      } else {
        console.log(`[${requestId}] No cache found, processing emails`);
      }
    } else {
      console.log(`[${requestId}] Force refresh requested, ignoring cache`);
    }

    // Process emails in batches
    console.log(
      `[${requestId}] Processing ${emails.length} emails in batches of ${batchSize}`,
    );
    const summaries = await processEmailBatches(
      emails,
      query,
      batchSize,
      forceRefresh,
    );
    console.log(`[${requestId}] Generated ${summaries.length} summaries`);

    const processingTime = Date.now() - startTime;
    console.log(
      `[${requestId}] Email summarization completed in ${processingTime}ms`,
    );

    return NextResponse.json({
      summaries,
      totalEmails: emails.length,
      cached,
      query,
      processingTime,
    });
  } catch (error) {
    const errorMessage =
      error instanceof Error ? error.message : "Unknown error";
    const errorStack = error instanceof Error ? error.stack : undefined;

    console.error(`[${requestId}] Sandbox email summarization error:`, {
      error: errorMessage,
      stack: errorStack,
      processingTime: Date.now() - startTime,
      url: request.url,
    });

    if (error instanceof z.ZodError) {
      return NextResponse.json(
        {
          error: "Invalid request data",
          details: error.errors,
          requestId,
          processingTime: Date.now() - startTime,
        },
        { status: 400 },
      );
    }

    return NextResponse.json(
      {
        error: "Failed to summarize emails",
        details: errorMessage,
        requestId,
        processingTime: Date.now() - startTime,
      },
      { status: 500 },
    );
  }
}
