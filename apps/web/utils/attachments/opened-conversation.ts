import type { ParsedMessage } from "@/utils/types";
import { fetchAttachment, getAttachmentUrl } from "./download";
import { getAttachmentImagePreview } from "./image-preview";
import { queueAttachmentDownload } from "./download-queue";

const FILE_LIMIT = 1024 * 1024;
const CONVERSATION_LIMIT = 3 * FILE_LIMIT;

export function createOpenedConversationAttachments(
  emailAccountId: string,
  _threadId: string,
  allowUncached = false,
) {
  let controller = new AbortController();
  let consumedBytes = 0;
  let epoch = 0;
  const pending = new Map<string, Promise<Blob | undefined>>();
  return {
    open() {
      if (controller.signal.aborted) controller = new AbortController();
    },
    close() {
      epoch++;
      controller.abort();
      pending.clear();
      consumedBytes = 0;
    },
    pause() {
      controller.abort();
      controller = new AbortController();
      pending.clear();
    },
    load(
      messageId: string,
      attachmentId: string,
      signal?: AbortSignal,
      attachment?: ParsedMessage["inline"][number],
    ) {
      const key = JSON.stringify([messageId, attachmentId]);
      let operation = pending.get(key);
      if (!operation) {
        const transferSignal = controller.signal;
        operation = load(messageId, attachmentId, attachment).then(
          async (blob) => {
            const preview = blob
              ? await getAttachmentImagePreview(blob)
              : undefined;
            transferSignal.throwIfAborted();
            return preview;
          },
        );
        pending.set(key, operation);
        operation
          .finally(() => {
            if (pending.get(key) === operation) pending.delete(key);
          })
          .catch(() => undefined);
      }
      return signal ? untilAborted(operation, signal) : operation;
    },
  };
  async function load(
    messageId: string,
    attachmentId: string,
    attachment?: ParsedMessage["inline"][number],
  ) {
    const startedEpoch = epoch;
    const transferSignal = controller.signal;
    transferSignal.throwIfAborted();
    if (!allowUncached || !attachment) return;
    const size = attachment.size;
    if (
      !size ||
      !Number.isSafeInteger(size) ||
      size < 0 ||
      size > FILE_LIMIT ||
      consumedBytes + size > CONVERSATION_LIMIT ||
      !eligible()
    )
      return;
    consumedBytes += size;
    let actualBytes = 0;
    try {
      const blob = await queueAttachmentDownload({
        priority: "speculative",
        signal: transferSignal,
        download: async (signal) => {
          if (!eligible()) return;
          return fetchAttachment({
            url: getAttachmentUrl({
              messageId,
              attachmentId,
              mimeType: attachment.mimeType,
              filename: attachment.filename,
            }),
            emailAccountId,
            maxBytes: size,
            signal,
            onProgress: (bytes) => {
              actualBytes = bytes;
            },
          });
        },
      });
      transferSignal.throwIfAborted();
      if (blob) actualBytes = blob.size;
      return blob;
    } finally {
      if (startedEpoch === epoch)
        consumedBytes -= size - Math.min(size, actualBytes);
    }
  }
}

function untilAborted<T>(operation: Promise<T>, signal: AbortSignal) {
  if (signal.aborted) return Promise.reject(signal.reason);
  return new Promise<T>((resolve, reject) => {
    const abort = () => reject(signal.reason);
    signal.addEventListener("abort", abort, { once: true });
    operation
      .then(resolve, reject)
      .finally(() => signal.removeEventListener("abort", abort));
  });
}

function eligible() {
  const connection = (
    navigator as Navigator & { connection?: { saveData?: boolean } }
  ).connection;
  return (
    navigator.onLine !== false &&
    document.visibilityState === "visible" &&
    !connection?.saveData
  );
}
