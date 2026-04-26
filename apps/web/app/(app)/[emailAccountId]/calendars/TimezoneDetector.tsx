"use client";

import { useEffect, useState } from "react";
import { useLocalStorage } from "usehooks-ts";
import { useCalendars } from "@/hooks/useCalendars";
import { useAction } from "next-safe-action/hooks";
import { updateEmailAccountTimezoneAction } from "@/utils/actions/calendar";
import { useAccount } from "@/providers/EmailAccountProvider";
import {
  addDismissedPrompt,
  shouldShowTimezonePrompt,
  type DismissedPrompt,
} from "./TimezoneDetector.utils";
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

export function TimezoneDetector() {
  const { emailAccountId } = useAccount();
  const { data, mutate } = useCalendars();
  const [showDialog, setShowDialog] = useState(false);
  const [dismissedPrompts, setDismissedPrompts] = useLocalStorage<
    DismissedPrompt[]
  >(`timezone-prompts-dismissed-${emailAccountId}`, []);

  const { execute: executeUpdateTimezone, isExecuting } = useAction(
    updateEmailAccountTimezoneAction.bind(null, emailAccountId),
    {
      onSuccess: () => {
        toastSuccess({ description: "Timezone updated!" });
        setShowDialog(false);
      },
      onSettled: () => {
        mutate();
      },
    },
  );

  // biome-ignore lint/correctness/useExhaustiveDependencies: executeUpdateTimezone is stable from useAction and causes infinite loops if included
  useEffect(() => {
    if (!data) return;

    const currentTimezone = Intl.DateTimeFormat().resolvedOptions().timeZone;
    const savedTimezone = data.timezone;

    // Case 1: No timezone set - automatically set it
    if (savedTimezone === null) {
      executeUpdateTimezone({ timezone: currentTimezone });
      return;
    }

    // Case 2: Timezone is different - show dialog (unless recently dismissed)
    if (
      shouldShowTimezonePrompt(savedTimezone, currentTimezone, dismissedPrompts)
    ) {
      setShowDialog(true);
    }
  }, [data, dismissedPrompts]);

  const handleUpdateTimezone = () => {
    const currentTimezone = Intl.DateTimeFormat().resolvedOptions().timeZone;
    executeUpdateTimezone({ timezone: currentTimezone });
  };

  const handleKeepCurrent = () => {
    // Remember this choice so we don't ask again for this timezone combination (for 30 days)
    const currentTimezone = Intl.DateTimeFormat().resolvedOptions().timeZone;
    if (data?.timezone) {
      const updated = addDismissedPrompt(
        dismissedPrompts,
        data.timezone,
        currentTimezone,
      );
      setDismissedPrompts(updated);
    }
    setShowDialog(false);
  };

  if (!data?.timezone) {
    return null;
  }

  const detectedTimezone = Intl.DateTimeFormat().resolvedOptions().timeZone;

  return (
    <Dialog open={showDialog} onOpenChange={setShowDialog}>
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
