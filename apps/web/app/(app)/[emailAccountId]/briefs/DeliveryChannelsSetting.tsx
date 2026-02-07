"use client";

import { useState } from "react";
import { MailIcon, HashIcon, XIcon, MessageSquareIcon } from "lucide-react";
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
import { Button } from "@/components/ui/button";
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
  disconnectChannelAction,
} from "@/utils/actions/messaging-channels";
import { getActionErrorMessage } from "@/utils/error";
import type { GetSlackAuthUrlResponse } from "@/app/api/slack/auth-url/route";
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
  const [connectingSlack, setConnectingSlack] = useState(false);

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
        {/* Email row */}
        <div className="flex items-center gap-3">
          <MailIcon className="h-5 w-5 text-muted-foreground" />
          <div className="flex-1">
            <div className="font-medium text-sm">Email</div>
            <MutedText>Receive briefings in your inbox</MutedText>
          </div>
          <Toggle
            name="emailDelivery"
            enabled={briefSettings?.meetingBriefsSendEmail ?? true}
            onChange={(sendEmail) => executeEmailDelivery({ sendEmail })}
          />
        </div>

        {/* Connected messaging channels */}
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

        {/* Connect Slack button */}
        {!hasSlack && (
          <div className="pt-2">
            <Button
              variant="outline"
              size="sm"
              disabled={connectingSlack}
              onClick={async () => {
                setConnectingSlack(true);
                try {
                  const res = await fetch(
                    `/api/slack/auth-url?emailAccountId=${emailAccountId}`,
                  );
                  const data: GetSlackAuthUrlResponse = await res.json();
                  if (data.url) {
                    window.location.href = data.url;
                  }
                } catch {
                  toastError({ description: "Failed to connect Slack" });
                  setConnectingSlack(false);
                }
              }}
            >
              <MessageSquareIcon className="mr-2 h-4 w-4" />
              {connectingSlack ? "Connecting..." : "Connect Slack"}
            </Button>
            <MutedText className="mt-1 text-xs">
              Chat with your assistant via DMs or @mentions after connecting
            </MutedText>
          </div>
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
    teamName: string | null;
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

  const { execute: executeDisconnect, status: disconnectStatus } = useAction(
    disconnectChannelAction.bind(null, emailAccountId),
    {
      onSuccess: () => {
        toastSuccess({ description: "Channel disconnected" });
        onUpdate();
      },
      onError: (error) => {
        toastError({
          description:
            getActionErrorMessage(error.error) ?? "Failed to disconnect",
        });
      },
    },
  );

  return (
    <div className="flex items-center gap-3">
      <Icon className="h-5 w-5 text-muted-foreground" />
      <div className="flex-1">
        <div className="font-medium text-sm">
          {config?.name ?? channel.provider}
          {channel.teamName && (
            <span className="text-muted-foreground font-normal">
              {" "}
              &middot; {channel.teamName}
            </span>
          )}
        </div>

        {!channel.channelId || selectingTarget ? (
          <div className="mt-1">
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
          <MutedText>
            Posting to {config?.targetPrefix}
            {channel.channelName}
          </MutedText>
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

      <Button
        variant="ghost"
        size="icon"
        className="h-8 w-8"
        disabled={disconnectStatus === "executing"}
        onClick={() => executeDisconnect({ channelId: channel.id })}
      >
        <XIcon className="h-4 w-4" />
      </Button>
    </div>
  );
}
