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
import { useEmailAccountFull } from "@/hooks/useEmailAccountFull";
import { useAction } from "next-safe-action/hooks";
import { updateFollowUpSettingsAction } from "@/utils/actions/follow-up-reminders";
import { toastError, toastSuccess } from "@/components/Toast";
import { LoadingContent } from "@/components/LoadingContent";
import { Skeleton } from "@/components/ui/skeleton";

const dayOptions = [
  { value: "1", label: "1 day" },
  { value: "3", label: "3 days" },
  { value: "7", label: "7 days" },
  { value: "14", label: "14 days" },
];

export function FollowUpRemindersSetting() {
  const [open, setOpen] = useState(false);
  const { data, isLoading, error, mutate } = useEmailAccountFull();

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
          description: error.error.serverError ?? "Failed to update settings",
        });
      },
    },
  );

  const enabled = data?.followUpRemindersEnabled ?? false;
  const awaitingDays = data?.followUpAwaitingReplyDays ?? 3;
  const needsReplyDays = data?.followUpNeedsReplyDays ?? 3;

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
      });
    },
    [data, mutate, execute, awaitingDays, needsReplyDays],
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
      });
    },
    [data, mutate, execute, enabled, needsReplyDays],
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
      });
    },
    [data, mutate, execute, enabled, awaitingDays],
  );

  return (
    <SettingCard
      title="Follow-up Reminders"
      description="Get reminded when you haven't heard back or haven't replied."
      right={
        <Dialog open={open} onOpenChange={setOpen}>
          <DialogTrigger asChild>
            <Button variant="outline" size="sm">
              Configure
            </Button>
          </DialogTrigger>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Follow-up Reminder Settings</DialogTitle>
              <DialogDescription>
                Configure when to receive follow-up reminders for your
                conversations.
              </DialogDescription>
            </DialogHeader>

            <LoadingContent
              loading={isLoading}
              error={error}
              loadingComponent={<Skeleton className="min-h-[200px] w-full" />}
            >
              <div className="space-y-6 py-4">
                <div className="flex items-center justify-between">
                  <Label htmlFor="follow-up-enabled">
                    Enable follow-up reminders
                  </Label>
                  <Toggle
                    name="follow-up-enabled"
                    enabled={enabled}
                    onChange={handleToggle}
                    disabled={isExecuting}
                  />
                </div>

                <div className="space-y-4">
                  <div className="space-y-2">
                    <Label htmlFor="awaiting-days">
                      Remind me when I haven't heard back
                    </Label>
                    <Select
                      value={awaitingDays.toString()}
                      onValueChange={handleAwaitingDaysChange}
                      disabled={!enabled || isExecuting}
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
                    <p className="text-muted-foreground text-sm">
                      A "Follow-up" label will be added to threads where you're
                      awaiting a reply.
                    </p>
                  </div>

                  <div className="space-y-2">
                    <Label htmlFor="needs-reply-days">
                      Remind me when I haven't replied
                    </Label>
                    <Select
                      value={needsReplyDays.toString()}
                      onValueChange={handleNeedsReplyDaysChange}
                      disabled={!enabled || isExecuting}
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
                    <p className="text-muted-foreground text-sm">
                      A "Follow-up" label will be added to threads where you
                      need to reply.
                    </p>
                  </div>
                </div>
              </div>
            </LoadingContent>
          </DialogContent>
        </Dialog>
      }
    />
  );
}
