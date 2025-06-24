"use client";

import { useState } from "react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { SchedulePicker } from "@/app/(app)/[emailAccountId]/settings/SchedulePicker";
import { updateDigestScheduleAction } from "@/utils/actions/settings";
import { toastError, toastSuccess } from "@/components/Toast";
import type { SaveDigestScheduleBody } from "@/utils/actions/settings.validation";
import { useAccount } from "@/providers/EmailAccountProvider";

interface DigestFrequencyDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function DigestFrequencyDialog({
  open,
  onOpenChange,
}: DigestFrequencyDialogProps) {
  const { emailAccountId } = useAccount();
  const [isLoading, setIsLoading] = useState(false);
  const [digestScheduleValue, setDigestScheduleValue] = useState<
    SaveDigestScheduleBody["schedule"]
  >({
    intervalDays: 7,
    daysOfWeek: 1 << (6 - 1), // Monday (1)
    timeOfDay: new Date(new Date().setHours(11, 0, 0, 0)), // 11 AM
    occurrences: 1,
  });

  const updateDigestSchedule = updateDigestScheduleAction.bind(
    null,
    emailAccountId,
  );

  const handleSave = async () => {
    if (!digestScheduleValue) return;

    setIsLoading(true);
    try {
      const result = await updateDigestSchedule({
        schedule: digestScheduleValue,
      });

      if (result?.serverError) {
        toastError({
          description: "Failed to save digest frequency. Please try again.",
        });
      } else {
        toastSuccess({ description: "Digest frequency saved!" });
        onOpenChange(false);
      }
    } catch (error) {
      toastError({
        description: "Failed to save digest frequency. Please try again.",
      });
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Digest Email Frequency</DialogTitle>
          <DialogDescription>
            Choose how often you want to receive your digest emails. These
            emails will include a summary of the actions taken on your behalf.
          </DialogDescription>
        </DialogHeader>
        <div className="py-4">
          <SchedulePicker onChange={setDigestScheduleValue} />
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button onClick={handleSave} loading={isLoading}>
            Save
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
