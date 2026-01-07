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

  const inReplyTo = message.headers["in-reply-to"];

  if (!inReplyTo) {
    logger.error("No In-Reply-To header found");
    return;
  }

  const filing = await prisma.documentFiling.findUnique({
    where: { notificationMessageId: inReplyTo },
    include: {
      driveConnection: true,
    },
  });

  if (!filing) {
    logger.error("Filing not found for In-Reply-To message", { inReplyTo });
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
    await emailProvider.replyToEmail(message, parseResult.reply);
  }

  switch (parseResult.action) {
    case "approve":
      await handleApprove(filing.id);
      break;
    case "undo":
      await handleUndo(filing.id);
      break;
    case "move":
      await handleMove({
        filingId: filing.id,
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

async function handleUndo(filingId: string): Promise<void> {
  await prisma.documentFiling.update({
    where: { id: filingId },
    data: { status: "REJECTED" },
  });
  // TODO: Delete file from Drive when driveProvider.deleteFile is implemented
}

async function handleMove({
  filingId,
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
  filingStatus: string;
  filingFolderPath: string;
  filingWasCorrected: boolean;
  filingOriginalPath: string | null;
  driveConnection: DriveConnection;
  folderPath: string | undefined;
  emailAccountId: string;
  logger: Logger;
}): Promise<void> {
  if (!folderPath) {
    logger.warn("Move action but no folder path provided");
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
