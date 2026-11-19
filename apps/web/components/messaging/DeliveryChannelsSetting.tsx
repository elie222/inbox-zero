"use client";

import { Trans, useLingui } from "@lingui/react/macro";
import { HashIcon, MailIcon, MessageCircleIcon, SendIcon } from "lucide-react";
import { useAction } from "next-safe-action/hooks";
import { SlackNotificationTargetSelect } from "@/components/SlackNotificationTargetSelect";
import { Toggle } from "@/components/Toggle";
import { LoadingContent } from "@/components/LoadingContent";
import { toastError, toastSuccess } from "@/components/Toast";
import { MutedText } from "@/components/Typography";
import { Card, CardContent } from "@/components/ui/card";
import { useMessagingChannels } from "@/hooks/useMessagingChannels";
import { useSettingsDialog } from "@/hooks/useSettingsDialog";
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
  slackDestinationHint,
  directMessageHint,
  email,
  connectSlackCta,
}: {
  title: string;
  description: string;
  purpose: MessagingFeatureRoutePurpose;
  slackDestinationHint: string;
  directMessageHint: string;
  email?: EmailDeliveryProps;
  connectSlackCta: string;
}) {
  const { emailAccountId } = useAccount();
  const { openSettings } = useSettingsDialog();
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
              <div className="flex-1 text-sm font-medium">
                <Trans>Email</Trans>
              </div>
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
                slackDestinationHint={slackDestinationHint}
                directMessageHint={directMessageHint}
                onUpdate={mutateChannels}
              />
            ))}
          </LoadingContent>

          {!isLoadingChannels && !hasSlack && slackAvailable && (
            <MutedText className="text-xs">
              {connectSlackCta}{" "}
              <button
                type="button"
                onClick={openSettings}
                className="text-foreground underline"
              >
                <Trans>Connect Slack in Settings</Trans>
              </button>
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
  slackDestinationHint,
  directMessageHint,
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
  slackDestinationHint: string;
  directMessageHint: string;
  onUpdate: () => void;
}) {
  const { t } = useLingui();
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
        toastSuccess({ description: t`Settings saved` });
        onUpdate();
      },
      onError: (error) => {
        toastError({
          description: getActionErrorMessage(
            error.error,
            t`An unknown error occurred`,
          ),
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
              placeholder={t`Select destination`}
              className="h-8 w-48 text-xs"
            />
            <MutedText className="text-xs">{slackDestinationHint}</MutedText>
          </div>
        ) : (
          <div className="space-y-1">
            <span className="text-sm font-medium">{config.name}</span>
            <MutedText className="text-xs">{directMessageHint}</MutedText>
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
