"use client";

import { useCallback } from "react";
import { LoadingContent } from "@/components/LoadingContent";
import { SettingCard } from "@/components/SettingCard";
import { toastError } from "@/components/Toast";
import { Skeleton } from "@/components/ui/skeleton";
import { useEmailAccountFull } from "@/hooks/useEmailAccountFull";
import { updateDraftReplyConfidenceThresholdAction } from "@/utils/actions/rule";
import { getActionErrorMessage } from "@/utils/error";
import { useAction } from "next-safe-action/hooks";

const DEFAULT_THRESHOLD = 70;

export function DraftConfidenceSetting() {
  const { data, isLoading, error, mutate } = useEmailAccountFull();

  const { execute } = useAction(
    updateDraftReplyConfidenceThresholdAction.bind(null, data?.id ?? ""),
    {
      onSuccess: () => {
        mutate();
      },
      onError: (error) => {
        mutate();
        toastError({
          description: getActionErrorMessage(error.error, {
            prefix: "There was an error",
          }),
        });
      },
    },
  );

  const threshold = data?.draftReplyConfidenceThreshold ?? DEFAULT_THRESHOLD;

  const handleThresholdChange = useCallback(
    (nextThreshold: number) => {
      if (!data) return;

      mutate(
        {
          ...data,
          draftReplyConfidenceThreshold: nextThreshold,
        },
        false,
      );

      execute({ threshold: nextThreshold });
    },
    [data, mutate, execute],
  );

  return (
    <SettingCard
      title="Draft confidence"
      description="Skip auto-drafting when confidence is below this threshold."
      right={
        <LoadingContent
          loading={isLoading}
          error={error}
          loadingComponent={<Skeleton className="h-10 w-44" />}
        >
          <div className="w-44 space-y-1">
            <div className="text-right text-xs text-muted-foreground">
              {threshold}%
            </div>
            <input
              type="range"
              min={0}
              max={100}
              step={1}
              value={threshold}
              onChange={(event) =>
                handleThresholdChange(Number(event.currentTarget.value))
              }
              className="w-full accent-foreground"
              disabled={!data}
              aria-label="Draft confidence threshold"
            />
            <p className="text-xs text-muted-foreground">0% always drafts</p>
          </div>
        </LoadingContent>
      }
    />
  );
}
