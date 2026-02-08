"use client";

import { useState } from "react";
import Link from "next/link";
import { MailIcon, HashIcon, MessageSquareIcon } from "lucide-react";
import { useAction } from "next-safe-action/hooks";
import { Card, CardContent } from "@/components/ui/card";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Toggle } from "@/components/Toggle";
import { toastSuccess, toastError } from "@/components/Toast";
import { LoadingContent } from "@/components/LoadingContent";
import { MutedText } from "@/components/Typography";
import { useAccount } from "@/providers/EmailAccountProvider";
import { useMeetingBriefSettings } from "@/hooks/useMeetingBriefs";
import {
  useMessagingChannels,
  useChannelTargets,
} from "@/hooks/useMessagingChannels";
import {
  updateSlackChannelAction,
  updateChannelFeaturesAction,
  updateEmailDeliveryAction,
} from "@/utils/actions/messaging-channels";
import { getActionErrorMessage } from "@/utils/error";
import { prefixPath } from "@/utils/path";
import type { MessagingProvider } from "@/generated/prisma/enums";

const PROVIDER_CONFIG: Record<
  MessagingProvider,
  {
    name: string;
    icon: typeof MessageSquareIcon;
    targetPrefix: string;
  }
> = {
  SLACK: { name: "Slack", icon: HashIcon, targetPrefix: "#" },
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
    channelsData?.channels.filter((c) => c.isConnected) ?? [];

  const hasSlack = connectedChannels.some((c) => c.provider === "SLACK");

  return (
    <Card>
      <CardContent className="p-4 space-y-4">
        <div>
          <h3 className="font-medium">Delivery Channels</h3>
          <MutedText>Choose where to receive meeting briefings</MutedText>
        </div>

        <div className="space-y-3">
          <div className="flex items-center gap-3">
            <MailIcon className="h-5 w-5 text-muted-foreground" />
            <div className="flex-1 font-medium text-sm">Email</div>
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

          {!isLoadingChannels && !hasSlack && (
            <MutedText className="text-xs">
              Want to receive briefs in Slack?{" "}
              <Link
                href={prefixPath(emailAccountId, "/settings?tab=email")}
                className="underline text-foreground"
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
    channelId: string | null;
    channelName: string | null;
    sendMeetingBriefs: boolean;
  };
  emailAccountId: string;
  onUpdate: () => void;
}) {
  const config = PROVIDER_CONFIG[channel.provider];
  const Icon = config?.icon ?? MessageSquareIcon;
  const [selectingTarget, setSelectingTarget] = useState(!channel.channelId);

  const {
    data: targetsData,
    isLoading: isLoadingTargets,
    error: targetsError,
  } = useChannelTargets(selectingTarget ? channel.id : null);

  const { execute: executeTarget } = useAction(
    updateSlackChannelAction.bind(null, emailAccountId),
    {
      onSuccess: () => {
        toastSuccess({ description: "Slack channel updated" });
        setSelectingTarget(false);
        onUpdate();
      },
      onError: (error) => {
        toastError({
          description: getActionErrorMessage(error.error) ?? "Failed to update",
        });
      },
    },
  );

  const { execute: executeFeatures } = useAction(
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
      <div className="flex-1">
        {!channel.channelId || selectingTarget ? (
          <div className="flex items-center gap-2">
            <span className="font-medium text-sm">
              {config?.name ?? channel.provider}
            </span>
            <Select
              onValueChange={(value) => {
                const target = targetsData?.targets.find((t) => t.id === value);
                if (target) {
                  executeTarget({
                    channelId: channel.id,
                    targetId: target.id,
                    targetName: target.name,
                  });
                }
              }}
              disabled={isLoadingTargets || !!targetsError}
            >
              <SelectTrigger className="h-8 w-48 text-xs">
                <SelectValue
                  placeholder={
                    targetsError
                      ? "Failed to load channels"
                      : isLoadingTargets
                        ? "Loading channels..."
                        : "Select channel"
                  }
                />
              </SelectTrigger>
              <SelectContent>
                {targetsData?.targets.map((target) => (
                  <SelectItem key={target.id} value={target.id}>
                    {config?.targetPrefix}
                    {target.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        ) : (
          <button
            type="button"
            className="font-medium text-sm text-left hover:underline"
            onClick={() => setSelectingTarget(true)}
            title="Change channel"
          >
            {config?.name ?? channel.provider}{" "}
            <span className="text-muted-foreground font-normal">
              &middot; {config?.targetPrefix}
              {channel.channelName}
            </span>
          </button>
        )}
      </div>

      {channel.channelId && !selectingTarget && (
        <Toggle
          name={`briefs-${channel.id}`}
          enabled={channel.sendMeetingBriefs}
          onChange={(sendMeetingBriefs) =>
            executeFeatures({
              channelId: channel.id,
              sendMeetingBriefs,
            })
          }
        />
      )}
    </div>
  );
}
