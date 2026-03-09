import useSWR from "swr";
import type { GetMessagingChannelsResponse } from "@/app/api/user/messaging-channels/route";
import type { GetChannelTargetsResponse } from "@/app/api/user/messaging-channels/[channelId]/targets/route";

export function useMessagingChannels(emailAccountId?: string | null) {
  return useSWR<GetMessagingChannelsResponse>(
    getAccountScopedKey("/api/user/messaging-channels", emailAccountId),
  );
}

export function useChannelTargets(
  channelId: string | null,
  emailAccountId?: string | null,
) {
  return useSWR<GetChannelTargetsResponse>(
    channelId
      ? getAccountScopedKey(
          `/api/user/messaging-channels/${channelId}/targets`,
          emailAccountId,
        )
      : null,
  );
}

function getAccountScopedKey(path: string, emailAccountId?: string | null) {
  if (emailAccountId === undefined) return path;

  return emailAccountId ? ([path, emailAccountId] as const) : null;
}
