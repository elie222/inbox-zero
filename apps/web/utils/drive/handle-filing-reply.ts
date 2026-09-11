import prisma from "@/utils/prisma";
import type { ParsedMessage } from "@/utils/types";
import type { EmailProvider } from "@/utils/email/types";
import type { Logger } from "@/utils/logger";
import type { EmailAccountWithAI } from "@/utils/llms/types";
import type { DriveConnection } from "@/generated/prisma/client";
import { extractEmailAddress } from "@/utils/email";
import { createDriveProviderWithRefresh } from "@/utils/drive/provider";
import { createAndSaveFilingFolder } from "@/utils/drive/folder-utils";
import {
  aiParseFilingReply,
  type ParseFilingReplyResult,
} from "@/utils/ai/document-filing/parse-filing-reply";
import {
  getFilebotFrom,
  getFilebotReplyTo,
} from "@/utils/filebot/is-filebot-email";
import { emailToContentForAI } from "@/utils/ai/content-sanitizer";

interface ProcessFilingReplyArgs {
  emailAccount: EmailAccountWithAI;
  emailAccountId: string;
  emailProvider: EmailProvider;
  logger: Logger;
  message: ParsedMessage;
  userEmail: string;
}

const FILING_ACTION_FAILURE_REPLY =
  "I couldn't complete one or more requested filing changes. Please try again.";

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

  if (!verifyUserSentEmail({ message, userEmail, provider: emailProvider })) {
    logger.error("Unauthorized filing reply attempt", {
      from: message.headers.from,
    });
    return;
  }

  const filings = await findFilingsFromThread({
    message,
    emailProvider,
    emailAccountId,
  });

  if (filings.length === 0) {
    logger.error("Filings not found for thread", {
      threadId: message.threadId,
    });
    return;
  }

  const replyContent = emailToContentForAI(message, {
    extractReply: true,
  }).trim();

  if (!replyContent) {
    return;
  }

  const messages: { role: "user" | "assistant"; content: string }[] = [
    { role: "user", content: replyContent },
  ];

  const parseResult = await aiParseFilingReply({
    messages,
    filingContexts: filings.map((filing) => ({
      id: filing.id,
      filename: filing.filename,
      currentFolder: filing.folderPath || "root",
    })),
    emailAccount,
  });

  const filingsById = new Map(filings.map((filing) => [filing.id, filing]));
  const processedFilingIds = new Set<string>();
  let hadActionFailure = false;

  for (const action of parseResult.actions) {
    const filing = filingsById.get(action.filingId);
    if (!filing) {
      logger.warn("Ignoring invalid filing reply action", {
        filingId: action.filingId,
      });
      hadActionFailure = true;
      continue;
    }

    if (processedFilingIds.has(filing.id)) {
      logger.warn("Ignoring duplicate filing reply action", {
        filingId: action.filingId,
      });
      continue;
    }

    processedFilingIds.add(filing.id);
    const filingLogger = logger.with({ filingId: filing.id });

    try {
      const actionSucceeded = await applyFilingReplyAction({
        action,
        emailAccountId,
        filing,
        logger: filingLogger,
      });
      hadActionFailure ||= !actionSucceeded;
    } catch (error) {
      filingLogger.error("Failed to apply filing reply action", { error });
      hadActionFailure = true;
    }
  }

  const reply = hadActionFailure
    ? FILING_ACTION_FAILURE_REPLY
    : parseResult.reply;
  if (reply) {
    const filebotReplyTo = getFilebotReplyTo({ userEmail });
    const filebotFrom = getFilebotFrom({ userEmail });
    await emailProvider.replyToEmail(message, reply, {
      replyTo: filebotReplyTo,
      from: filebotFrom,
    });
  }
}

function verifyUserSentEmail({
  message,
  userEmail,
  provider,
}: {
  message: ParsedMessage;
  userEmail: string;
  provider: EmailProvider;
}): boolean {
  const fromMatch =
    extractEmailAddress(message.headers.from)?.toLowerCase() ===
    userEmail.toLowerCase();

  // Check the SENT label to prevent spoofed From: header attacks
  const hasSentLabel = provider.isSentMessage(message);

  return fromMatch && hasSentLabel;
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
}): Promise<boolean> {
  let fileMoved = true;

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
      fileMoved = false;
    }
  }

  await prisma.documentFiling.update({
    where: { id: filingId },
    data: { status: "REJECTED" },
  });

  return fileMoved;
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
}): Promise<boolean> {
  if (!folderPath) {
    logger.warn("Move action but no folder path provided");
    return false;
  }

  if (!fileId) {
    logger.warn("Move action but no file ID available");
    return false;
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
    return true;
  } catch (error) {
    logger.error("Error moving file", { error });
    await prisma.documentFiling.update({
      where: { id: filingId },
      data: { status: "ERROR" },
    });
    return false;
  }
}

async function findFilingsFromThread({
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
  if (!threadMessages?.length) return [];

  const anchor = await findNotificationAnchor({
    emailAccountId,
    message,
    threadMessages,
  });
  if (!anchor) return [];

  return prisma.documentFiling.findMany({
    where: {
      ...(anchor.notificationBatchId
        ? { emailAccountId, notificationBatchId: anchor.notificationBatchId }
        : { id: anchor.id }),
    },
    include: { driveConnection: true },
    orderBy: { createdAt: "asc" },
  });
}

async function findNotificationAnchor({
  emailAccountId,
  message,
  threadMessages,
}: {
  emailAccountId: string;
  message: ParsedMessage;
  threadMessages: ParsedMessage[];
}) {
  const repliedToMessage = threadMessages.find(
    (threadMessage) =>
      threadMessage.headers["message-id"]?.trim() ===
      message.headers["in-reply-to"]?.trim(),
  );

  let anchor = repliedToMessage
    ? await prisma.documentFiling.findFirst({
        where: {
          emailAccountId,
          notificationMessageId: repliedToMessage.id,
        },
      })
    : null;

  if (!anchor && repliedToMessage?.headers["in-reply-to"]) {
    const sourceMessage = threadMessages.find(
      (threadMessage) =>
        threadMessage.headers["message-id"]?.trim() ===
        repliedToMessage.headers["in-reply-to"]?.trim(),
    );

    if (sourceMessage) {
      anchor = await prisma.documentFiling.findFirst({
        where: {
          emailAccountId,
          messageId: sourceMessage.id,
        },
        orderBy: { createdAt: "desc" },
      });
    }
  }

  if (anchor) return anchor;

  return prisma.documentFiling.findFirst({
    where: {
      emailAccountId,
      messageId: {
        in: threadMessages.map((threadMessage) => threadMessage.id),
      },
    },
    orderBy: { createdAt: "desc" },
  });
}

async function applyFilingReplyAction({
  action,
  emailAccountId,
  filing,
  logger,
}: {
  action: ParseFilingReplyResult["actions"][number];
  emailAccountId: string;
  filing: Awaited<ReturnType<typeof findFilingsFromThread>>[number];
  logger: Logger;
}): Promise<boolean> {
  switch (action.action) {
    case "approve":
      await handleApprove(filing.id);
      return true;
    case "undo":
      return handleUndo({
        filingId: filing.id,
        fileId: filing.fileId,
        driveConnection: filing.driveConnection,
        logger,
      });
    case "move":
      return handleMove({
        filingId: filing.id,
        fileId: filing.fileId,
        filingStatus: filing.status,
        filingFolderPath: filing.folderPath,
        filingWasCorrected: filing.wasCorrected,
        filingOriginalPath: filing.originalPath,
        driveConnection: filing.driveConnection,
        folderPath: action.folderPath,
        emailAccountId,
        logger,
      });
  }
}
