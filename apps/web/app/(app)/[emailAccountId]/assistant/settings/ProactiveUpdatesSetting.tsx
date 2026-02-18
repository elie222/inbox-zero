"use client";

import Link from "next/link";
import { useAction } from "next-safe-action/hooks";
import { useCallback, useEffect, useMemo, useState } from "react";
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
import { toastError, toastSuccess } from "@/components/Toast";
import { AutomationJobType } from "@/generated/prisma/enums";
import { useAutomationJob } from "@/hooks/useAutomationJob";
import { useMessagingChannels } from "@/hooks/useMessagingChannels";
import { useAccount } from "@/providers/EmailAccountProvider";
import {
  saveAutomationJobAction,
  toggleAutomationJobAction,
} from "@/utils/actions/automation-jobs";
import { getActionErrorMessage } from "@/utils/error";
import {
  AUTOMATION_CRON_PRESETS,
  DEFAULT_AUTOMATION_JOB_CRON,
} from "@/utils/automation-jobs/defaults";

export function ProactiveUpdatesSetting() {
  const [open, setOpen] = useState(false);
  const [cronExpression, setCronExpression] = useState(
    DEFAULT_AUTOMATION_JOB_CRON,
  );
  const [messagingChannelId, setMessagingChannelId] = useState("");
  const [prompt, setPrompt] = useState("");
  const [showCronEditor, setShowCronEditor] = useState(false);
  const [showCustomPrompt, setShowCustomPrompt] = useState(false);

  const { emailAccountId } = useAccount();
  const { data, isLoading, mutate } = useAutomationJob(emailAccountId);
  const {
    data: channelsData,
    isLoading: isLoadingChannels,
    mutate: mutateChannels,
  } = useMessagingChannels(emailAccountId);

  const connectedSlackChannels = useMemo(
    () =>
      channelsData?.channels.filter(
        (channel) =>
          channel.provider === "SLACK" &&
          channel.isConnected &&
          channel.hasSendDestination,
      ) ?? [],
    [channelsData?.channels],
  );

  const hasConnectedSlack = connectedSlackChannels.length > 0;
  const job = data?.job ?? null;
  const enabled = Boolean(job?.enabled);
  const resolvedJobType = job?.jobType ?? AutomationJobType.INBOX_NUDGE;

  useEffect(() => {
    if (!open) return;

    setCronExpression(job?.cronExpression ?? DEFAULT_AUTOMATION_JOB_CRON);
    setPrompt(job?.prompt ?? "");
    setShowCustomPrompt(Boolean(job?.prompt?.trim()));
    setShowCronEditor(false);
    setMessagingChannelId(
      job?.messagingChannelId ?? connectedSlackChannels[0]?.id ?? "",
    );
  }, [open, job, connectedSlackChannels]);

  const { execute: executeToggle, status: toggleStatus } = useAction(
    toggleAutomationJobAction.bind(null, emailAccountId),
    {
      onSuccess: () => {
        mutate();
        toastSuccess({ description: "Scheduled check-ins updated" });
      },
      onError: (error) => {
        mutate();
        toastError({
          description:
            getActionErrorMessage(error.error) ?? "Failed to update setting",
        });
      },
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
      onError: (error) => {
        toastError({
          description:
            getActionErrorMessage(error.error) ?? "Failed to save settings",
        });
      },
    },
  );

  const handleToggle = useCallback(
    (nextEnabled: boolean) => {
      if (!emailAccountId || (!hasConnectedSlack && nextEnabled)) return;
      executeToggle({ enabled: nextEnabled });
    },
    [emailAccountId, hasConnectedSlack, executeToggle],
  );

  const selectedPreset = useMemo(() => {
    return (
      AUTOMATION_CRON_PRESETS.find(
        (preset) => preset.cronExpression === cronExpression,
      ) ?? null
    );
  }, [cronExpression]);

  const scheduleText = selectedPreset
    ? selectedPreset.scheduleText
    : `Custom cron: ${cronExpression}`;

  const handleSave = useCallback(() => {
    if (!messagingChannelId) return;

    executeSave({
      cronExpression,
      jobType: resolvedJobType,
      messagingChannelId,
      prompt,
    });
  }, [
    cronExpression,
    resolvedJobType,
    messagingChannelId,
    prompt,
    executeSave,
  ]);

  const showLoading = isLoading || isLoadingChannels;

  return (
    <SettingCard
      title="Scheduled check-ins"
      description="Get inbox briefings on a schedule. Reply to take action."
      right={
        showLoading ? (
          <Skeleton className="h-5 w-24" />
        ) : (
          <div className="flex items-center gap-2">
            {!hasConnectedSlack && (
              <Button asChild variant="outline" size="sm">
                <Link href="/settings">Connect Slack</Link>
              </Button>
            )}

            {enabled && (
              <Dialog open={open} onOpenChange={setOpen}>
                <DialogTrigger asChild>
                  <Button variant="outline" size="sm">
                    Configure
                  </Button>
                </DialogTrigger>
                <DialogContent className="max-w-5xl p-0">
                  <div className="grid divide-y md:grid-cols-2 md:divide-x md:divide-y-0">
                    <div className="p-6">
                      <DialogHeader className="space-y-2">
                        <DialogTitle>Scheduled check-ins</DialogTitle>
                        <DialogDescription>
                          Your assistant messages you with inbox updates. Reply
                          to take action.
                        </DialogDescription>
                      </DialogHeader>

                      <div className="mt-6 space-y-6">
                        <div className="space-y-2">
                          <Label htmlFor="scheduled-checkins-channel">
                            Slack channel
                          </Label>
                          <Select
                            value={messagingChannelId}
                            onValueChange={setMessagingChannelId}
                          >
                            <SelectTrigger id="scheduled-checkins-channel">
                              <SelectValue placeholder="Select a Slack channel" />
                            </SelectTrigger>
                            <SelectContent>
                              {connectedSlackChannels.map((channel) => (
                                <SelectItem key={channel.id} value={channel.id}>
                                  {formatSlackChannelLabel(channel)}
                                </SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                          <p className="text-xs text-muted-foreground">
                            Telegram & WhatsApp coming soon
                          </p>
                        </div>

                        <div className="space-y-3">
                          <Label>Schedule</Label>
                          <div className="grid grid-cols-3 gap-2">
                            {AUTOMATION_CRON_PRESETS.map((preset) => (
                              <Button
                                key={preset.id}
                                type="button"
                                variant={
                                  selectedPreset?.id === preset.id
                                    ? "default"
                                    : "outline"
                                }
                                className="w-full"
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
                            <button
                              type="button"
                              className="underline underline-offset-2"
                              onClick={() =>
                                setShowCronEditor((value) => !value)
                              }
                            >
                              {showCronEditor ? "done" : "edit"}
                            </button>
                          </div>
                          {showCronEditor && (
                            <Input
                              value={cronExpression}
                              onChange={(event) =>
                                setCronExpression(event.target.value)
                              }
                              placeholder="Cron expression in UTC"
                            />
                          )}
                        </div>

                        <div className="space-y-2">
                          <button
                            type="button"
                            className="text-sm text-muted-foreground"
                            onClick={() =>
                              setShowCustomPrompt((value) => !value)
                            }
                          >
                            + Customize what's included
                          </button>
                          {showCustomPrompt && (
                            <Textarea
                              id="scheduled-checkins-prompt"
                              placeholder="Add custom instructions for what should be included."
                              value={prompt}
                              onChange={(event) =>
                                setPrompt(event.target.value)
                              }
                            />
                          )}
                        </div>

                        <div className="flex justify-end gap-2 pt-2">
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

                    <div className="bg-muted/20 p-6">
                      <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                        How it works
                      </p>
                      <HowItWorksPreview />
                      <div className="mt-4 space-y-2 text-sm text-muted-foreground">
                        <p>- AI sends check-ins at your scheduled times</p>
                        <p>- Reply in Slack to take action</p>
                        <p>- Handle replies, archive, or snooze from chat</p>
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
                (!hasConnectedSlack && !enabled)
              }
            />
          </div>
        )
      }
    />
  );
}

function formatSlackChannelLabel(channel: {
  channelName: string | null;
  channelId: string | null;
  teamName: string | null;
}) {
  if (channel.channelName) return `#${channel.channelName}`;
  if (channel.channelId) return `Channel ${channel.channelId}`;
  if (channel.teamName) return channel.teamName;
  return "Slack workspace";
}

function HowItWorksPreview() {
  return (
    <div className="mt-3 rounded-md border bg-background p-3 text-sm">
      <p className="text-xs text-muted-foreground">#inbox-updates</p>
      <div className="mt-3 space-y-3">
        <div className="rounded-md bg-muted/50 p-2">
          <p className="font-medium">Inbox Zero</p>
          <p className="text-muted-foreground">You have 7 new emails.</p>
          <p className="text-muted-foreground">2 urgent, 5 low priority.</p>
        </div>
        <div className="rounded-md border border-blue-100 bg-blue-50 p-2">
          <p className="font-medium text-blue-900">You</p>
          <p className="text-blue-900">Reply to Sara: Let's do Thursday 2pm.</p>
        </div>
        <div className="rounded-md bg-muted/50 p-2">
          <p className="font-medium">Inbox Zero</p>
          <p className="text-muted-foreground">
            Draft ready to send. Archive the rest?
          </p>
        </div>
      </div>
    </div>
  );
}
