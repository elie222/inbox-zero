"use client";

import { useCallback } from "react";
import { useAction } from "next-safe-action/hooks";
import {
  DraftMaterializationMode,
  MessagingProvider,
} from "@/generated/prisma/enums";
import { LoadingContent } from "@/components/LoadingContent";
import { Toggle } from "@/components/Toggle";
import { Card, CardContent } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { toastError, toastSuccess } from "@/components/Toast";
import { useAccount } from "@/providers/EmailAccountProvider";
import { useDraftReviewSettings } from "@/hooks/useDraftReviewSettings";
import { useMessagingChannels } from "@/hooks/useMessagingChannels";
import { saveDraftReviewSettingsAction } from "@/utils/actions/draft-review-settings";

export function DraftReviewDeliverySetting() {
  const { emailAccountId } = useAccount();
  const {
    data,
    mutate,
    isLoading,
    error,
  } = useDraftReviewSettings(emailAccountId);
  const { data: channelsData } = useMessagingChannels(emailAccountId);

  const slackChannels =
    channelsData?.channels.filter(
      (channel) =>
        channel.provider === MessagingProvider.SLACK &&
        channel.isConnected &&
        channel.channelId,
    ) ?? [];

  const { executeAsync, isExecuting } = useAction(
    saveDraftReviewSettingsAction.bind(null, emailAccountId),
  );

  const saveSettings = useCallback(
    async (next: {
      enabled: boolean;
      messagingChannelId: string | null;
      draftMaterializationMode: DraftMaterializationMode;
    }) => {
      try {
        await executeAsync(next);
        await mutate();
        toastSuccess({ description: "Draft review delivery updated" });
      } catch (error) {
        toastError({
          description:
            error instanceof Error
              ? error.message
              : "Failed to update draft review delivery",
        });
      }
    },
    [executeAsync, mutate],
  );

  return (
    <LoadingContent
      loading={isLoading}
      error={error}
      loadingComponent={<Skeleton className="h-28 w-full" />}
    >
      <Card>
        <CardContent className="space-y-4 p-4">
          <div className="flex items-center gap-4">
            <div className="flex-1">
              <h3 className="font-medium">Draft review delivery</h3>
              <p className="text-sm text-muted-foreground">
                Send draft replies to Slack so you can edit, send, or dismiss
                them without opening your inbox.
              </p>
            </div>
            <Toggle
              name="draft-review-delivery"
              enabled={data?.enabled ?? false}
              onChange={(enabled) =>
                saveSettings({
                  enabled,
                  messagingChannelId:
                    data?.messagingChannelId ?? slackChannels[0]?.id ?? null,
                  draftMaterializationMode:
                    data?.draftMaterializationMode ??
                    DraftMaterializationMode.MAILBOX_DRAFT,
                })
              }
              disabled={isExecuting || (!data?.enabled && slackChannels.length === 0)}
            />
          </div>

          <div className="grid gap-4 md:grid-cols-2">
            <div className="space-y-2">
              <Label htmlFor="draft-review-destination">Destination</Label>
              <Select
                value={data?.messagingChannelId ?? undefined}
                disabled={isExecuting || slackChannels.length === 0}
                onValueChange={(messagingChannelId) =>
                  saveSettings({
                    enabled: data?.enabled ?? true,
                    messagingChannelId,
                    draftMaterializationMode:
                      data?.draftMaterializationMode ??
                      DraftMaterializationMode.MAILBOX_DRAFT,
                  })
                }
              >
                <SelectTrigger id="draft-review-destination">
                  <SelectValue
                    placeholder={
                      slackChannels.length === 0
                        ? "Connect Slack first"
                        : "Choose a Slack destination"
                    }
                  />
                </SelectTrigger>
                <SelectContent>
                  {slackChannels.map((channel) => (
                    <SelectItem key={channel.id} value={channel.id}>
                      {channel.isDm
                        ? `${channel.teamName ?? "Slack"} DM`
                        : `${channel.teamName ?? "Slack"} #${channel.channelName ?? "private-channel"}`}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <Label htmlFor="draft-materialization-mode">
                Materialize drafts in
              </Label>
              <Select
                value={
                  data?.draftMaterializationMode ??
                  DraftMaterializationMode.MAILBOX_DRAFT
                }
                disabled={isExecuting}
                onValueChange={(value) =>
                  saveSettings({
                    enabled: data?.enabled ?? false,
                    messagingChannelId:
                      data?.messagingChannelId ?? slackChannels[0]?.id ?? null,
                    draftMaterializationMode:
                      value as DraftMaterializationMode,
                  })
                }
              >
                <SelectTrigger id="draft-materialization-mode">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value={DraftMaterializationMode.MAILBOX_DRAFT}>
                    Inbox draft + Slack
                  </SelectItem>
                  <SelectItem value={DraftMaterializationMode.MESSAGING_ONLY}>
                    Slack only
                  </SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>

          {slackChannels.length === 0 && (
            <p className="text-sm text-muted-foreground">
              Connect Slack and choose a DM or private channel in Connected Apps
              before enabling draft review delivery.
            </p>
          )}
        </CardContent>
      </Card>
    </LoadingContent>
  );
}
