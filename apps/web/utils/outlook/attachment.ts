import type { OutlookClient } from "@/utils/outlook/client";

export async function getOutlookAttachment(
  client: OutlookClient,
  messageId: string,
  attachmentId: string,
) {
  const attachment = await client
    .getClient()
    .api(`/me/messages/${messageId}/attachments/${attachmentId}`)
    .get();

  return attachment;
}
