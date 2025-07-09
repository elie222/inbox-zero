"use client";

import { useCallback } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Toggle } from "@/components/Toggle";
import { KnowledgeDialog } from "@/app/(app)/[emailAccountId]/assistant/knowledge/KnowledgeDialog";
import { enableDraftRepliesAction } from "@/utils/actions/rule";
import { toastError } from "@/components/Toast";
import { useAccount } from "@/providers/EmailAccountProvider";
import { useRules } from "@/hooks/useRules";
import { ActionType, SystemType } from "@prisma/client";
import { LoadingContent } from "@/components/LoadingContent";
import { Skeleton } from "@/components/ui/skeleton";

export function DraftReplies() {
  const { enabled, toggleDraftReplies, loading, error } = useDraftReplies();

  const handleToggle = useCallback(
    async (enable: boolean) => {
      try {
        await toggleDraftReplies(enable);
      } catch (error) {
        toastError({
          description: `There was an error: ${error instanceof Error ? error.message : "Unknown error"}`,
        });
      }
    },
    [toggleDraftReplies],
  );

  return (
    <Card>
      <CardContent className="p-4">
        <div className="flex items-center gap-4">
          <div className="flex-1">
            <h3 className="font-medium">Auto Draft Replies</h3>
            <p className="text-sm text-muted-foreground">
              Automatically draft replies written in your tone to emails needing
              a reply.
            </p>
          </div>

          {enabled && <KnowledgeDialog />}

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
        </div>
      </CardContent>
    </Card>
  );
}

function useDraftReplies() {
  const { data, mutate, isLoading, error } = useRules();
  const { emailAccountId } = useAccount();

  const toReplyRule = data?.find(
    (rule) => rule.systemType === SystemType.TO_REPLY,
  );
  const isEnabled = toReplyRule?.actions.some(
    (action) => action.type === ActionType.DRAFT_EMAIL,
  );

  const toggleDraftReplies = useCallback(
    async (enable: boolean) => {
      if (!data) return;

      // Optimistically update the cache
      const optimisticData = data.map((rule) => {
        if (rule.systemType === SystemType.TO_REPLY) {
          return {
            ...rule,
            actions: enable
              ? // Add DRAFT_EMAIL action if enabling
                rule.actions.some(
                  (action) => action.type === ActionType.DRAFT_EMAIL,
                )
                ? rule.actions // Already has the action
                : [
                    ...rule.actions,
                    {
                      id: `temp-${Date.now()}`, // Temporary ID for optimistic update
                      type: ActionType.DRAFT_EMAIL,
                      ruleId: rule.id,
                      label: null,
                      subject: null,
                      content: null,
                      to: null,
                      cc: null,
                      bcc: null,
                      url: null,
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

      try {
        // Call the actual API
        const result = await enableDraftRepliesAction(emailAccountId, {
          enable,
        });

        // Revalidate to get the real data from server
        mutate();

        return result;
      } catch (error) {
        // On error, revert the optimistic update
        mutate();
        throw error;
      }
    },
    [data, mutate, emailAccountId],
  );

  return {
    enabled: isEnabled ?? false,
    toggleDraftReplies,
    loading: isLoading,
    error,
  };
}
