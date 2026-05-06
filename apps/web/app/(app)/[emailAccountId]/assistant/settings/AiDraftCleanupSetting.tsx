"use client";

import { useCallback, useEffect, useState } from "react";
import { useAction } from "next-safe-action/hooks";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/Input";
import { Toggle } from "@/components/Toggle";
import { LoadingContent } from "@/components/LoadingContent";
import { MutedText } from "@/components/Typography";
import { Skeleton } from "@/components/ui/skeleton";
import { Label } from "@/components/ui/label";
import { useEmailAccountFull } from "@/hooks/useEmailAccountFull";
import { useAccount } from "@/providers/EmailAccountProvider";
import { createSettingActionErrorHandler } from "@/utils/actions/error-handling";
import { updateAiDraftCleanupSettingsAction } from "@/utils/actions/email-account";
import { cleanupAIDraftsAction } from "@/utils/actions/user";
import { toastError, toastSuccess } from "@/components/Toast";
import { getActionErrorMessage } from "@/utils/error";
import { BRAND_NAME } from "@/utils/branding";

export function AiDraftCleanupSetting() {
  const { data, isLoading, error, mutate } = useEmailAccountFull();
  const { emailAccountId } = useAccount();
  const autoEnabled = data?.aiDraftAutoCleanupEnabled ?? true;
  const persistedDays = data?.aiDraftRetentionDays ?? 14;

  const [daysInput, setDaysInput] = useState(String(persistedDays));

  useEffect(() => {
    setDaysInput(String(persistedDays));
  }, [persistedDays]);

  const { execute: executeSave, isExecuting: isSaving } = useAction(
    updateAiDraftCleanupSettingsAction.bind(null, emailAccountId),
    {
      onSuccess: () => {
        mutate();
      },
      onError: createSettingActionErrorHandler({
        mutate,
        prefix: "Failed to update draft cleanup settings",
      }),
    },
  );

  const handleToggle = useCallback(
    (nextAuto: boolean) => {
      if (!data) return;
      mutate(
        {
          ...data,
          aiDraftAutoCleanupEnabled: nextAuto,
        },
        false,
      );
      executeSave({
        aiDraftAutoCleanupEnabled: nextAuto,
        aiDraftRetentionDays: persistedDays,
      });
    },
    [data, executeSave, mutate, persistedDays],
  );

  const commitDays = useCallback(() => {
    if (!data) return;
    const parsed = Number.parseInt(daysInput, 10);
    if (!Number.isFinite(parsed)) {
      setDaysInput(String(persistedDays));
      return;
    }
    const clamped = Math.min(365, Math.max(1, Math.floor(parsed)));
    setDaysInput(String(clamped));
    if (clamped === persistedDays) return;

    mutate(
      {
        ...data,
        aiDraftRetentionDays: clamped,
      },
      false,
    );

    executeSave({
      aiDraftAutoCleanupEnabled: autoEnabled,
      aiDraftRetentionDays: clamped,
    });
  }, [autoEnabled, data, daysInput, executeSave, mutate, persistedDays]);

  const [manualSummary, setManualSummary] = useState<{
    deleted: number;
    skippedModified: number;
  } | null>(null);

  const { execute: executeCleanup, isExecuting: isCleaning } = useAction(
    cleanupAIDraftsAction.bind(null, emailAccountId),
    {
      onSuccess: (res) => {
        if (res.data) {
          setManualSummary(res.data);
          if (res.data.deleted === 0 && res.data.skippedModified === 0) {
            toastSuccess({ description: "No eligible drafts found." });
          } else if (res.data.deleted === 0) {
            toastSuccess({
              description:
                "Eligible drafts were edited by you, so none were removed.",
            });
          } else {
            toastSuccess({
              description: `Removed ${res.data.deleted} draft${res.data.deleted === 1 ? "" : "s"}.`,
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

  return (
    <Card>
      <CardContent className="space-y-4 p-4">
        <div className="space-y-2">
          <h3 className="font-medium">AI draft cleanup</h3>
          <MutedText>
            This only affects drafts that {BRAND_NAME} created for you and that
            still match the saved content—your edits always stay. Other drafts
            in your mailbox are never deleted.
          </MutedText>
        </div>

        <LoadingContent
          loading={isLoading}
          error={error}
          loadingComponent={
            <div className="space-y-3">
              <Skeleton className="h-9 w-full max-w-md" />
              <Skeleton className="h-9 w-full max-w-xs" />
            </div>
          }
        >
          <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
            <div className="space-y-1">
              <p className="text-sm font-medium">
                Automatically remove old drafts
              </p>
              <MutedText className="text-xs">
                Runs in the background when enabled. Uses the age below.
              </MutedText>
            </div>
            <Toggle
              name="ai-draft-auto-cleanup"
              enabled={autoEnabled}
              onChange={handleToggle}
              disabled={!data || isSaving}
            />
          </div>

          <div className="flex flex-wrap items-end gap-3">
            <div className="space-y-2">
              <Label htmlFor="ai-draft-retention-days">Age threshold</Label>
              <div className="flex items-center gap-2">
                <Input
                  id="ai-draft-retention-days"
                  type="number"
                  min={1}
                  max={365}
                  className="w-24"
                  value={daysInput}
                  disabled={!data || isSaving}
                  onChange={(e) => setDaysInput(e.target.value)}
                  onBlur={commitDays}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") {
                      e.currentTarget.blur();
                    }
                  }}
                />
                <span className="text-sm text-muted-foreground">days</span>
              </div>
            </div>
          </div>

          <div className="flex flex-col gap-2 border-t pt-4 sm:flex-row sm:items-center sm:justify-between">
            <MutedText className="text-xs">
              Remove eligible drafts immediately (same rules—only unedited AI
              drafts older than {persistedDays}{" "}
              {persistedDays === 1 ? "day" : "days"}).
            </MutedText>
            <Button
              size="sm"
              variant="outline"
              loading={isCleaning}
              onClick={() => {
                setManualSummary(null);
                executeCleanup();
              }}
            >
              Remove eligible drafts now
            </Button>
          </div>

          {manualSummary &&
            manualSummary.deleted > 0 &&
            manualSummary.skippedModified > 0 && (
              <p className="text-xs text-muted-foreground">
                {manualSummary.skippedModified} draft
                {manualSummary.skippedModified === 1 ? " was" : "s were"} kept
                because you edited{" "}
                {manualSummary.skippedModified === 1 ? "it" : "them"}.
              </p>
            )}
        </LoadingContent>
      </CardContent>
    </Card>
  );
}
