import { NextResponse } from "next/server";
import { createScopedLogger } from "@/utils/logger";
import type { CleanAction } from "@prisma/client";
import prisma from "@/utils/prisma";
import { createEmailProvider } from "@/utils/email/provider";
import { createUnsubscribeToken } from "@/utils/unsubscribe";
import { calculateNextScheduleDate } from "@/utils/schedule";
import { sendDigestEmail } from "@inboxzero/resend";
import { env } from "@/env";
import { DigestStatus, SystemType } from "@prisma/client";
import { extractNameFromEmail } from "@/utils/email";
import { camelCase } from "lodash";
import { getRuleName } from "@/utils/rule/consts";
import { storedDigestContentSchema } from "@/app/api/resend/digest/validation";
import { sleep } from "@/utils/sleep";
import type { ParsedMessage } from "@/utils/types";
import type { Digest } from "@/app/api/resend/digest/validation";
import { handleBatchRequest } from "@/app/api/user/categorize/senders/batch/handle-batch";

const logger = createScopedLogger("queue-handlers");

export interface DigestJobData {
  emailAccountId: string;
  actionId?: string;
  coldEmailId?: string;
  message: {
    id: string;
    threadId: string;
    from: string;
    to: string;
    subject: string;
    content: string;
  };
}

export interface AiCategorizeSendersJobData {
  emailAccountId: string;
  senders: string[];
}

export interface ScheduledActionJobData {
  scheduledActionId: string;
}

export interface AiCleanJobData {
  emailAccountId: string;
  threadId: string;
  markedDoneLabelId: string;
  processedLabelId: string;
  jobId: string;
  action: CleanAction;
  instructions?: string;
  skips: {
    reply: boolean;
    starred: boolean;
    calendar: boolean;
    receipt: boolean;
    attachment: boolean;
    conversation: boolean;
  };
}

export interface EmailDigestAllJobData {
  emailAccountId: string;
}

export interface EmailSummaryAllJobData {
  email: string;
  userId: string;
}

export interface CleanGmailJobData {
  emailAccountId: string;
  threadId: string;
  markDone: boolean;
  action: CleanAction;
  markedDoneLabelId?: string;
  processedLabelId?: string;
  jobId: string;
}

async function handleDigestJob(data: DigestJobData) {
  logger.info("Processing digest job", {
    emailAccountId: data.emailAccountId,
    actionId: data.actionId,
    coldEmailId: data.coldEmailId,
    messageId: data.message.id,
  });

  // TODO: Implement actual digest processing logic
  await new Promise((resolve) => setTimeout(resolve, 1000));

  logger.info("Digest job completed");
  return NextResponse.json({ success: true });
}

async function handleCategorizeSendersJob(data: AiCategorizeSendersJobData) {
  logger.info("Processing categorize senders job", {
    emailAccountId: data.emailAccountId,
    senderCount: data.senders.length,
  });

  try {
    // Call the batch categorization logic directly instead of making an HTTP call
    // This eliminates unnecessary network overhead and improves performance
    const response = await handleBatchRequest(
      new Request("http://localhost", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(data),
      }),
    );

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(
        `Batch categorization failed: ${response.status} - ${errorText}`,
      );
    }

    logger.info("Categorize senders job completed successfully");
    return NextResponse.json({ success: true });
  } catch (error) {
    logger.error("Error processing categorize senders job", { error });
    throw error;
  }
}

async function handleScheduledActionJob(data: ScheduledActionJobData) {
  logger.info("Processing scheduled action job", {
    scheduledActionId: data.scheduledActionId,
  });

  // TODO: Implement actual scheduled action logic
  await new Promise((resolve) => setTimeout(resolve, 500));

  logger.info("Scheduled action job completed");
  return NextResponse.json({ success: true });
}

async function handleAiCleanJob(data: AiCleanJobData) {
  logger.info("Processing AI clean job", {
    emailAccountId: data.emailAccountId,
    threadId: data.threadId,
    action: data.action,
    jobId: data.jobId,
  });

  // TODO: Implement actual AI clean logic
  await new Promise((resolve) => setTimeout(resolve, 3000));

  logger.info("AI clean job completed");
  return NextResponse.json({ success: true });
}

async function handleEmailDigestAllJob(data: EmailDigestAllJobData) {
  logger.info("Processing email digest all job", {
    emailAccountId: data.emailAccountId,
  });

  try {
    const result = await sendDigestEmailForAccount(data.emailAccountId);
    logger.info("Email digest all job completed", { result });
    return NextResponse.json({ success: true, result });
  } catch (error) {
    logger.error("Email digest all job failed", {
      emailAccountId: data.emailAccountId,
      error: error instanceof Error ? error.message : String(error),
    });
    throw error;
  }
}

async function getDigestSchedule({
  emailAccountId,
}: {
  emailAccountId: string;
}) {
  return prisma.schedule.findUnique({
    where: { emailAccountId },
    select: {
      id: true,
      intervalDays: true,
      occurrences: true,
      daysOfWeek: true,
      timeOfDay: true,
      lastOccurrenceAt: true,
      nextOccurrenceAt: true,
    },
  });
}

async function sendDigestEmailForAccount(emailAccountId: string) {
  logger.info("Sending digest email");

  const emailAccount = await prisma.emailAccount.findUnique({
    where: { id: emailAccountId },
    select: {
      email: true,
      account: { select: { provider: true } },
    },
  });

  if (!emailAccount) {
    throw new Error("Email account not found");
  }

  const emailProvider = await createEmailProvider({
    emailAccountId,
    provider: emailAccount.account.provider,
  });

  const digestScheduleData = await getDigestSchedule({ emailAccountId });

  const pendingDigests = await prisma.digest.findMany({
    where: {
      emailAccountId,
      status: DigestStatus.PENDING,
    },
    select: {
      id: true,
      items: {
        select: {
          messageId: true,
          content: true,
          action: {
            select: {
              executedRule: {
                select: {
                  rule: {
                    select: {
                      name: true,
                    },
                  },
                },
              },
            },
          },
        },
      },
    },
  });

  if (pendingDigests.length) {
    // Mark all found digests as processing
    await prisma.digest.updateMany({
      where: {
        id: {
          in: pendingDigests.map((d) => d.id),
        },
      },
      data: {
        status: DigestStatus.PROCESSING,
      },
    });
  }

  try {
    // Return early if no digests were found
    if (pendingDigests.length === 0) {
      return { success: true, message: "No digests to process" };
    }

    // Store the digest IDs for the final update
    const processedDigestIds = pendingDigests.map((d) => d.id);

    const messageIds = pendingDigests.flatMap((digest) =>
      digest.items.map((item) => item.messageId),
    );

    logger.info("Fetching batch of messages");

    const messages: ParsedMessage[] = [];
    if (messageIds.length > 0) {
      const batchSize = 100;

      // Can't fetch more than 100 messages at a time, so fetch in batches
      // and wait 2 seconds to avoid rate limiting
      // TODO: Refactor into the provider if used elsewhere
      for (let i = 0; i < messageIds.length; i += batchSize) {
        const batch = messageIds.slice(i, i + batchSize);
        const batchResults = await emailProvider.getMessagesBatch(batch);
        messages.push(...batchResults);

        if (i + batchSize < messageIds.length) {
          await sleep(2000);
        }
      }
    }

    logger.info("Fetched batch of messages");

    // Create a message lookup map for O(1) access
    const messageMap = new Map(messages.map((m) => [m.id, m]));

    // Map of rules camelCase -> ruleName
    const ruleNameMap = new Map<string, string>();

    // Transform and group in a single pass
    const executedRulesByRule = pendingDigests.reduce((acc, digest) => {
      digest.items.forEach((item) => {
        const message = messageMap.get(item.messageId);
        if (!message) {
          logger.warn("Message not found, skipping digest item", {
            messageId: item.messageId,
          });
          return;
        }

        const ruleName =
          item.action?.executedRule?.rule?.name ||
          getRuleName(SystemType.COLD_EMAIL);

        const ruleNameKey = camelCase(ruleName);
        if (!ruleNameMap.has(ruleNameKey)) {
          ruleNameMap.set(ruleNameKey, ruleName);
        }

        if (!acc[ruleNameKey]) {
          acc[ruleNameKey] = [];
        }

        let parsedContent: unknown;
        try {
          parsedContent = JSON.parse(item.content);
        } catch (error) {
          logger.warn("Failed to parse digest item content, skipping item", {
            messageId: item.messageId,
            digestId: digest.id,
            error: error instanceof Error ? error.message : "Unknown error",
          });
          return; // Skip this item and continue with the next one
        }

        const contentResult =
          storedDigestContentSchema.safeParse(parsedContent);

        if (contentResult.success) {
          acc[ruleNameKey].push({
            content: contentResult.data.content,
            from: extractNameFromEmail(message?.headers?.from || ""),
            subject: message?.headers?.subject || "",
          });
        } else {
          logger.warn("Failed to validate digest content structure", {
            messageId: item.messageId,
            digestId: digest.id,
            error: contentResult.error,
          });
        }
      });
      return acc;
    }, {} as Digest);

    if (Object.keys(executedRulesByRule).length === 0) {
      logger.info("No executed rules found, skipping digest email");
      // Reset digests back to PENDING so they can be picked up again in future runs
      await prisma.digest.updateMany({
        where: {
          id: {
            in: processedDigestIds,
          },
        },
        data: {
          status: DigestStatus.PENDING,
        },
      });
      return {
        success: true,
        message: "No executed rules found, skipping digest email",
      };
    }

    const token = await createUnsubscribeToken({ emailAccountId });

    logger.info("Sending digest email");

    // First, send the digest email and wait for it to complete
    await sendDigestEmail({
      from: env.RESEND_FROM_EMAIL,
      to: emailAccount.email,
      emailProps: {
        baseUrl: env.NEXT_PUBLIC_BASE_URL,
        unsubscribeToken: token,
        date: new Date(),
        ruleNames: Object.fromEntries(ruleNameMap),
        ...executedRulesByRule,
        emailAccountId,
      },
    });

    logger.info("Digest email sent");

    // Only update database if email sending succeeded
    // Use a transaction to ensure atomicity - all updates succeed or none are applied
    await prisma.$transaction([
      ...(digestScheduleData
        ? [
            prisma.schedule.update({
              where: {
                id: digestScheduleData.id,
                emailAccountId,
              },
              data: {
                lastOccurrenceAt: new Date(),
                nextOccurrenceAt: calculateNextScheduleDate(digestScheduleData),
              },
            }),
          ]
        : []),
      // Mark only the processed digests as sent
      prisma.digest.updateMany({
        where: {
          id: {
            in: processedDigestIds,
          },
        },
        data: {
          status: DigestStatus.SENT,
          sentAt: new Date(),
        },
      }),
      // Redact all DigestItems for the processed digests
      prisma.digestItem.updateMany({
        data: { content: "[REDACTED]" },
        where: {
          digestId: {
            in: processedDigestIds,
          },
        },
      }),
    ]);
  } catch (error) {
    await prisma.digest.updateMany({
      where: {
        id: {
          in: pendingDigests.map((d) => d.id),
        },
      },
      data: {
        status: DigestStatus.FAILED,
      },
    });
    logger.error("Error sending digest email", { error });
    throw error;
  }

  return { success: true, message: "Digest email sent successfully" };
}

async function handleEmailSummaryAllJob(data: EmailSummaryAllJobData) {
  logger.info("Processing email summary all job", {
    userId: data.userId,
  });

  // TODO: Implement actual email summary all logic
  await new Promise((resolve) => setTimeout(resolve, 2500));

  logger.info("Email summary all job completed");
  return NextResponse.json({ success: true });
}

async function handleCleanGmailJob(data: CleanGmailJobData) {
  logger.info("Processing clean Gmail job", {
    emailAccountId: data.emailAccountId,
    threadId: data.threadId,
    jobId: data.jobId,
  });

  // TODO: Implement actual clean Gmail logic
  await new Promise((resolve) => setTimeout(resolve, 2000));

  logger.info("Clean Gmail job completed");
  return NextResponse.json({ success: true });
}

// Configuration for distributed AI categorize senders queues
export const AI_CATEGORIZE_SENDERS_QUEUE_COUNT = 7;
const AI_CATEGORIZE_SENDERS_PREFIX = "ai-categorize-senders";

// Configuration for distributed AI clean queues
export const AI_CLEAN_QUEUE_COUNT = 7;
const AI_CLEAN_PREFIX = "ai-clean";

// Helper to get the queue index from an AI categorize senders queue name
export function getAiCategorizeSendersQueueIndex(
  queueName: string,
): number | null {
  if (!queueName.startsWith(`${AI_CATEGORIZE_SENDERS_PREFIX}-`)) return null;
  const index = Number.parseInt(queueName.split("-").pop() || "", 10);
  return Number.isNaN(index) ? null : index;
}

// Shared hashing function for queue distribution
// Uses character code sum to consistently hash emailAccountId to a queue index
// This ensures the same emailAccountId always maps to the same queue index
export function getQueueIndexFromEmailAccountId(
  emailAccountId: string,
  queueCount: number,
): number {
  const characterCodeSum = emailAccountId
    .split("")
    .reduce((total, character) => total + character.charCodeAt(0), 0);

  return characterCodeSum % queueCount;
}

// Helper to get the queue name for ai-clean jobs
// For BullMQ: Uses hash-based distribution across fixed queues (ai-clean-0 through ai-clean-6)
// For QStash: This function is not used; QStashManager.bulkEnqueue creates per-account queues (ai-clean-{emailAccountId})
export function getAiCleanQueueName({
  emailAccountId,
}: {
  emailAccountId: string;
}): string {
  // Only used for BullMQ (Redis) - hash-based distribution
  const targetQueueIndex = getQueueIndexFromEmailAccountId(
    emailAccountId,
    AI_CLEAN_QUEUE_COUNT,
  );

  return `${AI_CLEAN_PREFIX}-${targetQueueIndex}`;
}

// Helper to get the queue index from an AI clean queue name
export function getAiCleanQueueIndex(queueName: string): number | null {
  if (!queueName.startsWith(`${AI_CLEAN_PREFIX}-`)) return null;
  const index = Number.parseInt(queueName.split("-").pop() || "", 10);
  return Number.isNaN(index) ? null : index;
}

export const QUEUE_HANDLERS = {
  "digest-item-summarize": handleDigestJob,
  "scheduled-actions": handleScheduledActionJob,
  "ai-clean": handleAiCleanJob,
  "email-digest-all": handleEmailDigestAllJob,
  "email-summary-all": handleEmailSummaryAllJob,
  "clean-gmail": handleCleanGmailJob,
} as const;

export type QueueName = keyof typeof QUEUE_HANDLERS;
export function getQueueHandler(queueName: string) {
  if (queueName in QUEUE_HANDLERS) {
    return QUEUE_HANDLERS[queueName as QueueName];
  }

  if (queueName.startsWith(`${AI_CATEGORIZE_SENDERS_PREFIX}-`)) {
    return handleCategorizeSendersJob;
  }

  // Handle ai-clean queues
  // For BullMQ: hash-based distribution (ai-clean-0, ai-clean-1, etc.)
  // For QStash: per-account queues (ai-clean-{emailAccountId})
  if (queueName.startsWith(`${AI_CLEAN_PREFIX}-`)) {
    // For BullMQ: validate queue index (0-6)
    if (env.QUEUE_SYSTEM === "redis") {
      const queueIndex = getAiCleanQueueIndex(queueName);
      if (
        queueIndex !== null &&
        queueIndex >= 0 &&
        queueIndex < AI_CLEAN_QUEUE_COUNT
      ) {
        return handleAiCleanJob;
      }
    } else {
      // For QStash: accept any per-account queue (ai-clean-{emailAccountId})
      return handleAiCleanJob;
    }
  }

  return null;
}

export function isValidQueueName(queueName: string): boolean {
  if (queueName in QUEUE_HANDLERS) {
    return true;
  }

  // Accept any ai-categorize-senders-* queue (dynamic naming)
  if (queueName.startsWith(`${AI_CATEGORIZE_SENDERS_PREFIX}-`)) return true;

  // Allow ai-clean queues
  // Accept any ai-clean-* queue (dynamic naming)
  if (queueName.startsWith(`${AI_CLEAN_PREFIX}-`)) return true;

  return false;
}
