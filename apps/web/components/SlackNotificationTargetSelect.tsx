"use client";

import { useState } from "react";
import { LockIcon, MessageSquareIcon } from "lucide-react";
import { useAction } from "next-safe-action/hooks";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { toastError, toastSuccess } from "@/components/Toast";
import { env } from "@/env";
import { useChannelTargets } from "@/hooks/useMessagingChannels";
import type { MessagingRoutePurpose } from "@/generated/prisma/enums";
import { updateSlackRouteAction } from "@/utils/actions/messaging-channels";
import { getActionErrorMessage } from "@/utils/error";

export function SlackNotificationTargetSelect({
  emailAccountId,
  messagingChannelId,
  purpose,
  targetId,
  targetLabel,
  isDm,
  canSendAsDm,
  onUpdate,
  placeholder = "Select channel",
  className = "h-8 w-[180px]",
}: {
  emailAccountId: string;
  messagingChannelId: string;
  purpose: MessagingRoutePurpose;
  targetId: string | null;
  targetLabel: string | null;
  isDm: boolean;
  canSendAsDm: boolean;
  onUpdate: () => void;
  placeholder?: string;
  className?: string;
}) {
  const [loadTargets, setLoadTargets] = useState(false);
  const {
    data: targetsData,
    isLoading,
    error,
    mutate: mutateTargets,
  } = useChannelTargets(
    loadTargets ? messagingChannelId : null,
    emailAccountId,
  );

  const privateTargets = targetsData?.targets ?? [];
  const hasError = Boolean(error || targetsData?.error);

  const { execute, status } = useAction(
    updateSlackRouteAction.bind(null, emailAccountId),
    {
      onSuccess: () => {
        toastSuccess({ description: "Destination updated" });
        onUpdate();
      },
      onError: (actionError) => {
        toastError({
          description:
            getActionErrorMessage(actionError.error) ??
            "Failed to update destination",
        });
      },
    },
  );

  return (
    <Select
      value={isDm ? "dm" : (targetId ?? "")}
      onValueChange={(value) => {
        execute({
          channelId: messagingChannelId,
          purpose,
          targetId: value === "dm" ? "dm" : value,
        });
      }}
      disabled={isLoading || status === "executing"}
      onOpenChange={(open) => {
        if (open) setLoadTargets(true);
      }}
    >
      <SelectTrigger className={className}>
        <SelectValue
          placeholder={
            isLoading ? "Loading..." : hasError ? "Failed to load" : placeholder
          }
        >
          {targetLabel ?? undefined}
        </SelectValue>
      </SelectTrigger>
      <SelectContent>
        {canSendAsDm && (
          <SelectItem value="dm">
            <MessageSquareIcon className="mr-1 inline h-3 w-3" />
            Direct message
          </SelectItem>
        )}
        {privateTargets.map((target) => (
          <SelectItem key={target.id} value={target.id}>
            <LockIcon className="mr-1 inline h-3 w-3" />
            {target.name}
          </SelectItem>
        ))}
        {!isLoading && !hasError && (
          <div className="border-t px-2 py-1.5 text-xs text-muted-foreground">
            <div>
              {privateTargets.length === 0
                ? "No channels found."
                : "Don't see your channel?"}
            </div>
            <div>
              Invite the bot with{" "}
              <code className="rounded bg-muted px-1">
                /invite @{env.NEXT_PUBLIC_SLACK_BOT_NAME}
              </code>
            </div>
          </div>
        )}
        {hasError && (
          <div className="px-2 py-1.5 text-xs text-muted-foreground">
            Failed to load channels.{" "}
            <button
              type="button"
              className="underline underline-offset-4"
              onClick={() => mutateTargets()}
            >
              Retry
            </button>
          </div>
        )}
      </SelectContent>
    </Select>
  );
}
