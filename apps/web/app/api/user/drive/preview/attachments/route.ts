import { NextResponse } from "next/server";
import prisma from "@/utils/prisma";
import { withEmailProvider } from "@/utils/middleware";
import { SafeError } from "@/utils/error";
import { getExtractableAttachments } from "@/utils/drive/filing-engine";
import { extractNameFromEmail, extractEmailAddress } from "@/utils/email";
import type { ParsedMessage } from "@/utils/types";
import type { EmailProvider } from "@/utils/email/types";
import type { Logger } from "@/utils/logger";

export type AttachmentPreviewItem = {
  messageId: string;
  attachmentId: string;
  filename: string;
  mimeType: string;
  size: number;
  senderEmail: string;
  senderName: string;
  subject: string;
};

export type GetAttachmentsPreviewResponse = Awaited<
  ReturnType<typeof getAttachmentsData>
>;

const MAX_MESSAGES_TO_FETCH = 20;
const MAX_ATTACHMENTS = 3;

export const GET = withEmailProvider(async (request) => {
  const { emailAccountId } = request.auth;

  const result = await getAttachmentsData({
    emailAccountId,
    emailProvider: request.emailProvider,
    logger: request.logger,
  });

  return NextResponse.json(result);
});

async function getAttachmentsData({
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
      filingPrompt: true,
      filingFolders: { select: { id: true } },
      driveConnections: {
        where: { isConnected: true },
        select: { id: true },
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

  logger.info("Fetching recent messages for attachments preview");
  const { messages } = await emailProvider.getMessagesWithAttachments({
    maxResults: MAX_MESSAGES_TO_FETCH,
  });

  const attachments = extractAttachmentPreviews(messages, MAX_ATTACHMENTS);

  logger.info("Attachments preview ready", { count: attachments.length });

  return {
    attachments,
    noAttachmentsFound: attachments.length === 0,
  };
}

function extractAttachmentPreviews(
  messages: ParsedMessage[],
  limit: number,
): AttachmentPreviewItem[] {
  const result: AttachmentPreviewItem[] = [];

  for (const message of messages) {
    const extractable = getExtractableAttachments(message);
    for (const attachment of extractable) {
      result.push({
        messageId: message.id,
        attachmentId: attachment.attachmentId,
        filename: attachment.filename,
        mimeType: attachment.mimeType,
        size: attachment.size,
        senderEmail: extractEmailAddress(message.headers.from),
        senderName: extractNameFromEmail(message.headers.from),
        subject: message.headers.subject || message.subject || "(No subject)",
      });
      if (result.length >= limit) return result;
    }
  }

  return result;
}
