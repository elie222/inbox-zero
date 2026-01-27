"use client";

import { useState, useCallback } from "react";
import { Toggle } from "@/components/Toggle";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { toastSuccess, toastError } from "@/components/Toast";
import {
  useSlackConnection,
  useSlackChannels,
} from "@/hooks/useSlackConnection";
import { useMeetingBriefSettings } from "@/hooks/useMeetingBriefs";
import { useAction } from "next-safe-action/hooks";
import {
  updateMeetingBriefsDeliveryAction,
  updateSlackChannelAction,
  disconnectSlackAction,
} from "@/utils/actions/slack";
import { useAccount } from "@/providers/EmailAccountProvider";
import { getActionErrorMessage } from "@/utils/error";
import type { GetSlackAuthUrlResponse } from "@/app/api/slack/auth-url/route";
import { MutedText } from "@/components/Typography";
import { Card, CardContent } from "@/components/ui/card";
import { Loader2Icon, SlackIcon, MailIcon, XIcon } from "lucide-react";

export function DeliveryChannelsSetting() {
  const { emailAccountId } = useAccount();
  const { data: settings, mutate: mutateSettings } = useMeetingBriefSettings();
  const { data: slackData, mutate: mutateSlack } = useSlackConnection();
  const [isConnecting, setIsConnecting] = useState(false);

  const hasSlackConnected =
    slackData?.connection?.isConnected && slackData?.connection?.channelId;

  const { execute: updateDelivery, status: deliveryStatus } = useAction(
    updateMeetingBriefsDeliveryAction.bind(null, emailAccountId),
    {
      onSuccess: () => {
        toastSuccess({ description: "Delivery settings saved!" });
        mutateSettings();
      },
      onError: (error) => {
        toastError({
          description: getActionErrorMessage(error.error, {
            prefix: "Failed to save",
          }),
        });
      },
    },
  );

  const connectSlack = useCallback(async () => {
    setIsConnecting(true);
    try {
      const response = await fetch("/api/slack/auth-url");
      if (!response.ok) {
        throw new Error("Failed to get Slack auth URL");
      }
      const data: GetSlackAuthUrlResponse = await response.json();
      window.location.href = data.url;
    } catch {
      toastError({ description: "Failed to connect Slack" });
      setIsConnecting(false);
    }
  }, []);

  const handleEmailToggle = useCallback(
    (enabled: boolean) => {
      updateDelivery({
        sendEmail: enabled,
        sendSlack: settings?.sendSlack ?? false,
      });
    },
    [updateDelivery, settings?.sendSlack],
  );

  const handleSlackToggle = useCallback(
    (enabled: boolean) => {
      updateDelivery({
        sendEmail: settings?.sendEmail ?? true,
        sendSlack: enabled,
      });
    },
    [updateDelivery, settings?.sendEmail],
  );

  return (
    <Card>
      <CardContent className="p-4 space-y-4">
        <div>
          <h3 className="font-medium">Delivery Channels</h3>
          <MutedText>Choose how to receive your meeting briefings</MutedText>
        </div>

        <div className="space-y-3">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <MailIcon className="h-4 w-4 text-muted-foreground" />
              <div>
                <span className="text-sm font-medium">Email</span>
                <p className="text-xs text-muted-foreground">
                  Receive briefings in your inbox
                </p>
              </div>
            </div>
            <Toggle
              name="sendEmail"
              enabled={settings?.sendEmail ?? true}
              onChange={handleEmailToggle}
              disabled={deliveryStatus === "executing"}
            />
          </div>

          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <SlackIcon className="h-4 w-4 text-muted-foreground" />
              <div>
                <span className="text-sm font-medium">Slack</span>
                <p className="text-xs text-muted-foreground">
                  {hasSlackConnected
                    ? `Posting to #${slackData?.connection?.channelName}`
                    : slackData?.connection?.isConnected
                      ? "Select a channel"
                      : "Connect Slack to enable"}
                </p>
              </div>
            </div>
            {hasSlackConnected ? (
              <Toggle
                name="sendSlack"
                enabled={settings?.sendSlack ?? false}
                onChange={handleSlackToggle}
                disabled={deliveryStatus === "executing"}
              />
            ) : slackData?.connection?.isConnected ? (
              <ChannelSelector
                connectionId={slackData.connection.id}
                onSelected={() => {
                  mutateSlack();
                  mutateSettings();
                }}
              />
            ) : (
              <Button
                variant="outline"
                size="sm"
                onClick={connectSlack}
                disabled={isConnecting}
              >
                {isConnecting ? (
                  <Loader2Icon className="h-4 w-4 animate-spin mr-2" />
                ) : (
                  <SlackIcon className="h-4 w-4 mr-2" />
                )}
                Connect
              </Button>
            )}
          </div>

          {slackData?.connection?.isConnected && (
            <DisconnectSlack
              connectionId={slackData.connection.id}
              onDisconnected={() => {
                mutateSlack();
                mutateSettings();
              }}
            />
          )}
        </div>
      </CardContent>
    </Card>
  );
}

function ChannelSelector({
  connectionId,
  onSelected,
}: {
  connectionId: string;
  onSelected: () => void;
}) {
  const { emailAccountId } = useAccount();
  const { data, isLoading } = useSlackChannels();
  const [selectedChannel, setSelectedChannel] = useState<string>("");

  const { execute, status } = useAction(
    updateSlackChannelAction.bind(null, emailAccountId),
    {
      onSuccess: () => {
        toastSuccess({ description: "Channel selected!" });
        onSelected();
      },
      onError: (error) => {
        toastError({
          description: getActionErrorMessage(error.error, {
            prefix: "Failed to select channel",
          }),
        });
      },
    },
  );

  const handleChannelSelect = useCallback(
    (channelId: string) => {
      const channel = data?.channels.find((c) => c.id === channelId);
      if (channel) {
        setSelectedChannel(channelId);
        execute({
          connectionId,
          channelId: channel.id,
          channelName: channel.name,
        });
      }
    },
    [data?.channels, connectionId, execute],
  );

  if (isLoading) {
    return <Loader2Icon className="h-4 w-4 animate-spin" />;
  }

  return (
    <Select
      value={selectedChannel}
      onValueChange={handleChannelSelect}
      disabled={status === "executing"}
    >
      <SelectTrigger className="w-[180px]">
        <SelectValue placeholder="Select channel" />
      </SelectTrigger>
      <SelectContent>
        {data?.channels.map((channel) => (
          <SelectItem key={channel.id} value={channel.id}>
            #{channel.name}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}

function DisconnectSlack({
  connectionId,
  onDisconnected,
}: {
  connectionId: string;
  onDisconnected: () => void;
}) {
  const { emailAccountId } = useAccount();

  const { execute, status } = useAction(
    disconnectSlackAction.bind(null, emailAccountId),
    {
      onSuccess: () => {
        toastSuccess({ description: "Slack disconnected" });
        onDisconnected();
      },
      onError: (error) => {
        toastError({
          description: getActionErrorMessage(error.error, {
            prefix: "Failed to disconnect",
          }),
        });
      },
    },
  );

  return (
    <Button
      variant="ghost"
      size="sm"
      onClick={() => execute({ connectionId })}
      disabled={status === "executing"}
      className="text-muted-foreground hover:text-destructive"
    >
      <XIcon className="h-3 w-3 mr-1" />
      Disconnect Slack
    </Button>
  );
}
