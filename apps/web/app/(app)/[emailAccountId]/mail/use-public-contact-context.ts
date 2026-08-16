import useSWR from "swr";
import type { GetPublicContactContextResponse } from "@/app/api/user/public-contact-context/[messageId]/route";

export function usePublicContactContext({
  messageId,
  enabled,
}: {
  messageId: string | null;
  enabled: boolean;
}) {
  return useSWR<GetPublicContactContextResponse>(
    enabled && messageId
      ? `/api/user/public-contact-context/${encodeURIComponent(messageId)}`
      : null,
    {
      refreshInterval: (data) =>
        data?.status === "unavailable" && data.reason === "research_in_progress"
          ? 2000
          : 0,
      revalidateOnFocus: false,
      shouldRetryOnError: false,
    },
  );
}
