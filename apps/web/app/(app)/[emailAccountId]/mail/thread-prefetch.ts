import type { BareFetcher, ScopedMutator } from "swr";
import type { ThreadResponse } from "@/app/api/threads/[id]/route";
import {
  createThreadRequest,
  fetchThreadRequest,
} from "@/utils/email-cache/thread-request";
import {
  readCachedThreadDetail,
  writeCachedThreadDetail,
} from "@/utils/email-cache/threads";
import { prepareEmailHtml } from "@/utils/email/prepare-html.client";

/**
 * Warms every layer an opened thread reads from: the SWR cache (via mutate so
 * an open doesn't refetch), the IndexedDB copy, and the prepared HTML cache.
 * Shared by the adjacent-thread and hover prefetchers so they can't drift.
 */
export async function prefetchThreadDetail({
  emailAccountId,
  threadId,
  fetcher,
  mutate,
  isCancelled,
}: {
  emailAccountId: string;
  threadId: string;
  fetcher: BareFetcher;
  mutate: ScopedMutator;
  isCancelled?: () => boolean;
}) {
  const request = createThreadRequest({
    emailAccountId,
    threadId,
    options: { includeDrafts: true },
  });
  const cached = await readCachedThreadDetail({
    emailAccountId,
    threadId,
    variant: request.variant,
  });
  if (isCancelled?.()) return;
  if (cached) {
    await mutate<ThreadResponse>(
      request.key,
      (current) => current ?? cached.data,
      {
        populateCache: true,
        revalidate: false,
      },
    );
    await prepareVisibleMessageHtml(cached.data);
    return;
  }

  const data = await fetchThreadRequest<ThreadResponse | undefined>(
    request,
    async () => (await fetcher(request.key)) as ThreadResponse | undefined,
  );
  if (!data) return;
  await mutate(request.key, data, {
    populateCache: true,
    revalidate: false,
  });
  await Promise.all([
    writeCachedThreadDetail({
      emailAccountId,
      threadId,
      variant: request.variant,
      data,
    }),
    prepareVisibleMessageHtml(data),
  ]);
}

export function shouldPrefetchThreads() {
  if (document.visibilityState !== "visible") return false;
  const connection = (
    navigator as Navigator & {
      connection?: { effectiveType?: string; saveData?: boolean };
    }
  ).connection;
  return (
    !connection?.saveData &&
    connection?.effectiveType !== "slow-2g" &&
    connection?.effectiveType !== "2g"
  );
}

async function prepareVisibleMessageHtml(data: ThreadResponse) {
  const message = data.thread.messages.findLast(
    (candidate) => !candidate.labelIds?.includes("DRAFT"),
  );
  if (!message?.textHtml) return;
  await prepareEmailHtml({ messageId: message.id, html: message.textHtml });
}
