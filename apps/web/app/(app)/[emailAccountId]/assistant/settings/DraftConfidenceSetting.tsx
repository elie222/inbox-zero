"use client";

import { useCallback, useEffect, useRef, useState } from "react";
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
  const persistedThreshold =
    data?.draftReplyConfidenceThreshold ?? DEFAULT_THRESHOLD;
  const [sliderThreshold, setSliderThreshold] = useState(persistedThreshold);
  const requestSequenceRef = useRef(0);
  const lastRequestedThresholdRef = useRef<number | null>(null);

  const { executeAsync } = useAction(
    updateDraftReplyConfidenceThresholdAction.bind(null, data?.id ?? ""),
  );

  useEffect(() => {
    setSliderThreshold(persistedThreshold);
  }, [persistedThreshold]);

  const saveThreshold = useCallback(
    (nextThreshold: number) => {
      if (!data) return;
      if (nextThreshold === persistedThreshold) return;
      if (lastRequestedThresholdRef.current === nextThreshold) return;

      lastRequestedThresholdRef.current = nextThreshold;
      const requestSequence = ++requestSequenceRef.current;

      mutate(
        {
          ...data,
          draftReplyConfidenceThreshold: nextThreshold,
        },
        false,
      );

      executeAsync({ threshold: nextThreshold })
        .then((result) => {
          if (requestSequence !== requestSequenceRef.current) return;

          if (
            result?.serverError ||
            result?.validationErrors ||
            result?.bindArgsValidationErrors
          ) {
            lastRequestedThresholdRef.current = null;
            mutate();
            toastError({
              description: getActionErrorMessage(
                {
                  serverError: result.serverError,
                  validationErrors: result.validationErrors,
                  bindArgsValidationErrors: result.bindArgsValidationErrors,
                },
                {
                  prefix: "There was an error",
                },
              ),
            });
            return;
          }

          mutate();
        })
        .catch(() => {
          if (requestSequence !== requestSequenceRef.current) return;

          lastRequestedThresholdRef.current = null;
          mutate();
          toastError({
            description: "There was an error",
          });
        });
    },
    [data, mutate, executeAsync, persistedThreshold],
  );

  const commitThreshold = useCallback(() => {
    saveThreshold(sliderThreshold);
  }, [saveThreshold, sliderThreshold]);

  const handleSliderChange = (nextThreshold: number) => {
    setSliderThreshold(nextThreshold);
  };

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
              {sliderThreshold}%
            </div>
            <input
              type="range"
              min={0}
              max={100}
              step={1}
              value={sliderThreshold}
              onChange={(event) =>
                handleSliderChange(Number(event.currentTarget.value))
              }
              onPointerUp={commitThreshold}
              onBlur={commitThreshold}
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
