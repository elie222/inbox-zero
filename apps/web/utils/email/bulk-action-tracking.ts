import { publishArchive, publishDelete } from "@inboxzero/tinybird";
import { createScopedLogger } from "@/utils/logger";
import prisma from "@/utils/prisma";

const logger = createScopedLogger("bulk-action-tracking");

export async function publishBulkActionToTinybird(options: {
  threadIds: string[];
  action: "archive" | "trash";
  ownerEmail: string;
}): Promise<void> {
  const { threadIds, action, ownerEmail } = options;
  const timestamp = Date.now();
  const publishFn = action === "archive" ? publishArchive : publishDelete;

  const BATCH_SIZE = 100;
  for (let i = 0; i < threadIds.length; i += BATCH_SIZE) {
    const batch = threadIds.slice(i, i + BATCH_SIZE);

    await Promise.allSettled(
      batch.map((threadId) =>
        publishFn({
          ownerEmail,
          threadId,
          actionSource: "user",
          timestamp,
        }),
      ),
    ).then((results) => {
      const failures = results.filter((r) => r.status === "rejected");
      if (failures.length > 0) {
        logger.error("Failed to publish some events to Tinybird", {
          failureCount: failures.length,
          totalCount: batch.length,
        });
      }
    });
  }
}

export async function updateEmailMessagesForSender(options: {
  sender: string;
  messageIds: string[];
  emailAccountId: string;
  action: "archive" | "trash";
}): Promise<void> {
  const { sender, messageIds, emailAccountId, action } = options;

  try {
    if (action === "trash") {
      const result = await prisma.emailMessage.deleteMany({
        where: {
          emailAccountId,
          from: sender,
          messageId: { in: messageIds },
        },
      });

      logger.info("Deleted EmailMessage records", {
        sender,
        emailAccountId,
        action,
        deletedCount: result.count,
        messageIdsCount: messageIds.length,
      });
    } else {
      const result = await prisma.emailMessage.updateMany({
        where: {
          emailAccountId,
          from: sender,
          messageId: { in: messageIds },
        },
        data: {
          inbox: false,
        },
      });

      logger.info("Updated EmailMessage records", {
        sender,
        emailAccountId,
        action,
        updatedCount: result.count,
        messageIdsCount: messageIds.length,
      });
    }
  } catch (error) {
    logger.error("Failed to update/delete EmailMessage records", {
      sender,
      emailAccountId,
      action,
      error,
    });
    // Don't throw - this is analytics, shouldn't break the main flow
  }
}
