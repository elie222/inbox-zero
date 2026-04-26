"use client";

import { useCallback } from "react";
import { Toggle } from "@/components/Toggle";
import { enableMultiRuleSelectionAction } from "@/utils/actions/rule";
import { createSettingActionErrorHandler } from "@/utils/actions/error-handling";
import { SettingCard } from "@/components/SettingCard";
import { useEmailAccountFull } from "@/hooks/useEmailAccountFull";
import { useAction } from "next-safe-action/hooks";
import { Skeleton } from "@/components/ui/skeleton";
import { LoadingContent } from "@/components/LoadingContent";
import { TooltipExplanation } from "@/components/TooltipExplanation";

export function MultiRuleSetting() {
  const { data, isLoading, error, mutate } = useEmailAccountFull();

  const { execute } = useAction(
    enableMultiRuleSelectionAction.bind(null, data?.id ?? ""),
    {
      onSuccess: () => {
        mutate();
      },
      onError: createSettingActionErrorHandler({
        mutate,
        prefix: "There was an error",
      }),
    },
  );

  const enabled = data?.multiRuleSelectionEnabled ?? false;

  const handleToggle = useCallback(
    (enable: boolean) => {
      if (!data) return;

      const optimisticData = {
        ...data,
        multiRuleSelectionEnabled: enable,
      };
      mutate(optimisticData, false);

      execute({ enable });
    },
    [data, mutate, execute],
  );

  return (
    <SettingCard
      title={
        <div className="flex items-center gap-1.5">
          <span>Multi-rule selection</span>
          <TooltipExplanation
            side="top"
            text="Turning this off stops the AI from intentionally choosing multiple custom rules for one email. Inbox Zero can still apply more than one rule in a few special cases."
          />
        </div>
      }
      description="Allow the AI to select multiple rules for a single email when appropriate."
      right={
        <LoadingContent
          loading={isLoading}
          error={error}
          loadingComponent={<Skeleton className="h-8 w-32" />}
        >
          <Toggle
            name="multi-rule-selection"
            enabled={enabled}
            onChange={handleToggle}
            disabled={isLoading}
          />
        </LoadingContent>
      }
    />
  );
}
