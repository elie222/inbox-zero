"use client";

import { useState } from "react";
import { useAction } from "next-safe-action/hooks";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
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
  draftCleanupDays,
}: {
  emailAccountId: string;
  draftCleanupDays: number | null;
}) {
  const [savedCleanupDays, setSavedCleanupDays] = useState(draftCleanupDays);
  const [cleanupDaysInput, setCleanupDaysInput] = useState(
    String(draftCleanupDays ?? DEFAULT_AI_DRAFT_CLEANUP_DAYS),
  );
  const [result, setResult] = useState<{
    deleted: number;
    skippedModified: number;
  } | null>(null);

  const parsedCleanupDays = Number(cleanupDaysInput);
  const cleanupDaysIsValid =
    Number.isInteger(parsedCleanupDays) &&
    parsedCleanupDays >= MIN_AI_DRAFT_CLEANUP_DAYS &&
    parsedCleanupDays <= MAX_AI_DRAFT_CLEANUP_DAYS;
  const automaticCleanupEnabled = savedCleanupDays !== null;

  const {
    execute: updateCleanupSettings,
    isExecuting: isUpdatingCleanupSettings,
  } = useAction(updateAIDraftCleanupSettingsAction.bind(null, emailAccountId), {
    onSuccess: (res) => {
      if (!res.data) return;

      setSavedCleanupDays(res.data.cleanupDays);
      setCleanupDaysInput(
        String(res.data.cleanupDays ?? DEFAULT_AI_DRAFT_CLEANUP_DAYS),
      );
      toastSuccess({ description: "Draft cleanup settings updated." });
    },
    onError: (error) => {
      setCleanupDaysInput(
        String(savedCleanupDays ?? DEFAULT_AI_DRAFT_CLEANUP_DAYS),
      );
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

    setCleanupDaysInput(
      String(nextCleanupDays ?? DEFAULT_AI_DRAFT_CLEANUP_DAYS),
    );
    updateCleanupSettings({ cleanupDays: nextCleanupDays });
  };

  const handleSaveCleanupDays = () => {
    if (!cleanupDaysIsValid) return;

    updateCleanupSettings({ cleanupDays: parsedCleanupDays });
  };

  return (
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
                onChange={(event) => setCleanupDaysInput(event.target.value)}
                step={1}
                type="number"
                value={cleanupDaysInput}
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
          <ItemTitle>Delete Old AI Drafts Now</ItemTitle>
          <ItemDescription>
            {`Remove unedited drafts created by ${BRAND_NAME} that are older than ${DEFAULT_AI_DRAFT_CLEANUP_DAYS} days.`}
          </ItemDescription>
        </ItemContent>
        <ItemActions>
          <Button
            size="sm"
            variant="outline"
            loading={isExecuting}
            onClick={() =>
              execute({ olderThanDays: DEFAULT_AI_DRAFT_CLEANUP_DAYS })
            }
          >
            Delete old drafts
          </Button>
        </ItemActions>
      </Item>
      {result && result.deleted > 0 && result.skippedModified > 0 && (
        <div className="px-4 pb-2">
          <p className="text-xs text-muted-foreground">
            {result.skippedModified} draft
            {result.skippedModified === 1 ? " was" : "s were"} kept because you
            edited {result.skippedModified === 1 ? "it" : "them"}
          </p>
        </div>
      )}
    </>
  );
}
