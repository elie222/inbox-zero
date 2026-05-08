"use client";

import { useState } from "react";
import { useAction } from "next-safe-action/hooks";
import useSWR from "swr";
import type { GetDraftCleanupSettingsResponse } from "@/app/api/user/draft-cleanup-settings/route";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { LoadingContent } from "@/components/LoadingContent";
import {
  Item,
  ItemContent,
  ItemTitle,
  ItemDescription,
  ItemActions,
  ItemSeparator,
} from "@/components/ui/item";
import {
  cleanupAIDraftsAction,
  updateAIDraftCleanupSettingsAction,
} from "@/utils/actions/user";
import { toastError, toastSuccess } from "@/components/Toast";
import { getActionErrorMessage } from "@/utils/error";
import { BRAND_NAME } from "@/utils/branding";
import {
  DEFAULT_AI_DRAFT_CLEANUP_DAYS,
  MAX_AI_DRAFT_CLEANUP_DAYS,
  MIN_AI_DRAFT_CLEANUP_DAYS,
} from "@/utils/ai/draft-cleanup-settings";

export function CleanupDraftsSection({
  emailAccountId,
}: {
  emailAccountId: string;
}) {
  const { data, isLoading, error, mutate } =
    useSWR<GetDraftCleanupSettingsResponse>(
      emailAccountId
        ? ["/api/user/draft-cleanup-settings", emailAccountId]
        : null,
    );
  const [cleanupDaysInput, setCleanupDaysInput] = useState<string | null>(null);
  const [result, setResult] = useState<{
    deleted: number;
    skippedModified: number;
  } | null>(null);

  const savedCleanupDays =
    data?.draftCleanupDays ?? DEFAULT_AI_DRAFT_CLEANUP_DAYS;
  const cleanupDaysInputValue = cleanupDaysInput ?? String(savedCleanupDays);

  const parsedCleanupDays = Number(cleanupDaysInputValue);
  const cleanupDaysIsValid =
    Number.isInteger(parsedCleanupDays) &&
    parsedCleanupDays >= MIN_AI_DRAFT_CLEANUP_DAYS &&
    parsedCleanupDays <= MAX_AI_DRAFT_CLEANUP_DAYS;
  const automaticCleanupEnabled = data?.draftCleanupDays !== null;

  const {
    execute: updateCleanupSettings,
    isExecuting: isUpdatingCleanupSettings,
  } = useAction(updateAIDraftCleanupSettingsAction.bind(null, emailAccountId), {
    onSuccess: (res) => {
      if (!res.data) return;

      setCleanupDaysInput(null);
      mutate({ draftCleanupDays: res.data.cleanupDays }, false);
      toastSuccess({ description: "Draft cleanup settings updated." });
    },
    onError: (error) => {
      setCleanupDaysInput(null);
      toastError({
        description: getActionErrorMessage(error.error),
      });
    },
  });

  const { execute, isExecuting } = useAction(
    cleanupAIDraftsAction.bind(null, emailAccountId),
    {
      onSuccess: (res) => {
        if (res.data) {
          setResult(res.data);
          if (res.data.deleted === 0 && res.data.skippedModified === 0) {
            toastSuccess({ description: "No stale drafts found." });
          } else if (res.data.deleted === 0) {
            toastSuccess({
              description:
                "All stale drafts were edited by you, so none were removed.",
            });
          } else {
            toastSuccess({
              description: `Cleaned up ${res.data.deleted} draft${res.data.deleted === 1 ? "" : "s"}.`,
            });
          }
        }
      },
      onError: (error) => {
        toastError({
          description: getActionErrorMessage(error.error),
        });
      },
    },
  );

  const handleToggleAutomaticCleanup = (checked: boolean) => {
    const nextCleanupDays = checked ? DEFAULT_AI_DRAFT_CLEANUP_DAYS : null;

    setCleanupDaysInput(null);
    updateCleanupSettings({ cleanupDays: nextCleanupDays });
  };

  const handleSaveCleanupDays = () => {
    if (!cleanupDaysIsValid) return;

    updateCleanupSettings({ cleanupDays: parsedCleanupDays });
  };

  return (
    <LoadingContent loading={isLoading} error={error}>
      {data && (
        <>
          <ItemSeparator />
          <Item size="sm">
            <ItemContent>
              <ItemTitle>Auto-delete AI Drafts</ItemTitle>
              <ItemDescription>
                {`Only removes drafts created by ${BRAND_NAME} that have not been edited by you.`}
              </ItemDescription>
            </ItemContent>
            <ItemActions className="flex-wrap justify-end">
              {automaticCleanupEnabled ? (
                <>
                  <Input
                    aria-label="Draft cleanup age in days"
                    className="h-8 w-24"
                    disabled={isUpdatingCleanupSettings}
                    max={MAX_AI_DRAFT_CLEANUP_DAYS}
                    min={MIN_AI_DRAFT_CLEANUP_DAYS}
                    onChange={(event) =>
                      setCleanupDaysInput(event.target.value)
                    }
                    step={1}
                    type="number"
                    value={cleanupDaysInputValue}
                  />
                  <span className="text-sm text-muted-foreground">days</span>
                  <Button
                    size="sm"
                    variant="outline"
                    disabled={
                      !cleanupDaysIsValid ||
                      parsedCleanupDays === savedCleanupDays ||
                      isUpdatingCleanupSettings
                    }
                    loading={isUpdatingCleanupSettings}
                    onClick={handleSaveCleanupDays}
                  >
                    Save
                  </Button>
                </>
              ) : null}
              <Switch
                aria-label="Toggle automatic AI draft cleanup"
                checked={automaticCleanupEnabled}
                disabled={isUpdatingCleanupSettings}
                onCheckedChange={handleToggleAutomaticCleanup}
              />
            </ItemActions>
          </Item>
          <ItemSeparator />
          <Item size="sm">
            <ItemContent>
              <ItemTitle>Delete Old AI Drafts</ItemTitle>
              <ItemDescription>
                {`Remove unedited drafts created by ${BRAND_NAME} that are older than ${savedCleanupDays} days.`}
              </ItemDescription>
            </ItemContent>
            <ItemActions>
              <Button
                size="sm"
                variant="outline"
                loading={isExecuting}
                onClick={() => execute()}
              >
                Delete old drafts
              </Button>
            </ItemActions>
          </Item>
          {result && result.deleted > 0 && result.skippedModified > 0 && (
            <div className="px-4 pb-2">
              <p className="text-xs text-muted-foreground">
                {result.skippedModified} draft
                {result.skippedModified === 1 ? " was" : "s were"} kept because
                you edited {result.skippedModified === 1 ? "it" : "them"}
              </p>
            </div>
          )}
        </>
      )}
    </LoadingContent>
  );
}
