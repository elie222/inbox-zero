"use client";

import { useEffect, useRef, useState } from "react";
import { useLocalStorage } from "usehooks-ts";
import { useCalendars } from "@/hooks/useCalendars";
import { useAction } from "next-safe-action/hooks";
import { updateEmailAccountTimezoneAction } from "@/utils/actions/calendar";
import { useAccount } from "@/providers/EmailAccountProvider";
import {
  addDismissedPrompt,
  shouldShowTimezonePrompt,
  type DismissedPrompt,
} from "@/components/TimezoneDetector.utils";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { toastSuccess } from "@/components/Toast";
import { useProductAnalytics } from "@/hooks/useProductAnalytics";
import { useOrgAccess } from "@/hooks/useOrgAccess";

export function TimezoneDetector() {
  const { emailAccountId } = useAccount();
  const { data, mutate } = useCalendars();
  const { isAccountOwner } = useOrgAccess();
  const analytics = useProductAnalytics();
  const [showDialog, setShowDialog] = useState(false);
  const trackedPromptRef = useRef<string | null>(null);
  const [dismissedPrompts, setDismissedPrompts] = useLocalStorage<
    DismissedPrompt[]
  >(`timezone-prompts-dismissed-${emailAccountId}`, []);

  const { execute: executeUpdateTimezone, isExecuting } = useAction(
    updateEmailAccountTimezoneAction.bind(null, emailAccountId),
    {
      onSuccess: () => {
        toastSuccess({ description: "Timezone updated!" });
        closeDialog();
      },
      onSettled: () => {
        mutate();
      },
    },
  );

  // biome-ignore lint/correctness/useExhaustiveDependencies: executeUpdateTimezone is stable from useAction and causes infinite loops if included
  useEffect(() => {
    if (!data || !isAccountOwner) return;

    const currentTimezone = Intl.DateTimeFormat().resolvedOptions().timeZone;
    const savedTimezone = data.timezone;

    // A missing timezone is filled app-wide by FillMissingTimezone.
    if (savedTimezone === null) return;

    if (
      shouldShowTimezonePrompt(savedTimezone, currentTimezone, dismissedPrompts)
    ) {
      setShowDialog(true);

      const promptKey = `${savedTimezone}:${currentTimezone}`;
      if (trackedPromptRef.current !== promptKey) {
        trackedPromptRef.current = promptKey;
        analytics.captureAction("timezone_prompt_shown", {
          saved_timezone: savedTimezone,
          detected_timezone: currentTimezone,
        });
      }
    }
  }, [data, dismissedPrompts, isAccountOwner]);

  const handleUpdateTimezone = () => {
    const currentTimezone = Intl.DateTimeFormat().resolvedOptions().timeZone;
    analytics.captureAction("timezone_prompt_accepted", {
      saved_timezone: data?.timezone,
      detected_timezone: currentTimezone,
    });
    executeUpdateTimezone({ timezone: currentTimezone });
  };

  const handleKeepCurrent = () => {
    // Remember this choice so we don't ask again for this timezone combination (for 30 days)
    const currentTimezone = Intl.DateTimeFormat().resolvedOptions().timeZone;
    analytics.captureAction("timezone_prompt_dismissed", {
      saved_timezone: data?.timezone,
      detected_timezone: currentTimezone,
    });
    if (data?.timezone) {
      const updated = addDismissedPrompt(
        dismissedPrompts,
        data.timezone,
        currentTimezone,
      );
      setDismissedPrompts(updated);
    }
    closeDialog();
  };

  const closeDialog = () => {
    setShowDialog(false);
    trackedPromptRef.current = null;
  };

  if (!data?.timezone) {
    return null;
  }

  const detectedTimezone = Intl.DateTimeFormat().resolvedOptions().timeZone;

  return (
    <Dialog
      open={showDialog}
      onOpenChange={(open) => {
        if (!open) handleKeepCurrent();
      }}
    >
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Timezone Change Detected</DialogTitle>
          <DialogDescription>
            Your saved timezone is <strong>{data.timezone}</strong>, but we
            detected that your current timezone is{" "}
            <strong>{detectedTimezone}</strong>. Would you like to update your
            timezone?
          </DialogDescription>
        </DialogHeader>
        <DialogFooter>
          <Button
            variant="outline"
            onClick={handleKeepCurrent}
            disabled={isExecuting}
          >
            Keep Current Setting
          </Button>
          <Button onClick={handleUpdateTimezone} loading={isExecuting}>
            Update to {detectedTimezone}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
