import { fetchWithAccount } from "@/utils/fetch";

export function getAttachmentUrl({
  messageId,
  attachmentId,
  mimeType,
  filename,
}: {
  messageId: string;
  attachmentId: string;
  mimeType: string;
  filename: string;
}) {
  const searchParams = new URLSearchParams({
    messageId,
    attachmentId,
    mimeType,
    filename,
  });

  return `/api/messages/attachment?${searchParams.toString()}`;
}

export async function fetchAttachment({
  url,
  emailAccountId,
  signal,
  maxBytes,
  onProgress,
}: {
  url: string;
  emailAccountId: string;
  signal?: AbortSignal;
  maxBytes?: number;
  onProgress?: (receivedBytes: number) => void;
}): Promise<Blob> {
  if (!emailAccountId) {
    throw new Error("Email account ID is required");
  }

  if (
    maxBytes !== undefined &&
    (!Number.isSafeInteger(maxBytes) || maxBytes < 0)
  )
    throw new Error("Invalid attachment download size limit");
  signal?.throwIfAborted();
  const response = await fetchWithAccount({
    url,
    emailAccountId,
    ...(signal ? { init: { signal } } : {}),
  });

  if (!response.ok) {
    await response.body?.cancel().catch(() => undefined);
    throw new Error("Failed to download attachment");
  }

  if (maxBytes === undefined && !onProgress) return response.blob();

  const limit = maxBytes ?? Number.POSITIVE_INFINITY;
  const sizeError = () =>
    new Error("Attachment exceeds the download size limit");
  if (Number(response.headers.get("content-length")) > limit) {
    await response.body?.cancel().catch(() => undefined);
    throw sizeError();
  }
  const reader = response.body?.getReader();
  if (!reader) {
    signal?.throwIfAborted();
    onProgress?.(0);
    return new Blob([], { type: response.headers.get("content-type") ?? "" });
  }
  const cancel = () => {
    reader.cancel().catch(() => undefined);
  };
  signal?.addEventListener("abort", cancel, { once: true });
  const chunks: Uint8Array<ArrayBuffer>[] = [];
  let buffer: Uint8Array<ArrayBuffer> | undefined;
  let bufferedBytes = 0;
  let receivedBytes = 0;
  try {
    signal?.throwIfAborted();
    onProgress?.(0);
    while (true) {
      const { done, value } = await reader.read();
      signal?.throwIfAborted();
      if (done) break;
      if (value.byteLength > limit - receivedBytes) throw sizeError();
      // Coalesce tiny transport chunks so their object overhead stays bounded.
      let offset = 0;
      while (offset < value.byteLength) {
        buffer ??= new Uint8Array(Math.min(64 * 1024, limit));
        const length = Math.min(
          buffer.byteLength - bufferedBytes,
          value.byteLength - offset,
        );
        buffer.set(value.subarray(offset, offset + length), bufferedBytes);
        offset += length;
        bufferedBytes += length;
        if (bufferedBytes === buffer.byteLength) {
          chunks.push(buffer);
          buffer = undefined;
          bufferedBytes = 0;
        }
      }
      receivedBytes += value.byteLength;
      onProgress?.(receivedBytes);
    }
    if (buffer) chunks.push(buffer.subarray(0, bufferedBytes));
    return new Blob(chunks, {
      type: response.headers.get("content-type") ?? "",
    });
  } catch (error) {
    await reader.cancel().catch(() => undefined);
    throw error;
  } finally {
    signal?.removeEventListener("abort", cancel);
    reader.releaseLock();
  }
}
