import prisma from "@/utils/prisma";
import type { DriveConnection } from "@/generated/prisma/client";
import type { EmailProvider } from "@/utils/email/types";
import type { ParsedMessage, Attachment } from "@/utils/types";
import type { EmailAccountWithAI } from "@/utils/llms/types";
import type { Logger } from "@/utils/logger";
import { createDriveProviderWithRefresh } from "@/utils/drive/provider";
import { createAndSaveFilingFolder } from "@/utils/drive/folder-utils";
import { extractTextFromDocument } from "@/utils/drive/document-extraction";
import { analyzeDocument } from "@/utils/ai/document-filing/analyze-document";
import { isDuplicateError } from "@/utils/prisma-helpers";
import {
  sendFiledNotification,
  sendAskNotification,
} from "@/utils/drive/filing-notifications";
import { sendFilingMessagingNotifications } from "@/utils/drive/filing-messaging-notifications";
import { extractEmailAddress } from "@/utils/email";
import { isCalendarInviteAttachment } from "@/utils/parse/calender-event";

// ============================================================================
// Types
// ============================================================================

export interface FilingResult {
  error?: string;
  filing?: {
    id: string;
    filename: string;
    folderPath: string;
    fileId: string | null;
    wasAsked: boolean;
    confidence: number | null;
    provider: string;
  };
  filingId?: string; // Available for both filed and skipped items (for feedback)
  skipped?: boolean;
  skipReason?: string;
  success: boolean;
}

export interface ProcessAttachmentOptions {
  attachment: Attachment;
  emailAccount: EmailAccountWithAI & {
    filingEnabled: boolean;
    filingPrompt: string | null;
    filingConfirmationSendEmail: boolean;
    email: string;
  };
  emailProvider: EmailProvider;
  logger: Logger;
  message: ParsedMessage;
  sendNotification?: boolean;
}

const DUPLICATE_FILING_FIELDS = ["emailAccountId", "messageId", "attachmentId"];
const PROCESSING_FILING_STALE_MS = 30 * 60 * 1000;

// ============================================================================
// Main Filing Engine
// ============================================================================

/**
 * Process a single attachment through the filing pipeline:
 * 1. Download attachment
 * 2. Extract text
 * 3. Fetch folders from all connected drives
 * 4. Analyze with AI
 * 5. Upload to drive
 * 6. Create DocumentFiling record
 */
export async function processAttachment({
  emailAccount,
  message,
  attachment,
  emailProvider,
  logger,
  sendNotification = true,
}: ProcessAttachmentOptions): Promise<FilingResult> {
  const log = logger.with({
    action: "processAttachment",
    messageId: message.id,
    filename: attachment.filename,
  });
  let claimedFilingId: string | null = null;

  try {
    // Validate filing is enabled with a prompt
    if (!emailAccount.filingEnabled || !emailAccount.filingPrompt) {
      log.info("Filing not enabled or no prompt configured");
      return { success: false, error: "Filing not enabled" };
    }

    const attachmentLookup = {
      emailAccountId: emailAccount.id,
      messageId: message.id,
      attachmentId: attachment.attachmentId,
    };

    const [existingFiling, driveConnections] = await Promise.all([
      findAttachmentFiling(attachmentLookup),
      prisma.driveConnection.findMany({
        where: {
          emailAccountId: emailAccount.id,
          isConnected: true,
        },
      }),
    ]);

    if (existingFiling && !isClaimableFiling(existingFiling)) {
      return getExistingFilingResult(existingFiling, log);
    }

    // ERROR and stale PROCESSING claim the row, so wait until drives are
    // available; otherwise an early "no drives" return would leave the row
    // stuck in PROCESSING.
    if (driveConnections.length === 0) {
      log.info("No connected drives");
      return { success: false, error: "No connected drives" };
    }

    const claim = await claimAttachmentFiling({
      existingFiling,
      attachmentLookup,
      attachment,
      driveConnectionId: driveConnections[0].id,
      logger: log,
    });
    if (claim.type === "return") return claim.result;
    claimedFilingId = claim.filingId;

    // Step 1: Download attachment
    log.info("Downloading attachment");
    const attachmentData = await emailProvider.getAttachment(
      message.id,
      attachment.attachmentId,
    );
    const buffer = Buffer.from(attachmentData.data, "base64");

    // Step 2: Extract text (optional - some file types like images can be filed by filename alone)
    log.info("Extracting text from document");
    const extraction = await extractTextFromDocument(
      buffer,
      attachment.mimeType,
      { logger: log },
    );

    if (!extraction) {
      log.info(
        "No text extraction available, will file based on filename and email metadata",
      );
    }

    // Step 3: Get saved filing folders (user-selected, not all folders)
    log.info("Fetching saved filing folders");
    const savedFolders = await prisma.filingFolder.findMany({
      where: { emailAccountId: emailAccount.id },
      include: { driveConnection: true },
    });

    const allFolders: FolderWithConnection[] = savedFolders.map((f) => ({
      id: f.folderId,
      name: f.folderName,
      path: f.folderPath,
      driveConnectionId: f.driveConnectionId,
      driveProvider: f.driveConnection.provider,
    }));

    if (allFolders.length === 0) {
      log.warn("No filing folders configured");
    }

    // Step 4: Analyze with AI
    log.info("Analyzing document with AI");
    const analysis = await analyzeDocument({
      emailAccount: {
        ...emailAccount,
        filingPrompt: emailAccount.filingPrompt,
      },
      email: {
        subject: message.headers.subject || message.subject,
        sender: message.headers.from,
      },
      attachment: {
        filename: attachment.filename,
        mimeType: attachment.mimeType,
        size: attachment.size,
        content: extraction?.text ?? "",
      },
      folders: allFolders,
    });

    log.info("AI analysis complete", {
      action: analysis.action,
      confidence: analysis.confidence,
      reasoning: analysis.reasoning,
    });

    // Step 5: Handle skip action
    if (analysis.action === "skip") {
      log.info("AI decided to skip this document");

      const skipFilingData = {
        messageId: message.id,
        attachmentId: attachment.attachmentId,
        filename: attachment.filename,
        folderPath: "",
        status: "PREVIEW" as const, // PREVIEW = AI decided to skip (not user rejection)
        reasoning: analysis.reasoning,
        confidence: analysis.confidence,
        driveConnectionId: driveConnections[0].id,
        emailAccountId: emailAccount.id,
      };
      const skipFiling = await prisma.documentFiling.update({
        where: { id: claimedFilingId },
        data: skipFilingData,
      });

      log.info("Skip record created", { filingId: skipFiling.id });

      return {
        success: false,
        skipped: true,
        skipReason: analysis.reasoning,
        filingId: skipFiling.id,
      };
    }

    // Step 6: Determine target folder and drive connection
    const { driveConnection, folderId, folderPath, needsToCreateFolder } =
      resolveFolderTarget(analysis, allFolders, driveConnections, log);

    // Step 6: Create folder if needed
    const driveProvider = await createDriveProviderWithRefresh(
      driveConnection,
      log,
    );
    let targetFolderId = folderId;
    let targetFolderPath = folderPath;

    if (needsToCreateFolder && folderPath) {
      log.info("Creating new folder", { path: folderPath });
      const newFolder = await createAndSaveFilingFolder({
        driveProvider,
        folderPath,
        emailAccountId: emailAccount.id,
        driveConnectionId: driveConnection.id,
        logger: log,
      });
      targetFolderId = newFolder.id;
      targetFolderPath = folderPath;
    }

    // Step 7: Determine if we should ask the user first
    const shouldAsk = analysis.confidence < 0.7;

    // Step 8: Upload file (unless low confidence - then we ask first)
    let fileId: string | null = null;
    if (!shouldAsk) {
      log.info("Uploading file to drive", {
        folderId: targetFolderId,
        folderPath: targetFolderPath,
      });
      const uploadedFile = await driveProvider.uploadFile({
        filename: attachment.filename,
        mimeType: attachment.mimeType,
        content: buffer,
        folderId: targetFolderId,
      });
      fileId = uploadedFile.id;
    }

    // Step 9: Create or replace DocumentFiling record
    const filingData = {
      messageId: message.id,
      attachmentId: attachment.attachmentId,
      filename: attachment.filename,
      folderId: targetFolderId,
      folderPath: targetFolderPath,
      fileId,
      reasoning: analysis.reasoning,
      confidence: analysis.confidence,
      status: shouldAsk ? ("PENDING" as const) : ("FILED" as const),
      wasAsked: shouldAsk,
      driveConnectionId: driveConnection.id,
      emailAccountId: emailAccount.id,
    };
    const filing = await prisma.documentFiling.update({
      where: { id: claimedFilingId },
      data: filingData,
    });

    log.info("Filing record created", {
      filingId: filing.id,
      status: filing.status,
      wasAsked: shouldAsk,
    });

    const shouldSendAskNotification = sendNotification && shouldAsk;
    const shouldSendFiledNotification =
      sendNotification &&
      !shouldAsk &&
      emailAccount.filingConfirmationSendEmail;

    // Step 10: Send notification email as a reply to the source email
    if (shouldSendAskNotification || shouldSendFiledNotification) {
      const sourceMessage = {
        threadId: message.threadId,
        headerMessageId: message.headers["message-id"] || "",
        references: message.headers.references,
        messageId: message.id,
      };

      try {
        if (shouldSendAskNotification) {
          await sendAskNotification({
            emailProvider,
            userEmail: emailAccount.email,
            filingId: filing.id,
            sourceMessage,
            logger: log,
          });
        } else {
          await sendFiledNotification({
            emailProvider,
            userEmail: emailAccount.email,
            filingId: filing.id,
            sourceMessage,
            logger: log,
          });
        }
      } catch (notificationError) {
        // Don't fail the filing if notification fails
        log.error("Failed to send notification", { error: notificationError });
      }
    }

    try {
      await sendFilingMessagingNotifications({
        emailAccountId: emailAccount.id,
        filingId: filing.id,
        senderEmail: extractEmailAddress(message.headers.from),
        logger: log,
      });
    } catch (messagingError) {
      log.error("Failed to send messaging notification", {
        error: messagingError,
      });
    }

    return {
      success: true,
      filing: {
        id: filing.id,
        filename: attachment.filename,
        folderPath: targetFolderPath,
        fileId,
        wasAsked: shouldAsk,
        confidence: analysis.confidence,
        provider: driveConnection.provider,
      },
    };
  } catch (error) {
    if (claimedFilingId) {
      try {
        await prisma.documentFiling.update({
          where: { id: claimedFilingId },
          data: {
            status: "ERROR",
            reasoning: error instanceof Error ? error.message : "Unknown error",
          },
        });
      } catch (cleanupError) {
        log.error("Failed to mark filing as errored", { error: cleanupError });
      }
    }

    log.error("Error processing attachment", { error });
    return {
      success: false,
      error: error instanceof Error ? error.message : "Unknown error",
    };
  }
}

/**
 * Get all filable attachments from a message.
 * All attachment types are supported - text-extractable files (PDF, DOCX, TXT)
 * get full content analysis, while other types (images, spreadsheets, etc.)
 * are filed based on filename and email metadata. Calendar invite artifacts are
 * excluded because they describe the email event rather than a user document.
 */
export function getFilableAttachments(message: ParsedMessage): Attachment[] {
  return (message.attachments || []).filter(
    (attachment) => !isCalendarInviteAttachment(attachment),
  );
}

// ============================================================================
// Helper Functions
// ============================================================================

interface FolderWithConnection {
  driveConnectionId: string;
  driveProvider: string;
  id: string;
  name: string;
  path: string;
}

interface FolderTarget {
  driveConnection: DriveConnection;
  folderId: string;
  folderPath: string;
  needsToCreateFolder: boolean;
}

type AttachmentFiling = NonNullable<
  Awaited<ReturnType<typeof findAttachmentFiling>>
>;

type ExistingFilingDecision =
  | { type: "retry"; filingId: string }
  | { type: "return"; result: FilingResult };

type AttachmentLookup = {
  emailAccountId: string;
  messageId: string;
  attachmentId: string;
};

function findAttachmentFiling({
  emailAccountId,
  messageId,
  attachmentId,
}: AttachmentLookup) {
  return prisma.documentFiling.findFirst({
    where: {
      emailAccountId,
      messageId,
      attachmentId,
    },
    select: {
      id: true,
      filename: true,
      folderPath: true,
      fileId: true,
      status: true,
      updatedAt: true,
      wasAsked: true,
      confidence: true,
      reasoning: true,
      driveConnection: {
        select: {
          provider: true,
        },
      },
    },
  });
}

async function claimAttachmentFiling({
  existingFiling,
  attachmentLookup,
  attachment,
  driveConnectionId,
  logger,
}: {
  existingFiling: AttachmentFiling | null;
  attachmentLookup: AttachmentLookup;
  attachment: Attachment;
  driveConnectionId: string;
  logger: Logger;
}): Promise<ExistingFilingDecision> {
  if (existingFiling) {
    return claimOrResolveExistingFiling(existingFiling, logger);
  }

  try {
    const processingFiling = await prisma.documentFiling.create({
      data: {
        ...attachmentLookup,
        filename: attachment.filename,
        folderPath: "",
        status: "PROCESSING",
        driveConnectionId,
      },
    });
    return { type: "retry", filingId: processingFiling.id };
  } catch (claimError) {
    if (!isDuplicateError(claimError, DUPLICATE_FILING_FIELDS)) {
      throw claimError;
    }

    const claimedFiling = await findAttachmentFiling(attachmentLookup);
    if (!claimedFiling) throw claimError;

    logger.info("Attachment was claimed by another filing process", {
      filingId: claimedFiling.id,
      status: claimedFiling.status,
    });

    return claimOrResolveExistingFiling(claimedFiling, logger);
  }
}

async function claimOrResolveExistingFiling(
  filing: AttachmentFiling,
  logger: Logger,
): Promise<ExistingFilingDecision> {
  logger.info("Attachment already has a filing record", {
    filingId: filing.id,
    status: filing.status,
  });

  if (filing.status === "ERROR") {
    const claim = await prisma.documentFiling.updateMany({
      where: {
        id: filing.id,
        status: "ERROR",
      },
      data: {
        status: "PROCESSING",
        reasoning: null,
        updatedAt: new Date(),
      },
    });

    if (claim.count === 1) {
      logger.info("Retrying attachment after previous filing error", {
        filingId: filing.id,
      });
      return { type: "retry", filingId: filing.id };
    }

    return alreadyProcessing(filing.id);
  }

  if (filing.status === "PREVIEW") {
    return { type: "return", result: getExistingFilingResult(filing) };
  }

  if (filing.status === "PROCESSING") {
    const staleCutoff = new Date(Date.now() - PROCESSING_FILING_STALE_MS);

    if (filing.updatedAt <= staleCutoff) {
      const claim = await prisma.documentFiling.updateMany({
        where: {
          id: filing.id,
          status: "PROCESSING",
          updatedAt: { lte: staleCutoff },
        },
        data: {
          reasoning: null,
          updatedAt: new Date(),
        },
      });

      if (claim.count === 1) {
        logger.info("Retrying stale attachment filing claim", {
          filingId: filing.id,
        });
        return { type: "retry", filingId: filing.id };
      }
    }

    return alreadyProcessing(filing.id);
  }

  return { type: "return", result: getExistingFilingResult(filing) };
}

function alreadyProcessing(filingId: string): ExistingFilingDecision {
  return {
    type: "return",
    result: {
      success: false,
      error: "Attachment is already being filed",
      filingId,
    },
  };
}

function isClaimableFiling(filing: AttachmentFiling) {
  return filing.status === "ERROR" || filing.status === "PROCESSING";
}

function getExistingFilingResult(
  filing: AttachmentFiling,
  logger?: Logger,
): FilingResult {
  logger?.info("Attachment already has a filing record", {
    filingId: filing.id,
    status: filing.status,
  });

  if (filing.status === "PREVIEW") {
    return {
      success: false,
      skipped: true,
      skipReason:
        filing.reasoning || "Document doesn't match filing preferences",
      filingId: filing.id,
    };
  }

  return {
    success: true,
    filing: {
      id: filing.id,
      filename: filing.filename,
      folderPath: filing.folderPath,
      fileId: filing.fileId,
      wasAsked: filing.wasAsked,
      confidence: filing.confidence,
      provider: filing.driveConnection.provider,
    },
    filingId: filing.id,
  };
}

function resolveFolderTarget(
  analysis: {
    action: string;
    folderId?: string | null;
    folderPath?: string | null;
  },
  folders: FolderWithConnection[],
  connections: DriveConnection[],
  logger: Logger,
): FolderTarget {
  if (analysis.action === "use_existing" && analysis.folderId) {
    // Find the folder in our list
    const folder = folders.find((f) => f.id === analysis.folderId);
    if (folder) {
      const connection = connections.find(
        (c) => c.id === folder.driveConnectionId,
      );
      if (connection) {
        return {
          driveConnection: connection,
          folderId: folder.id,
          folderPath: folder.path || folder.name,
          needsToCreateFolder: false,
        };
      }
    }
    // Folder not found (stale reference) - fall back to creating a new folder
    // Use the folder name from our records if available, otherwise use a default
    const staleFolderName =
      folders.find((f) => f.id === analysis.folderId)?.name ||
      "Inbox Zero Filed";
    logger.warn("Could not find folder from AI response, creating new folder", {
      folderId: analysis.folderId,
      fallbackPath: staleFolderName,
    });
    const connection = connections[0];
    return {
      driveConnection: connection,
      folderId: "root",
      folderPath: staleFolderName,
      needsToCreateFolder: true,
    };
  }

  // Creating new folder - use first connection
  const connection = connections[0];
  return {
    driveConnection: connection,
    folderId: "root",
    folderPath: analysis.folderPath || "Inbox Zero Filed",
    needsToCreateFolder: true,
  };
}
