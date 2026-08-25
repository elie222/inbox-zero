import useSWR from "swr";
import type { GetPublicContactContextResponse } from "@/app/api/user/public-contact-context/[messageId]/route";
import { useAccount } from "@/providers/EmailAccountProvider";

export function usePublicContactContext({
  messageId,
  enabled,
  emailAccountId: explicitEmailAccountId,
}: {
  messageId: string | null;
  enabled: boolean;
  emailAccountId?: string;
}) {
  const { emailAccountId: currentEmailAccountId } = useAccount();
  const emailAccountId = explicitEmailAccountId ?? currentEmailAccountId;

  return useSWR<GetPublicContactContextResponse>(
    enabled && messageId
      ? [
          `/api/user/public-contact-context/${encodeURIComponent(messageId)}`,
          emailAccountId,
        ]
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
