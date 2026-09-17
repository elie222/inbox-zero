import { getEmailCacheDatabase } from "./database";
import {
  downloadLocalMailAttachment,
  LOCAL_MAIL_ATTACHMENT_MEMORY_LIMIT,
} from "./local-mail-attachment-download";
import type { LocalMailAttachmentJob } from "./local-mail-attachments-types";

// A file whose size the provider did not report is allowed this much before
// the transfer is cut off, so an unreported size cannot consume the budget.
const UNKNOWN_SIZE_ALLOWANCE = 2 * 1024 * 1024;
const MAX_ATTEMPTS = 6;
const RETRY_BASE_MS = 30_000;
const RETRY_CEILING_MS = 30 * 60_000;
// Storage pressure is not the file's fault, so it must not consume the job's
// attempts. The wait lives in memory: on reload one retry per pin is cheap,
// and persisting it would mean a write on every blocked pass.
const STORAGE_RETRY_MS = 60_000;
const storageWaitUntil = new Map<string, number>();

/**
 * Downloads one attachment belonging to a pinned conversation.
 *
 * Pins persist as `localMailAttachmentJobs` rows, so the work resumes by
 * itself after a reload or a reconnect without any state held here. The
 * transfer primitives own the job's lifecycle: a commit marks it complete and
 * a failure increments its attempts, which is why nothing below writes a job.
 *
 * One file per call. The sync loop that drives this interleaves it with mail
 * synchronization, and `queueAttachmentDownload` already serializes transfers
 * against the previews of whatever conversation is open.
 */
export async function drainLocalMailOfflineDownloads({
  emailAccountId,
  now = Date.now(),
  signal,
}: {
  emailAccountId: string;
  now?: number;
  signal?: AbortSignal;
}): Promise<"idle" | "progress" | "blocked"> {
  signal?.throwIfAborted();
  if (now < (storageWaitUntil.get(emailAccountId) ?? 0)) return "blocked";
  const database = await getEmailCacheDatabase();
  if (!database) return "idle";
  // Start from the conversations kept offline, not from every attachment job
  // the account has ever cached: the protection store holds one small row per
  // thread, while the job store grows with every attachment ever downloaded
  // and this runs on every synchronization tick.
  const kept = (await database.getAll("localMailThreadProtection")).filter(
    (protection) =>
      protection.emailAccountId === emailAccountId &&
      protection.pinned &&
      protection.pinSnapshotId &&
      !protection.pinSnapshotInvalidated,
  );
  if (!kept.length) return "idle";
  let blocked = false;
  for (const protection of kept) {
    const jobs = await database.getAllFromIndex(
      "localMailAttachmentJobs",
      "byAccountThread",
      [emailAccountId, protection.threadId],
    );
    for (const job of jobs) {
      if (
        job.state === "complete" ||
        job.snapshotId !== protection.pinSnapshotId
      )
        continue;
      if (!isRetryable(job, now) || !isLocalMailOfflineFileStorable(job)) {
        blocked = true;
        continue;
      }
      signal?.throwIfAborted();
      const result = await downloadLocalMailAttachment({
        emailAccountId,
        messageId: job.messageId,
        attachmentId: job.attachmentId,
        priority: "speculative",
        maxBytes: job.reportedBytes ?? UNKNOWN_SIZE_ALLOWANCE,
        signal,
      });
      if (result.status === "skipped" && result.reason === "storage") {
        storageWaitUntil.set(emailAccountId, now + STORAGE_RETRY_MS);
        return "blocked";
      }
      storageWaitUntil.delete(emailAccountId);
      return "progress";
    }
  }
  return blocked ? "blocked" : "idle";
}

export function forgetLocalMailOfflineDownloadWaits(emailAccountId: string) {
  storageWaitUntil.delete(emailAccountId);
}

/**
 * Whether a file can be kept at all, which the pin UI reports rather than
 * retrying. An unreported size is attempted against the allowance instead of
 * being refused, because most such files turn out to be small.
 */
export function isLocalMailOfflineFileStorable(job: LocalMailAttachmentJob) {
  return (
    job.reportedBytes === undefined ||
    job.reportedBytes <= LOCAL_MAIL_ATTACHMENT_MEMORY_LIMIT
  );
}

export function isLocalMailOfflineFileExhausted(job: LocalMailAttachmentJob) {
  return job.attempts >= MAX_ATTEMPTS;
}

function isRetryable(job: LocalMailAttachmentJob, now: number) {
  if (isLocalMailOfflineFileExhausted(job)) return false;
  if (job.state !== "failed") return true;
  const delay = Math.min(
    RETRY_CEILING_MS,
    RETRY_BASE_MS * 2 ** Math.max(0, job.attempts - 1),
  );
  return now >= job.updatedAt + delay;
}
