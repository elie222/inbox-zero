import useSWR from "swr";
import type { GetMessagingChannelsResponse } from "@/app/api/user/messaging-channels/route";
import type { GetChannelTargetsResponse } from "@/app/api/user/messaging-channels/[channelId]/targets/route";

export function useMessagingChannels(emailAccountId?: string) {
  return useSWR<GetMessagingChannelsResponse>(
    emailAccountId
      ? ["/api/user/messaging-channels", emailAccountId]
      : "/api/user/messaging-channels",
  );
}

export function useChannelTargets(channelId: string | null) {
  return useSWR<GetChannelTargetsResponse>(
    channelId ? `/api/user/messaging-channels/${channelId}/targets` : null,
  );
}
