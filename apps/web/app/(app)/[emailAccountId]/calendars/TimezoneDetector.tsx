"use client";

import { useEffect, useState } from "react";
import { useLocalStorage } from "usehooks-ts";
import { useCalendars } from "@/hooks/useCalendars";
import { useAction } from "next-safe-action/hooks";
import { updateEmailAccountTimezoneAction } from "@/utils/actions/calendar";
import { useAccount } from "@/providers/EmailAccountProvider";
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

export type DismissedPrompt = {
  saved: string;
  detected: string;
  dismissedAt: number; // timestamp
};

export const DISMISSAL_EXPIRY_DAYS = 30;

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

/**
 * Check if a timezone prompt should be shown based on dismissal history
 */
export function shouldShowTimezonePrompt(
  savedTimezone: string,
  detectedTimezone: string,
  dismissedPrompts: DismissedPrompt[],
): boolean {
  // If timezones match, don't show prompt
  if (savedTimezone === detectedTimezone) {
    return false;
  }

  // Check if this combination was recently dismissed
  const now = Date.now();
  const expiryMs = DISMISSAL_EXPIRY_DAYS * 24 * 60 * 60 * 1000;

  const recentlyDismissed = dismissedPrompts.some(
    (prompt) =>
      prompt.saved === savedTimezone &&
      prompt.detected === detectedTimezone &&
      now - prompt.dismissedAt < expiryMs,
  );

  return !recentlyDismissed;
}

/**
 * Add a new dismissal to the list, replacing any existing one for the same timezone combination
 */
export function addDismissedPrompt(
  dismissedPrompts: DismissedPrompt[],
  savedTimezone: string,
  detectedTimezone: string,
): DismissedPrompt[] {
  // Remove any old dismissals for this combination
  const filtered = dismissedPrompts.filter(
    (prompt) =>
      !(prompt.saved === savedTimezone && prompt.detected === detectedTimezone),
  );

  // Add the new dismissal
  return [
    ...filtered,
    {
      saved: savedTimezone,
      detected: detectedTimezone,
      dismissedAt: Date.now(),
    },
  ];
}
