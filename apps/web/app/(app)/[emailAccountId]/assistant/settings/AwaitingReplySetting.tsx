"use client";

import { useCallback } from "react";
import { Toggle } from "@/components/Toggle";
import { updateAwaitingReplyTrackingAction } from "@/utils/actions/settings";
import { toastError, toastSuccess } from "@/components/Toast";
import { useEmailAccountFull } from "@/hooks/useEmailAccountFull";
import { LoadingContent } from "@/components/LoadingContent";
import { Skeleton } from "@/components/ui/skeleton";
import { SettingCard } from "@/components/SettingCard";
import { AWAITING_REPLY_LABEL_NAME } from "@/utils/reply-tracker/consts";

export function AwaitingReplySetting() {
  const {
    data: emailAccountData,
    isLoading,
    error,
    mutate,
  } = useEmailAccountFull();
  const enabled = emailAccountData?.outboundReplyTracking ?? false;

  const handleToggle = useCallback(
    async (enable: boolean) => {
      if (!emailAccountData) return null;

      // Optimistically update the UI
      mutate(
        emailAccountData
          ? { ...emailAccountData, outboundReplyTracking: enable }
          : undefined,
        false,
      );

      try {
        await updateAwaitingReplyTrackingAction(emailAccountData.id, {
          enabled: enable,
        });
        toastSuccess({
          description: `Awaiting reply labels ${enable ? "enabled" : "disabled"}`,
        });
        mutate();
      } catch (error) {
        // Revert optimistic update on error
        mutate();
        toastError({
          description: `Failed to update awaiting reply labels: ${
            error instanceof Error ? error.message : "Unknown error"
          }`,
        });
      }
    },
    [emailAccountData, mutate],
  );

  return (
    <SettingCard
      title="Label awaiting reply"
      description={`Our AI detects when your sent emails need a response and labels them '${AWAITING_REPLY_LABEL_NAME}'.`}
      right={
        <LoadingContent
          loading={isLoading}
          error={error}
          loadingComponent={<Skeleton className="h-8 w-32" />}
        >
          <Toggle
            name="outbound-reply-tracking"
            enabled={enabled}
            onChange={handleToggle}
          />
        </LoadingContent>
      }
    />
  );
}
