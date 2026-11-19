"use client";

import type { MessageDescriptor } from "@lingui/core";
import { msg } from "@lingui/core/macro";
import { useLingui } from "@lingui/react/macro";
import { useEffect, useRef, useState } from "react";
import { LoadingContent } from "@/components/LoadingContent";
import { SettingCard } from "@/components/SettingCard";
import { toastSuccess } from "@/components/Toast";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import type { DraftReplyConfidence } from "@/generated/prisma/enums";
import { useEmailAccountFull } from "@/hooks/useEmailAccountFull";
import { updateDraftReplyConfidenceAction } from "@/utils/actions/rule";
import {
  DEFAULT_DRAFT_REPLY_CONFIDENCE,
  DRAFT_REPLY_CONFIDENCE_OPTIONS,
  getDraftReplyConfidenceOption,
} from "@/utils/ai/reply/draft-confidence";
import { showSettingActionError } from "@/utils/actions/error-handling";
import { useAction } from "next-safe-action/hooks";

const CONFIDENCE_DISPLAY: Record<
  DraftReplyConfidence,
  { label: MessageDescriptor; description: MessageDescriptor }
> = {
  ALL_EMAILS: {
    label: msg`All emails`,
    description: msg`Draft a reply for every email, even when uncertain.`,
  },
  STANDARD: {
    label: msg`Standard`,
    description: msg`Skip drafting when the AI is clearly unsure. Most emails still get a draft.`,
  },
  HIGH_CONFIDENCE: {
    label: msg`High confidence`,
    description: msg`Only draft when the AI is very sure of the right reply. Many emails will get no draft.`,
  },
};

export function DraftConfidenceSetting() {
  const { t, i18n } = useLingui();
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
          showSettingActionError({
            error: {
              serverError: result.serverError,
              validationErrors: result.validationErrors,
            },
            mutate,
            prefix: t`Failed to update draft confidence`,
          });
          return;
        }

        toastSuccess({
          description: t`Draft confidence updated`,
        });
        mutate();
      })
      .catch(() => {
        if (requestSequence !== requestSequenceRef.current) return;

        lastRequestedConfidenceRef.current = null;
        showSettingActionError({
          error: {},
          mutate,
          defaultMessage: t`Failed to update draft confidence`,
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
      title={t`Draft confidence`}
      description={t`How sure should the AI be before drafting a reply?`}
      right={
        <LoadingContent
          loading={isLoading}
          error={error}
          loadingComponent={<Skeleton className="h-10 w-44" />}
        >
          <div className="w-52">
            <Select
              value={selectedConfidence}
              onValueChange={onValueChange}
              disabled={!data}
            >
              <SelectTrigger aria-label={t`Draft confidence`}>
                <SelectValue>
                  {i18n._(CONFIDENCE_DISPLAY[selectedOption.value].label)}
                </SelectValue>
              </SelectTrigger>
              <SelectContent align="end" className="w-[22rem]">
                {DRAFT_REPLY_CONFIDENCE_OPTIONS.map((option) => (
                  <SelectItem
                    key={option.value}
                    value={option.value}
                    className="items-start py-2"
                  >
                    <div className="flex flex-col text-left">
                      <span className="font-medium">
                        {i18n._(CONFIDENCE_DISPLAY[option.value].label)}
                      </span>
                      <span className="text-xs text-muted-foreground">
                        {i18n._(CONFIDENCE_DISPLAY[option.value].description)}
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
