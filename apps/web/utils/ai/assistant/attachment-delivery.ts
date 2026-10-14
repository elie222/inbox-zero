import { tool } from "ai";
import { z } from "zod";
import type { EmailProvider } from "@/utils/email/types";
import { createEmailProvider } from "@/utils/email/provider";
import type { Logger } from "@/utils/logger";
import { SafeError } from "@/utils/error";

export const MAX_DELIVERY_ATTACHMENT_BYTES = 20 * 1024 * 1024;

export async function getDeliveryAttachment(
  provider: EmailProvider,
  messageId: string,
  attachmentId: string,
) {
  const message = await provider.getMessage(messageId);
  const attachment = message.attachments?.find(
    (item) => item.attachmentId === attachmentId,
  );
  if (!attachment)
    throw new SafeError("Attachment not found in this message", 404);
  if (attachment.size > MAX_DELIVERY_ATTACHMENT_BYTES)
    throw new SafeError("Attachment exceeds the 20 MB delivery limit", 413);
  return {
    messageId: message.id,
    attachmentId,
    filename: attachment.filename || "attachment",
    mimeType: attachment.mimeType || "application/octet-stream",
    size: attachment.size,
  };
}

export function deliverAttachmentTool(options: {
  emailAccountId: string;
  provider: string;
  logger: Logger;
}) {
  return tool({
    description:
      "Prepare an existing email attachment for delivery to the current user's private messaging conversation. Use only when the user asks to receive the actual file. First searchInbox and readEmail, then use the attachment IDs from that message; ask if the intended file is ambiguous. Supports PDFs, images, and other original files up to 20 MB. The service fixes the recipient; you cannot choose one. Returns a verified file reference for the messaging service to deliver after this response, not a delivery receipt. Do not claim the file has already been sent. Use readAttachment instead when the user only wants its contents summarized.",
    inputSchema: z.object({
      messageId: z.string().trim().min(1).describe("Message ID from readEmail"),
      attachmentId: z
        .string()
        .trim()
        .min(1)
        .describe("Attachment ID in that readEmail result"),
    }),
    execute: async ({ messageId, attachmentId }) => {
      try {
        const provider = await createEmailProvider(options);
        return {
          attachmentDelivery: await getDeliveryAttachment(
            provider,
            messageId,
            attachmentId,
          ),
        };
      } catch (error) {
        options.logger.warn("Unable to prepare attachment delivery", { error });
        return { error: "Unable to prepare this attachment for delivery" };
      }
    },
  });
}
