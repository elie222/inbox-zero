import { NextResponse } from "next/server";
import prisma from "@/utils/prisma";
import { withEmailProvider } from "@/utils/middleware";
import { SafeError } from "@/utils/error";
import {
  getExtractableAttachments,
  processAttachment,
} from "@/utils/drive/filing-engine";
import type { ParsedMessage, Attachment } from "@/utils/types";
import type { EmailProvider } from "@/utils/email/types";
import type { Logger } from "@/utils/logger";
import type { DriveProviderType } from "@/utils/drive/types";

export type FilingPreviewResult = {
  filingId: string;
  filename: string;
  folderPath: string;
  fileId: string | null;
  filedAt: string;
  provider: DriveProviderType;
};

export type GetFilingPreviewResponse = Awaited<
  ReturnType<typeof getPreviewData>
>;

const MAX_MESSAGES_TO_FETCH = 20;
const MAX_FILINGS = 3;

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
      filingEnabled: true,
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
  const { messages } = await emailProvider.getMessagesWithAttachments({
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
    MAX_FILINGS,
  );

  logger.info("Extractable attachments found", {
    count: messagesWithAttachments.length,
    files: messagesWithAttachments
      .flatMap((m) => m.attachments)
      .map((a) => a.filename),
  });

  if (messagesWithAttachments.length === 0) {
    logger.info("No extractable attachments found - returning empty");
    return { filings: [], noAttachmentsFound: true };
  }

  const filings = await fileAttachments({
    messagesWithAttachments,
    emailAccount: {
      ...emailAccount,
      filingEnabled: true,
      filingPrompt: emailAccount.filingPrompt,
    },
    emailProvider,
    logger,
  });

  return {
    filings,
    noAttachmentsFound: filings.length === 0,
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

async function fileAttachments({
  messagesWithAttachments,
  emailAccount,
  emailProvider,
  logger,
}: {
  messagesWithAttachments: Array<{
    message: ParsedMessage;
    attachments: Attachment[];
  }>;
  emailAccount: Parameters<typeof processAttachment>[0]["emailAccount"];
  emailProvider: EmailProvider;
  logger: Logger;
}): Promise<FilingPreviewResult[]> {
  const filings: FilingPreviewResult[] = [];

  for (const { message, attachments } of messagesWithAttachments) {
    const attachment = attachments[0];

    try {
      logger.info("Filing attachment for preview", {
        messageId: message.id,
        filename: attachment.filename,
      });

      const result = await processAttachment({
        emailAccount,
        message,
        attachment,
        emailProvider,
        logger,
        sendNotification: false,
      });

      if (result.success && result.filing) {
        filings.push({
          filingId: result.filing.id,
          filename: result.filing.filename,
          folderPath: result.filing.folderPath,
          fileId: result.filing.fileId,
          filedAt: new Date().toISOString(),
          provider: result.filing.provider as DriveProviderType,
        });

        logger.info("Preview filing complete", { filingId: result.filing.id });
        logger.trace("Preview filing complete", {
          filename: result.filing.filename,
          folderPath: result.filing.folderPath,
        });
      } else {
        logger.warn("Failed to file attachment for preview", {
          error: result.error,
        });
      }
    } catch (attachmentError) {
      logger.error("Error filing attachment for preview", {
        messageId: message.id,
        error: attachmentError,
      });
    }
  }

  return filings;
}
