"use client";

import { useEffect, useMemo } from "react";
import { useSWRConfig } from "swr";
import type { ThreadResponse } from "@/app/api/threads/[id]/route";
import {
  createThreadRequest,
  fetchThreadRequest,
} from "@/utils/email-cache/thread-request";
import {
  readCachedThread,
  writeCachedThread,
} from "@/utils/email-cache/threads";
import { prepareEmailHtml } from "@/utils/email/prepare-html.client";

export function useAdjacentThreadPrefetch({
  currentThreadId,
  emailAccountId,
  threadIds,
}: {
  currentThreadId: string | null;
  emailAccountId: string;
  threadIds: string[];
}) {
  const { fetcher, mutate } = useSWRConfig();
  const adjacentThreadIds = useMemo(() => {
    const currentIndex = currentThreadId
      ? threadIds.indexOf(currentThreadId)
      : -1;
    if (currentIndex < 0) return [];
    return [threadIds[currentIndex - 1], threadIds[currentIndex + 1]].filter(
      (threadId): threadId is string => Boolean(threadId),
    );
  }, [currentThreadId, threadIds]);

  useEffect(() => {
    if (!fetcher || !shouldPrefetch() || !adjacentThreadIds.length) return;
    let cancelled = false;

    const prefetch = () => {
      for (const threadId of adjacentThreadIds) {
        const request = createThreadRequest({
          emailAccountId,
          threadId,
          options: { includeDrafts: true },
        });
        readCachedThread<ThreadResponse>({
          emailAccountId,
          threadId,
          variant: request.variant,
        })
          .then(async (cached) => {
            if (cancelled) return;
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
              async () =>
                (await fetcher(request.key)) as ThreadResponse | undefined,
            );
            if (!data) return;
            await mutate(request.key, data, {
              populateCache: true,
              revalidate: false,
            });
            await Promise.all([
              writeCachedThread({
                emailAccountId,
                threadId,
                variant: request.variant,
                data,
              }),
              prepareVisibleMessageHtml(data),
            ]);
          })
          .catch(() => {
            // Prefetch failures are intentionally silent; opening still retries normally.
          });
      }
    };

    const idleCallback = window.requestIdleCallback?.(prefetch, {
      timeout: 800,
    });
    const timeout =
      idleCallback === undefined ? window.setTimeout(prefetch, 150) : undefined;

    return () => {
      cancelled = true;
      if (idleCallback !== undefined) window.cancelIdleCallback(idleCallback);
      if (timeout !== undefined) window.clearTimeout(timeout);
    };
  }, [adjacentThreadIds, emailAccountId, fetcher, mutate]);
}

async function prepareVisibleMessageHtml(data: ThreadResponse) {
  const message = data.thread.messages.findLast(
    (candidate) => !candidate.labelIds?.includes("DRAFT"),
  );
  if (!message?.textHtml) return;
  await prepareEmailHtml({ messageId: message.id, html: message.textHtml });
}

function shouldPrefetch() {
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
