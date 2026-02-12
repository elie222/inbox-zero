import prisma from "@/utils/prisma";
import type { ParsedMessage } from "@/utils/types";
import type { EmailProvider } from "@/utils/email/types";
import type { Logger } from "@/utils/logger";
import type { EmailAccountWithAI } from "@/utils/llms/types";
import type { DriveConnection } from "@/generated/prisma/client";
import { extractEmailAddress } from "@/utils/email";
import { emailToContent } from "@/utils/mail";
import { createDriveProviderWithRefresh } from "@/utils/drive/provider";
import { createAndSaveFilingFolder } from "@/utils/drive/folder-utils";
import { aiParseFilingReply } from "@/utils/ai/document-filing/parse-filing-reply";
import {
  getFilebotFrom,
  getFilebotReplyTo,
} from "@/utils/filebot/is-filebot-email";

interface ProcessFilingReplyArgs {
  emailAccountId: string;
  userEmail: string;
  message: ParsedMessage;
  emailProvider: EmailProvider;
  emailAccount: EmailAccountWithAI;
  logger: Logger;
}

/**
 * Process a reply to a filebot notification email.
 * Uses the In-Reply-To header to find which notification was replied to,
 * then looks up the filing by notificationMessageId.
 */
export async function processFilingReply({
  emailAccountId,
  userEmail,
  message,
  emailProvider,
  emailAccount,
  logger,
}: ProcessFilingReplyArgs): Promise<void> {
  logger = logger.with({
    action: "processFilingReply",
    messageId: message.id,
  });

  if (!verifyUserSentEmail({ message, userEmail })) {
    logger.error("Unauthorized filing reply attempt", {
      from: message.headers.from,
    });
    return;
  }

  const filing = await findFilingFromThread({
    message,
    emailProvider,
    emailAccountId,
  });

  if (!filing) {
    logger.error("Filing not found for thread", {
      threadId: message.threadId,
    });
    return;
  }

  if (filing.emailAccountId !== emailAccountId) {
    logger.error("Filing does not belong to this email account");
    return;
  }

  logger = logger.with({ filingId: filing.id });

  const replyContent = emailToContent(message, { extractReply: true }).trim();

  if (!replyContent) {
    return;
  }

  const messages: { role: "user" | "assistant"; content: string }[] = [
    { role: "user", content: replyContent },
  ];

  const parseResult = await aiParseFilingReply({
    messages,
    filingContext: {
      filename: filing.filename,
      currentFolder: filing.folderPath || "root",
    },
    emailAccount,
  });

  if (parseResult.reply) {
    const filebotReplyTo = getFilebotReplyTo({ userEmail });
    const filebotFrom = getFilebotFrom({ userEmail });
    await emailProvider.replyToEmail(message, parseResult.reply, {
      replyTo: filebotReplyTo,
      from: filebotFrom,
    });
  }

  switch (parseResult.action) {
    case "approve":
      await handleApprove(filing.id);
      break;
    case "undo":
      await handleUndo({
        filingId: filing.id,
        fileId: filing.fileId,
        driveConnection: filing.driveConnection,
        logger,
      });
      break;
    case "move":
      await handleMove({
        filingId: filing.id,
        fileId: filing.fileId,
        filingStatus: filing.status,
        filingFolderPath: filing.folderPath,
        filingWasCorrected: filing.wasCorrected,
        filingOriginalPath: filing.originalPath,
        driveConnection: filing.driveConnection,
        folderPath: parseResult.folderPath,
        emailAccountId,
        logger,
      });
      break;
    case "none":
      break;
  }
}

function verifyUserSentEmail({
  message,
  userEmail,
}: {
  message: ParsedMessage;
  userEmail: string;
}): boolean {
  const fromEmail = extractEmailAddress(message.headers.from)?.toLowerCase();
  return fromEmail === userEmail.toLowerCase();
}

async function handleApprove(filingId: string): Promise<void> {
  await prisma.documentFiling.update({
    where: { id: filingId },
    data: {
      feedbackPositive: true,
      feedbackAt: new Date(),
    },
  });
}

const TO_DELETE_FOLDER = "Inbox Zero - To Delete";

async function handleUndo({
  filingId,
  fileId,
  driveConnection,
  logger,
}: {
  filingId: string;
  fileId: string | null;
  driveConnection: DriveConnection;
  logger: Logger;
}): Promise<void> {
  // Move file to "To Delete" folder so user can easily find and delete
  if (fileId) {
    try {
      const driveProvider = await createDriveProviderWithRefresh(
        driveConnection,
        logger,
      );

      // Get or create the "To Delete" folder at root
      const folders = await driveProvider.listFolders();
      let toDeleteFolder = folders.find((f) => f.name === TO_DELETE_FOLDER);

      if (!toDeleteFolder) {
        toDeleteFolder = await driveProvider.createFolder(TO_DELETE_FOLDER);
      }

      await driveProvider.moveFile(fileId, toDeleteFolder.id);
    } catch (error) {
      logger.error("Failed to move file to To Delete folder", { error });
    }
  }

  await prisma.documentFiling.update({
    where: { id: filingId },
    data: { status: "REJECTED" },
  });
}

async function handleMove({
  filingId,
  fileId,
  filingStatus,
  filingFolderPath,
  filingWasCorrected,
  filingOriginalPath,
  driveConnection,
  folderPath,
  emailAccountId,
  logger,
}: {
  filingId: string;
  fileId: string | null;
  filingStatus: string;
  filingFolderPath: string;
  filingWasCorrected: boolean;
  filingOriginalPath: string | null;
  driveConnection: DriveConnection;
  folderPath: string | null;
  emailAccountId: string;
  logger: Logger;
}): Promise<void> {
  if (!folderPath) {
    logger.warn("Move action but no folder path provided");
    return;
  }

  if (!fileId) {
    logger.warn("Move action but no file ID available");
    return;
  }

  try {
    const driveProvider = await createDriveProviderWithRefresh(
      driveConnection,
      logger,
    );

    const targetFolder = await createAndSaveFilingFolder({
      driveProvider,
      folderPath,
      emailAccountId,
      driveConnectionId: driveConnection.id,
      logger,
    });

    await driveProvider.moveFile(fileId, targetFolder.id);

    await prisma.documentFiling.update({
      where: { id: filingId },
      data: {
        folderId: targetFolder.id,
        folderPath,
        status: "FILED",
        wasCorrected: filingStatus === "FILED",
        originalPath: filingWasCorrected
          ? filingOriginalPath
          : filingFolderPath,
        correctedAt: new Date(),
      },
    });
  } catch (error) {
    logger.error("Error moving file", { error });
    await prisma.documentFiling.update({
      where: { id: filingId },
      data: { status: "ERROR" },
    });
  }
}

/**
 * Find the filing by walking the thread to find a message whose
 * notificationMessageId matches one of the thread's message IDs.
 */
async function findFilingFromThread({
  message,
  emailProvider,
  emailAccountId,
}: {
  message: ParsedMessage;
  emailProvider: EmailProvider;
  emailAccountId: string;
}) {
  const threadMessages = await emailProvider.getThreadMessages(
    message.threadId,
  );
  if (!threadMessages?.length) return null;

  const messageIds = threadMessages.map((m) => m.id);

  return prisma.documentFiling.findFirst({
    where: {
      emailAccountId,
      notificationMessageId: { in: messageIds },
    },
    include: { driveConnection: true },
  });
}
