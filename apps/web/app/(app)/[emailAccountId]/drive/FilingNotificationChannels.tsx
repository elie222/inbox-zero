"use client";

import Link from "next/link";
import { HashIcon, MessageSquareIcon } from "lucide-react";
import { useAction } from "next-safe-action/hooks";
import { Card, CardContent } from "@/components/ui/card";
import { Toggle } from "@/components/Toggle";
import { toastSuccess, toastError } from "@/components/Toast";
import { LoadingContent } from "@/components/LoadingContent";
import { MutedText } from "@/components/Typography";
import { useAccount } from "@/providers/EmailAccountProvider";
import { useMessagingChannels } from "@/hooks/useMessagingChannels";
import { updateChannelFeaturesAction } from "@/utils/actions/messaging-channels";
import { getActionErrorMessage } from "@/utils/error";
import { prefixPath } from "@/utils/path";
import type { MessagingProvider } from "@/generated/prisma/enums";

export function FilingNotificationChannels() {
  const { emailAccountId } = useAccount();
  const {
    data: channelsData,
    isLoading,
    error,
    mutate: mutateChannels,
  } = useMessagingChannels();

  const allConnected =
    channelsData?.channels.filter((c) => c.isConnected) ?? [];
  const withChannel = allConnected.filter((c) => c.channelId);

  if (!isLoading && allConnected.length === 0) {
    return (
      <Card>
        <CardContent className="p-4">
          <h3 className="font-medium">Slack Notifications</h3>
          <MutedText className="text-xs mt-1">
            Get filing notifications in Slack.{" "}
            <Link
              href={prefixPath(emailAccountId, "/settings?tab=email")}
              className="underline text-foreground"
            >
              Connect Slack in Settings
            </Link>
          </MutedText>
        </CardContent>
      </Card>
    );
  }

  if (!isLoading && withChannel.length === 0) {
    return (
      <Card>
        <CardContent className="p-4">
          <h3 className="font-medium">Slack Notifications</h3>
          <MutedText className="text-xs mt-1">
            Select a target channel in{" "}
            <Link
              href={prefixPath(emailAccountId, "/briefs")}
              className="underline text-foreground"
            >
              Meeting Briefs
            </Link>{" "}
            to enable filing notifications.
          </MutedText>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardContent className="p-4 space-y-3">
        <div>
          <h3 className="font-medium">Slack Notifications</h3>
          <MutedText>Get filing notifications in your Slack channel</MutedText>
        </div>

        <LoadingContent loading={isLoading} error={error}>
          {withChannel.map((channel) => (
            <FilingChannelToggle
              key={channel.id}
              channel={channel}
              emailAccountId={emailAccountId}
              onUpdate={mutateChannels}
            />
          ))}
        </LoadingContent>
      </CardContent>
    </Card>
  );
}

function FilingChannelToggle({
  channel,
  emailAccountId,
  onUpdate,
}: {
  channel: {
    id: string;
    provider: MessagingProvider;
    channelName: string | null;
    sendDocumentFilings: boolean;
  };
  emailAccountId: string;
  onUpdate: () => void;
}) {
  const Icon = channel.provider === "SLACK" ? HashIcon : MessageSquareIcon;

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
    <div className="flex items-center gap-3">
      <Icon className="h-5 w-5 text-muted-foreground" />
      <div className="flex-1 text-sm">
        Slack
        {channel.channelName && (
          <span className="text-muted-foreground">
            {" "}
            &middot; #{channel.channelName}
          </span>
        )}
      </div>
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
