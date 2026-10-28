import type { ProcessAttachmentOptions } from "@/utils/drive/filing-engine";
import { processAttachment } from "@/utils/drive/filing-engine";
import { sendFilingNotifications } from "@/utils/drive/filing-notifications";
import type { Attachment } from "@/utils/types";

export async function processAttachmentsForFiling({
  attachments,
  emailAccount,
  emailProvider,
  logger,
  message,
}: Omit<ProcessAttachmentOptions, "attachment" | "sendNotification"> & {
  attachments: Attachment[];
}): Promise<void> {
  const filingIds: string[] = [];

  for (const attachment of attachments) {
    const result = await processAttachment({
      attachment,
      emailAccount,
      emailProvider,
      logger,
      message,
      sendNotification: false,
    }).catch((error) => {
      logger.error("Failed to process attachment", {
        filename: attachment.filename,
        error,
      });
      return null;
    });

    if (
      result?.filing &&
      (result.filing.wasAsked || emailAccount.filingConfirmationSendEmail)
    ) {
      filingIds.push(result.filing.id);
    }
  }

  if (filingIds.length === 0) return;

  try {
    await sendFilingNotifications({
      emailProvider,
      userEmail: emailAccount.email,
      filingIds,
      sourceMessage: {
        threadId: message.threadId,
        headerMessageId: message.headers["message-id"] || "",
        references: message.headers.references,
        messageId: message.id,
      },
      logger,
    });
  } catch (error) {
    logger.error("Failed to send filing notifications", { error });
  }
}
