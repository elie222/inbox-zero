import type { ThreadResponse } from "@/app/api/threads/[id]/route";
import {
  createCompleteThreadBudget,
  readCompleteThreadJson,
} from "@/utils/email/complete-thread";
import { fetchWithAccount } from "@/utils/fetch";
import { captureLocalMailCacheContext } from "./local-mail-cache-context";
import { isEmailCacheEpochCurrent } from "./database";
import { getThreadCacheVersion } from "./thread-invalidation";

export async function prepareLocalMailOfflineConversation({
  emailAccountId,
  threadId,
  signal,
}: {
  emailAccountId: string;
  threadId: string;
  signal?: AbortSignal;
}) {
  if (!emailAccountId || !threadId)
    throw new Error("Mail account is unavailable");
  const requestSignal = AbortSignal.any([
    ...(signal ? [signal] : []),
    AbortSignal.timeout(60_000),
  ]);
  requestSignal.throwIfAborted();
  const context = await captureLocalMailCacheContext(emailAccountId);
  if (!context?.generation)
    throw new Error("Local mail is still preparing. Try again shortly.");
  const version = getThreadCacheVersion(emailAccountId, threadId);
  const fetchedAt = Date.now();
  const response = await fetchWithAccount({
    emailAccountId,
    url: `/api/threads/${encodeURIComponent(threadId)}?complete=true&includeDrafts=true`,
    init: { signal: requestSignal },
  });
  if (!response.ok || !response.body) {
    await response.body?.cancel().catch(() => undefined);
    throw new Error("The conversation could not be prepared for offline use.");
  }
  const data = await readCompleteThreadJson<ThreadResponse>(
    response.body,
    createCompleteThreadBudget(),
    requestSignal,
  );
  requestSignal.throwIfAborted();
  if (
    !isEmailCacheEpochCurrent(emailAccountId, context.epoch) ||
    version !== getThreadCacheVersion(emailAccountId, threadId)
  )
    throw new Error(
      "The conversation changed. Prepare it again before saving offline.",
    );
  if (
    data.thread.id !== threadId ||
    !data.thread.messages.length ||
    data.thread.messages.some((message) => message.threadId !== threadId)
  )
    throw new Error("The complete conversation is unavailable.");

  const attachments = new Map<string, { size: number }>();
  for (const message of data.thread.messages) {
    for (const file of [
      ...(message.attachments ?? []),
      ...(message.inline ?? []),
    ]) {
      attachments.set(JSON.stringify([message.id, file.attachmentId]), file);
    }
  }
  let knownAttachmentBytes = 0;
  let unknownSizeCount = 0;
  for (const file of attachments.values()) {
    if (Number.isSafeInteger(file.size) && file.size > 0)
      knownAttachmentBytes += file.size;
    else unknownSizeCount++;
  }
  if (!Number.isSafeInteger(knownAttachmentBytes))
    throw new Error("Attachment sizes are unavailable.");
  return {
    emailAccountId,
    threadId,
    context,
    version,
    fetchedAt,
    data,
    messageCount: data.thread.messages.length,
    attachmentCount: attachments.size,
    knownAttachmentBytes,
    unknownSizeCount,
  };
}
