import type { OutlookClient } from "@/utils/outlook/client";
import type { FileAttachment } from "@microsoft/microsoft-graph-types";

export async function getOutlookAttachment(
  client: OutlookClient,
  messageId: string,
  attachmentId: string,
) {
  const attachment: FileAttachment = await client
    .getClient()
    .api(`/me/messages/${messageId}/attachments/${attachmentId}`)
    .get();

  return attachment;
}
