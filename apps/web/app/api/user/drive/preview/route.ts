import { NextResponse } from "next/server";
import prisma from "@/utils/prisma";
import { withEmailProvider } from "@/utils/middleware";
import { SafeError } from "@/utils/error";
import { getExtractableAttachments } from "@/utils/drive/filing-engine";
import { extractTextFromDocument } from "@/utils/drive/document-extraction";
import { analyzeDocument } from "@/utils/ai/document-filing/analyze-document";
import type { ParsedMessage, Attachment } from "@/utils/types";
import type { EmailProvider } from "@/utils/email/types";
import type { Logger } from "@/utils/logger";

export type FilingPreviewPrediction = {
  filingId: string;
  filename: string;
  emailSubject: string;
  predictedFolder: string;
};

export type GetFilingPreviewResponse = Awaited<
  ReturnType<typeof getPreviewData>
>;

const MAX_MESSAGES_TO_FETCH = 20;
const MAX_PREDICTIONS = 3;

export const GET = withEmailProvider(async (request) => {
  const { emailAccountId } = request.auth;

  const result = await getPreviewData({
    emailAccountId,
    emailProvider: request.emailProvider,
    logger: request.logger,
  });

  return NextResponse.json(result);
});

async function getPreviewData({
  emailAccountId,
  emailProvider,
  logger,
}: {
  emailAccountId: string;
  emailProvider: EmailProvider;
  logger: Logger;
}) {
  const emailAccount = await prisma.emailAccount.findUnique({
    where: { id: emailAccountId },
    select: {
      id: true,
      userId: true,
      email: true,
      about: true,
      multiRuleSelectionEnabled: true,
      timezone: true,
      calendarBookingLink: true,
      filingPrompt: true,
      user: {
        select: {
          aiProvider: true,
          aiModel: true,
          aiApiKey: true,
        },
      },
      account: {
        select: {
          provider: true,
        },
      },
      filingFolders: {
        include: { driveConnection: true },
      },
      driveConnections: {
        where: { isConnected: true },
      },
    },
  });

  if (!emailAccount) {
    throw new SafeError("Email account not found");
  }

  if (!emailAccount.filingPrompt) {
    throw new SafeError(
      "Please describe how you organize files before previewing",
    );
  }

  if (emailAccount.filingFolders.length === 0) {
    throw new SafeError("Please select at least one folder before previewing");
  }

  if (emailAccount.driveConnections.length === 0) {
    throw new SafeError("No connected drives found");
  }

  logger.info("Fetching recent messages");
  const { messages } = await emailProvider.getMessagesWithPagination({
    maxResults: MAX_MESSAGES_TO_FETCH,
  });

  logger.info("Messages fetched", {
    count: messages.length,
    withAttachments: messages.filter((m) => m.attachments?.length).length,
    allAttachmentTypes: messages
      .flatMap((m) => m.attachments || [])
      .map((a) => ({ filename: a.filename, mimeType: a.mimeType }))
      .slice(0, 10),
  });

  const messagesWithAttachments = findMessagesWithExtractableAttachments(
    messages,
    MAX_PREDICTIONS,
  );

  logger.info("Extractable attachments found", {
    count: messagesWithAttachments.length,
    files: messagesWithAttachments
      .flatMap((m) => m.attachments)
      .map((a) => a.filename),
  });

  if (messagesWithAttachments.length === 0) {
    logger.info("No extractable attachments found - returning empty");
    return { predictions: [], noAttachmentsFound: true };
  }

  const folders = emailAccount.filingFolders.map((f) => ({
    id: f.folderId,
    name: f.folderName,
    path: f.folderPath,
    driveProvider: f.driveConnection.provider,
  }));

  const driveConnectionId = emailAccount.driveConnections[0].id;

  const predictions = await generatePredictions({
    messagesWithAttachments,
    emailAccount: { ...emailAccount, filingPrompt: emailAccount.filingPrompt },
    folders,
    emailProvider,
    emailAccountId,
    driveConnectionId,
    logger,
  });

  return {
    predictions,
    noAttachmentsFound: predictions.length === 0,
  };
}

function findMessagesWithExtractableAttachments(
  messages: ParsedMessage[],
  limit: number,
): Array<{ message: ParsedMessage; attachments: Attachment[] }> {
  const result: Array<{ message: ParsedMessage; attachments: Attachment[] }> =
    [];

  for (const message of messages) {
    const extractable = getExtractableAttachments(message);
    if (extractable.length > 0) {
      result.push({ message, attachments: extractable });
      if (result.length >= limit) break;
    }
  }

  return result;
}

async function generatePredictions({
  messagesWithAttachments,
  emailAccount,
  folders,
  emailProvider,
  emailAccountId,
  driveConnectionId,
  logger,
}: {
  messagesWithAttachments: Array<{
    message: ParsedMessage;
    attachments: Attachment[];
  }>;
  emailAccount: Parameters<typeof analyzeDocument>[0]["emailAccount"];
  folders: Array<{
    id: string;
    name: string;
    path: string;
    driveProvider: string;
  }>;
  emailProvider: EmailProvider;
  emailAccountId: string;
  driveConnectionId: string;
  logger: Logger;
}): Promise<FilingPreviewPrediction[]> {
  const predictions: FilingPreviewPrediction[] = [];

  for (const { message, attachments } of messagesWithAttachments) {
    const attachment = attachments[0];

    try {
      logger.info("Processing attachment for preview", {
        messageId: message.id,
        filename: attachment.filename,
      });

      const attachmentData = await emailProvider.getAttachment(
        message.id,
        attachment.attachmentId,
      );
      const buffer = Buffer.from(attachmentData.data, "base64");

      const extraction = await extractTextFromDocument(
        buffer,
        attachment.mimeType,
        { logger },
      );

      if (!extraction) {
        logger.warn("Could not extract text from attachment", {
          filename: attachment.filename,
        });
        continue;
      }

      const analysis = await analyzeDocument({
        emailAccount,
        email: {
          subject: message.headers.subject || message.subject,
          sender: message.headers.from,
        },
        attachment: {
          filename: attachment.filename,
          content: extraction.text,
        },
        folders,
      });

      let predictedFolder = analysis.folderPath || "Unknown";
      let folderId: string | null = null;

      if (analysis.action === "use_existing" && analysis.folderId) {
        const folder = folders.find((f) => f.id === analysis.folderId);
        if (folder) {
          predictedFolder = folder.path;
          folderId = folder.id;
        }
      }

      const filing = await prisma.documentFiling.create({
        data: {
          messageId: message.id,
          attachmentId: attachment.attachmentId,
          filename: attachment.filename,
          folderId,
          folderPath: predictedFolder,
          confidence: analysis.confidence,
          reasoning: analysis.reasoning,
          status: "PREVIEW",
          driveConnectionId,
          emailAccountId,
        },
      });

      predictions.push({
        filingId: filing.id,
        filename: attachment.filename,
        emailSubject: message.headers.subject || message.subject,
        predictedFolder,
      });

      logger.info("Preview prediction complete", {
        filingId: filing.id,
        filename: attachment.filename,
        predictedFolder,
        confidence: analysis.confidence,
      });
    } catch (attachmentError) {
      logger.error("Error processing attachment for preview", {
        messageId: message.id,
        filename: attachment.filename,
        error: attachmentError,
      });
    }
  }

  return predictions;
}
