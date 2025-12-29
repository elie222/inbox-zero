# Email Expiration & Automatic Cleanup Feature

## Overview

This feature adds automated cleanup of "aged out" emails (notifications, newsletters, promotions) that are no longer timely. Users configure expiration periods per email category, and a periodic cron job archives expired emails with an "Expired" label.

## Current State Analysis

### Existing Infrastructure We'll Leverage

1. **Cron System** (`apps/web/utils/cron.ts`)
   - Uses Upstash QStash for background job processing
   - CRON_SECRET authentication for endpoints
   - Established patterns in `/api/watch/all`, `/api/resend/digest/all`, etc.

2. **SystemType Categories** (Prisma schema)
   - Already defined: `NOTIFICATION`, `NEWSLETTER`, `MARKETING`, `CALENDAR`, `RECEIPT`
   - These map perfectly to expiration categories

3. **Cleanup Job System** (`CleanupJob` model)
   - Manual, one-time cleanup with AI processing
   - We'll build on these patterns but create a separate automated system

4. **Label Utilities** (`apps/web/utils/label.ts`, `apps/web/utils/gmail/label.ts`)
   - `inboxZeroLabels` pattern for system labels
   - `getOrCreateInboxZeroLabel()` for label management

5. **Gmail Query API** (used in existing cleanup)
   - Query by label, date range, and categories
   - Batch processing via QStash queues

---

## Architecture Design

### Approach: Category-Based Expiration System

```
┌─────────────────────────────────────────────────────────────────────┐
│                    User Configuration (Settings UI)                  │
│  ┌─────────────┐ ┌─────────────┐ ┌─────────────┐ ┌─────────────┐   │
│  │ Notifications│ │ Newsletters │ │  Marketing  │ │   Custom    │   │
│  │   7 days     │ │  30 days    │ │  14 days    │ │  AI-based   │   │
│  └─────────────┘ └─────────────┘ └─────────────┘ └─────────────┘   │
└─────────────────────────────────────────────────────────────────────┘
                                    │
                                    ▼
┌─────────────────────────────────────────────────────────────────────┐
│                    Cron Job (Daily/Hourly)                          │
│  /api/cron/cleanup-expired-emails                                   │
│  - Queries EmailExpirationConfig for all enabled accounts           │
│  - Publishes batch jobs to QStash queue                            │
└─────────────────────────────────────────────────────────────────────┘
                                    │
                                    ▼
┌─────────────────────────────────────────────────────────────────────┐
│                    Email Processing Worker                          │
│  /api/cron/cleanup-expired-emails/process                           │
│  - For each category config:                                        │
│    1. Query Gmail: label:X older_than:Y                             │
│    2. Archive emails + apply "Inbox Zero/Expired" label             │
│    3. Log to ExpiredEmailLog for audit                              │
└─────────────────────────────────────────────────────────────────────┘
```

---

## Database Schema Changes

### New Models

```prisma
// Add to schema.prisma

model EmailExpirationConfig {
  id             String   @id @default(cuid())
  createdAt      DateTime @default(now())
  updatedAt      DateTime @updatedAt

  enabled        Boolean  @default(true)

  // Category targeting (multiple options for flexibility)
  category       ExpirationCategory

  // Expiration settings
  expirationDays Int      // Days before email is considered expired

  // Action settings
  action         ExpirationAction @default(ARCHIVE)
  applyLabel     Boolean  @default(true) // Apply "Expired" label

  // Optional: AI-based expiration for custom rules
  useAI          Boolean  @default(false)
  aiInstructions String?  // Custom AI prompt for determining expiration

  // Relation to email account
  emailAccountId String
  emailAccount   EmailAccount @relation(fields: [emailAccountId], references: [id], onDelete: Cascade)

  // Track last run for scheduling
  lastRunAt      DateTime?
  nextRunAt      DateTime?

  @@unique([emailAccountId, category])
  @@index([emailAccountId])
  @@index([enabled, nextRunAt])
}

model ExpiredEmailLog {
  id             String   @id @default(cuid())
  createdAt      DateTime @default(now())

  threadId       String
  messageId      String?
  subject        String?
  from           String?
  originalDate   DateTime?

  category       ExpirationCategory
  expirationDays Int

  // What action was taken
  action         ExpirationAction
  labelApplied   String?

  emailAccountId String
  emailAccount   EmailAccount @relation(fields: [emailAccountId], references: [id], onDelete: Cascade)

  @@index([emailAccountId, createdAt])
  @@index([emailAccountId, category])
}

enum ExpirationCategory {
  NOTIFICATION      // Package tracking, social notifications, etc.
  NEWSLETTER        // Subscribed newsletters
  MARKETING         // Promotional emails
  SOCIAL            // Social media notifications
  UPDATES           // Gmail Updates category
  FORUMS            // Forum/mailing list emails
  CALENDAR_PAST     // Past calendar events
  CUSTOM            // Custom AI-based category
}

enum ExpirationAction {
  ARCHIVE           // Remove from inbox
  ARCHIVE_AND_LABEL // Archive + apply expired label
  LABEL_ONLY        // Just apply label, keep in inbox
  DELETE            // Move to trash (requires explicit user consent)
}
```

### Update EmailAccount Model

```prisma
// Add to EmailAccount model
model EmailAccount {
  // ... existing fields ...

  // New relation
  expirationConfigs  EmailExpirationConfig[]
  expiredEmailLogs   ExpiredEmailLog[]

  // Global expiration settings
  expirationEnabled  Boolean @default(false)
}
```

---

## File Structure

```
apps/web/
├── app/
│   ├── api/
│   │   └── cron/
│   │       └── cleanup-expired-emails/
│   │           ├── route.ts              # Main cron entry point
│   │           └── process/
│   │               └── route.ts          # Process individual account
│   │   └── expiration-config/
│   │       ├── route.ts                  # CRUD for configs
│   │       └── [id]/
│   │           └── route.ts              # Individual config operations
│   └── (app)/
│       └── [emailAccountId]/
│           └── settings/
│               └── ExpirationSettings.tsx  # Settings UI component
├── utils/
│   ├── expiration/
│   │   ├── index.ts                      # Main expiration logic
│   │   ├── categories.ts                 # Category definitions & Gmail queries
│   │   ├── process-expired.ts            # Email processing logic
│   │   └── ai-expiration.ts              # AI-based expiration for custom rules
│   └── label.ts                          # Add "expired" to inboxZeroLabels
└── prisma/
    └── schema.prisma                     # Schema updates
```

---

## Implementation Steps

### Phase 1: Database & Core Infrastructure

#### Step 1.1: Schema Migration
```bash
# Add new models to schema.prisma
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

#### Step 1.3: Category Query Mapping
```typescript
// apps/web/utils/expiration/categories.ts

import { ExpirationCategory } from "@prisma/client";
import { GmailLabel } from "@/utils/gmail/label";

export const categoryToGmailQuery: Record<ExpirationCategory, {
  labelIds?: string[];
  query?: string;
  description: string;
  defaultDays: number;
}> = {
  NOTIFICATION: {
    // Gmail's UPDATES category often contains notifications
    labelIds: [GmailLabel.UPDATES],
    query: "category:updates",
    description: "System notifications, alerts, package tracking",
    defaultDays: 7,
  },
  NEWSLETTER: {
    query: "has:unsubscribe",
    description: "Subscribed newsletters with unsubscribe links",
    defaultDays: 30,
  },
  MARKETING: {
    labelIds: [GmailLabel.PROMOTIONS],
    query: "category:promotions",
    description: "Promotional emails and marketing",
    defaultDays: 14,
  },
  SOCIAL: {
    labelIds: [GmailLabel.SOCIAL],
    query: "category:social",
    description: "Social media notifications",
    defaultDays: 7,
  },
  UPDATES: {
    labelIds: [GmailLabel.UPDATES],
    query: "category:updates",
    description: "Updates and notifications",
    defaultDays: 14,
  },
  FORUMS: {
    labelIds: [GmailLabel.FORUMS],
    query: "category:forums",
    description: "Mailing lists and forum posts",
    defaultDays: 30,
  },
  CALENDAR_PAST: {
    query: "calendar invite",
    description: "Past calendar event invitations",
    defaultDays: 1, // Archive day after event
  },
  CUSTOM: {
    description: "Custom AI-defined category",
    defaultDays: 14,
  },
};
```

### Phase 2: Cron Endpoint Implementation

#### Step 2.1: Main Cron Entry Point
```typescript
// apps/web/app/api/cron/cleanup-expired-emails/route.ts

import { NextResponse } from "next/server";
import { z } from "zod";
import prisma from "@/utils/prisma";
import { hasCronSecret } from "@/utils/cron";
import { publishToQstashQueue } from "@/utils/upstash";
import { withError } from "@/utils/middleware";

const QUEUE_NAME = "expired-email-cleanup";
const PARALLELISM = 3;

async function getAccountsWithExpiration() {
  return prisma.emailAccount.findMany({
    where: {
      expirationEnabled: true,
      expirationConfigs: {
        some: {
          enabled: true,
        },
      },
    },
    select: {
      id: true,
      email: true,
      expirationConfigs: {
        where: { enabled: true },
      },
    },
  });
}

export const GET = withError(async (request: Request) => {
  if (!hasCronSecret(request)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const accounts = await getAccountsWithExpiration();

  if (accounts.length === 0) {
    return NextResponse.json({ message: "No accounts with expiration enabled" });
  }

  // Publish each account to the processing queue
  for (const account of accounts) {
    await publishToQstashQueue({
      queueName: QUEUE_NAME,
      parallelism: PARALLELISM,
      url: "/api/cron/cleanup-expired-emails/process",
      body: {
        emailAccountId: account.id,
        configs: account.expirationConfigs,
      },
    });
  }

  return NextResponse.json({
    message: `Queued ${accounts.length} accounts for expiration processing`,
    accounts: accounts.map((a) => a.email),
  });
});

// Also support POST for QStash callbacks
export const POST = GET;
```

#### Step 2.2: Account Processing Worker
```typescript
// apps/web/app/api/cron/cleanup-expired-emails/process/route.ts

import { NextResponse } from "next/server";
import { verifySignatureAppRouter } from "@upstash/qstash/nextjs";
import { z } from "zod";
import prisma from "@/utils/prisma";
import { createEmailProvider } from "@/utils/email/provider";
import { withError } from "@/utils/middleware";
import { processExpiredEmails } from "@/utils/expiration/process-expired";
import { ExpirationCategory } from "@prisma/client";

const processSchema = z.object({
  emailAccountId: z.string(),
  configs: z.array(z.object({
    id: z.string(),
    category: z.nativeEnum(ExpirationCategory),
    expirationDays: z.number(),
    action: z.string(),
    applyLabel: z.boolean(),
    useAI: z.boolean(),
    aiInstructions: z.string().nullable(),
  })),
});

export const POST = withError(
  verifySignatureAppRouter(async (request: Request) => {
    const json = await request.json();
    const { emailAccountId, configs } = processSchema.parse(json);

    const emailAccount = await prisma.emailAccount.findUnique({
      where: { id: emailAccountId },
      include: {
        account: {
          select: {
            access_token: true,
            refresh_token: true,
            expires_at: true,
          },
        },
      },
    });

    if (!emailAccount?.account) {
      return NextResponse.json({ error: "Account not found" }, { status: 404 });
    }

    const provider = await createEmailProvider({
      emailAccountId,
      provider: "google", // or detect from account
    });

    // Process each category configuration
    const results = [];
    for (const config of configs) {
      const result = await processExpiredEmails({
        emailAccountId,
        provider,
        config,
      });
      results.push(result);

      // Update last run timestamp
      await prisma.emailExpirationConfig.update({
        where: { id: config.id },
        data: {
          lastRunAt: new Date(),
          nextRunAt: new Date(Date.now() + 24 * 60 * 60 * 1000), // Next day
        },
      });
    }

    return NextResponse.json({
      success: true,
      results,
    });
  })
);
```

#### Step 2.3: Core Expiration Processing Logic
```typescript
// apps/web/utils/expiration/process-expired.ts

import { ExpirationCategory, ExpirationAction } from "@prisma/client";
import type { EmailProvider } from "@/utils/email/types";
import { categoryToGmailQuery } from "./categories";
import { GmailLabel } from "@/utils/gmail/label";
import { inboxZeroLabels } from "@/utils/label";
import prisma from "@/utils/prisma";
import { ONE_DAY_MS } from "@/utils/date";

interface ProcessConfig {
  id: string;
  category: ExpirationCategory;
  expirationDays: number;
  action: string;
  applyLabel: boolean;
  useAI: boolean;
  aiInstructions: string | null;
}

interface ProcessResult {
  category: ExpirationCategory;
  processedCount: number;
  archivedCount: number;
  errors: string[];
}

export async function processExpiredEmails({
  emailAccountId,
  provider,
  config,
}: {
  emailAccountId: string;
  provider: EmailProvider;
  config: ProcessConfig;
}): Promise<ProcessResult> {
  const result: ProcessResult = {
    category: config.category,
    processedCount: 0,
    archivedCount: 0,
    errors: [],
  };

  try {
    // Get or create the expired label
    const expiredLabel = config.applyLabel
      ? await provider.getOrCreateInboxZeroLabel("expired")
      : null;

    // Calculate the cutoff date
    const cutoffDate = new Date(Date.now() - config.expirationDays * ONE_DAY_MS);

    // Build the Gmail query
    const categoryConfig = categoryToGmailQuery[config.category];
    const query = buildExpirationQuery(categoryConfig, cutoffDate);

    // Fetch expired emails
    let nextPageToken: string | undefined;

    do {
      const { threads, nextPageToken: pageToken } = await provider.getThreadsWithQuery({
        query: {
          rawQuery: query,
          labelIds: [GmailLabel.INBOX], // Only process emails still in inbox
          maxResults: 50,
        },
        pageToken: nextPageToken,
      });

      nextPageToken = pageToken;

      if (threads.length === 0) break;

      // Process each thread
      for (const thread of threads) {
        if (!thread.id) continue;

        result.processedCount++;

        try {
          // Build label operations
          const addLabelIds: string[] = [];
          const removeLabelIds: string[] = [];

          if (expiredLabel?.id) {
            addLabelIds.push(expiredLabel.id);
          }

          if (config.action === ExpirationAction.ARCHIVE ||
              config.action === ExpirationAction.ARCHIVE_AND_LABEL) {
            removeLabelIds.push(GmailLabel.INBOX);
          }

          // Apply labels/archive
          if (addLabelIds.length > 0 || removeLabelIds.length > 0) {
            await provider.modifyThread(thread.id, {
              addLabelIds,
              removeLabelIds,
            });
            result.archivedCount++;
          }

          // Log the expiration
          await logExpiredEmail({
            emailAccountId,
            threadId: thread.id,
            category: config.category,
            expirationDays: config.expirationDays,
            action: config.action as ExpirationAction,
            labelApplied: expiredLabel?.name,
          });

        } catch (threadError) {
          result.errors.push(`Thread ${thread.id}: ${threadError}`);
        }
      }

    } while (nextPageToken && result.processedCount < 500); // Safety limit

  } catch (error) {
    result.errors.push(`Fatal: ${error}`);
  }

  return result;
}

function buildExpirationQuery(
  categoryConfig: typeof categoryToGmailQuery[ExpirationCategory],
  cutoffDate: Date
): string {
  const parts: string[] = [];

  if (categoryConfig.query) {
    parts.push(categoryConfig.query);
  }

  // Add date filter: older than cutoff
  parts.push(`before:${formatDateForGmail(cutoffDate)}`);

  // Exclude already processed emails
  parts.push(`-label:${inboxZeroLabels.expired.name.replace(/\//g, "-")}`);

  return parts.join(" ");
}

function formatDateForGmail(date: Date): string {
  return date.toISOString().split("T")[0]; // YYYY-MM-DD
}

async function logExpiredEmail(data: {
  emailAccountId: string;
  threadId: string;
  category: ExpirationCategory;
  expirationDays: number;
  action: ExpirationAction;
  labelApplied?: string | null;
}) {
  await prisma.expiredEmailLog.create({
    data: {
      emailAccountId: data.emailAccountId,
      threadId: data.threadId,
      category: data.category,
      expirationDays: data.expirationDays,
      action: data.action,
      labelApplied: data.labelApplied,
    },
  });
}
```

### Phase 3: API Endpoints for Configuration

```typescript
// apps/web/app/api/expiration-config/route.ts

import { NextResponse } from "next/server";
import { z } from "zod";
import prisma from "@/utils/prisma";
import { withEmailAccount } from "@/utils/middleware";
import { ExpirationCategory, ExpirationAction } from "@prisma/client";

const createConfigSchema = z.object({
  category: z.nativeEnum(ExpirationCategory),
  expirationDays: z.number().min(1).max(365),
  action: z.nativeEnum(ExpirationAction).default(ExpirationAction.ARCHIVE_AND_LABEL),
  applyLabel: z.boolean().default(true),
  useAI: z.boolean().default(false),
  aiInstructions: z.string().optional(),
});

export const GET = withEmailAccount(async (request) => {
  const { emailAccountId } = request;

  const configs = await prisma.emailExpirationConfig.findMany({
    where: { emailAccountId },
    orderBy: { category: "asc" },
  });

  return NextResponse.json({ configs });
});

export const POST = withEmailAccount(async (request) => {
  const { emailAccountId } = request;
  const body = await request.json();
  const data = createConfigSchema.parse(body);

  const config = await prisma.emailExpirationConfig.upsert({
    where: {
      emailAccountId_category: {
        emailAccountId,
        category: data.category,
      },
    },
    create: {
      emailAccountId,
      ...data,
    },
    update: data,
  });

  return NextResponse.json({ config });
});
```

### Phase 4: Settings UI Component

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

### Phase 5: Cron Scheduling

#### Option A: Vercel Cron (if using Vercel)
```json
// vercel.json
{
  "crons": [
    {
      "path": "/api/cron/cleanup-expired-emails",
      "schedule": "0 2 * * *"  // Daily at 2 AM UTC
    }
  ]
}
```

#### Option B: External Scheduler (QStash Schedules)
```typescript
// apps/web/utils/expiration/schedule.ts

import { Client } from "@upstash/qstash";

const qstash = new Client({ token: process.env.QSTASH_TOKEN });

export async function createExpirationSchedule() {
  await qstash.schedules.create({
    destination: `${process.env.NEXT_PUBLIC_BASE_URL}/api/cron/cleanup-expired-emails`,
    cron: "0 2 * * *", // Daily at 2 AM
    headers: {
      Authorization: `Bearer ${process.env.CRON_SECRET}`,
    },
  });
}
```

---

## Advanced Features (Future Enhancements)

### 1. AI-Based Custom Expiration

For the `CUSTOM` category, allow users to define AI rules:

```typescript
// apps/web/utils/expiration/ai-expiration.ts

export async function shouldExpireWithAI({
  emailAccount,
  message,
  instructions,
}: {
  emailAccount: EmailAccountWithAI;
  message: EmailForLLM;
  instructions: string;
}): Promise<{ shouldExpire: boolean; reason: string }> {
  const schema = z.object({
    shouldExpire: z.boolean(),
    reason: z.string(),
  });

  const prompt = `
You are evaluating whether an email should be expired/archived based on the following criteria:

<instructions>
${instructions}
</instructions>

<email>
From: ${message.from}
Subject: ${message.subject}
Date: ${message.date}
Body: ${message.textPlain?.slice(0, 1000)}
</email>

Should this email be expired? Consider the current date is ${new Date().toISOString()}.
`;

  const result = await generateObject({
    schema,
    prompt,
    system: "You help users manage their inbox by identifying emails that are no longer relevant.",
  });

  return result.object;
}
```

### 2. Integration with Existing Rules

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
4. **Is extensible**: Supports AI-based custom rules
5. **Is observable**: Logs all actions for review

The feature fits naturally into the existing architecture while providing powerful new functionality for inbox management.
