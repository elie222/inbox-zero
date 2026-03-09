"use client";

import Link from "next/link";
import { useAction } from "next-safe-action/hooks";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { SettingCard } from "@/components/SettingCard";
import { Toggle } from "@/components/Toggle";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { Textarea } from "@/components/ui/textarea";
import { toastSuccess } from "@/components/Toast";
import { useAutomationJob } from "@/hooks/useAutomationJob";
import { useMessagingChannels } from "@/hooks/useMessagingChannels";
import { useAccount } from "@/providers/EmailAccountProvider";
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
import { getMessagingProviderName } from "@/utils/messaging/platforms";
import { cn } from "@/utils";

export function ProactiveUpdatesSetting({
  emailAccountId: emailAccountIdProp,
}: {
  emailAccountId?: string;
} = {}) {
  const [open, setOpen] = useState(false);
  const [cronExpression, setCronExpression] = useState(
    DEFAULT_AUTOMATION_JOB_CRON,
  );
  const [messagingChannelId, setMessagingChannelId] = useState("");
  const [prompt, setPrompt] = useState("");
  const [showCronEditor, setShowCronEditor] = useState(false);
  const [showCustomPrompt, setShowCustomPrompt] = useState(false);
  const isDialogFormInitializedRef = useRef(false);

  const { emailAccountId: emailAccountIdFromContext } = useAccount();
  const emailAccountId = emailAccountIdProp ?? emailAccountIdFromContext;
  const { data, isLoading, mutate } = useAutomationJob(emailAccountIdProp);
  const {
    data: channelsData,
    isLoading: isLoadingChannels,
    mutate: mutateChannels,
  } = useMessagingChannels(emailAccountIdProp);

  const connectedMessagingChannels = useMemo(
    () =>
      channelsData?.channels.filter(
        (channel) => channel.isConnected && channel.hasSendDestination,
      ) ?? [],
    [channelsData?.channels],
  );

  const hasConnectedMessagingChannel = connectedMessagingChannels.length > 0;
  const job = data?.job ?? null;
  const enabled = Boolean(job?.enabled);

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
    setMessagingChannelId(job?.messagingChannelId ?? "");

    isDialogFormInitializedRef.current = true;
  }, [open, job]);

  useEffect(() => {
    if (!open) return;

    const hasSelectedConnectedChannel = connectedMessagingChannels.some(
      (channel) => channel.id === messagingChannelId,
    );

    if (hasSelectedConnectedChannel) return;

    const fallbackChannelId = connectedMessagingChannels[0]?.id ?? "";
    if (messagingChannelId === fallbackChannelId) return;

    setMessagingChannelId(fallbackChannelId);
  }, [open, connectedMessagingChannels, messagingChannelId]);

  const { execute: executeToggle, status: toggleStatus } = useAction(
    toggleAutomationJobAction.bind(null, emailAccountId),
    {
      onSuccess: () => {
        mutate();
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
        mutateChannels();
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
      onError: createSettingActionErrorHandler({
        defaultMessage: "Failed to send test check-in",
      }),
    },
  );

  const handleToggle = useCallback(
    (nextEnabled: boolean) => {
      if (!emailAccountId || (!hasConnectedMessagingChannel && nextEnabled))
        return;
      executeToggle({ enabled: nextEnabled });
    },
    [emailAccountId, hasConnectedMessagingChannel, executeToggle],
  );

  const selectedPreset = useMemo(() => {
    return (
      AUTOMATION_CRON_PRESETS.find(
        (preset) => preset.cronExpression === cronExpression,
      ) ?? null
    );
  }, [cronExpression]);

  const scheduleText = useMemo(
    () => describeCronSchedule(cronExpression),
    [cronExpression],
  );

  const handleSave = useCallback(() => {
    if (!messagingChannelId) return;

    executeSave({
      cronExpression,
      messagingChannelId,
      prompt,
    });
  }, [cronExpression, messagingChannelId, prompt, executeSave]);

  const showLoading = isLoading || isLoadingChannels;

  return (
    <SettingCard
      title="Scheduled check-ins"
      description="Get periodic updates sent to your connected chat app."
      right={
        showLoading ? (
          <Skeleton className="h-5 w-24" />
        ) : (
          <div className="flex items-center gap-2">
            {!hasConnectedMessagingChannel && (
              <Button asChild variant="outline" size="sm">
                <Link href="/settings">Connect channel</Link>
              </Button>
            )}

            {enabled && (
              <Dialog open={open} onOpenChange={setOpen}>
                <DialogTrigger asChild>
                  <Button variant="outline" size="sm">
                    Configure
                  </Button>
                </DialogTrigger>
                <DialogContent className="sm:max-w-lg">
                  <DialogHeader>
                    <DialogTitle>Scheduled check-ins</DialogTitle>
                    <DialogDescription>
                      Get notified about important emails and take action
                      directly from your connected chat app.
                    </DialogDescription>
                  </DialogHeader>

                  <div className="space-y-6">
                    <div className="space-y-2">
                      <Label htmlFor="scheduled-checkins-channel">
                        Send to
                      </Label>
                      <Select
                        value={messagingChannelId}
                        onValueChange={setMessagingChannelId}
                      >
                        <SelectTrigger id="scheduled-checkins-channel">
                          <SelectValue placeholder="Select a destination" />
                        </SelectTrigger>
                        <SelectContent>
                          {connectedMessagingChannels.map((channel) => (
                            <SelectItem key={channel.id} value={channel.id}>
                              {formatMessagingChannelLabel(channel)}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>

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
                            onChange={(event) =>
                              setCronExpression(event.target.value)
                            }
                            placeholder="Cron expression in UTC"
                          />
                          <p className="text-xs text-muted-foreground">
                            This is a cron expression (UTC). Ask ChatGPT or
                            Claude to generate one for your preferred schedule.
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
                          id="scheduled-checkins-prompt"
                          placeholder="Example: Only include emails that need a reply today or have a deadline in the next 2 days. Skip newsletters, receipts, and FYI updates."
                          value={prompt}
                          onChange={(event) => setPrompt(event.target.value)}
                        />
                      )}
                    </div>

                    <div className="flex items-center justify-between pt-2">
                      {job ? (
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
                          disabled={
                            !messagingChannelId || saveStatus === "executing"
                          }
                        >
                          {saveStatus === "executing" ? "Saving..." : "Save"}
                        </Button>
                      </div>
                    </div>
                  </div>
                </DialogContent>
              </Dialog>
            )}

            <Toggle
              name="proactive-updates-enabled"
              enabled={enabled}
              onChange={handleToggle}
              disabled={
                toggleStatus === "executing" ||
                !emailAccountId ||
                (!hasConnectedMessagingChannel && !enabled)
              }
            />
          </div>
        )
      }
    />
  );
}

function formatMessagingChannelLabel(channel: {
  provider: "SLACK" | "TEAMS" | "TELEGRAM";
  channelName: string | null;
  channelId: string | null;
  teamName: string | null;
}) {
  const provider = getMessagingProviderName(channel.provider);
  if (channel.channelName) return `${provider} · #${channel.channelName}`;
  if (channel.channelId) return `${provider} · ${channel.channelId}`;
  if (channel.teamName) return `${provider} · ${channel.teamName}`;
  return provider;
}
