"use client";

import { useState, useCallback } from "react";
import { Button } from "@/components/ui/button";
import { SettingCard } from "@/components/SettingCard";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
} from "@/components/ui/select";
import { Label } from "@/components/ui/label";
import { Toggle } from "@/components/Toggle";
import { Badge } from "@/components/Badge";
import { useEmailAccountFull } from "@/hooks/useEmailAccountFull";
import { useFollowUpRemindersEnabled } from "@/hooks/useFeatureFlags";
import { useAccount } from "@/providers/EmailAccountProvider";
import { useAction } from "next-safe-action/hooks";
import { updateFollowUpSettingsAction } from "@/utils/actions/follow-up-reminders";
import { toastError, toastSuccess } from "@/components/Toast";
import { getEmailTerminology } from "@/utils/terminology";

const dayOptions = [
  { value: "1", label: "1 day" },
  { value: "3", label: "3 days" },
  { value: "7", label: "7 days" },
  { value: "14", label: "14 days" },
  { value: "30", label: "30 days" },
];

export function FollowUpRemindersSetting() {
  const isFeatureEnabled = useFollowUpRemindersEnabled();

  if (!isFeatureEnabled) return null;

  return <FollowUpRemindersSettingContent />;
}

function FollowUpRemindersSettingContent() {
  const [open, setOpen] = useState(false);
  const { data, mutate } = useEmailAccountFull();
  const { provider } = useAccount();
  const terminology = getEmailTerminology(provider);

  const enabled = data?.followUpRemindersEnabled ?? false;
  const awaitingDays = data?.followUpAwaitingReplyDays ?? 3;
  const needsReplyDays = data?.followUpNeedsReplyDays ?? 3;
  const autoDraftEnabled = data?.followUpAutoDraftEnabled ?? true;

  // Must define all hooks before any conditional returns to follow React hooks rules
  const { execute, isExecuting } = useAction(
    updateFollowUpSettingsAction.bind(null, data?.id ?? ""),
    {
      onSuccess: () => {
        toastSuccess({
          description: "Follow-up reminder settings updated!",
        });
        mutate();
      },
      onError: (error) => {
        mutate();
        toastError({
          description: error.error?.serverError ?? "Failed to update settings",
        });
      },
    },
  );

  const handleToggle = useCallback(
    (enable: boolean) => {
      if (!data) return;

      const optimisticData = {
        ...data,
        followUpRemindersEnabled: enable,
      };
      mutate(optimisticData, false);

      execute({
        followUpRemindersEnabled: enable,
        followUpAwaitingReplyDays: awaitingDays,
        followUpNeedsReplyDays: needsReplyDays,
        followUpAutoDraftEnabled: autoDraftEnabled,
      });
    },
    [data, mutate, execute, awaitingDays, needsReplyDays, autoDraftEnabled],
  );

  const handleAwaitingDaysChange = useCallback(
    (value: string) => {
      if (!data) return;

      const days = Number.parseInt(value, 10);
      const optimisticData = {
        ...data,
        followUpAwaitingReplyDays: days,
      };
      mutate(optimisticData, false);

      execute({
        followUpRemindersEnabled: enabled,
        followUpAwaitingReplyDays: days,
        followUpNeedsReplyDays: needsReplyDays,
        followUpAutoDraftEnabled: autoDraftEnabled,
      });
    },
    [data, mutate, execute, enabled, needsReplyDays, autoDraftEnabled],
  );

  const handleNeedsReplyDaysChange = useCallback(
    (value: string) => {
      if (!data) return;

      const days = Number.parseInt(value, 10);
      const optimisticData = {
        ...data,
        followUpNeedsReplyDays: days,
      };
      mutate(optimisticData, false);

      execute({
        followUpRemindersEnabled: enabled,
        followUpAwaitingReplyDays: awaitingDays,
        followUpNeedsReplyDays: days,
        followUpAutoDraftEnabled: autoDraftEnabled,
      });
    },
    [data, mutate, execute, enabled, awaitingDays, autoDraftEnabled],
  );

  const handleAutoDraftToggle = useCallback(
    (enable: boolean) => {
      if (!data) return;

      const optimisticData = {
        ...data,
        followUpAutoDraftEnabled: enable,
      };
      mutate(optimisticData, false);

      execute({
        followUpRemindersEnabled: enabled,
        followUpAwaitingReplyDays: awaitingDays,
        followUpNeedsReplyDays: needsReplyDays,
        followUpAutoDraftEnabled: enable,
      });
    },
    [data, mutate, execute, enabled, awaitingDays, needsReplyDays],
  );

  return (
    <SettingCard
      title="Follow-up Reminders"
      description="Get reminded when you haven't heard back or haven't replied."
      right={
        <div className="flex items-center gap-2">
          {enabled && (
            <Dialog open={open} onOpenChange={setOpen}>
              <DialogTrigger asChild>
                <Button variant="outline" size="sm">
                  Configure
                </Button>
              </DialogTrigger>
              <DialogContent>
                <DialogHeader>
                  <DialogTitle>Follow-up Reminders</DialogTitle>
                  <DialogDescription>
                    Get reminded about conversations that need attention.
                    <br />
                    We'll add a <Badge color="blue">Follow-up</Badge>{" "}
                    {terminology.label.singular} so you can easily find them.
                  </DialogDescription>
                </DialogHeader>

                <div className="space-y-4">
                  <div className="space-y-1">
                    <Label htmlFor="awaiting-days">
                      Remind me when they haven't replied after
                    </Label>
                    <Select
                      value={awaitingDays.toString()}
                      onValueChange={handleAwaitingDaysChange}
                      disabled={isExecuting}
                    >
                      <SelectTrigger id="awaiting-days">
                        {dayOptions.find(
                          (d) => d.value === awaitingDays.toString(),
                        )?.label ?? "Select..."}
                      </SelectTrigger>
                      <SelectContent>
                        {dayOptions.map((option) => (
                          <SelectItem key={option.value} value={option.value}>
                            {option.label}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>

                  <div className="space-y-1">
                    <Label htmlFor="needs-reply-days">
                      Remind me when I haven't replied after
                    </Label>
                    <Select
                      value={needsReplyDays.toString()}
                      onValueChange={handleNeedsReplyDaysChange}
                      disabled={isExecuting}
                    >
                      <SelectTrigger id="needs-reply-days">
                        {dayOptions.find(
                          (d) => d.value === needsReplyDays.toString(),
                        )?.label ?? "Select..."}
                      </SelectTrigger>
                      <SelectContent>
                        {dayOptions.map((option) => (
                          <SelectItem key={option.value} value={option.value}>
                            {option.label}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>

                  <div className="flex items-center justify-between">
                    <div>
                      <Label htmlFor="auto-draft-enabled">
                        Auto-generate drafts
                      </Label>
                      <p className="text-muted-foreground text-sm">
                        Draft a nudge when you haven't heard back.
                      </p>
                    </div>
                    <Toggle
                      name="auto-draft-enabled"
                      enabled={autoDraftEnabled}
                      onChange={handleAutoDraftToggle}
                      disabled={isExecuting}
                    />
                  </div>
                </div>
              </DialogContent>
            </Dialog>
          )}
          <Toggle
            name="follow-up-enabled"
            enabled={enabled}
            onChange={handleToggle}
            disabled={!data}
          />
        </div>
      }
    />
  );
}
