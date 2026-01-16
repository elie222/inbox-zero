"use client";

import { useState } from "react";
import { useAction } from "next-safe-action/hooks";
import { SettingCard } from "@/components/SettingCard";
import { Toggle } from "@/components/Toggle";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { toastSuccess, toastError } from "@/components/Toast";
import { useAccount } from "@/providers/EmailAccountProvider";
import {
  upsertNotificationChannelAction,
  toggleNotificationChannelAction,
  deleteNotificationChannelAction,
} from "@/utils/actions/meeting-briefs";
import {
  MessageSquareIcon,
  ExternalLinkIcon,
  PlusIcon,
  TrashIcon,
} from "lucide-react";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

type ChannelType = "slack" | "teams" | "telegram" | "discord";

type NotificationChannel = {
  id: string;
  channelType: string;
  config: Record<string, unknown>;
  enabled: boolean;
};

type AvailableChannelType = {
  type: string;
  name: string;
};

type NotificationChannelsSettingProps = {
  channels: NotificationChannel[];
  isPipedreamConfigured: boolean;
  availableChannelTypes: AvailableChannelType[];
  onSaved: () => void;
};

const CHANNEL_CONFIG_FIELDS: Record<
  ChannelType,
  { key: string; label: string; placeholder: string; helpText: string }[]
> = {
  slack: [
    {
      key: "channel",
      label: "Channel ID",
      placeholder: "C01234567 or #channel",
      helpText:
        'Find your channel ID by right-clicking on the channel in Slack and selecting "Copy link". The ID is the last part of the URL.',
    },
  ],
  teams: [
    {
      key: "teamId",
      label: "Team ID",
      placeholder: "Team ID",
      helpText: "Your Microsoft Teams team ID",
    },
    {
      key: "channelId",
      label: "Channel ID",
      placeholder: "Channel ID",
      helpText: "Your Microsoft Teams channel ID",
    },
  ],
  telegram: [
    {
      key: "chatId",
      label: "Chat ID",
      placeholder: "-1001234567890",
      helpText: "Your Telegram chat or group ID",
    },
  ],
  discord: [
    {
      key: "channelId",
      label: "Channel ID",
      placeholder: "123456789012345678",
      helpText:
        'Right-click the channel in Discord and select "Copy Channel ID" (requires Developer Mode)',
    },
  ],
};

export function NotificationChannelsSetting({
  channels,
  isPipedreamConfigured,
  availableChannelTypes,
  onSaved,
}: NotificationChannelsSettingProps) {
  const { emailAccountId } = useAccount();
  const [showAddChannel, setShowAddChannel] = useState(false);
  const [newChannelType, setNewChannelType] = useState<ChannelType | "">("");
  const [newChannelConfig, setNewChannelConfig] = useState<
    Record<string, string>
  >({});

  const { execute: executeUpsert, status: upsertStatus } = useAction(
    upsertNotificationChannelAction.bind(null, emailAccountId),
    {
      onSuccess: () => {
        toastSuccess({ description: "Notification channel saved!" });
        setShowAddChannel(false);
        setNewChannelType("");
        setNewChannelConfig({});
        onSaved();
      },
      onError: (error) => {
        toastError({
          description:
            error.error.serverError ?? "Failed to save notification channel",
        });
      },
    },
  );

  const { execute: executeToggle, status: toggleStatus } = useAction(
    toggleNotificationChannelAction.bind(null, emailAccountId),
    {
      onSuccess: () => {
        toastSuccess({ description: "Channel updated!" });
        onSaved();
      },
      onError: () => {
        toastError({ description: "Failed to update channel" });
      },
    },
  );

  const { execute: executeDelete, status: deleteStatus } = useAction(
    deleteNotificationChannelAction.bind(null, emailAccountId),
    {
      onSuccess: () => {
        toastSuccess({ description: "Channel removed!" });
        onSaved();
      },
      onError: () => {
        toastError({ description: "Failed to remove channel" });
      },
    },
  );

  if (!isPipedreamConfigured) {
    return (
      <SettingCard
        title="Notification Channels"
        description="Send meeting briefs to Slack, Teams, Telegram, or Discord"
        right={
          <a
            href={`/${emailAccountId}/integrations`}
            className="flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground"
          >
            Connect Pipedream
            <ExternalLinkIcon className="h-4 w-4" />
          </a>
        }
      >
        <div className="text-sm text-muted-foreground mt-2">
          <p>
            To send meeting briefs to messaging platforms, first configure{" "}
            <a
              href={`/${emailAccountId}/integrations`}
              className="text-primary hover:underline"
            >
              Pipedream Connect
            </a>{" "}
            in your environment settings.
          </p>
        </div>
      </SettingCard>
    );
  }

  const configuredChannelTypes = new Set(channels.map((c) => c.channelType));
  const availableToAdd = availableChannelTypes.filter(
    (ct) => !configuredChannelTypes.has(ct.type),
  );

  const handleAddChannel = () => {
    if (!newChannelType) return;

    executeUpsert({
      channelType: newChannelType,
      config: newChannelConfig,
      enabled: true,
    });
  };

  return (
    <div className="space-y-2">
      <SettingCard
        title="Notification Channels"
        description="Send meeting briefs to messaging platforms"
        right={
          availableToAdd.length > 0 && (
            <Button
              variant="outline"
              size="sm"
              onClick={() => setShowAddChannel(!showAddChannel)}
            >
              <PlusIcon className="h-4 w-4 mr-1" />
              Add Channel
            </Button>
          )
        }
      />

      {showAddChannel && availableToAdd.length > 0 && (
        <SettingCard
          title="Add Notification Channel"
          description="Choose a platform to receive meeting briefs"
        >
          <div className="mt-3 space-y-4">
            <div>
              <span className="text-sm font-medium mb-2 block">Platform</span>
              <Select
                value={newChannelType}
                onValueChange={(value: ChannelType) => {
                  setNewChannelType(value);
                  setNewChannelConfig({});
                }}
              >
                <SelectTrigger className="w-full">
                  <SelectValue placeholder="Select a platform" />
                </SelectTrigger>
                <SelectContent>
                  {availableToAdd.map((ct) => (
                    <SelectItem key={ct.type} value={ct.type}>
                      {ct.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            {newChannelType && CHANNEL_CONFIG_FIELDS[newChannelType] && (
              <>
                {CHANNEL_CONFIG_FIELDS[newChannelType].map((field) => (
                  <div key={field.key}>
                    <span className="text-sm font-medium mb-2 block">
                      {field.label}
                    </span>
                    <Input
                      value={newChannelConfig[field.key] || ""}
                      onChange={(e) =>
                        setNewChannelConfig((prev) => ({
                          ...prev,
                          [field.key]: e.target.value,
                        }))
                      }
                      placeholder={field.placeholder}
                    />
                    <p className="text-xs text-muted-foreground mt-1">
                      {field.helpText}
                    </p>
                  </div>
                ))}

                <div className="flex justify-end gap-2">
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => {
                      setShowAddChannel(false);
                      setNewChannelType("");
                      setNewChannelConfig({});
                    }}
                  >
                    Cancel
                  </Button>
                  <Button
                    size="sm"
                    onClick={handleAddChannel}
                    disabled={
                      upsertStatus === "executing" ||
                      !newChannelType ||
                      !CHANNEL_CONFIG_FIELDS[newChannelType]?.every((field) =>
                        newChannelConfig[field.key]?.trim(),
                      )
                    }
                  >
                    Add Channel
                  </Button>
                </div>
              </>
            )}
          </div>
        </SettingCard>
      )}

      {channels.map((channel) => {
        const channelTypeInfo = availableChannelTypes.find(
          (ct) => ct.type === channel.channelType,
        );
        const configFields =
          CHANNEL_CONFIG_FIELDS[channel.channelType as ChannelType] || [];

        return (
          <SettingCard
            key={channel.id}
            title={channelTypeInfo?.name || channel.channelType}
            description={configFields
              .map(
                (f) =>
                  `${f.label}: ${(channel.config[f.key] as string) || "Not set"}`,
              )
              .join(" | ")}
            right={
              <div className="flex items-center gap-2">
                <Toggle
                  name={`channel-${channel.id}`}
                  enabled={channel.enabled}
                  onChange={(enabled) =>
                    executeToggle({
                      channelType: channel.channelType as ChannelType,
                      enabled,
                    })
                  }
                  disabled={toggleStatus === "executing"}
                />
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() =>
                    executeDelete({
                      channelType: channel.channelType as ChannelType,
                    })
                  }
                  disabled={deleteStatus === "executing"}
                >
                  <TrashIcon className="h-4 w-4 text-destructive" />
                </Button>
              </div>
            }
          >
            <div className="text-xs text-muted-foreground mt-2 flex items-start gap-2">
              <MessageSquareIcon className="h-4 w-4 mt-0.5 shrink-0" />
              <span>
                Meeting briefs will be sent to this channel{" "}
                {channel.enabled ? "automatically" : "when enabled"}.
              </span>
            </div>
          </SettingCard>
        );
      })}

      {channels.length === 0 && !showAddChannel && (
        <div className="text-sm text-muted-foreground p-4 text-center border rounded-lg">
          No notification channels configured. Click &quot;Add Channel&quot; to
          set up Slack, Teams, Telegram, or Discord notifications.
        </div>
      )}
    </div>
  );
}
