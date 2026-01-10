"use client";

import { useState, useCallback } from "react";
import { useForm, Controller } from "react-hook-form";
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
import {
  toggleFollowUpRemindersAction,
  updateFollowUpSettingsAction,
} from "@/utils/actions/follow-up-reminders";
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

  const enabled = data?.followUpRemindersEnabled ?? false;

  const { execute: executeToggle } = useAction(
    toggleFollowUpRemindersAction.bind(null, data?.id ?? ""),
    {
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
      executeToggle({ enabled: enable });
    },
    [data, mutate, executeToggle],
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
              <FollowUpSettingsDialog
                emailAccountId={data?.id ?? ""}
                awaitingDays={data?.followUpAwaitingReplyDays ?? 3}
                needsReplyDays={data?.followUpNeedsReplyDays ?? 3}
                autoDraftEnabled={data?.followUpAutoDraftEnabled ?? true}
                onSuccess={() => {
                  mutate();
                  setOpen(false);
                }}
              />
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

interface FollowUpSettingsFormValues {
  awaitingDays: number;
  needsReplyDays: number;
  autoDraftEnabled: boolean;
}

function FollowUpSettingsDialog({
  emailAccountId,
  awaitingDays,
  needsReplyDays,
  autoDraftEnabled,
  onSuccess,
}: {
  emailAccountId: string;
  awaitingDays: number;
  needsReplyDays: number;
  autoDraftEnabled: boolean;
  onSuccess: () => void;
}) {
  const { provider } = useAccount();
  const terminology = getEmailTerminology(provider);

  const { control, handleSubmit } = useForm<FollowUpSettingsFormValues>({
    defaultValues: {
      awaitingDays,
      needsReplyDays,
      autoDraftEnabled,
    },
  });

  const { execute, isExecuting } = useAction(
    updateFollowUpSettingsAction.bind(null, emailAccountId),
    {
      onSuccess: () => {
        toastSuccess({ description: "Settings saved!" });
        onSuccess();
      },
      onError: (error) => {
        toastError({
          description: error.error?.serverError ?? "Failed to save settings",
        });
      },
    },
  );

  const onSubmit = (data: FollowUpSettingsFormValues) => {
    execute({
      followUpAwaitingReplyDays: data.awaitingDays,
      followUpNeedsReplyDays: data.needsReplyDays,
      followUpAutoDraftEnabled: data.autoDraftEnabled,
    });
  };

  return (
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

      <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
        <Controller
          name="awaitingDays"
          control={control}
          render={({ field }) => (
            <div className="space-y-1">
              <Label htmlFor="awaiting-days">
                Remind me when they haven't replied after
              </Label>
              <Select
                value={field.value.toString()}
                onValueChange={(value) =>
                  field.onChange(Number.parseInt(value, 10))
                }
              >
                <SelectTrigger id="awaiting-days">
                  {dayOptions.find((d) => d.value === field.value.toString())
                    ?.label ?? "Select..."}
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
          )}
        />

        <Controller
          name="needsReplyDays"
          control={control}
          render={({ field }) => (
            <div className="space-y-1">
              <Label htmlFor="needs-reply-days">
                Remind me when I haven't replied after
              </Label>
              <Select
                value={field.value.toString()}
                onValueChange={(value) =>
                  field.onChange(Number.parseInt(value, 10))
                }
              >
                <SelectTrigger id="needs-reply-days">
                  {dayOptions.find((d) => d.value === field.value.toString())
                    ?.label ?? "Select..."}
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
          )}
        />

        <Controller
          name="autoDraftEnabled"
          control={control}
          render={({ field }) => (
            <div className="flex items-center justify-between">
              <div>
                <Label htmlFor="auto-draft-enabled">Auto-generate drafts</Label>
                <p className="text-muted-foreground text-sm">
                  Draft a nudge when you haven't heard back.
                </p>
              </div>
              <Toggle
                name="auto-draft-enabled"
                enabled={field.value}
                onChange={field.onChange}
              />
            </div>
          )}
        />

        <Button type="submit" size="sm" loading={isExecuting}>
          Save
        </Button>
      </form>
    </DialogContent>
  );
}
