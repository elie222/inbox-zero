"use client";

import { useCallback, useMemo } from "react";
import { Toggle } from "@/components/Toggle";
import {
  updateAwaitingReplyTrackingAction,
  toggleToReplyTrackingAction,
} from "@/utils/actions/settings";
import { toastError, toastSuccess } from "@/components/Toast";
import { useEmailAccountFull } from "@/hooks/useEmailAccountFull";
import { useRules } from "@/hooks/useRules";
import { LoadingContent } from "@/components/LoadingContent";
import { Skeleton } from "@/components/ui/skeleton";
import { SettingCard } from "@/components/SettingCard";
import {
  AWAITING_REPLY_LABEL_NAME,
  NEEDS_REPLY_LABEL_NAME,
} from "@/utils/reply-tracker/consts";

export function AwaitingReplySetting() {
  const {
    data: emailAccountData,
    isLoading,
    error,
    mutate,
  } = useEmailAccountFull();
  const { mutate: mutateRules } = useRules();

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

      // Update both outbound tracking and TRACK_THREAD actions
      const [outboundResult, trackThreadResult] = await Promise.allSettled([
        updateAwaitingReplyTrackingAction(emailAccountData.id, {
          enabled: enable,
        }),
        toggleToReplyTrackingAction(emailAccountData.id, { enabled: enable }),
      ]);

      // Check for errors
      if (outboundResult.status === "rejected") {
        mutate(); // Revert optimistic update
        toastError({
          description: `Failed to update outbound tracking: ${outboundResult.reason}`,
        });
        return;
      }

      if (outboundResult.value?.serverError) {
        mutate(); // Revert optimistic update
        toastError({ description: outboundResult.value.serverError });
        return;
      }

      if (trackThreadResult.status === "rejected") {
        toastError({
          description: `Failed to update thread tracking: ${trackThreadResult.reason}`,
        });
        // Don't return - outbound tracking still worked
      }

      if (
        trackThreadResult.status === "fulfilled" &&
        trackThreadResult.value?.serverError
      ) {
        toastError({ description: trackThreadResult.value.serverError });
        // Don't return - outbound tracking still worked
      }

      toastSuccess({
        description: `Reply tracking ${enable ? "enabled" : "disabled"}`,
      });

      await Promise.allSettled([mutate(), mutateRules()]);
    },
    [emailAccountData, mutate, mutateRules],
  );

  return (
    <SettingCard
      title={`Label "${AWAITING_REPLY_LABEL_NAME}"`}
      description={`Adds '${AWAITING_REPLY_LABEL_NAME}' label to sent emails needing responses. Removes '${NEEDS_REPLY_LABEL_NAME}' when you reply and '${AWAITING_REPLY_LABEL_NAME}' when they reply.`}
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
