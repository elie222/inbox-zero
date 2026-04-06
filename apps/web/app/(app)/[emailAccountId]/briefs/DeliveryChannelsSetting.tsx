"use client";

import Link from "next/link";
import { HashIcon, MailIcon, MessageCircleIcon, SendIcon } from "lucide-react";
import { useAction } from "next-safe-action/hooks";
import { SlackNotificationTargetSelect } from "@/components/SlackNotificationTargetSelect";
import { Toggle } from "@/components/Toggle";
import { LoadingContent } from "@/components/LoadingContent";
import { toastError, toastSuccess } from "@/components/Toast";
import { MutedText } from "@/components/Typography";
import { Card, CardContent } from "@/components/ui/card";
import { useMeetingBriefSettings } from "@/hooks/useMeetingBriefs";
import { useMessagingChannels } from "@/hooks/useMessagingChannels";
import { useAccount } from "@/providers/EmailAccountProvider";
import {
  type MessagingProvider,
  MessagingRoutePurpose,
} from "@/generated/prisma/enums";
import {
  updateMessagingFeatureRouteAction,
  updateEmailDeliveryAction,
} from "@/utils/actions/messaging-channels";
import { getActionErrorMessage } from "@/utils/error";
import {
  canEnableMessagingFeatureRoute,
  getMessagingFeatureRouteSummary,
  type MessagingChannelDestinations,
} from "@/utils/messaging/routes";
import { prefixPath } from "@/utils/path";

const PROVIDER_CONFIG: Record<
  MessagingProvider,
  {
    name: string;
    icon: typeof HashIcon;
    supportsBriefTargetSelection: boolean;
  }
> = {
  SLACK: {
    name: "Slack",
    icon: HashIcon,
    supportsBriefTargetSelection: true,
  },
  TEAMS: {
    name: "Teams",
    icon: MessageCircleIcon,
    supportsBriefTargetSelection: false,
  },
  TELEGRAM: {
    name: "Telegram",
    icon: SendIcon,
    supportsBriefTargetSelection: false,
  },
};

export function DeliveryChannelsSetting() {
  const { emailAccountId } = useAccount();
  const {
    data: briefSettings,
    isLoading: isLoadingBriefSettings,
    mutate: mutateBriefSettings,
  } = useMeetingBriefSettings();
  const {
    data: channelsData,
    isLoading: isLoadingChannels,
    error: channelsError,
    mutate: mutateChannels,
  } = useMessagingChannels();

  const { execute: executeEmailDelivery } = useAction(
    updateEmailDeliveryAction.bind(null, emailAccountId),
    {
      onSuccess: () => {
        toastSuccess({ description: "Settings saved" });
        mutateBriefSettings();
      },
      onError: (error) => {
        toastError({
          description: getActionErrorMessage(error.error) ?? "Failed to update",
        });
      },
    },
  );

  const connectedChannels =
    channelsData?.channels.filter((channel) => channel.isConnected) ?? [];
  const hasSlack = connectedChannels.some(
    (channel) => channel.provider === "SLACK",
  );
  const slackAvailable =
    channelsData?.availableProviders?.includes("SLACK") ?? false;

  return (
    <Card>
      <CardContent className="space-y-4 p-4">
        <div>
          <h3 className="font-medium">Delivery Channels</h3>
          <MutedText>Choose where to receive meeting briefings</MutedText>
        </div>

        <div className="space-y-3">
          <div className="flex items-center gap-3">
            <MailIcon className="h-5 w-5 text-muted-foreground" />
            <div className="flex-1 text-sm font-medium">Email</div>
            <Toggle
              name="emailDelivery"
              enabled={briefSettings?.meetingBriefsSendEmail ?? true}
              disabled={isLoadingBriefSettings}
              onChange={(sendEmail) => executeEmailDelivery({ sendEmail })}
            />
          </div>

          <LoadingContent loading={isLoadingChannels} error={channelsError}>
            {connectedChannels.map((channel) => (
              <ChannelRow
                key={channel.id}
                channel={channel}
                emailAccountId={emailAccountId}
                onUpdate={mutateChannels}
              />
            ))}
          </LoadingContent>

          {!isLoadingChannels && !hasSlack && slackAvailable && (
            <MutedText className="text-xs">
              Want to receive briefs in Slack?{" "}
              <Link
                href={prefixPath(emailAccountId, "/settings")}
                className="text-foreground underline"
              >
                Connect Slack in Settings
              </Link>
            </MutedText>
          )}
        </div>
      </CardContent>
    </Card>
  );
}

function ChannelRow({
  channel,
  emailAccountId,
  onUpdate,
}: {
  channel: {
    id: string;
    provider: MessagingProvider;
    destinations: MessagingChannelDestinations;
    canSendAsDm: boolean;
  };
  emailAccountId: string;
  onUpdate: () => void;
}) {
  const config = PROVIDER_CONFIG[channel.provider];
  const Icon = config.icon;
  const destination = getMessagingFeatureRouteSummary(
    channel.destinations,
    MessagingRoutePurpose.MEETING_BRIEFS,
  );
  const canEnableFeatureRoute = canEnableMessagingFeatureRoute(
    channel.destinations,
    MessagingRoutePurpose.MEETING_BRIEFS,
  );

  const { execute: executeFeatures } = useAction(
    updateMessagingFeatureRouteAction.bind(null, emailAccountId),
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
      <div className="flex-1">
        {config.supportsBriefTargetSelection ? (
          <div className="space-y-2">
            <span className="text-sm font-medium">{config.name}</span>
            <SlackNotificationTargetSelect
              emailAccountId={emailAccountId}
              messagingChannelId={channel.id}
              purpose={MessagingRoutePurpose.MEETING_BRIEFS}
              targetId={destination.targetId}
              targetLabel={destination.targetLabel}
              isDm={destination.isDm}
              canSendAsDm={channel.canSendAsDm}
              onUpdate={onUpdate}
              placeholder="Select destination"
              className="h-8 w-48 text-xs"
            />
            <MutedText className="text-xs">
              Pick where meeting briefs should be delivered for this Slack
              workspace.
            </MutedText>
          </div>
        ) : (
          <div className="space-y-1">
            <span className="text-sm font-medium">{config.name}</span>
            <MutedText className="text-xs">
              Meeting briefs will be sent to this connected app&apos;s direct
              message destination.
            </MutedText>
          </div>
        )}
      </div>

      <Toggle
        name={`briefs-${channel.id}`}
        enabled={destination.enabled}
        disabled={!canEnableFeatureRoute}
        onChange={(enabled) => {
          if (!canEnableFeatureRoute) return;
          executeFeatures({
            channelId: channel.id,
            purpose: MessagingRoutePurpose.MEETING_BRIEFS,
            enabled,
          });
        }}
      />
    </div>
  );
}
