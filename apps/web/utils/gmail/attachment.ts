import type { gmail_v1 } from "googleapis";

export async function getGmailAttachment(
  gmail: gmail_v1.Gmail,
  messageId: string,
  attachmentId: string,
) {
  const attachment = await gmail.users.messages.attachments.get({
    userId: "me",
    id: attachmentId,
    messageId,
  });
  const attachmentData = attachment.data;
  return attachmentData;
}
