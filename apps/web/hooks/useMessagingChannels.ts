import useSWR from "swr";
import type { GetMessagingChannelsResponse } from "@/app/api/user/messaging-channels/route";
import type { GetChannelTargetsResponse } from "@/app/api/user/messaging-channels/[channelId]/targets/route";
import { useAccount } from "@/providers/EmailAccountProvider";
import { fetchWithAccount } from "@/utils/fetch";

export function useMessagingChannels(emailAccountId?: string) {
  const { emailAccountId: activeEmailAccountId } = useAccount();
  const resolvedEmailAccountId = emailAccountId ?? activeEmailAccountId;

  return useSWR<GetMessagingChannelsResponse>(
    resolvedEmailAccountId
      ? ["/api/user/messaging-channels", resolvedEmailAccountId]
      : null,
    fetchMessagingChannels,
  );
}

export function useChannelTargets(channelId: string | null) {
  return useSWR<GetChannelTargetsResponse>(
    channelId ? `/api/user/messaging-channels/${channelId}/targets` : null,
  );
}

async function fetchMessagingChannels([url, emailAccountId]: [
  string,
  string,
]): Promise<GetMessagingChannelsResponse> {
  const res = await fetchWithAccount({
    url,
    emailAccountId,
  });

  if (!res.ok) {
    throw new Error("Failed to fetch messaging channels");
  }

  return res.json();
}
