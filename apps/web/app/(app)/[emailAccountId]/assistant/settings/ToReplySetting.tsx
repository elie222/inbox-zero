"use client";

import { useCallback, useMemo } from "react";
import { Toggle } from "@/components/Toggle";
import { toastError, toastSuccess } from "@/components/Toast";
import { useEmailAccountFull } from "@/hooks/useEmailAccountFull";
import { useRules } from "@/hooks/useRules";
import { LoadingContent } from "@/components/LoadingContent";
import { Skeleton } from "@/components/ui/skeleton";
import { SettingCard } from "@/components/SettingCard";
import { NEEDS_REPLY_LABEL_NAME } from "@/utils/reply-tracker/consts";
import { toggleToReplyTrackingAction } from "@/utils/actions/settings";
import { ActionType } from "@prisma/client";

export function ToReplySetting() {
  const { data: emailAccountData, isLoading, error } = useEmailAccountFull();

  const { data: rules, mutate: mutateRules } = useRules();

  // Check if any rules with "To Reply" label have TRACK_THREAD action
  const enabled = useMemo(() => {
    if (!rules) return false;
    return rules.some(
      (rule) =>
        rule.actions.some(
          (action) =>
            action.type === ActionType.LABEL &&
            action.label === NEEDS_REPLY_LABEL_NAME,
        ) &&
        rule.actions.some((action) => action.type === ActionType.TRACK_THREAD),
    );
  }, [rules]);

  const handleToggle = useCallback(
    async (enable: boolean) => {
      if (!emailAccountData) return null;

      try {
        await toggleToReplyTrackingAction(emailAccountData.id, {
          enabled: enable,
        });
        toastSuccess({
          description: `Auto-remove ${NEEDS_REPLY_LABEL_NAME} ${enable ? "enabled" : "disabled"}`,
        });
        mutateRules(); // Refresh rules to update the toggle state
      } catch (error) {
        toastError({
          description: `Failed to update auto-remove setting: ${
            error instanceof Error ? error.message : "Unknown error"
          }`,
        });
      }
    },
    [emailAccountData, mutateRules],
  );

  return (
    <SettingCard
      title={`Auto-remove "${NEEDS_REPLY_LABEL_NAME}"`}
      description={`Automatically removes the '${NEEDS_REPLY_LABEL_NAME}' label when you reply to an email.`}
      right={
        <LoadingContent
          loading={isLoading}
          error={error}
          loadingComponent={<Skeleton className="h-8 w-32" />}
        >
          <Toggle
            name="auto-remove-to-reply"
            enabled={enabled}
            onChange={handleToggle}
          />
        </LoadingContent>
      }
    />
  );
}
