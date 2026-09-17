import type { ParsedMessage } from "@/utils/types";
import {
  captureEmailCacheEpoch,
  isEmailCacheEpochCurrent,
} from "@/utils/email-cache/database";
import { fetchAttachment, getAttachmentUrl } from "./download";
import { queueAttachmentDownload } from "./download-queue";
import { downloadLocalMailAttachment } from "@/utils/email-cache/local-mail-attachment-download";
import {
  getLocalMailAttachmentReference,
  readLocalMailAttachment,
} from "@/utils/email-cache/local-mail-attachments";

const FILE_LIMIT = 1024 * 1024;
const CONVERSATION_LIMIT = 3 * FILE_LIMIT;

export function createOpenedConversationAttachments(
  emailAccountId: string,
  threadId: string,
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
      // Consumers are replaced while bytes are still arriving: the reader
      // re-renders a preview whenever the cached conversation changes under
      // it. The session owns the transfer, so a newcomer joins the one in
      // flight instead of cancelling it and paying for the download again.
      let operation = pending.get(key);
      if (!operation) {
        operation = load(messageId, attachmentId, attachment);
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
    const accountEpoch = captureEmailCacheEpoch(emailAccountId);
    const transferSignal = controller.signal;
    transferSignal.throwIfAborted();
    const reference = await getLocalMailAttachmentReference({
      emailAccountId,
      messageId,
      attachmentId,
    });
    if (reference && reference.threadId !== threadId) return;
    if (!reference && (!allowUncached || !attachment)) return;
    const cached = reference
      ? await readLocalMailAttachment(reference)
      : undefined;
    transferSignal.throwIfAborted();
    if (cached) return cached;
    const size = reference ? reference.reportedBytes : attachment?.size;
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
      if (!reference && attachment) {
        const blob = await queueAttachmentDownload({
          priority: "speculative",
          signal: transferSignal,
          download: async (signal) => {
            if (
              !eligible() ||
              !isEmailCacheEpochCurrent(emailAccountId, accountEpoch)
            )
              return;
            return fetchAttachment({
              url: getAttachmentUrl({ ...attachment, messageId }),
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
        if (!isEmailCacheEpochCurrent(emailAccountId, accountEpoch)) return;
        if (blob) actualBytes = blob.size;
        return blob;
      }
      const result = await downloadLocalMailAttachment({
        emailAccountId,
        messageId,
        attachmentId,
        maxBytes: size,
        priority: "speculative",
        signal: transferSignal,
        onProgress: (bytes) => {
          actualBytes = bytes;
        },
      });
      transferSignal.throwIfAborted();
      if (result.status === "ready") {
        actualBytes = result.blob.size;
        return result.blob;
      }
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
