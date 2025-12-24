import prisma from "@/utils/prisma";
import type { DriveConnection } from "@/generated/prisma/client";
import type { EmailProvider } from "@/utils/email/types";
import type { ParsedMessage, Attachment } from "@/utils/types";
import type { EmailAccountWithAI } from "@/utils/llms/types";
import type { Logger } from "@/utils/logger";
import { createDriveProviderWithRefresh } from "@/utils/drive/provider";
import { createFolderPath } from "@/utils/drive/folder-utils";
import {
  extractTextFromDocument,
  isExtractableMimeType,
} from "@/utils/drive/document-extraction";
import { analyzeDocument } from "@/utils/ai/document-filing/analyze-document";
import {
  sendFiledNotification,
  sendAskNotification,
} from "@/utils/drive/filing-notifications";

// ============================================================================
// Types
// ============================================================================

export interface FilingResult {
  success: boolean;
  filing?: {
    id: string;
    filename: string;
    folderPath: string;
    fileId: string | null;
    wasAsked: boolean;
    confidence: number | null;
    provider: string;
  };
  error?: string;
}

export interface ProcessAttachmentOptions {
  emailAccount: EmailAccountWithAI & {
    filingEnabled: boolean;
    filingPrompt: string | null;
    email: string;
  };
  message: ParsedMessage;
  attachment: Attachment;
  emailProvider: EmailProvider;
  logger: Logger;
  sendNotification?: boolean;
}

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

  try {
    // Validate filing is enabled with a prompt
    if (!emailAccount.filingEnabled || !emailAccount.filingPrompt) {
      log.info("Filing not enabled or no prompt configured");
      return { success: false, error: "Filing not enabled" };
    }

    // Get all connected drives
    const driveConnections = await prisma.driveConnection.findMany({
      where: {
        emailAccountId: emailAccount.id,
        isConnected: true,
      },
    });

    if (driveConnections.length === 0) {
      log.info("No connected drives");
      return { success: false, error: "No connected drives" };
    }

    // Step 1: Download attachment
    log.info("Downloading attachment");
    const attachmentData = await emailProvider.getAttachment(
      message.id,
      attachment.attachmentId,
    );
    const buffer = Buffer.from(attachmentData.data, "base64");

    // Step 2: Extract text
    log.info("Extracting text from document");
    const extraction = await extractTextFromDocument(
      buffer,
      attachment.mimeType,
      { logger: log },
    );

    if (!extraction) {
      log.warn("Could not extract text from document");
      return { success: false, error: "Could not extract text" };
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
        content: extraction.text,
      },
      folders: allFolders,
    });

    log.info("AI analysis complete", {
      action: analysis.action,
      confidence: analysis.confidence,
      reasoning: analysis.reasoning,
    });

    // Step 5: Determine target folder and drive connection
    const { driveConnection, folderId, folderPath, needsToCreateFolder } =
      resolveFolderTarget(analysis, allFolders, driveConnections, log);

    // Step 6: Create folder if needed
    const driveProvider = await createDriveProviderWithRefresh(
      driveConnection,
      log,
    );
    let targetFolderId = folderId;
    let targetFolderPath = folderPath;

    if (needsToCreateFolder && analysis.folderPath) {
      log.info("Creating new folder", { path: analysis.folderPath });
      const newFolder = await createFolderPath(
        driveProvider,
        analysis.folderPath,
        log,
      );
      targetFolderId = newFolder.id;
      targetFolderPath = analysis.folderPath;
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

    // Step 9: Create DocumentFiling record
    const filing = await prisma.documentFiling.create({
      data: {
        messageId: message.id,
        attachmentId: attachment.attachmentId,
        filename: attachment.filename,
        folderId: targetFolderId,
        folderPath: targetFolderPath,
        fileId,
        reasoning: analysis.reasoning,
        confidence: analysis.confidence,
        status: shouldAsk ? "PENDING" : "FILED",
        wasAsked: shouldAsk,
        driveConnectionId: driveConnection.id,
        emailAccountId: emailAccount.id,
      },
    });

    log.info("Filing record created", {
      filingId: filing.id,
      status: filing.status,
      wasAsked: shouldAsk,
    });

    // Step 10: Send notification email as a reply to the source email
    if (sendNotification) {
      const sourceMessage = {
        threadId: message.threadId,
        headerMessageId: message.headers["message-id"] || "",
        references: message.headers.references,
      };

      try {
        if (shouldAsk) {
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
    log.error("Error processing attachment", { error });
    return {
      success: false,
      error: error instanceof Error ? error.message : "Unknown error",
    };
  }
}

/**
 * Get all extractable attachments from a message.
 */
export function getExtractableAttachments(
  message: ParsedMessage,
): Attachment[] {
  return (message.attachments || []).filter((a) =>
    isExtractableMimeType(a.mimeType),
  );
}

// ============================================================================
// Helper Functions
// ============================================================================

interface FolderWithConnection {
  id: string;
  name: string;
  path: string;
  driveConnectionId: string;
  driveProvider: string;
}

interface FolderTarget {
  driveConnection: DriveConnection;
  folderId: string;
  folderPath: string;
  needsToCreateFolder: boolean;
}

function resolveFolderTarget(
  analysis: { action: string; folderId?: string; folderPath?: string },
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
    logger.warn("Could not find folder from AI response, using first drive", {
      folderId: analysis.folderId,
    });
  }

  // Creating new folder or fallback - use first connection
  const connection = connections[0];
  return {
    driveConnection: connection,
    folderId: "root",
    folderPath: analysis.folderPath || "Inbox Zero Filed",
    needsToCreateFolder: true,
  };
}
