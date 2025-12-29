import { z } from "zod";
import { addDays } from "date-fns";
import type { EmailAccountWithAI } from "@/utils/llms/types";
import type { ParsedMessage } from "@/utils/types";
import type { Logger } from "@/utils/logger";
import { formatDateForLLM } from "@/utils/date";
import { getModel } from "@/utils/llms/model";
import { createGenerateObject } from "@/utils/llms";
import { getEmailForLLM } from "@/utils/get-email-from-message";
import { stringifyEmail } from "@/utils/stringify-email";
import prisma from "@/utils/prisma";
import {
  detectExpirableCategory,
  getDefaultExpirationDays,
} from "./categories";

const expirationSchema = z.object({
  shouldExpire: z
    .boolean()
    .describe("Whether this email should have an expiration date"),
  expiresAt: z
    .string()
    .nullable()
    .describe("ISO date string when this email should expire, or null"),
  reason: z
    .string()
    .describe("Brief explanation of why this expiration date was chosen"),
});

export interface ExpirationResult {
  shouldExpire: boolean;
  expiresAt: Date | null;
  reason: string;
}

/**
 * Analyze an email and determine when it should expire.
 * The LLM extracts dates from the content to set context-aware expiration.
 *
 * Examples:
 * - "Your package arrives November 5th" -> expires Nov 12 (7 days after)
 * - "Event tomorrow at 3pm" -> expires day after event
 * - "Weekly newsletter" -> expires in 30 days (default)
 */
async function analyzeExpirationWithLLM({
  emailAccount,
  message,
  category,
  defaultDays,
}: {
  emailAccount: EmailAccountWithAI;
  message: ParsedMessage;
  category: string;
  defaultDays: number;
}): Promise<ExpirationResult> {
  const currentDate = new Date();
  const emailForLLM = getEmailForLLM(message);
  const emailDate = emailForLLM.date || currentDate;
  const defaultExpiration = addDays(emailDate, defaultDays);

  const system = `You analyze emails to determine when they should be automatically archived.
Your goal is to extract any relevant dates from the email content and set an appropriate expiration.

Rules for setting expiration dates:
1. **Time-sensitive content**: If the email mentions a specific date/event, expire shortly after that date
   - Package delivery: Expire 7 days after expected delivery
   - Calendar events/meetings: Expire 1 day after the event
   - Sales/promotions with end dates: Expire 1 day after the sale ends
   - Appointments: Expire 1 day after the appointment
   - Limited-time offers: Expire when the offer ends

2. **No specific date found**: Use the default expiration (${defaultDays} days from email date)

3. **Never expire** (return shouldExpire=false) for:
   - Important receipts or financial records
   - Legal documents or contracts
   - Personal correspondence that seems important
   - Account security notifications
   - Password reset emails (these should be handled immediately, not archived by expiration)

Current date: ${formatDateForLLM(currentDate)}
Email received: ${formatDateForLLM(emailDate)}
Category detected: ${category}
Default expiration: ${formatDateForLLM(defaultExpiration)}

Return your response in JSON format with:
- shouldExpire: boolean
- expiresAt: ISO date string or null
- reason: brief explanation`;

  const prompt = `Analyze this email and determine its expiration date:

${stringifyEmail(emailForLLM, 3000)}

Based on the content, when should this email be archived?`;

  try {
    const modelOptions = getModel(emailAccount.user);
    const generateObject = createGenerateObject({
      emailAccount,
      label: "Expiration",
      modelOptions,
    });

    const result = await generateObject({
      ...modelOptions,
      system,
      prompt,
      schema: expirationSchema,
    });

    const { shouldExpire, expiresAt, reason } = result.object;

    return {
      shouldExpire,
      expiresAt: expiresAt ? new Date(expiresAt) : null,
      reason,
    };
  } catch (error) {
    // Fallback to default on error
    return {
      shouldExpire: true,
      expiresAt: defaultExpiration,
      reason: `Fallback: Using default ${defaultDays} days due to analysis error`,
    };
  }
}

/**
 * Main entry point: Analyze an email and set its expiration date.
 * Checks if expiration is enabled, detects category, runs LLM analysis,
 * and stores the result in the database.
 */
export async function analyzeAndSetExpiration({
  emailAccount,
  message,
  logger,
}: {
  emailAccount: EmailAccountWithAI;
  message: ParsedMessage;
  logger: Logger;
}): Promise<void> {
  // 1. Check if expiration is enabled for this account
  const settings = await prisma.emailExpirationSettings.findUnique({
    where: { emailAccountId: emailAccount.id },
  });

  if (!settings?.enabled) {
    logger.trace("Expiration not enabled for account");
    return;
  }

  // 2. Detect if this email category should be analyzed
  const category = detectExpirableCategory(message);
  if (!category) {
    logger.trace("Email not in expirable category");
    return;
  }

  // 3. Check if category is enabled in user settings
  if (!settings.enabledCategories.includes(category)) {
    logger.trace("Category not enabled for expiration", { category });
    return;
  }

  // 4. Get default days for this category
  const defaultDays = getDefaultExpirationDays(category, settings);

  // 5. Run LLM analysis
  const result = await analyzeExpirationWithLLM({
    emailAccount,
    message,
    category,
    defaultDays,
  });

  // 6. Store expiration date on EmailMessage
  if (result.shouldExpire && result.expiresAt) {
    const emailDate = message.internalDate
      ? new Date(Number(message.internalDate))
      : new Date();

    await prisma.emailMessage.upsert({
      where: {
        emailAccountId_threadId_messageId: {
          emailAccountId: emailAccount.id,
          threadId: message.threadId,
          messageId: message.id,
        },
      },
      create: {
        emailAccountId: emailAccount.id,
        threadId: message.threadId,
        messageId: message.id,
        date: emailDate,
        from: message.headers.from,
        fromDomain: extractDomain(message.headers.from),
        to: message.headers.to || "",
        read: !message.labelIds?.includes("UNREAD"),
        sent: message.labelIds?.includes("SENT") || false,
        draft: message.labelIds?.includes("DRAFT") || false,
        inbox: message.labelIds?.includes("INBOX") || false,
        expiresAt: result.expiresAt,
        expirationReason: result.reason,
      },
      update: {
        expiresAt: result.expiresAt,
        expirationReason: result.reason,
      },
    });

    logger.info("Set email expiration", {
      messageId: message.id,
      category,
      expiresAt: result.expiresAt,
      reason: result.reason,
    });
  } else {
    logger.trace("Email should not expire", {
      messageId: message.id,
      reason: result.reason,
    });
  }
}

function extractDomain(email: string): string {
  const match = email.match(/@([^>]+)/);
  return match?.[1]?.replace(/>.*$/, "") || "";
}
