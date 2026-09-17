import {
  fetchAttachment,
  getAttachmentUrl,
} from "@/utils/attachments/download";
import { queueAttachmentDownload } from "@/utils/attachments/download-queue";
import {
  captureEmailCacheEpoch,
  getEmailCacheDatabase,
  isEmailCacheEpochCurrent,
} from "./database";
import {
  commitLocalMailAttachmentDownload,
  getLocalMailAttachmentReference,
  markLocalMailAttachmentDownloadFailed,
  prepareLocalMailAttachmentDownload,
  readLocalMailAttachment,
} from "./local-mail-attachments";

const MAX_MEMORY_BYTES = 16 * 1024 * 1024;
type StorageOptions = Omit<
  Parameters<typeof prepareLocalMailAttachmentDownload>[0],
  "reference" | "maxBytes"
>;
type Result =
  | { status: "ready"; blob: Blob; cached: boolean }
  | { status: "external-download-required" }
  | { status: "skipped"; reason: "storage" | "stale" | "size" };

export async function downloadLocalMailAttachment({
  emailAccountId,
  messageId,
  attachmentId,
  priority,
  maxBytes,
  signal,
  onProgress,
  storageOptions,
}: {
  emailAccountId: string;
  messageId: string;
  attachmentId: string;
  priority: "requested" | "speculative";
  maxBytes?: number;
  signal?: AbortSignal;
  onProgress?: (receivedBytes: number) => void;
  storageOptions?: StorageOptions;
}): Promise<Result> {
  signal?.throwIfAborted();
  const epoch = captureEmailCacheEpoch(emailAccountId);
  const database = await getEmailCacheDatabase();
  const generation = (
    await database?.get("searchIndexAccounts", emailAccountId)
  )?.generation;
  const reference = await getLocalMailAttachmentReference({
    emailAccountId,
    messageId,
    attachmentId,
  });
  if (!database || !reference || !generation)
    return { status: "skipped", reason: "stale" };
  const current = async () => {
    if (!isEmailCacheEpochCurrent(emailAccountId, epoch)) return false;
    const [account, latest] = await Promise.all([
      database.get("searchIndexAccounts", emailAccountId),
      getLocalMailAttachmentReference({
        emailAccountId,
        messageId,
        attachmentId,
      }),
    ]);
    return (
      isEmailCacheEpochCurrent(emailAccountId, epoch) &&
      account?.generation === generation &&
      latest?.revision === reference.revision &&
      latest.threadId === reference.threadId
    );
  };
  const cached = await readLocalMailAttachment(reference);
  signal?.throwIfAborted();
  if (!(await current())) return { status: "skipped", reason: "stale" };
  if (cached) return { status: "ready", blob: cached, cached: true };
  if (
    typeof maxBytes !== "number" ||
    !Number.isSafeInteger(maxBytes) ||
    maxBytes <= 0 ||
    maxBytes > MAX_MEMORY_BYTES ||
    (reference.reportedBytes ?? 0) > maxBytes
  )
    return priority === "requested"
      ? { status: "external-download-required" }
      : { status: "skipped", reason: "size" };
  const ticket = await prepareLocalMailAttachmentDownload({
    ...storageOptions,
    reference,
    maxBytes: maxBytes,
  });
  if (!ticket && priority === "speculative")
    return { status: "skipped", reason: "storage" };
  let committed = false;
  try {
    return await queueAttachmentDownload({
      priority,
      signal,
      download: async (transferSignal): Promise<Result> => {
        if (!(await current())) return { status: "skipped", reason: "stale" };
        const blob = await fetchAttachment({
          url: getAttachmentUrl(reference),
          emailAccountId,
          maxBytes: maxBytes,
          signal: transferSignal,
          onProgress,
        });
        transferSignal.throwIfAborted();
        if (!(await current())) return { status: "skipped", reason: "stale" };
        if (ticket)
          committed = await commitLocalMailAttachmentDownload({
            ...storageOptions,
            ticket,
            blob,
            signal: transferSignal,
          });
        if (!(await current())) return { status: "skipped", reason: "stale" };
        if (priority === "speculative" && !committed)
          return { status: "skipped", reason: "storage" };
        return { status: "ready", blob, cached: committed };
      },
    });
  } finally {
    if (ticket && !committed)
      await markLocalMailAttachmentDownloadFailed(ticket);
  }
}
