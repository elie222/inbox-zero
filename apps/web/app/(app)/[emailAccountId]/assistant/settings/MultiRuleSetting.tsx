"use client";

import { Toggle } from "@/components/Toggle";
import { enableMultiRuleSelectionAction } from "@/utils/actions/rule";
import { toastError } from "@/components/Toast";
import { SettingCard } from "@/components/SettingCard";
import { useEmailAccountFull } from "@/hooks/useEmailAccountFull";
import { useAction } from "next-safe-action/hooks";
import { Skeleton } from "@/components/ui/skeleton";
import { LoadingContent } from "@/components/LoadingContent";

export function MultiRuleSetting() {
  const { data, isLoading, error, mutate } = useEmailAccountFull();

  const { execute } = useAction(
    enableMultiRuleSelectionAction.bind(null, data?.id ?? ""),
    {
      onSuccess: () => {
        mutate();
      },
      onError: (error) => {
        toastError({
          description: `There was an error: ${error.error.serverError || "Unknown error"}`,
        });
      },
    },
  );

  const enabled = data?.multiRuleSelectionEnabled ?? false;

  return (
    <SettingCard
      title="Multi-rule selection"
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
            onChange={(enable) => execute({ enable })}
            disabled={isLoading}
          />
        </LoadingContent>
      }
    />
  );
}
