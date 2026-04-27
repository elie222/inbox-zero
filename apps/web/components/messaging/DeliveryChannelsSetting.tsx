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
import { useMessagingChannels } from "@/hooks/useMessagingChannels";
import { useAccount } from "@/providers/EmailAccountProvider";
import type { MessagingProvider } from "@/generated/prisma/enums";
import { updateMessagingFeatureRouteAction } from "@/utils/actions/messaging-channels";
import { getActionErrorMessage } from "@/utils/error";
import {
  canEnableMessagingFeatureRoute,
  getMessagingFeatureRouteSummary,
  type MessagingChannelDestinations,
  type MessagingFeatureRoutePurpose,
} from "@/utils/messaging/routes";
import { prefixPath } from "@/utils/path";

const PROVIDER_CONFIG: Record<
  MessagingProvider,
  {
    name: string;
    icon: typeof HashIcon;
    supportsTargetSelection: boolean;
  }
> = {
  SLACK: { name: "Slack", icon: HashIcon, supportsTargetSelection: true },
  TEAMS: {
    name: "Teams",
    icon: MessageCircleIcon,
    supportsTargetSelection: false,
  },
  TELEGRAM: {
    name: "Telegram",
    icon: SendIcon,
    supportsTargetSelection: false,
  },
};

type EmailDeliveryProps = {
  enabled: boolean;
  isLoading: boolean;
  onChange: (enabled: boolean) => void;
};

export function DeliveryChannelsSetting({
  title,
  description,
  purpose,
  featureLabel,
  email,
  connectSlackCta,
}: {
  title: string;
  description: string;
  purpose: MessagingFeatureRoutePurpose;
  featureLabel: string;
  email?: EmailDeliveryProps;
  connectSlackCta: string;
}) {
  const { emailAccountId } = useAccount();
  const {
    data: channelsData,
    isLoading: isLoadingChannels,
    error: channelsError,
    mutate: mutateChannels,
  } = useMessagingChannels();

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
          <h3 className="font-medium">{title}</h3>
          <MutedText>{description}</MutedText>
        </div>

        <div className="space-y-3">
          {email && (
            <div className="flex items-center gap-3">
              <MailIcon className="h-5 w-5 text-muted-foreground" />
              <div className="flex-1 text-sm font-medium">Email</div>
              <Toggle
                name="emailDelivery"
                enabled={email.enabled}
                disabled={email.isLoading}
                onChange={email.onChange}
              />
            </div>
          )}

          <LoadingContent loading={isLoadingChannels} error={channelsError}>
            {connectedChannels.map((channel) => (
              <ChannelRow
                key={channel.id}
                channel={channel}
                emailAccountId={emailAccountId}
                purpose={purpose}
                featureLabel={featureLabel}
                onUpdate={mutateChannels}
              />
            ))}
          </LoadingContent>

          {!isLoadingChannels && !hasSlack && slackAvailable && (
            <MutedText className="text-xs">
              {connectSlackCta}{" "}
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
  purpose,
  featureLabel,
  onUpdate,
}: {
  channel: {
    id: string;
    provider: MessagingProvider;
    destinations: MessagingChannelDestinations;
    canSendAsDm: boolean;
  };
  emailAccountId: string;
  purpose: MessagingFeatureRoutePurpose;
  featureLabel: string;
  onUpdate: () => void;
}) {
  const config = PROVIDER_CONFIG[channel.provider];
  const Icon = config.icon;
  const destination = getMessagingFeatureRouteSummary(
    channel.destinations,
    purpose,
  );
  const canEnableFeatureRoute = canEnableMessagingFeatureRoute(
    channel.destinations,
    purpose,
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
        {config.supportsTargetSelection ? (
          <div className="space-y-2">
            <span className="text-sm font-medium">{config.name}</span>
            <SlackNotificationTargetSelect
              emailAccountId={emailAccountId}
              messagingChannelId={channel.id}
              purpose={purpose}
              targetId={destination.targetId}
              targetLabel={destination.targetLabel}
              isDm={destination.isDm}
              canSendAsDm={channel.canSendAsDm}
              onUpdate={onUpdate}
              placeholder="Select destination"
              className="h-8 w-48 text-xs"
            />
            <MutedText className="text-xs">
              Pick where {featureLabel} should be delivered for this Slack
              workspace.
            </MutedText>
          </div>
        ) : (
          <div className="space-y-1">
            <span className="text-sm font-medium">{config.name}</span>
            <MutedText className="text-xs">
              {featureLabel} will be sent to this connected app&apos;s direct
              message destination.
            </MutedText>
          </div>
        )}
      </div>

      <Toggle
        name={`${purpose}-${channel.id}`}
        enabled={destination.enabled}
        disabled={!canEnableFeatureRoute}
        onChange={(enabled) => {
          if (!canEnableFeatureRoute) return;
          executeFeatures({
            channelId: channel.id,
            purpose,
            enabled,
          });
        }}
      />
    </div>
  );
}
