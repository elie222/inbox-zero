import prisma from "@/utils/prisma";
import type { ParsedMessage } from "@/utils/types";
import type { EmailProvider } from "@/utils/email/types";
import type { Logger } from "@/utils/logger";
import { extractEmailAddress } from "@/utils/email";
import { emailToContent } from "@/utils/mail";
import { createDriveProviderWithRefresh } from "@/utils/drive/provider";
import { createAndSaveFilingFolder } from "@/utils/drive/folder-utils";
import { sendCorrectionConfirmation } from "@/utils/drive/filing-notifications";

// ============================================================================
// Types
// ============================================================================

interface ProcessFilingReplyArgs {
  emailAccountId: string;
  userEmail: string;
  message: ParsedMessage;
  emailProvider: EmailProvider;
  logger: Logger;
}

// ============================================================================
// Main Handler
// ============================================================================

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
  logger,
}: ProcessFilingReplyArgs): Promise<void> {
  logger = logger.with({
    action: "processFilingReply",
    messageId: message.id,
  });

  // Verify the message is from the user
  if (!verifyUserSentEmail({ message, userEmail })) {
    logger.error("Unauthorized filing reply attempt", {
      from: message.headers.from,
    });
    return;
  }

  // Get the In-Reply-To header to find which notification this is replying to
  const inReplyTo = message.headers["in-reply-to"];

  if (!inReplyTo) {
    logger.error("No In-Reply-To header found");
    return;
  }

  // The In-Reply-To header contains the Message-ID of the notification email
  // Look up the filing by notificationMessageId
  const filing = await prisma.documentFiling.findUnique({
    where: { notificationMessageId: inReplyTo },
    include: {
      driveConnection: true,
      emailAccount: true,
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
  logger.info("Processing filing reply");

  // Parse the reply content
  const replyContent = emailToContent(message, { extractReply: true }).trim();

  if (!replyContent) {
    logger.info("Empty reply, ignoring");
    return;
  }

  // Check for skip/reject
  if (isSkipCommand(replyContent)) {
    await handleSkip(filing.id, logger);
    return;
  }

  // Parse as folder path
  const folderPath = parseFolderPath(replyContent);

  if (!folderPath) {
    logger.info("Could not parse folder path from reply", { replyContent });
    // Could send a clarification email here
    return;
  }

  // Get or create the folder and move/upload the file
  try {
    const driveProvider = await createDriveProviderWithRefresh(
      filing.driveConnection,
      logger,
    );

    const targetFolder = await createAndSaveFilingFolder({
      driveProvider,
      folderPath,
      emailAccountId: filing.emailAccountId,
      driveConnectionId: filing.driveConnectionId,
      logger,
    });

    // If the file was already uploaded, we need to move it
    // For now, we'll just update the record (moving files requires additional API calls)
    // TODO: Implement file moving for corrections

    // Update the filing record
    await prisma.documentFiling.update({
      where: { id: filing.id },
      data: {
        folderId: targetFolder.id,
        folderPath: folderPath,
        status: "FILED",
        wasCorrected: filing.status === "FILED",
        originalPath: filing.wasCorrected
          ? filing.originalPath
          : filing.folderPath,
        correctedAt: new Date(),
      },
    });

    // If the file wasn't uploaded yet (was PENDING), upload it now
    if (filing.status === "PENDING" && !filing.fileId) {
      logger.info("Filing was pending, file upload would happen here");
      // TODO: Fetch attachment and upload to the specified folder
      // This requires storing the attachment content or re-fetching it
    }

    // Build source message info for threading the confirmation
    const sourceMessage = {
      threadId: message.threadId,
      headerMessageId: message.headers["message-id"] || "",
      references: message.headers.references,
    };

    // Send confirmation
    await sendCorrectionConfirmation({
      emailProvider,
      userEmail,
      filingId: filing.id,
      sourceMessage,
      newFolderPath: folderPath,
      logger,
    });

    logger.info("Filing reply processed successfully", { newPath: folderPath });
  } catch (error) {
    logger.error("Error processing filing reply", { error });

    await prisma.documentFiling.update({
      where: { id: filing.id },
      data: { status: "ERROR" },
    });
  }
}

// ============================================================================
// Helper Functions
// ============================================================================

function verifyUserSentEmail({
  message,
  userEmail,
}: {
  message: ParsedMessage;
  userEmail: string;
}): boolean {
  return (
    extractEmailAddress(message.headers.from).toLowerCase() ===
    userEmail.toLowerCase()
  );
}

function isSkipCommand(content: string): boolean {
  const normalized = content.toLowerCase().trim();
  return (
    normalized === "skip" ||
    normalized === "ignore" ||
    normalized === "no" ||
    normalized === "don't file" ||
    normalized === "dont file"
  );
}

function parseFolderPath(content: string): string | null {
  // Clean up the reply content
  const lines = content.split("\n");

  // Take the first non-empty line as the folder path
  for (const line of lines) {
    const trimmed = line.trim();
    if (trimmed && !trimmed.startsWith(">") && !trimmed.startsWith("On ")) {
      // Remove common prefixes
      const cleaned = trimmed
        .replace(/^(put it in|move to|file to|folder:?)\s*/i, "")
        .replace(/^["']|["']$/g, "")
        .trim();

      if (cleaned) {
        return cleaned;
      }
    }
  }

  return null;
}

async function handleSkip(filingId: string, logger: Logger): Promise<void> {
  await prisma.documentFiling.update({
    where: { id: filingId },
    data: { status: "REJECTED" },
  });
  logger.info("Filing skipped by user");
}
