"use client";

import { useEffect, useRef, useState } from "react";
import { LoadingContent } from "@/components/LoadingContent";
import { SettingCard } from "@/components/SettingCard";
import { toastError } from "@/components/Toast";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { DraftReplyConfidence } from "@/generated/prisma/enums";
import { useEmailAccountFull } from "@/hooks/useEmailAccountFull";
import { updateDraftReplyConfidenceAction } from "@/utils/actions/rule";
import {
  DEFAULT_DRAFT_REPLY_CONFIDENCE,
  DRAFT_REPLY_CONFIDENCE_OPTIONS,
  getDraftReplyConfidenceOption,
} from "@/utils/ai/reply/draft-confidence";
import { getActionErrorMessage } from "@/utils/error";
import { useAction } from "next-safe-action/hooks";

export function DraftConfidenceSetting() {
  const { data, isLoading, error, mutate } = useEmailAccountFull();
  const persistedConfidence =
    data?.draftReplyConfidence ?? DEFAULT_DRAFT_REPLY_CONFIDENCE;
  const [selectedConfidence, setSelectedConfidence] =
    useState<DraftReplyConfidence>(persistedConfidence);
  const requestSequenceRef = useRef(0);
  const lastRequestedConfidenceRef = useRef<DraftReplyConfidence | null>(null);

  const { executeAsync } = useAction(
    updateDraftReplyConfidenceAction.bind(null, data?.id ?? ""),
  );

  useEffect(() => {
    setSelectedConfidence(persistedConfidence);
  }, [persistedConfidence]);

  const selectedOption = getDraftReplyConfidenceOption(selectedConfidence);

  const saveConfidence = (nextConfidence: DraftReplyConfidence) => {
    if (!data) return;
    if (nextConfidence === persistedConfidence) return;
    if (lastRequestedConfidenceRef.current === nextConfidence) return;

    lastRequestedConfidenceRef.current = nextConfidence;
    const requestSequence = ++requestSequenceRef.current;

    mutate(
      {
        ...data,
        draftReplyConfidence: nextConfidence,
      },
      false,
    );

    executeAsync({ confidence: nextConfidence })
      .then((result) => {
        if (requestSequence !== requestSequenceRef.current) return;

        if (result?.serverError || result?.validationErrors) {
          lastRequestedConfidenceRef.current = null;
          mutate();
          toastError({
            description: getActionErrorMessage(
              {
                serverError: result.serverError,
                validationErrors: result.validationErrors,
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

        lastRequestedConfidenceRef.current = null;
        mutate();
        toastError({
          description: "There was an error",
        });
      });
  };

  const onValueChange = (value: string) => {
    const nextConfidence = value as DraftReplyConfidence;
    setSelectedConfidence(nextConfidence);
    saveConfidence(nextConfidence);
  };

  return (
    <SettingCard
      title="Draft confidence"
      description="How sure should the AI be before drafting a reply?"
      right={
        <LoadingContent
          loading={isLoading}
          error={error}
          loadingComponent={<Skeleton className="h-10 w-44" />}
        >
          <div className="w-72">
            <Select
              value={selectedConfidence}
              onValueChange={onValueChange}
              disabled={!data}
            >
              <SelectTrigger aria-label="Draft confidence">
                <SelectValue>{selectedOption.label}</SelectValue>
              </SelectTrigger>
              <SelectContent align="end" className="w-[22rem]">
                {DRAFT_REPLY_CONFIDENCE_OPTIONS.map((option) => (
                  <SelectItem
                    key={option.value}
                    value={option.value}
                    className="items-start py-2"
                  >
                    <div className="flex flex-col text-left">
                      <span className="font-medium">{option.label}</span>
                      <span className="text-xs text-muted-foreground">
                        {option.description}
                      </span>
                    </div>
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </LoadingContent>
      }
    />
  );
}
