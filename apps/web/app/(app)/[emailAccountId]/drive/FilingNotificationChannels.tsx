"use client";

import { useAction } from "next-safe-action/hooks";
import { Toggle } from "@/components/Toggle";
import { toastSuccess, toastError } from "@/components/Toast";
import { useMessagingChannels } from "@/hooks/useMessagingChannels";
import { updateChannelFeaturesAction } from "@/utils/actions/messaging-channels";
import { getActionErrorMessage } from "@/utils/error";

export function FilingNotificationChannels({
  emailAccountId,
}: {
  emailAccountId: string;
}) {
  const {
    data: channelsData,
    isLoading,
    mutate: mutateChannels,
  } = useMessagingChannels();

  const channels =
    channelsData?.channels.filter((c) => c.isConnected && c.channelId) ?? [];

  if (isLoading || channels.length === 0) return null;

  return (
    <div className="space-y-2">
      {channels.map((channel) => (
        <FilingChannelToggle
          key={channel.id}
          channel={channel}
          emailAccountId={emailAccountId}
          onUpdate={mutateChannels}
        />
      ))}
    </div>
  );
}

function FilingChannelToggle({
  channel,
  emailAccountId,
  onUpdate,
}: {
  channel: {
    id: string;
    channelName: string | null;
    sendDocumentFilings: boolean;
  };
  emailAccountId: string;
  onUpdate: () => void;
}) {
  const { execute } = useAction(
    updateChannelFeaturesAction.bind(null, emailAccountId),
    {
      onSuccess: () => {
        toastSuccess({ description: "Settings saved" });
        onUpdate();
      },
      onError: (error) => {
        toastError({
          description: getActionErrorMessage(error.error) ?? "Failed to update",
        });
      },
    },
  );

  return (
    <div className="flex items-center justify-between">
      <span className="text-sm text-muted-foreground">
        Notify via Slack
        {channel.channelName && <span> &middot; #{channel.channelName}</span>}
      </span>
      <Toggle
        name={`filing-${channel.id}`}
        enabled={channel.sendDocumentFilings}
        onChange={(sendDocumentFilings) =>
          execute({ channelId: channel.id, sendDocumentFilings })
        }
      />
    </div>
  );
}
