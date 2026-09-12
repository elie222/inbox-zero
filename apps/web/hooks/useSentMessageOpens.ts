import useSWR from "swr";
import type { GetSentMessageOpensResponse } from "@/app/api/user/sent-message-opens/route";

export function useSentMessageOpens(threadId: string | null) {
  return useSWR<GetSentMessageOpensResponse>(
    threadId
      ? `/api/user/sent-message-opens?threadId=${encodeURIComponent(threadId)}`
      : null,
    { refreshInterval: sentMessageOpenRefreshInterval },
  );
}

export function useSentMessageOpensForThreads(threadIds: string[]) {
  const key =
    threadIds.length > 0
      ? `/api/user/sent-message-opens?threadIds=${threadIds
          .map((threadId) => encodeURIComponent(threadId))
          .join(",")}`
      : null;
  return useSWR<GetSentMessageOpensResponse>(key, {
    refreshInterval: sentMessageOpenRefreshInterval,
  });
}

function sentMessageOpenRefreshInterval(
  data: GetSentMessageOpensResponse | undefined,
) {
  const opens = data ? Object.values(data.opens) : [];
  if (opens.length === 0) return 0;
  return opens.some((open) => !open.firstOpenedAt) ? 15_000 : 60_000;
}
