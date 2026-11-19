"use client";

import { useLingui } from "@lingui/react/macro";
import { useCallback } from "react";
import { Toggle } from "@/components/Toggle";
import { enableDraftRepliesAction } from "@/utils/actions/rule";
import { toastError } from "@/components/Toast";
import { useAccount } from "@/providers/EmailAccountProvider";
import { useRules } from "@/hooks/useRules";
import { useEmailAccountFull } from "@/hooks/useEmailAccountFull";
import { getActionErrorMessage } from "@/utils/error";
import { isDraftRepliesEnabled } from "@/utils/rule/draft-replies";
import { ActionType, SystemType } from "@/generated/prisma/enums";
import { LoadingContent } from "@/components/LoadingContent";
import { Skeleton } from "@/components/ui/skeleton";
import { SettingCard } from "@/components/SettingCard";

export function DraftReplies() {
  const { t } = useLingui();
  const { enabled, toggleDraftReplies, loading, error } = useDraftReplies();

  const handleToggle = useCallback(
    async (enable: boolean) => {
      try {
        await toggleDraftReplies(enable);
      } catch (error) {
        toastError({
          title: t`Failed to update draft replies`,
          description:
            error instanceof Error ? error.message : t`Unknown error`,
        });
      }
    },
    [toggleDraftReplies, t],
  );

  return (
    <SettingCard
      title={t`Draft replies`}
      description={t`Draft replies in your tone to emails that need a reply. Turning this off keeps the To Reply label.`}
      right={
        <LoadingContent
          loading={loading}
          error={error}
          loadingComponent={<Skeleton className="h-8 w-32" />}
        >
          <Toggle
            name="draft-replies"
            enabled={enabled}
            onChange={handleToggle}
          />
        </LoadingContent>
      }
    />
  );
}

export function useDraftReplies() {
  const { data, mutate, isLoading, error } = useRules();
  const { mutate: mutateEmailAccount } = useEmailAccountFull();
  const { emailAccountId } = useAccount();

  const toReplyRule = data?.find(
    (rule) => rule.systemType === SystemType.TO_REPLY,
  );

  const toggleDraftReplies = useCallback(
    async (enable: boolean) => {
      if (!data) return;

      const optimisticData = data.map((rule) => {
        if (rule.systemType === SystemType.TO_REPLY) {
          return {
            ...rule,
            enabled: enable ? true : rule.enabled,
            actions: enable
              ? rule.actions.some(
                  (action) => action.type === ActionType.DRAFT_EMAIL,
                )
                ? rule.actions
                : [
                    ...rule.actions,
                    {
                      id: `temp-${Date.now()}`, // Temporary ID for optimistic update
                      type: ActionType.DRAFT_EMAIL,
                      ruleId: rule.id,
                      emailAccountId,
                      label: null,
                      labelId: null,
                      subject: null,
                      content: null,
                      to: null,
                      cc: null,
                      bcc: null,
                      url: null,
                      delayInMinutes: null,
                      folderName: null,
                      folderId: null,
                      messagingChannelId: null,
                      messagingChannelEmailAccountId: null,
                      messagingChannel: null,
                      staticAttachments: null,
                      integrationName: null,
                      integrationToolName: null,
                      integrationArgs: null,
                      createdAt: new Date(),
                      updatedAt: new Date(),
                    },
                  ]
              : // Remove DRAFT_EMAIL action if disabling
                rule.actions.filter(
                  (action) => action.type !== ActionType.DRAFT_EMAIL,
                ),
          };
        }
        return rule;
      });

      // Update SWR cache optimistically
      mutate(optimisticData, false);

      const result = await enableDraftRepliesAction(emailAccountId, {
        enable,
      }).finally(() => {
        mutate();
        mutateEmailAccount();
      });

      if (result?.serverError || result?.validationErrors) {
        throw new Error(getActionErrorMessage(result));
      }
    },
    [data, mutate, mutateEmailAccount, emailAccountId],
  );

  return {
    enabled: isDraftRepliesEnabled(toReplyRule),
    toggleDraftReplies,
    loading: isLoading,
    error,
  };
}
