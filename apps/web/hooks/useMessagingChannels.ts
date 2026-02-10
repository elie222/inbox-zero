import useSWR from "swr";
import type { GetMessagingChannelsResponse } from "@/app/api/user/messaging-channels/route";
import type { GetChannelTargetsResponse } from "@/app/api/user/messaging-channels/[channelId]/targets/route";
import { useAccount } from "@/providers/EmailAccountProvider";

export function useMessagingChannels(emailAccountId?: string) {
  const { emailAccountId: contextId } = useAccount();
  const id = emailAccountId ?? contextId;
  return useSWR<GetMessagingChannelsResponse>(
    id ? ["/api/user/messaging-channels", id] : null,
  );
}

export function useChannelTargets(channelId: string | null) {
  return useSWR<GetChannelTargetsResponse>(
    channelId ? `/api/user/messaging-channels/${channelId}/targets` : null,
  );
}
