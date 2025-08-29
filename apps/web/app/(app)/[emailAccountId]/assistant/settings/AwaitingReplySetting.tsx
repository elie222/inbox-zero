"use client";

import { useCallback } from "react";
import { Toggle } from "@/components/Toggle";
import { updateReplyTrackingAction } from "@/utils/actions/settings";
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
import { useAccount } from "@/providers/EmailAccountProvider";
import { getEmailTerminology } from "@/utils/terminology";

export function AwaitingReplySetting() {
  const { provider, isLoading: accountLoading } = useAccount();
  const {
    data: emailAccountData,
    isLoading,
    error,
    mutate,
  } = useEmailAccountFull();
  const { mutate: mutateRules } = useRules();

  const enabled = emailAccountData?.outboundReplyTracking ?? false;
  const terminology = getEmailTerminology(provider);

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

      const result = await updateReplyTrackingAction(emailAccountData.id, {
        enabled: enable,
      });

      if (result?.serverError) {
        mutate(); // Revert optimistic update
        toastError({ description: result.serverError });
        return;
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
      title="Reply tracking"
      description={
        accountLoading
          ? "Loading..."
          : `Adds '${AWAITING_REPLY_LABEL_NAME}' ${terminology.label.singular} to sent emails needing responses. Removes '${NEEDS_REPLY_LABEL_NAME}' when you reply and '${AWAITING_REPLY_LABEL_NAME}' when they reply.`
      }
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
