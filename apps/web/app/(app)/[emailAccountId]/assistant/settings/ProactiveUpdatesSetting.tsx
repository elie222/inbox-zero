"use client";

import { Settings2Icon } from "lucide-react";
import { useAction } from "next-safe-action/hooks";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { SlackNotificationTargetSelect } from "@/components/SlackNotificationTargetSelect";
import { Tooltip } from "@/components/Tooltip";
import { Toggle } from "@/components/Toggle";
import { toastError, toastSuccess } from "@/components/Toast";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import {
  Item,
  ItemActions,
  ItemContent,
  ItemDescription,
  ItemTitle,
} from "@/components/ui/item";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { useAutomationJob } from "@/hooks/useAutomationJob";
import {
  saveAutomationJobAction,
  toggleAutomationJobAction,
  triggerTestCheckInAction,
} from "@/utils/actions/automation-jobs";
import { createSettingActionErrorHandler } from "@/utils/actions/error-handling";
import {
  AUTOMATION_CRON_PRESETS,
  DEFAULT_AUTOMATION_JOB_CRON,
} from "@/utils/automation-jobs/defaults";
import { describeCronSchedule } from "@/utils/automation-jobs/describe";
import { getActionErrorMessage } from "@/utils/error";
import { getMessagingProviderName } from "@/utils/messaging/platforms";
import { cn } from "@/utils";
import {
  MessagingProvider,
  MessagingRoutePurpose,
} from "@/generated/prisma/enums";
import type { GetMessagingChannelsResponse } from "@/app/api/user/messaging-channels/route";

type Channel = GetMessagingChannelsResponse["channels"][number];

export function ProactiveUpdatesSetting({
  channel,
  emailAccountId,
  onUpdate,
}: {
  channel: Channel;
  emailAccountId: string;
  onUpdate: () => void;
}) {
  const [open, setOpen] = useState(false);
  const [cronExpression, setCronExpression] = useState(
    DEFAULT_AUTOMATION_JOB_CRON,
  );
  const [prompt, setPrompt] = useState("");
  const [showCronEditor, setShowCronEditor] = useState(false);
  const [showCustomPrompt, setShowCustomPrompt] = useState(false);
  const isDialogFormInitializedRef = useRef(false);

  const { data, isLoading, mutate } = useAutomationJob(emailAccountId);
  const job = data?.job ?? null;
  const activeForChannel = job?.messagingChannelId === channel.id;
  const enabled = activeForChannel && Boolean(job?.enabled);

  useEffect(() => {
    if (!open) {
      isDialogFormInitializedRef.current = false;
      return;
    }

    if (isDialogFormInitializedRef.current) return;

    setCronExpression(job?.cronExpression ?? DEFAULT_AUTOMATION_JOB_CRON);
    setPrompt(job?.prompt ?? "");
    setShowCustomPrompt(Boolean(job?.prompt?.trim()));
    setShowCronEditor(false);

    isDialogFormInitializedRef.current = true;
  }, [open, job]);

  const { execute: executeToggle, status: toggleStatus } = useAction(
    toggleAutomationJobAction.bind(null, emailAccountId),
    {
      onSuccess: () => {
        mutate();
        onUpdate();
        toastSuccess({ description: "Scheduled check-ins updated" });
      },
      onError: createSettingActionErrorHandler({
        mutate,
        defaultMessage: "Failed to update setting",
      }),
    },
  );

  const { execute: executeSave, status: saveStatus } = useAction(
    saveAutomationJobAction.bind(null, emailAccountId),
    {
      onSuccess: () => {
        mutate();
        onUpdate();
        setOpen(false);
        toastSuccess({ description: "Scheduled check-in settings saved" });
      },
      onError: createSettingActionErrorHandler({
        defaultMessage: "Failed to save settings",
      }),
    },
  );

  const { execute: executeTestCheckIn, status: testCheckInStatus } = useAction(
    triggerTestCheckInAction.bind(null, emailAccountId),
    {
      onSuccess: () => {
        toastSuccess({ description: "Test check-in sent" });
      },
      onError: (error) => {
        const description =
          getActionErrorMessage(error.error) ?? "Failed to send test check-in";
        toastError({ description });
      },
    },
  );

  const handleToggle = useCallback(
    (nextEnabled: boolean) => {
      if (!nextEnabled) {
        if (!enabled) return;
        executeToggle({ enabled: false });
        return;
      }

      if (activeForChannel && job) {
        executeToggle({ enabled: true });
        return;
      }

      setOpen(true);
    },
    [activeForChannel, enabled, executeToggle, job],
  );

  const selectedPreset = useMemo(
    () =>
      AUTOMATION_CRON_PRESETS.find(
        (preset) => preset.cronExpression === cronExpression,
      ) ?? null,
    [cronExpression],
  );

  const scheduleText = useMemo(
    () => describeCronSchedule(cronExpression),
    [cronExpression],
  );
  const destinationLabel = getScheduledCheckInsDestinationLabel(channel);
  const summaryText =
    activeForChannel && job
      ? `${describeCronSchedule(job.cronExpression ?? DEFAULT_AUTOMATION_JOB_CRON)}. ${destinationLabel}`
      : "Get periodic summaries in chat.";

  const handleSave = useCallback(() => {
    executeSave({
      cronExpression,
      messagingChannelId: channel.id,
      prompt,
    });
  }, [channel.id, cronExpression, executeSave, prompt]);

  return (
    <>
      <Item size="sm">
        <ItemContent>
          <ItemTitle>Scheduled check-ins</ItemTitle>
          <ItemDescription>{summaryText}</ItemDescription>
        </ItemContent>
        <ItemActions>
          <Tooltip content="Configure">
            <Button
              variant="ghost"
              size="icon"
              className="h-8 w-8"
              onClick={() => setOpen(true)}
            >
              <Settings2Icon className="h-4 w-4" />
            </Button>
          </Tooltip>
          {channel.provider === MessagingProvider.SLACK ? (
            <SlackNotificationTargetSelect
              emailAccountId={emailAccountId}
              messagingChannelId={channel.id}
              purpose={MessagingRoutePurpose.SCHEDULED_CHECK_INS}
              value={getSlackScheduledCheckInsTargetValue(channel)}
              targetId={channel.destinations.scheduledCheckIns.targetId}
              targetLabel={channel.destinations.scheduledCheckIns.targetLabel}
              isDm={channel.destinations.scheduledCheckIns.isDm}
              canSendAsDm={channel.canSendAsDm}
              onUpdate={onUpdate}
              disabled={saveStatus === "executing"}
              className="h-8 min-w-[170px]"
            />
          ) : (
            <div className="min-w-[120px] text-right text-sm text-muted-foreground">
              {destinationLabel}
            </div>
          )}
          <Toggle
            name={`scheduled-checkins-${channel.id}`}
            enabled={enabled}
            disabled={toggleStatus === "executing" || isLoading}
            onChange={handleToggle}
          />
        </ItemActions>
      </Item>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>Scheduled check-ins</DialogTitle>
            <DialogDescription>
              Configure when Inbox Zero sends scheduled summaries to{" "}
              {getMessagingProviderName(channel.provider)}.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-6">
            <div className="space-y-3">
              <Label>Schedule</Label>
              <div className="grid grid-cols-3 gap-2">
                {AUTOMATION_CRON_PRESETS.map((preset) => (
                  <Button
                    key={preset.id}
                    type="button"
                    variant="outline"
                    className={cn(
                      "w-full",
                      selectedPreset?.id === preset.id &&
                        "border-primary ring-1 ring-primary",
                    )}
                    onClick={() => {
                      setCronExpression(preset.cronExpression);
                      setShowCronEditor(false);
                    }}
                  >
                    {preset.label}
                  </Button>
                ))}
              </div>
              <div className="flex items-center justify-between text-xs text-muted-foreground">
                <span>{scheduleText}</span>
                <Button
                  variant="ghost"
                  size="xs"
                  onClick={() => setShowCronEditor((value) => !value)}
                >
                  {showCronEditor ? "done" : "edit"}
                </Button>
              </div>
              {showCronEditor && (
                <>
                  <Input
                    value={cronExpression}
                    onChange={(event) => setCronExpression(event.target.value)}
                    placeholder="Cron expression in UTC"
                  />
                  <p className="text-xs text-muted-foreground">
                    This is a cron expression (UTC). Ask ChatGPT or Claude to
                    generate one for your preferred schedule.
                  </p>
                </>
              )}
            </div>

            <div className="space-y-2">
              <Button
                variant="ghost"
                size="sm"
                onClick={() => setShowCustomPrompt((value) => !value)}
              >
                + Add check-in instructions
              </Button>
              {showCustomPrompt && (
                <Textarea
                  id={`scheduled-checkins-prompt-${channel.id}`}
                  placeholder="Example: Only include emails that need a reply today or have a deadline in the next 2 days. Skip newsletters, receipts, and FYI updates."
                  value={prompt}
                  onChange={(event) => setPrompt(event.target.value)}
                />
              )}
            </div>

            <div className="flex items-center justify-between pt-2">
              {activeForChannel && job ? (
                <Button
                  variant="ghost"
                  disabled={testCheckInStatus === "executing"}
                  onClick={() => executeTestCheckIn({})}
                >
                  {testCheckInStatus === "executing"
                    ? "Sending..."
                    : "Send test check-in"}
                </Button>
              ) : (
                <div />
              )}
              <div className="flex gap-2">
                <Button
                  variant="outline"
                  onClick={() => setOpen(false)}
                  disabled={saveStatus === "executing"}
                >
                  Cancel
                </Button>
                <Button
                  onClick={handleSave}
                  disabled={saveStatus === "executing"}
                >
                  {saveStatus === "executing" ? "Saving..." : "Save"}
                </Button>
              </div>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}

function getSlackScheduledCheckInsTargetValue(channel: Channel) {
  const destination = channel.destinations.scheduledCheckIns;
  if (destination.isDm) return "dm";
  if (destination.targetId) return destination.targetId;
  if (channel.canSendAsDm) return "dm";
  return null;
}

function getScheduledCheckInsDestinationLabel(channel: Channel) {
  const destination = channel.destinations.scheduledCheckIns;
  if (destination.targetLabel) return destination.targetLabel;
  if (
    channel.destinations.scheduledCheckIns.isDm ||
    channel.provider !== MessagingProvider.SLACK ||
    channel.canSendAsDm
  ) {
    return "Direct message";
  }

  if (channel.teamName) {
    return `${getMessagingProviderName(channel.provider)} workspace`;
  }

  return "Select destination";
}
