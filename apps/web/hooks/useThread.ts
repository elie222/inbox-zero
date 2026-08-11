import { useEffect, useMemo, useRef, useState } from "react";
import useSWR from "swr";
import type { ThreadResponse } from "@/app/api/threads/[id]/route";
import { useAccount } from "@/providers/EmailAccountProvider";
import {
  readCachedThread,
  writeCachedThread,
} from "@/utils/email-cache/threads";
import {
  createThreadRequest,
  type ThreadRequestOptions,
} from "@/utils/email-cache/thread-request";
import {
  EMAIL_CACHE_MEASURES,
  finishEmailCacheMeasure,
  startEmailCacheMeasure,
} from "@/utils/email-cache/telemetry";

// `id` accepts null so "no thread open" is expressible in the type rather than
// as a magic empty string that would silently resolve to the thread list route.
export function useThread(
  { id }: { id: string | null },
  options?: ThreadRequestOptions,
) {
  const { emailAccountId } = useAccount();
  const includeDrafts = options?.includeDrafts;
  const parseReplies = options?.parseReplies;
  const request = useMemo(
    () =>
      id && emailAccountId
        ? createThreadRequest({
            emailAccountId,
            threadId: id,
            options: { includeDrafts, parseReplies },
          })
        : null,
    [emailAccountId, id, includeDrafts, parseReplies],
  );
  const swr = useSWR<ThreadResponse>(request?.key ?? null, {
    keepPreviousData: false,
  });
  const [persistent, setPersistent] = useState<{
    identity: string;
    data: ThreadResponse;
  }>();
  const remoteIdentity = useRef<string>();

  const remoteData = swr?.data?.thread.id === id ? swr.data : undefined;
  remoteIdentity.current =
    remoteData && request ? request.cacheIdentity : undefined;

  useEffect(() => {
    if (!request || !id) return;
    let cancelled = false;
    const startedAt = startEmailCacheMeasure();

    readCachedThread<ThreadResponse>({
      emailAccountId,
      threadId: id,
      variant: request.variant,
    }).then((cached) => {
      finishEmailCacheMeasure(EMAIL_CACHE_MEASURES.threadHydration, startedAt);
      if (
        cancelled ||
        !cached ||
        remoteIdentity.current === request.cacheIdentity
      ) {
        return;
      }
      setPersistent({ identity: request.cacheIdentity, data: cached.data });
    });

    return () => {
      cancelled = true;
    };
  }, [emailAccountId, id, request]);

  useEffect(() => {
    if (!remoteData || !request || !id) return;
    writeCachedThread({
      emailAccountId,
      threadId: id,
      variant: request.variant,
      data: remoteData,
    }).catch(() => {});
  }, [emailAccountId, id, remoteData, request]);

  const persistentData =
    persistent && persistent.identity === request?.cacheIdentity
      ? persistent.data
      : undefined;
  const data = remoteData ?? persistentData;

  return {
    ...swr,
    data,
    error: data ? undefined : swr?.error,
    isLoading: Boolean(swr?.isLoading && !persistentData),
    isValidating: swr?.isValidating ?? false,
    mutate: swr?.mutate ?? mutateIdleThread,
  };
}

async function mutateIdleThread() {
  return;
}
