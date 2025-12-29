# Email Expiration & Automatic Cleanup Feature

## Overview

This feature adds **intelligent, context-aware** cleanup of "aged out" emails. Instead of static "expire after X days" rules, the **LLM analyzes each email and sets a specific expiration date** based on the content (e.g., "package arrives Nov 5th" → expires Nov 12th).

### Key Differentiator: Dynamic Per-Email Expiration

- **Package notification**: "Your package arrives November 5th" → LLM sets `expiresAt: Nov 12`
- **Calendar invite**: Event on Dec 25 → LLM sets `expiresAt: Dec 26`
- **Flash sale**: "24-hour sale ends tonight!" → LLM sets `expiresAt: tomorrow`
- **Generic newsletter**: No specific date → LLM uses default (30 days from receipt)

## Current State Analysis

### Existing Infrastructure We'll Leverage

1. **Rule Processing Flow** (`apps/web/utils/webhook/process-history-item.ts`)
   - `processHistoryItem()` → `runRules()` flow for incoming emails
   - Perfect hook point for expiration analysis after rule matching

2. **Cron System** (`apps/web/utils/cron.ts`)
   - Uses Upstash QStash for background job processing
   - CRON_SECRET authentication for endpoints
   - Established patterns in `/api/watch/all`, `/api/resend/digest/all`
   - **We'll hook into this existing cron pattern**

3. **SystemType Categories** (Prisma schema)
   - Already defined: `NOTIFICATION`, `NEWSLETTER`, `MARKETING`, `CALENDAR`, `RECEIPT`
   - These help identify emails that should have expiration analysis

4. **EmailMessage Model** (`apps/web/prisma/schema.prisma:686`)
   - Already tracks per-email metadata
   - **We'll add `expiresAt` field here**

5. **ScheduledAction System** (`apps/web/utils/scheduled-actions/`)
   - Existing pattern for time-based actions via QStash
   - Could be extended, but per-email `expiresAt` is simpler

6. **AI Clean System** (`apps/web/utils/ai/clean/ai-clean.ts`)
   - Existing AI pattern for email analysis
   - We'll create similar `ai-expiration.ts` for date extraction

---

## Architecture Design

### Approach: LLM-Driven Per-Email Expiration

```
┌─────────────────────────────────────────────────────────────────────┐
│                    TWO PROCESSING PATHS                              │
└─────────────────────────────────────────────────────────────────────┘

PATH 1: REAL-TIME (New Emails)
═══════════════════════════════════════════════════════════════════════
  Email Arrives → Gmail Webhook → processHistoryItem() → runRules()
                                                              │
                                                              ▼
                                              ┌───────────────────────┐
                                              │ analyzeExpiration()   │
                                              │ - Is this expirable?  │
                                              │ - Extract dates from  │
                                              │   content             │
                                              │ - Calculate expiresAt │
                                              └───────────────────────┘
                                                              │
                                                              ▼
                                              ┌───────────────────────┐
                                              │ Store expiresAt on    │
                                              │ EmailMessage record   │
                                              └───────────────────────┘

PATH 2: BATCH BACKFILL (Existing Emails)
═══════════════════════════════════════════════════════════════════════
  Cron Job (hooks into existing /api/watch/all pattern)
         │
         ▼
  ┌───────────────────────────────────────────────────────────────────┐
  │ /api/cron/expiration/backfill                                      │
  │ Find emails where:                                                 │
  │   - inbox = true                                                   │
  │   - expiresAt IS NULL                                              │
  │   - Matches expirable categories (notification, newsletter, etc.)  │
  │   - Older than 1 day (give real-time a chance first)               │
  └───────────────────────────────────────────────────────────────────┘
         │
         ▼
  For each email → analyzeExpiration() → set expiresAt

PATH 3: CLEANUP (Expired Emails)
═══════════════════════════════════════════════════════════════════════
  Cron Job (daily, hooks into existing pattern)
         │
         ▼
  ┌───────────────────────────────────────────────────────────────────┐
  │ /api/cron/expiration/cleanup                                       │
  │ Find emails where:                                                 │
  │   - inbox = true                                                   │
  │   - expiresAt <= NOW()                                             │
  └───────────────────────────────────────────────────────────────────┘
         │
         ▼
  Archive + Apply "Inbox Zero/Expired" label
```

---

## Database Schema Changes

### Core Change: Add `expiresAt` to EmailMessage

```prisma
// apps/web/prisma/schema.prisma - Update EmailMessage model

model EmailMessage {
  id              String   @id @default(cuid())
  createdAt       DateTime @default(now())
  updatedAt       DateTime @updatedAt
  threadId        String
  messageId       String
  date            DateTime // date of the email
  from            String
  fromName        String?
  fromDomain      String
  to              String
  unsubscribeLink String?
  read            Boolean
  sent            Boolean
  draft           Boolean
  inbox           Boolean

  // NEW: Expiration tracking
  expiresAt       DateTime?  // When this email should be archived
  expiredAt       DateTime?  // When it was actually archived (for audit)
  expirationReason String?   // Why this expiration date was set (LLM reasoning)

  emailAccountId String
  emailAccount   EmailAccount @relation(fields: [emailAccountId], references: [id], onDelete: Cascade)

  @@unique([emailAccountId, threadId, messageId])
  @@index([emailAccountId, threadId])
  @@index([emailAccountId, date])
  @@index([emailAccountId, from])
  @@index([emailAccountId, fromName])
  // NEW: Index for expiration queries
  @@index([emailAccountId, inbox, expiresAt])
}
```

### User Configuration Model

```prisma
// Add to schema.prisma - User's expiration preferences

model EmailExpirationSettings {
  id             String   @id @default(cuid())
  createdAt      DateTime @default(now())
  updatedAt      DateTime @updatedAt

  enabled        Boolean  @default(false)  // Master toggle

  // Default expiration periods (used as suggestions to LLM)
  notificationDays   Int  @default(7)   // Package tracking, alerts
  newsletterDays     Int  @default(30)  // Subscribed newsletters
  marketingDays      Int  @default(14)  // Promotions
  socialDays         Int  @default(7)   // Social media notifications
  calendarDays       Int  @default(1)   // Days after event

  // Action settings
  applyLabel     Boolean  @default(true)  // Apply "Expired" label

  // Categories to analyze (bitmask or JSON array)
  enabledCategories String[] @default(["NOTIFICATION", "NEWSLETTER", "MARKETING", "SOCIAL", "CALENDAR"])

  emailAccountId String   @unique
  emailAccount   EmailAccount @relation(fields: [emailAccountId], references: [id], onDelete: Cascade)
}
```

### Audit Log (Optional but Recommended)

```prisma
model ExpiredEmailLog {
  id             String   @id @default(cuid())
  createdAt      DateTime @default(now())

  threadId       String
  messageId      String
  subject        String?
  from           String?

  // Expiration details
  expiresAt      DateTime  // When it was set to expire
  expiredAt      DateTime  // When cleanup ran
  reason         String?   // LLM's reasoning for expiration date

  emailAccountId String
  emailAccount   EmailAccount @relation(fields: [emailAccountId], references: [id], onDelete: Cascade)

  @@index([emailAccountId, createdAt])
}
```

### Update EmailAccount Model

```prisma
// Add to EmailAccount model
model EmailAccount {
  // ... existing fields ...

  // New relations
  expirationSettings  EmailExpirationSettings?
  expiredEmailLogs    ExpiredEmailLog[]
}
```

---

## File Structure

```
apps/web/
├── app/
│   ├── api/
│   │   ├── cron/
│   │   │   └── expiration/
│   │   │       ├── cleanup/
│   │   │       │   └── route.ts          # Cleanup expired emails (hooks into existing cron)
│   │   │       └── backfill/
│   │   │           └── route.ts          # Backfill missing expiration dates
│   │   └── expiration-settings/
│   │       └── route.ts                  # CRUD for user settings
│   └── (app)/
│       └── [emailAccountId]/
│           └── settings/
│               └── ExpirationSettings.tsx  # Settings UI component
├── utils/
│   ├── expiration/
│   │   ├── index.ts                      # Main expiration logic exports
│   │   ├── analyze-expiration.ts         # LLM-based expiration date extraction
│   │   ├── process-expired.ts            # Cleanup logic
│   │   ├── backfill.ts                   # Batch backfill logic
│   │   └── categories.ts                 # Category detection helpers
│   ├── webhook/
│   │   └── process-history-item.ts       # MODIFY: Add expiration hook after runRules
│   └── label.ts                          # Add "expired" to inboxZeroLabels
└── prisma/
    └── schema.prisma                     # Schema updates
```

---

## Implementation Steps

### Phase 1: Database & Core Infrastructure

#### Step 1.1: Schema Migration
```bash
# Add new fields and models to schema.prisma
# Run migration
pnpm prisma migrate dev --name add-email-expiration
```

#### Step 1.2: Add Expired Label Definition
```typescript
// apps/web/utils/label.ts - Update inboxZeroLabels

export const inboxZeroLabels = {
  // ... existing labels ...
  expired: {
    name: "Inbox Zero/Expired",
    color: "#ffa000", // amber/orange color
    description: "Automatically archived due to age",
  },
};
```

#### Step 1.3: Category Detection Helpers
```typescript
// apps/web/utils/expiration/categories.ts

import { GmailLabel } from "@/utils/gmail/label";
import type { ParsedMessage } from "@/utils/types";

export type ExpirableCategory =
  | "NOTIFICATION"
  | "NEWSLETTER"
  | "MARKETING"
  | "SOCIAL"
  | "CALENDAR"
  | null;

export const categoryDefaults: Record<NonNullable<ExpirableCategory>, number> = {
  NOTIFICATION: 7,
  NEWSLETTER: 30,
  MARKETING: 14,
  SOCIAL: 7,
  CALENDAR: 1,
};

/**
 * Detect if an email should be analyzed for expiration
 * Returns the category if expirable, null if not
 */
export function detectExpirableCategory(message: ParsedMessage): ExpirableCategory {
  const labels = message.labelIds || [];

  // Check Gmail categories
  if (labels.includes(GmailLabel.SOCIAL)) return "SOCIAL";
  if (labels.includes(GmailLabel.PROMOTIONS)) return "MARKETING";
  if (labels.includes(GmailLabel.UPDATES)) return "NOTIFICATION";
  if (labels.includes(GmailLabel.FORUMS)) return "NEWSLETTER";

  // Check for calendar invites
  if (message.headers["content-type"]?.includes("calendar")) return "CALENDAR";

  // Check for unsubscribe link (newsletter indicator)
  if (message.headers["list-unsubscribe"]) return "NEWSLETTER";

  // Could add more heuristics here
  return null;
}

/**
 * Get default expiration days for a category
 */
export function getDefaultExpirationDays(
  category: ExpirableCategory,
  userSettings?: { notificationDays?: number; newsletterDays?: number; /* etc */ }
): number {
  if (!category) return 30; // Fallback default

  // Use user settings if available, otherwise category defaults
  switch (category) {
    case "NOTIFICATION": return userSettings?.notificationDays ?? 7;
    case "NEWSLETTER": return userSettings?.newsletterDays ?? 30;
    case "MARKETING": return userSettings?.marketingDays ?? 14;
    case "SOCIAL": return userSettings?.socialDays ?? 7;
    case "CALENDAR": return userSettings?.calendarDays ?? 1;
    default: return 30;
  }
}
```

### Phase 2: LLM Expiration Analysis (Core Feature)

#### Step 2.1: AI Expiration Date Extraction
```typescript
// apps/web/utils/expiration/analyze-expiration.ts

import { z } from "zod";
import type { EmailAccountWithAI } from "@/utils/llms/types";
import type { EmailForLLM } from "@/utils/types";
import { formatDateForLLM } from "@/utils/date";
import { getModel } from "@/utils/llms/model";
import { createGenerateObject } from "@/utils/llms";
import { addDays } from "date-fns";
import { detectExpirableCategory, getDefaultExpirationDays } from "./categories";

const expirationSchema = z.object({
  isExpirable: z.boolean().describe("Whether this email should have an expiration date"),
  expiresAt: z.string().nullable().describe("ISO date string when this email should expire, or null"),
  reason: z.string().describe("Brief explanation of why this expiration date was chosen"),
});

export interface ExpirationResult {
  isExpirable: boolean;
  expiresAt: Date | null;
  reason: string;
}

/**
 * Analyze an email and determine when it should expire.
 * The LLM extracts dates from the content to set context-aware expiration.
 *
 * Examples:
 * - "Your package arrives November 5th" → expires Nov 12 (7 days after)
 * - "Event tomorrow at 3pm" → expires day after event
 * - "Weekly newsletter" → expires in 30 days (default)
 */
export async function analyzeExpiration({
  emailAccount,
  message,
  category,
  defaultDays,
}: {
  emailAccount: EmailAccountWithAI;
  message: EmailForLLM;
  category: string;
  defaultDays: number;
}): Promise<ExpirationResult> {
  const currentDate = new Date();
  const defaultExpiration = addDays(currentDate, defaultDays);

  const system = `You analyze emails to determine when they should be automatically archived.
Your goal is to extract any relevant dates from the email content and set an appropriate expiration.

Rules for setting expiration dates:
1. **Time-sensitive content**: If the email mentions a specific date/event, expire shortly after that date
   - Package delivery: Expire 7 days after expected delivery
   - Calendar events: Expire 1 day after the event
   - Sales/promotions with end dates: Expire 1 day after the sale ends
   - Appointments: Expire 1 day after the appointment

2. **No specific date**: Use the default expiration (${defaultDays} days from receipt)

3. **Never expire**: Return isExpirable=false for:
   - Important receipts or financial records
   - Legal documents
   - Personal correspondence that seems important

Current date: ${formatDateForLLM(currentDate)}
Email received: ${message.date ? formatDateForLLM(new Date(message.date)) : "unknown"}
Category detected: ${category}
Default expiration: ${formatDateForLLM(defaultExpiration)}

Return your response in JSON format.`;

  const prompt = `Analyze this email and determine its expiration date:

From: ${message.from}
Subject: ${message.subject}
Date: ${message.date || "unknown"}

Body:
${message.textPlain?.slice(0, 2000) || message.textHtml?.slice(0, 2000) || "(no body)"}

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

    const { isExpirable, expiresAt, reason } = result.object;

    return {
      isExpirable,
      expiresAt: expiresAt ? new Date(expiresAt) : null,
      reason,
    };
  } catch (error) {
    // Fallback to default on error
    return {
      isExpirable: true,
      expiresAt: defaultExpiration,
      reason: `Fallback: Using default ${defaultDays} days due to analysis error`,
    };
  }
}
```

#### Step 2.2: Integration with Email Processing Flow
```typescript
// apps/web/utils/webhook/process-history-item.ts - ADD after runRules

import { after } from "next/server";
import { analyzeAndSetExpiration } from "@/utils/expiration";

// Inside processHistoryItem(), after runRules() call:

if (hasAutomationRules && hasAiAccess) {
  logger.info("Running rules...");

  await runRules({
    provider,
    message: parsedMessage,
    rules,
    emailAccount,
    isTest: false,
    modelType: "default",
    logger,
  });

  // NEW: Analyze expiration for applicable emails
  // Run in background to not block the main flow
  after(() =>
    analyzeAndSetExpiration({
      emailAccount,
      message: parsedMessage,
      logger,
    }).catch((error) =>
      logger.error("Failed to analyze expiration", { error, messageId })
    )
  );
}
```

#### Step 2.3: Expiration Analysis Wrapper
```typescript
// apps/web/utils/expiration/index.ts

import { after } from "next/server";
import prisma from "@/utils/prisma";
import { analyzeExpiration } from "./analyze-expiration";
import { detectExpirableCategory, getDefaultExpirationDays } from "./categories";
import { getEmailForLLM } from "@/utils/get-email-from-message";
import type { ParsedMessage } from "@/utils/types";
import type { EmailAccountWithAI } from "@/utils/llms/types";
import type { Logger } from "@/utils/logger";

export async function analyzeAndSetExpiration({
  emailAccount,
  message,
  logger,
}: {
  emailAccount: EmailAccountWithAI;
  message: ParsedMessage;
  logger: Logger;
}) {
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
  const emailForLLM = getEmailForLLM(message);
  const result = await analyzeExpiration({
    emailAccount,
    message: emailForLLM,
    category,
    defaultDays,
  });

  // 6. Store expiration date on EmailMessage
  if (result.isExpirable && result.expiresAt) {
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
        date: new Date(message.internalDate),
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
      expiresAt: result.expiresAt,
      reason: result.reason,
    });
  }
}

function extractDomain(email: string): string {
  const match = email.match(/@([^>]+)/);
  return match?.[1] || "";
}
```

### Phase 3: Batch Backfill (For Existing Emails)

This cron job processes emails that weren't analyzed in real-time (e.g., emails received before the feature was enabled).

```typescript
// apps/web/app/api/cron/expiration/backfill/route.ts

import { NextResponse } from "next/server";
import { hasCronSecret } from "@/utils/cron";
import { withError } from "@/utils/middleware";
import prisma from "@/utils/prisma";
import { publishToQstashQueue } from "@/utils/upstash";

export const dynamic = "force-dynamic";
export const maxDuration = 300;

const QUEUE_NAME = "expiration-backfill";
const PARALLELISM = 3;
const BATCH_SIZE = 50;

export const GET = withError("expiration/backfill", async (request) => {
  if (!hasCronSecret(request)) {
    return new Response("Unauthorized", { status: 401 });
  }

  // Find accounts with expiration enabled
  const accounts = await prisma.emailExpirationSettings.findMany({
    where: { enabled: true },
    select: { emailAccountId: true },
  });

  if (accounts.length === 0) {
    return NextResponse.json({ message: "No accounts with expiration enabled" });
  }

  // For each account, find emails needing expiration analysis
  let totalQueued = 0;
  for (const { emailAccountId } of accounts) {
    // Find inbox emails without expiresAt, older than 1 day
    const emailsToProcess = await prisma.emailMessage.findMany({
      where: {
        emailAccountId,
        inbox: true,
        expiresAt: null,
        date: {
          lt: new Date(Date.now() - 24 * 60 * 60 * 1000), // Older than 1 day
        },
      },
      select: {
        messageId: true,
        threadId: true,
      },
      take: BATCH_SIZE,
    });

    if (emailsToProcess.length > 0) {
      await publishToQstashQueue({
        queueName: QUEUE_NAME,
        parallelism: PARALLELISM,
        url: "/api/cron/expiration/backfill/process",
        body: {
          emailAccountId,
          emails: emailsToProcess,
        },
      });
      totalQueued += emailsToProcess.length;
    }
  }

  return NextResponse.json({
    message: `Queued ${totalQueued} emails for expiration backfill`,
  });
});

export const POST = GET;
```

```typescript
// apps/web/app/api/cron/expiration/backfill/process/route.ts

import { NextResponse } from "next/server";
import { verifySignatureAppRouter } from "@upstash/qstash/nextjs";
import { z } from "zod";
import { withError, type RequestWithLogger } from "@/utils/middleware";
import { getEmailAccountWithAiAndTokens } from "@/utils/user/get";
import { createEmailProvider } from "@/utils/email/provider";
import { analyzeAndSetExpiration } from "@/utils/expiration";

const processSchema = z.object({
  emailAccountId: z.string(),
  emails: z.array(z.object({
    messageId: z.string(),
    threadId: z.string(),
  })),
});

export const POST = withError(
  "expiration/backfill/process",
  verifySignatureAppRouter(async (request: Request) => {
    const json = await request.json();
    const { emailAccountId, emails } = processSchema.parse(json);
    const logger = (request as RequestWithLogger).logger;

    const emailAccount = await getEmailAccountWithAiAndTokens({ emailAccountId });
    if (!emailAccount) {
      return NextResponse.json({ error: "Account not found" }, { status: 404 });
    }

    const provider = await createEmailProvider({
      emailAccountId,
      provider: "google",
      logger,
    });

    let processed = 0;
    let errors = 0;

    for (const { messageId } of emails) {
      try {
        const message = await provider.getMessage(messageId);
        if (message) {
          await analyzeAndSetExpiration({
            emailAccount,
            message,
            logger,
          });
          processed++;
        }
      } catch (error) {
        logger.error("Failed to process email for expiration", { messageId, error });
        errors++;
      }
    }

    return NextResponse.json({ processed, errors });
  })
);
```

### Phase 4: Cleanup Cron (Archive Expired Emails)

This cron job finds emails past their expiration date and archives them.

```typescript
// apps/web/app/api/cron/expiration/cleanup/route.ts

import { NextResponse } from "next/server";
import { hasCronSecret } from "@/utils/cron";
import { withError } from "@/utils/middleware";
import prisma from "@/utils/prisma";
import { publishToQstashQueue } from "@/utils/upstash";

export const dynamic = "force-dynamic";
export const maxDuration = 300;

const QUEUE_NAME = "expiration-cleanup";
const PARALLELISM = 3;

export const GET = withError("expiration/cleanup", async (request) => {
  if (!hasCronSecret(request)) {
    return new Response("Unauthorized", { status: 401 });
  }

  // Find accounts with expiration enabled
  const accounts = await prisma.emailExpirationSettings.findMany({
    where: { enabled: true },
    select: {
      emailAccountId: true,
      applyLabel: true,
    },
  });

  if (accounts.length === 0) {
    return NextResponse.json({ message: "No accounts with expiration enabled" });
  }

  // For each account, find expired emails
  let totalQueued = 0;
  for (const account of accounts) {
    const expiredEmails = await prisma.emailMessage.findMany({
      where: {
        emailAccountId: account.emailAccountId,
        inbox: true,
        expiredAt: null, // Not yet processed
        expiresAt: {
          lte: new Date(), // Expiration date has passed
        },
      },
      select: {
        id: true,
        messageId: true,
        threadId: true,
        expiresAt: true,
        expirationReason: true,
      },
      take: 100, // Process in batches
    });

    if (expiredEmails.length > 0) {
      await publishToQstashQueue({
        queueName: QUEUE_NAME,
        parallelism: PARALLELISM,
        url: "/api/cron/expiration/cleanup/process",
        body: {
          emailAccountId: account.emailAccountId,
          applyLabel: account.applyLabel,
          emails: expiredEmails,
        },
      });
      totalQueued += expiredEmails.length;
    }
  }

  return NextResponse.json({
    message: `Queued ${totalQueued} expired emails for cleanup`,
  });
});

export const POST = GET;
```

```typescript
// apps/web/app/api/cron/expiration/cleanup/process/route.ts

import { NextResponse } from "next/server";
import { verifySignatureAppRouter } from "@upstash/qstash/nextjs";
import { z } from "zod";
import { withError, type RequestWithLogger } from "@/utils/middleware";
import prisma from "@/utils/prisma";
import { createEmailProvider } from "@/utils/email/provider";
import { GmailLabel } from "@/utils/gmail/label";

const processSchema = z.object({
  emailAccountId: z.string(),
  applyLabel: z.boolean(),
  emails: z.array(z.object({
    id: z.string(),
    messageId: z.string(),
    threadId: z.string(),
    expiresAt: z.string(),
    expirationReason: z.string().nullable(),
  })),
});

export const POST = withError(
  "expiration/cleanup/process",
  verifySignatureAppRouter(async (request: Request) => {
    const json = await request.json();
    const { emailAccountId, applyLabel, emails } = processSchema.parse(json);
    const logger = (request as RequestWithLogger).logger;

    const provider = await createEmailProvider({
      emailAccountId,
      provider: "google",
      logger,
    });

    // Get or create expired label if needed
    const expiredLabel = applyLabel
      ? await provider.getOrCreateInboxZeroLabel("expired")
      : null;

    let archived = 0;
    let errors = 0;

    for (const email of emails) {
      try {
        // Archive the email and optionally apply label
        const addLabelIds = expiredLabel?.id ? [expiredLabel.id] : [];
        const removeLabelIds = [GmailLabel.INBOX];

        await provider.modifyThread(email.threadId, {
          addLabelIds,
          removeLabelIds,
        });

        // Update the record
        await prisma.emailMessage.update({
          where: { id: email.id },
          data: {
            inbox: false,
            expiredAt: new Date(),
          },
        });

        // Log for audit
        await prisma.expiredEmailLog.create({
          data: {
            emailAccountId,
            threadId: email.threadId,
            messageId: email.messageId,
            expiresAt: new Date(email.expiresAt),
            expiredAt: new Date(),
            reason: email.expirationReason,
          },
        });

        archived++;
        logger.info("Archived expired email", {
          threadId: email.threadId,
          reason: email.expirationReason,
        });
      } catch (error) {
        logger.error("Failed to archive expired email", {
          threadId: email.threadId,
          error,
        });
        errors++;
      }
    }

    return NextResponse.json({ archived, errors });
  })
);
```

### Phase 5: API Endpoints for Configuration

```typescript
// apps/web/app/api/expiration-settings/route.ts

import { NextResponse } from "next/server";
import { z } from "zod";
import prisma from "@/utils/prisma";
import { withEmailAccount } from "@/utils/middleware";

const updateSettingsSchema = z.object({
  enabled: z.boolean().optional(),
  notificationDays: z.number().min(1).max(365).optional(),
  newsletterDays: z.number().min(1).max(365).optional(),
  marketingDays: z.number().min(1).max(365).optional(),
  socialDays: z.number().min(1).max(365).optional(),
  calendarDays: z.number().min(1).max(30).optional(),
  applyLabel: z.boolean().optional(),
  enabledCategories: z.array(z.string()).optional(),
});

export const GET = withEmailAccount(async (request) => {
  const { emailAccountId } = request;

  const settings = await prisma.emailExpirationSettings.findUnique({
    where: { emailAccountId },
  });

  return NextResponse.json({ settings });
});

export const POST = withEmailAccount(async (request) => {
  const { emailAccountId } = request;
  const body = await request.json();
  const data = updateSettingsSchema.parse(body);

  const settings = await prisma.emailExpirationSettings.upsert({
    where: { emailAccountId },
    create: {
      emailAccountId,
      ...data,
    },
    update: data,
  });

  return NextResponse.json({ settings });
});
```

### Phase 6: Settings UI Component

```tsx
// apps/web/app/(app)/[emailAccountId]/settings/ExpirationSettings.tsx

"use client";

import { useState } from "react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Switch } from "@/components/ui/switch";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Clock, Trash2, Archive, Tag } from "lucide-react";

const CATEGORIES = [
  {
    id: "NOTIFICATION",
    name: "Notifications",
    description: "Package tracking, social alerts, system notifications",
    defaultDays: 7,
    icon: "🔔"
  },
  {
    id: "NEWSLETTER",
    name: "Newsletters",
    description: "Subscribed email newsletters",
    defaultDays: 30,
    icon: "📰"
  },
  {
    id: "MARKETING",
    name: "Marketing/Promotions",
    description: "Promotional emails and offers",
    defaultDays: 14,
    icon: "📢"
  },
  {
    id: "SOCIAL",
    name: "Social Media",
    description: "LinkedIn, Facebook, Twitter notifications",
    defaultDays: 7,
    icon: "💬"
  },
  {
    id: "FORUMS",
    name: "Forums/Mailing Lists",
    description: "Discussion forums and mailing list posts",
    defaultDays: 30,
    icon: "👥"
  },
  {
    id: "CALENDAR_PAST",
    name: "Past Calendar Events",
    description: "Calendar invitations for past events",
    defaultDays: 1,
    icon: "📅"
  },
];

export function ExpirationSettings({ emailAccountId, initialConfigs }) {
  const [configs, setConfigs] = useState(initialConfigs || []);
  const [enabled, setEnabled] = useState(false);

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between">
          <div>
            <CardTitle className="flex items-center gap-2">
              <Clock className="h-5 w-5" />
              Email Expiration & Auto-Cleanup
            </CardTitle>
            <CardDescription>
              Automatically archive old emails that are no longer timely
            </CardDescription>
          </div>
          <Switch
            checked={enabled}
            onCheckedChange={setEnabled}
          />
        </div>
      </CardHeader>

      {enabled && (
        <CardContent className="space-y-6">
          <p className="text-sm text-muted-foreground">
            Configure how long different types of emails should remain in your inbox
            before being automatically archived with an "Expired" label.
          </p>

          <div className="space-y-4">
            {CATEGORIES.map((category) => (
              <CategoryConfig
                key={category.id}
                category={category}
                config={configs.find(c => c.category === category.id)}
                onUpdate={(config) => updateConfig(category.id, config)}
              />
            ))}
          </div>

          <div className="border-t pt-4">
            <h4 className="text-sm font-medium mb-2">Actions</h4>
            <div className="flex gap-2">
              <Button variant="outline" size="sm">
                <Archive className="h-4 w-4 mr-2" />
                Run Cleanup Now
              </Button>
              <Button variant="outline" size="sm">
                Preview Expired Emails
              </Button>
            </div>
          </div>
        </CardContent>
      )}
    </Card>
  );
}

function CategoryConfig({ category, config, onUpdate }) {
  const [isEnabled, setIsEnabled] = useState(config?.enabled ?? false);
  const [days, setDays] = useState(config?.expirationDays ?? category.defaultDays);

  return (
    <div className="flex items-center justify-between p-3 border rounded-lg">
      <div className="flex items-center gap-3">
        <span className="text-2xl">{category.icon}</span>
        <div>
          <div className="font-medium">{category.name}</div>
          <div className="text-sm text-muted-foreground">{category.description}</div>
        </div>
      </div>

      <div className="flex items-center gap-4">
        <div className="flex items-center gap-2">
          <Label htmlFor={`days-${category.id}`} className="text-sm whitespace-nowrap">
            Expire after
          </Label>
          <Input
            id={`days-${category.id}`}
            type="number"
            value={days}
            onChange={(e) => setDays(Number(e.target.value))}
            className="w-16"
            min={1}
            max={365}
            disabled={!isEnabled}
          />
          <span className="text-sm text-muted-foreground">days</span>
        </div>
        <Switch
          checked={isEnabled}
          onCheckedChange={(checked) => {
            setIsEnabled(checked);
            onUpdate({ enabled: checked, expirationDays: days });
          }}
        />
      </div>
    </div>
  );
}
```

### Phase 7: Cron Scheduling (Hook into Existing Cron)

The expiration cron jobs follow the same pattern as existing crons (`/api/watch/all`, `/api/resend/digest/all`).

#### Option A: External Scheduler (Recommended - matches existing pattern)

Since the codebase uses an external scheduler that calls these endpoints with CRON_SECRET, add these to your external scheduler configuration:

```
# Daily cleanup of expired emails (2 AM UTC)
0 2 * * * curl -H "Authorization: Bearer $CRON_SECRET" https://your-app.com/api/cron/expiration/cleanup

# Backfill missing expiration dates (3 AM UTC, less frequent)
0 3 * * * curl -H "Authorization: Bearer $CRON_SECRET" https://your-app.com/api/cron/expiration/backfill
```

#### Option B: QStash Schedules
```typescript
// apps/web/utils/expiration/schedule.ts

import { Client } from "@upstash/qstash";

const qstash = new Client({ token: process.env.QSTASH_TOKEN });

export async function createExpirationSchedules() {
  // Cleanup expired emails daily at 2 AM
  await qstash.schedules.create({
    destination: `${process.env.NEXT_PUBLIC_BASE_URL}/api/cron/expiration/cleanup`,
    cron: "0 2 * * *",
    headers: {
      Authorization: `Bearer ${process.env.CRON_SECRET}`,
    },
  });

  // Backfill missing expirations daily at 3 AM
  await qstash.schedules.create({
    destination: `${process.env.NEXT_PUBLIC_BASE_URL}/api/cron/expiration/backfill`,
    cron: "0 3 * * *",
    headers: {
      Authorization: `Bearer ${process.env.CRON_SECRET}`,
    },
  });
}
```

---

## Advanced Features (Future Enhancements)

### 1. Integration with Existing Rules

Allow rules to set expiration when they match:

```prisma
// Add to Action model
model Action {
  // ... existing fields ...
  expirationDays  Int?  // If set, mark email to expire after N days
}
```

### 3. Digest of Expired Emails

Send users a weekly summary of what was auto-archived:

```typescript
// Include in existing digest system
export async function includeExpiredEmailsInDigest({
  emailAccountId,
  since: Date,
}): Promise<ExpiredEmailSummary> {
  const logs = await prisma.expiredEmailLog.findMany({
    where: {
      emailAccountId,
      createdAt: { gte: since },
    },
    orderBy: { createdAt: "desc" },
  });

  return {
    totalArchived: logs.length,
    byCategory: groupBy(logs, "category"),
  };
}
```

---

## Testing Strategy

1. **Unit Tests**: Test Gmail query building, date calculations
2. **Integration Tests**: Test with mock Gmail API
3. **E2E Tests**: Full cron job execution with test account

```typescript
// __tests__/expiration/process-expired.test.ts

describe("processExpiredEmails", () => {
  it("should archive emails older than configured days", async () => {
    // Create test emails with old dates
    // Run processor
    // Verify emails were archived and labeled
  });

  it("should respect category filters", async () => {
    // Verify only matching category emails are processed
  });

  it("should not re-process already expired emails", async () => {
    // Verify emails with expired label are skipped
  });
});
```

---

## Migration & Rollout Plan

1. **Phase 1**: Deploy schema changes, API endpoints (feature flagged)
2. **Phase 2**: Add settings UI, allow configuration
3. **Phase 3**: Enable cron job for opt-in users
4. **Phase 4**: Gradual rollout with monitoring
5. **Phase 5**: Full availability

---

## Monitoring & Observability

```typescript
// Add to expiration processing
logger.info("Expiration job completed", {
  emailAccountId,
  category: config.category,
  processedCount: result.processedCount,
  archivedCount: result.archivedCount,
  errors: result.errors.length,
  duration: endTime - startTime,
});
```

---

## Summary

This implementation:

1. **Leverages existing infrastructure**: QStash, Gmail API, label utilities
2. **Is configurable**: Per-category settings with custom expiration periods
3. **Is safe**: Applies labels for audit trail, doesn't delete by default
4. **Is observable**: Logs all actions with LLM reasoning for review
5. **Has two processing paths**: Real-time (webhook) and batch (cron backfill)

### Key Innovation: LLM-Driven Dynamic Expiration

Unlike static "expire after X days" rules, this system:

1. **Analyzes email content** to find relevant dates (package delivery, event dates, sale end dates)
2. **Sets per-email expiration** based on context, not just category
3. **Stores reasoning** so users can understand why emails were archived
4. **Falls back gracefully** to category defaults when no specific date is found

Example transformations:
- "Your Amazon package arrives Tuesday" → expires 7 days after Tuesday
- "Reminder: Team meeting tomorrow at 2pm" → expires day after meeting
- "50% off sale ends midnight!" → expires next day
- "Weekly newsletter digest" → expires in 30 days (default)

The feature fits naturally into the existing architecture while providing intelligent, context-aware inbox management.
