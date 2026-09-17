import { ResponseType } from "@microsoft/microsoft-graph-client";
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

export async function getOutlookAttachmentStream(
  client: OutlookClient,
  messageId: string,
  attachmentId: string,
  signal?: AbortSignal,
): Promise<ReadableStream<Uint8Array>> {
  signal?.throwIfAborted();
  const response: Response = await client
    .getClient()
    .api(
      `/me/messages/${encodeURIComponent(messageId)}/attachments/${encodeURIComponent(attachmentId)}/$value`,
    )
    .options({ signal })
    .responseType(ResponseType.RAW)
    .get();
  if (!response.ok || !response.body || signal?.aborted) {
    await response.body?.cancel().catch(() => undefined);
    signal?.throwIfAborted();
    throw new Error("Unable to stream attachment");
  }
  return response.body.pipeThrough(
    new TransformStream<Uint8Array, Uint8Array>(),
    { signal },
  );
}
