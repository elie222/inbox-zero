import { useMemo } from "react";
import useSWR, { useSWRConfig } from "swr";
import type { GetSentMessageOpensResponse } from "@/app/api/user/sent-message-opens/route";
import { useAccount } from "@/providers/EmailAccountProvider";
import {
  chunkSentMessageOpenThreadIds,
  mergeSentMessageOpenResponses,
} from "@/utils/email/sent-message-open";
import { getAccountScopedKey } from "@/utils/swr";

export function useSentMessageOpens(threadId: string | null) {
  const { emailAccountId } = useAccount();
  return useSWR<GetSentMessageOpensResponse>(
    threadId
      ? getAccountScopedKey(
          `/api/user/sent-message-opens?threadId=${encodeURIComponent(threadId)}`,
          emailAccountId || null,
        )
      : null,
    { refreshInterval: sentMessageOpenRefreshInterval },
  );
}

export function useSentMessageOpensForThreads(threadIds: string[]) {
  const { emailAccountId } = useAccount();
  const { fetcher } = useSWRConfig();
  const uniqueThreadIds = useMemo(
    () => [...new Set(threadIds.filter(Boolean))],
    [threadIds],
  );
  const threadIdsKey = uniqueThreadIds.join(",");
  const key =
    emailAccountId && uniqueThreadIds.length > 0
      ? (["sent-message-opens", emailAccountId, threadIdsKey] as const)
      : null;

  return useSWR<GetSentMessageOpensResponse>(
    key,
    async () => {
      if (!fetcher || !emailAccountId) {
        throw new Error("SWR fetcher is not configured");
      }
      const accountFetcher = fetcher as (
        key: string | [string, string],
      ) => Promise<GetSentMessageOpensResponse>;
      const responses = await Promise.all(
        chunkSentMessageOpenThreadIds(uniqueThreadIds).map((chunkIds) =>
          accountFetcher([
            `/api/user/sent-message-opens?threadIds=${chunkIds
              .map((threadId) => encodeURIComponent(threadId))
              .join(",")}`,
            emailAccountId,
          ]),
        ),
      );
      return mergeSentMessageOpenResponses(responses);
    },
    { refreshInterval: sentMessageOpenRefreshInterval },
  );
}

function sentMessageOpenRefreshInterval(
  data: GetSentMessageOpensResponse | undefined,
) {
  const opens = data ? Object.values(data.opens) : [];
  if (opens.length === 0) return 0;
  return opens.some((open) => !open.firstOpenedAt) ? 15_000 : 60_000;
}
