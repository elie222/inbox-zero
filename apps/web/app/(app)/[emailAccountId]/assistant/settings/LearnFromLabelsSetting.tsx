"use client";

import { useCallback } from "react";
import { Toggle } from "@/components/Toggle";
import { enableLearnFromLabelsAction } from "@/utils/actions/rule";
import { createSettingActionErrorHandler } from "@/utils/actions/error-handling";
import { SettingCard } from "@/components/SettingCard";
import { useEmailAccountFull } from "@/hooks/useEmailAccountFull";
import { useAction } from "next-safe-action/hooks";
import { Skeleton } from "@/components/ui/skeleton";
import { LoadingContent } from "@/components/LoadingContent";
import { TooltipExplanation } from "@/components/TooltipExplanation";
import { useAccount } from "@/providers/EmailAccountProvider";
import { isGoogleProvider } from "@/utils/email/provider-types";

export function LearnFromLabelsSetting() {
  const { provider } = useAccount();
  const { data, isLoading, error, mutate } = useEmailAccountFull();

  const { execute, isExecuting } = useAction(
    enableLearnFromLabelsAction.bind(null, data?.id ?? ""),
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

  const enabled = data?.learnFromLabels ?? false;

  const handleToggle = useCallback(
    (enable: boolean) => {
      if (!data) return;

      const optimisticData = {
        ...data,
        learnFromLabels: enable,
      };
      mutate(optimisticData, false);

      execute({ enable });
    },
    [data, mutate, execute],
  );

  // Driven by Gmail label events; other providers have no equivalent yet.
  if (!isGoogleProvider(provider)) return null;

  return (
    <SettingCard
      title={
        <div className="flex items-center gap-1.5">
          <span>Learn from labels</span>
          <TooltipExplanation
            side="top"
            text="When you move an email to a label in Gmail, future emails from that sender get the same label automatically. If no rule uses that label yet, one is created for you."
          />
        </div>
      }
      description="Train the assistant by moving emails to labels."
      right={
        <LoadingContent
          loading={isLoading}
          error={error}
          loadingComponent={<Skeleton className="h-8 w-32" />}
        >
          <Toggle
            name="learn-from-labels"
            ariaLabel="Learn from labels"
            enabled={enabled}
            onChange={handleToggle}
            disabled={isLoading || isExecuting}
          />
        </LoadingContent>
      }
    />
  );
}
