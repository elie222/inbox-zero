"use client";

import { Trans, useLingui } from "@lingui/react/macro";
import { HashIcon, LockIcon, MessageSquareIcon } from "lucide-react";
import { useState } from "react";
import { useAction } from "next-safe-action/hooks";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
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
  value,
  targetId,
  targetLabel,
  isDm,
  canSendAsDm,
  onUpdate,
  onValueChange,
  placeholder,
  className = "h-8 w-[180px] [&>span]:min-w-0 [&>span]:text-left",
  disabled = false,
}: {
  emailAccountId: string;
  messagingChannelId: string;
  purpose: MessagingRoutePurpose;
  value?: string | null;
  targetId: string | null;
  targetLabel: string | null;
  isDm: boolean;
  canSendAsDm: boolean;
  onUpdate: () => void;
  onValueChange?: (value: string) => void;
  placeholder?: string;
  className?: string;
  disabled?: boolean;
}) {
  const { t } = useLingui();
  const [pendingPublicTarget, setPendingPublicTarget] = useState<{
    id: string;
    name: string;
  } | null>(null);
  const {
    data: targetsData,
    isLoading,
    error,
    mutate: mutateTargets,
  } = useChannelTargets(messagingChannelId, emailAccountId);

  const botName = env.NEXT_PUBLIC_SLACK_BOT_NAME;
  const pendingChannelName = pendingPublicTarget?.name ?? "";
  const targets = targetsData?.targets ?? [];
  const hasError = Boolean(error || targetsData?.error);
  const selectedValue = value ?? (isDm ? "dm" : (targetId ?? ""));
  const selectedIsDm = selectedValue === "dm";
  const selectedTargetId =
    selectedValue && selectedValue !== "dm" ? selectedValue : targetId;
  const selectedTargetLabel = getSelectedTargetLabel({
    directMessageLabel: t`Direct message`,
    isDm: selectedIsDm,
    targetId: selectedTargetId,
    targetLabel,
    targets,
    isLoading,
  });

  const { execute, status } = useAction(
    updateSlackRouteAction.bind(null, emailAccountId),
    {
      onSuccess: () => {
        toastSuccess({ description: t`Destination updated` });
        onUpdate();
      },
      onError: (actionError) => {
        toastError({
          description: getActionErrorMessage(
            actionError.error,
            t`Failed to update destination`,
          ),
        });
      },
    },
  );

  const applyValue = (value: string) => {
    if (onValueChange) {
      onValueChange(value);
      return;
    }

    execute({
      channelId: messagingChannelId,
      purpose,
      targetId: value === "dm" ? "dm" : value,
    });
  };

  return (
    <>
      <Select
        value={selectedValue}
        onValueChange={(value) => {
          const publicTarget = targets.find(
            (target) => target.id === value && !target.isPrivate,
          );
          if (publicTarget) {
            setPendingPublicTarget(publicTarget);
            return;
          }

          applyValue(value);
        }}
        disabled={disabled || isLoading || status === "executing"}
      >
        <SelectTrigger className={className}>
          <SelectValue
            placeholder={
              isLoading
                ? t`Loading...`
                : hasError
                  ? t`Failed to load`
                  : (placeholder ?? t`Select channel`)
            }
          >
            {selectedTargetLabel}
          </SelectValue>
        </SelectTrigger>
        <SelectContent>
          {canSendAsDm && (
            <SelectItem value="dm">
              <MessageSquareIcon className="mr-1 inline h-3 w-3" />
              <Trans>Direct message</Trans>
            </SelectItem>
          )}
          {targets.map((target) => (
            <SelectItem key={target.id} value={target.id}>
              {target.isPrivate ? (
                <LockIcon aria-hidden className="mr-1 inline h-3 w-3" />
              ) : (
                <HashIcon aria-hidden className="mr-1 inline h-3 w-3" />
              )}
              {target.name}
              <span className="sr-only">
                {target.isPrivate ? t`(private channel)` : t`(public channel)`}
              </span>
            </SelectItem>
          ))}
          {!isLoading && !hasError && (
            <div className="border-t px-2 py-1.5 text-xs text-muted-foreground">
              <div>
                {targets.length === 0
                  ? t`No channels found.`
                  : t`Don't see your channel?`}
              </div>
              <div>
                <Trans>
                  Invite the bot with{" "}
                  <code className="rounded bg-muted px-1">
                    /invite @{botName}
                  </code>
                </Trans>
              </div>
            </div>
          )}
          {hasError && (
            <div className="px-2 py-1.5 text-xs text-muted-foreground">
              <Trans>
                Failed to load channels.{" "}
                <button
                  type="button"
                  className="underline underline-offset-4"
                  onClick={() => mutateTargets()}
                >
                  Retry
                </button>
              </Trans>
            </div>
          )}
        </SelectContent>
      </Select>
      <AlertDialog
        open={Boolean(pendingPublicTarget)}
        onOpenChange={(open) => {
          if (!open) setPendingPublicTarget(null);
        }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>
              <Trans>Send to a public channel?</Trans>
            </AlertDialogTitle>
            <AlertDialogDescription>
              <Trans>
                Anyone in your Slack workspace can read #{pendingChannelName},
                including the email content in these notifications.
              </Trans>
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>
              <Trans>Cancel</Trans>
            </AlertDialogCancel>
            <AlertDialogAction
              onClick={() => {
                if (pendingPublicTarget) applyValue(pendingPublicTarget.id);
              }}
            >
              <Trans>Use public channel</Trans>
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}

function getSelectedTargetLabel({
  directMessageLabel,
  isDm,
  targetId,
  targetLabel,
  targets,
  isLoading,
}: {
  directMessageLabel: string;
  isDm: boolean;
  targetId: string | null;
  targetLabel: string | null;
  targets: Array<{ id: string; name: string }>;
  isLoading: boolean;
}) {
  if (isDm) return directMessageLabel;
  if (!targetId) return targetLabel;

  const loadedTargetLabel = targets.find(
    (target) => target.id === targetId,
  )?.name;
  if (loadedTargetLabel) return loadedTargetLabel;

  if (isLoading && targetLabel === `#${targetId}`) return null;

  return targetLabel;
}
