"use client";

import { useState } from "react";
import Link from "next/link";
import { MailIcon, HashIcon, MessageSquareIcon } from "lucide-react";
import { useAction } from "next-safe-action/hooks";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
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
  updateChannelTargetAction,
  updateChannelFeaturesAction,
  updateEmailDeliveryAction,
} from "@/utils/actions/messaging-channels";
import { getActionErrorMessage } from "@/utils/error";
import { prefixPath } from "@/utils/path";
import type { MessagingProvider } from "@/generated/prisma/enums";

const PROVIDER_CONFIG: Record<
  string,
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
  const { data: briefSettings, mutate: mutateBriefSettings } =
    useMeetingBriefSettings();
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
        toastSuccess({ description: "Email delivery updated" });
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
      <CardHeader className="pb-3">
        <CardTitle className="text-base">Delivery Channels</CardTitle>
        <MutedText>Choose where to receive meeting briefings</MutedText>
      </CardHeader>
      <CardContent className="space-y-3">
        <div className="flex items-center gap-3">
          <MailIcon className="h-5 w-5 text-muted-foreground" />
          <div className="flex-1 font-medium text-sm">Email</div>
          <Toggle
            name="emailDelivery"
            enabled={briefSettings?.meetingBriefsSendEmail ?? true}
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

        {!hasSlack && (
          <MutedText className="pt-2 text-xs">
            Want to receive briefs in Slack?{" "}
            <Link
              href={prefixPath(emailAccountId, "/settings?tab=email")}
              className="underline text-foreground"
            >
              Connect Slack in Settings
            </Link>
          </MutedText>
        )}
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

  const { data: targetsData, isLoading: isLoadingTargets } = useChannelTargets(
    selectingTarget ? channel.id : null,
  );

  const { execute: executeTarget } = useAction(
    updateChannelTargetAction.bind(null, emailAccountId),
    {
      onSuccess: () => {
        toastSuccess({ description: "Channel target updated" });
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
        toastSuccess({ description: "Settings updated" });
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
              disabled={isLoadingTargets}
            >
              <SelectTrigger className="h-8 w-48 text-xs">
                <SelectValue
                  placeholder={
                    isLoadingTargets ? "Loading channels..." : "Select channel"
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
          <div className="font-medium text-sm">
            {config?.name ?? channel.provider}{" "}
            <span className="text-muted-foreground font-normal">
              &middot; {config?.targetPrefix}
              {channel.channelName}
            </span>
          </div>
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
