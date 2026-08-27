import { useMemo, useRef } from "react";
import useSWR, { unstable_serialize, useSWRConfig } from "swr";
import type { ThreadResponse } from "@/app/api/threads/[id]/route";
import { useAccount } from "@/providers/EmailAccountProvider";
import {
  readCachedThreadDetail,
  writeCachedThreadDetail,
} from "@/utils/email-cache/threads";
import {
  createThreadRequest,
  fetchThreadRequest,
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
  {
    id,
    emailAccountId: explicitEmailAccountId,
  }: { id: string | null; emailAccountId?: string },
  options?: ThreadRequestOptions,
) {
  const { emailAccountId: currentEmailAccountId } = useAccount();
  const emailAccountId = explicitEmailAccountId ?? currentEmailAccountId;
  const { cache, fetcher } = useSWRConfig();
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
  const memoryData = request
    ? (
        cache.get(unstable_serialize(request.key)) as
          | { data?: ThreadResponse }
          | undefined
      )?.data
    : undefined;
  const hasMatchingMemoryData = memoryData?.thread.id === id;
  const checkedPersistentCache = useRef(new Set<string>());
  const swr = useSWR<ThreadResponse>(
    request?.key ?? null,
    request && fetcher && id
      ? () =>
          fetchThreadRequest(request, async () => {
            if (
              !hasMatchingMemoryData &&
              !checkedPersistentCache.current.has(request.cacheIdentity)
            ) {
              checkedPersistentCache.current.add(request.cacheIdentity);
              const startedAt = startEmailCacheMeasure();
              const cached = await readCachedThreadDetail({
                emailAccountId,
                threadId: id,
                variant: request.variant,
              });
              finishEmailCacheMeasure(
                EMAIL_CACHE_MEASURES.threadHydration,
                startedAt,
              );
              if (cached) return cached.data;
            }

            const data = (await fetcher(request.key)) as ThreadResponse;
            writeCachedThreadDetail({
              emailAccountId,
              threadId: id,
              variant: request.variant,
              data,
            });
            return data;
          })
      : null,
    {
      keepPreviousData: false,
      revalidateOnMount: !hasMatchingMemoryData,
      revalidateOnFocus: false,
      revalidateOnReconnect: false,
    },
  );
  const data = swr.data?.thread.id === id ? swr.data : undefined;

  return {
    ...swr,
    data,
    error: data ? undefined : swr.error,
    isLoading: swr.isLoading,
    isValidating: swr.isValidating,
    mutate: swr.mutate,
  };
}
