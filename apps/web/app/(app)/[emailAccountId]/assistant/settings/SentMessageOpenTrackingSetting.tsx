"use client";

import { useCallback } from "react";
import { useAction } from "next-safe-action/hooks";
import { Toggle } from "@/components/Toggle";
import { SettingCard } from "@/components/SettingCard";
import { LoadingContent } from "@/components/LoadingContent";
import { Skeleton } from "@/components/ui/skeleton";
import { useEmailAccountFull } from "@/hooks/useEmailAccountFull";
import { useAccount } from "@/providers/EmailAccountProvider";
import { createSettingActionErrorHandler } from "@/utils/actions/error-handling";
import { updateSentMessageOpenTrackingAction } from "@/utils/actions/email-account";

export function SentMessageOpenTrackingSetting() {
  const { data, isLoading, error, mutate } = useEmailAccountFull();
  const { emailAccountId } = useAccount();

  const { execute, isExecuting } = useAction(
    updateSentMessageOpenTrackingAction.bind(null, emailAccountId),
    {
      onSuccess: () => {
        mutate();
      },
      onError: createSettingActionErrorHandler({
        mutate,
        prefix: "Failed to update read status setting",
      }),
    },
  );

  const handleToggle = useCallback(
    (enabled: boolean) => {
      if (!data) return;

      mutate({ ...data, sentMessageOpenTrackingEnabled: enabled }, false);

      execute({ enabled });
    },
    [data, execute, mutate],
  );

  return (
    <SettingCard
      title="Read status"
      description="See when recipients open emails you send from the mail client. Some apps block this, so an unopened status is not a guarantee."
      right={
        <LoadingContent
          loading={isLoading}
          error={error}
          loadingComponent={<Skeleton className="h-8 w-32" />}
        >
          <Toggle
            name="sent-message-open-tracking"
            enabled={data?.sentMessageOpenTrackingEnabled ?? true}
            onChange={handleToggle}
            disabled={isLoading || isExecuting}
          />
        </LoadingContent>
      }
    />
  );
}
