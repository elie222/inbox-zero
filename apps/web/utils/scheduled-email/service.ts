import { createHash } from "node:crypto";
import { mapWithConcurrency } from "@/utils/async";
import type { z } from "zod";
import type { ScheduledEmail } from "@/generated/prisma/client";
import prisma from "@/utils/prisma";
import { isDuplicateError } from "@/utils/prisma-helpers";
import { SafeError } from "@/utils/error";
import { scheduleEmailBody } from "@/utils/actions/scheduled-email.validation";
import { executeDurableEmailSend } from "@/utils/email/durable-email-send";
import { createEmailProvider } from "@/utils/email/provider";
import type { EmailProvider } from "@/utils/email/types";
import type { Logger } from "@/utils/logger";
import { isSameEmailAddress } from "@/utils/email";
import { getMessageTimestamp } from "@/utils/email/message-timestamp";

const LEASE_MS = 5 * 60 * 1000;

export async function scheduleEmail(
  emailAccountId: string,
  input: z.infer<typeof scheduleEmailBody>,
  now = new Date(),
) {
  const payloadHash = createHash("sha256")
    .update(JSON.stringify(input))
    .digest("hex");
  const existing = await prisma.scheduledEmail.findUnique({
    where: {
      emailAccountId_clientMutationId: {
        emailAccountId,
        clientMutationId: input.clientMutationId,
      },
    },
  });
  if (existing) {
    assertReusableRequest(existing, payloadHash);
    return existing;
  }
  const sendAt = input.sendAt ? new Date(input.sendAt) : now;
  const remindAt = input.remindAt ? new Date(input.remindAt) : null;
  if (input.sendAt && sendAt <= now)
    throw new SafeError("Choose a future send time.");
  if (remindAt && remindAt <= sendAt)
    throw new SafeError("The reminder must be after the send time.");
  if (
    input.email.replyToEmail &&
    input.email.replyToEmail.threadId !== input.threadId
  )
    throw new SafeError("The reply belongs to a different conversation.");
  try {
    return await prisma.scheduledEmail.create({
      data: {
        emailAccountId,
        clientMutationId: input.clientMutationId,
        payloadHash,
        payload: input,
        threadId: input.threadId,
        sendAt,
        remindAt,
        reminderStatus: remindAt ? "PENDING" : "NONE",
      },
    });
  } catch (error) {
    if (!isDuplicateError(error)) throw error;
    const duplicate = await prisma.scheduledEmail.findUniqueOrThrow({
      where: {
        emailAccountId_clientMutationId: {
          emailAccountId,
          clientMutationId: input.clientMutationId,
        },
      },
    });
    assertReusableRequest(duplicate, payloadHash);
    return duplicate;
  }
}

export async function cancelScheduledEmail(emailAccountId: string, id: string) {
  const result = await prisma.scheduledEmail.updateMany({
    where: {
      id,
      emailAccountId,
      status: { in: ["PENDING", "BLOCKED_AUTH", "FAILED"] },
    },
    data: { status: "CANCELLED", reminderStatus: "CANCELLED", error: null },
  });
  if (!result.count)
    throw new SafeError(
      "This email has started sending or is no longer scheduled.",
    );
}

export async function retryScheduledEmail(
  emailAccountId: string,
  id: string,
  now = new Date(),
) {
  const row = await prisma.scheduledEmail.findUnique({
    where: { id, emailAccountId },
  });
  if (!row || (row.status !== "FAILED" && row.status !== "BLOCKED_AUTH"))
    throw new SafeError("This email cannot be retried safely.");
  const operation = await prisma.emailSendOperation.findUnique({
    where: {
      emailAccountId_clientMutationId: {
        emailAccountId,
        clientMutationId: row.clientMutationId,
      },
    },
    select: { id: true },
  });
  if (operation)
    throw new SafeError(
      "This email cannot be retried safely. Check Sent before sending again.",
    );
  const result = await prisma.scheduledEmail.updateMany({
    where: { id, emailAccountId, updatedAt: row.updatedAt, status: row.status },
    data: {
      status: "PENDING",
      sendAt: now,
      executionQueuedAt: null,
      processingStartedAt: null,
      error: null,
    },
  });
  if (!result.count)
    throw new SafeError("This email cannot be retried safely.");
}

export async function processScheduledEmail(
  id: string,
  logger: Logger,
  now = new Date(),
) {
  const row = await prisma.scheduledEmail.findUnique({ where: { id } });
  if (!row || row.sendAt > now) return;
  const claim = await prisma.scheduledEmail.updateMany({
    where: {
      id,
      updatedAt: row.updatedAt,
      OR: [
        { status: "PENDING" },
        {
          status: "PROCESSING",
          processingStartedAt: { lte: new Date(now.getTime() - LEASE_MS) },
        },
      ],
    },
    data: {
      status: "PROCESSING",
      processingStartedAt: now,
      executionQueuedAt: row.executionQueuedAt ?? now,
    },
  });
  if (!claim.count) return;
  const claimedWhere = {
    id,
    status: "PROCESSING" as const,
    processingStartedAt: now,
  };
  try {
    const input = scheduleEmailBody.parse(row.payload);
    const account = await prisma.emailAccount.findUniqueOrThrow({
      where: { id: row.emailAccountId },
      include: { account: true },
    });
    const outcome = await executeDurableEmailSend({
      emailAccountId: row.emailAccountId,
      provider: account.account.provider,
      getEmailProvider: () =>
        createEmailProvider({
          emailAccountId: row.emailAccountId,
          provider: account.account.provider,
          logger,
        }),
      input: {
        mutationId: row.clientMutationId,
        threadId: row.threadId,
        messageIds: input.messageIds,
        email: input.email,
        queuedAt: (row.executionQueuedAt ?? now).getTime(),
      },
    });
    if (outcome.status === "applied" || outcome.status === "already_applied") {
      const sentOperation = await prisma.emailSendOperation.findUniqueOrThrow({
        where: {
          emailAccountId_clientMutationId: {
            emailAccountId: row.emailAccountId,
            clientMutationId: row.clientMutationId,
          },
        },
        select: { processingStartedAt: true },
      });
      await prisma.scheduledEmail.updateMany({
        where: claimedWhere,
        data: {
          status: "SENT",
          sentAt: sentOperation.processingStartedAt,
          error: null,
        },
      });
    } else if (outcome.status === "retry") {
      const operation = await prisma.emailSendOperation.findUnique({
        where: {
          emailAccountId_clientMutationId: {
            emailAccountId: row.emailAccountId,
            clientMutationId: row.clientMutationId,
          },
        },
        select: { id: true },
      });
      // A durable worker may still be sending. Only absent operations are known unsent.
      if (operation) return;
      await prisma.scheduledEmail.updateMany({
        where: claimedWhere,
        data: {
          status: "PENDING",
          sendAt: new Date(now.getTime() + 60_000),
          error: "Delivery delayed. Retrying shortly.",
        },
      });
    } else {
      await prisma.scheduledEmail.updateMany({
        where: claimedWhere,
        data: {
          status:
            outcome.status === "blocked_auth"
              ? "BLOCKED_AUTH"
              : outcome.status === "uncertain"
                ? "UNCERTAIN"
                : "FAILED",
          error:
            outcome.status === "blocked_auth"
              ? "Reconnect your email account to send this reply."
              : outcome.status === "uncertain"
                ? "This email may have sent. Check Sent before sending again."
                : outcome.error,
        },
      });
    }
  } catch (error) {
    // Keep the lease: the durable operation may have sent before a DB failure.
    // A later cron reconciles the same immutable operation, never a new send.
    logger.error("Scheduled email execution failed", {
      error,
      scheduledEmailId: id,
    });
  }
}

export function hasReplySince(
  messages: Awaited<ReturnType<EmailProvider["getThreadMessages"]>>,
  ownerEmail: string,
  sentAt: Date,
) {
  return messages.some(
    (message) =>
      !message.labelIds?.includes("DRAFT") &&
      !message.labelIds?.includes("SENT") &&
      !isSameEmailAddress(message.headers.from, ownerEmail) &&
      getMessageTimestamp({
        ...message,
        date: message.date || message.headers.date,
      }) > sentAt.getTime(),
  );
}

async function processReminder(row: ScheduledEmail, logger: Logger, now: Date) {
  if (!row.sentAt) return;
  const claim = await prisma.scheduledEmail.updateMany({
    where: {
      id: row.id,
      status: "SENT",
      OR: [
        { reminderStatus: "PENDING" },
        {
          reminderStatus: "PROCESSING",
          reminderStartedAt: { lte: new Date(now.getTime() - LEASE_MS) },
        },
      ],
    },
    data: { reminderStatus: "PROCESSING", reminderStartedAt: now },
  });
  if (!claim.count) return;
  const where = {
    id: row.id,
    reminderStatus: "PROCESSING" as const,
    reminderStartedAt: now,
  };
  try {
    const account = await prisma.emailAccount.findUniqueOrThrow({
      where: { id: row.emailAccountId },
      include: { account: true },
    });
    const provider = await createEmailProvider({
      emailAccountId: row.emailAccountId,
      provider: account.account.provider,
      logger,
    });
    const messages = await provider.getThreadMessages(row.threadId);
    if (!hasReplySince(messages, account.email, row.sentAt))
      await provider.unarchiveThread(row.threadId);
    await prisma.scheduledEmail.updateMany({
      where,
      data: { reminderStatus: "COMPLETED" },
    });
  } catch (error) {
    logger.error("Email reminder failed", { error, scheduledEmailId: row.id });
    // Retain the lease to avoid tight retries and recover on the next stale scan.
  }
}

export async function processDueScheduledEmails(
  logger: Logger,
  now = new Date(),
) {
  const stale = new Date(now.getTime() - LEASE_MS);
  const rows = await prisma.scheduledEmail.findMany({
    where: {
      OR: [
        { status: "PENDING", sendAt: { lte: now } },
        { status: "PROCESSING", processingStartedAt: { lte: stale } },
        { status: "SENT", remindAt: { lte: now }, reminderStatus: "PENDING" },
        {
          status: "SENT",
          remindAt: { lte: now },
          reminderStatus: "PROCESSING",
          reminderStartedAt: { lte: stale },
        },
      ],
    },
    orderBy: { sendAt: "asc" },
    take: 100,
  });
  await mapWithConcurrency(rows, 5, async (row) => {
    const scopedLogger = logger.with({
      emailAccountId: row.emailAccountId,
      scheduledEmailId: row.id,
    });
    try {
      if (row.status === "SENT") await processReminder(row, scopedLogger, now);
      else await processScheduledEmail(row.id, scopedLogger, now);
    } catch (error) {
      scopedLogger.error("Failed to process scheduled email", { error });
    }
  });
  return { processed: rows.length };
}

function assertReusableRequest(
  row: Pick<ScheduledEmail, "payloadHash" | "status">,
  payloadHash: string,
) {
  if (row.payloadHash !== payloadHash)
    throw new SafeError(
      "This send request was already used for a different email.",
    );
  if (row.status === "CANCELLED")
    throw new SafeError(
      "This scheduled reply was cancelled. Start a new reply to send this message.",
    );
}
