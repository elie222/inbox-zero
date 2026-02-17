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
  const [jobType, setJobType] = useState<AutomationJobType>(
    AutomationJobType.INBOX_NUDGE,
  );
  const [cronExpression, setCronExpression] = useState(
    DEFAULT_AUTOMATION_JOB_CRON,
  );
  const [messagingChannelId, setMessagingChannelId] = useState("");
  const [prompt, setPrompt] = useState("");

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

  useEffect(() => {
    if (!open) return;

    setJobType(job?.jobType ?? AutomationJobType.INBOX_NUDGE);
    setCronExpression(job?.cronExpression ?? DEFAULT_AUTOMATION_JOB_CRON);
    setPrompt(job?.prompt ?? "");
    setMessagingChannelId(
      job?.messagingChannelId ?? connectedSlackChannels[0]?.id ?? "",
    );
  }, [open, job, connectedSlackChannels]);

  const { execute: executeToggle, status: toggleStatus } = useAction(
    toggleAutomationJobAction.bind(null, emailAccountId),
    {
      onSuccess: () => {
        mutate();
        toastSuccess({ description: "Proactive updates updated" });
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
        toastSuccess({ description: "Proactive update settings saved" });
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

  const scheduleOptions = useMemo(() => {
    if (
      AUTOMATION_CRON_PRESETS.some(
        (preset) => preset.cronExpression === cronExpression,
      )
    ) {
      return AUTOMATION_CRON_PRESETS;
    }

    return [
      ...AUTOMATION_CRON_PRESETS,
      { cronExpression, label: `Custom (${cronExpression})` },
    ];
  }, [cronExpression]);

  const handleSave = useCallback(() => {
    if (!messagingChannelId) return;

    executeSave({
      cronExpression,
      jobType,
      messagingChannelId,
      prompt,
    });
  }, [cronExpression, jobType, messagingChannelId, prompt, executeSave]);

  const showLoading = isLoading || isLoadingChannels;

  return (
    <SettingCard
      title="Proactive updates"
      description={
        hasConnectedSlack
          ? "Send inbox nudges or summaries to Slack on a schedule."
          : "Connect Slack in Settings to enable proactive updates."
      }
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
                <DialogContent>
                  <DialogHeader>
                    <DialogTitle>Proactive updates</DialogTitle>
                    <DialogDescription>
                      Choose what to send, when to send it, and where to send it
                      in Slack.
                    </DialogDescription>
                  </DialogHeader>

                  <div className="space-y-4">
                    <div className="space-y-2">
                      <Label htmlFor="proactive-job-type">Message type</Label>
                      <Select
                        value={jobType}
                        onValueChange={(value) =>
                          setJobType(value as AutomationJobType)
                        }
                      >
                        <SelectTrigger id="proactive-job-type">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value={AutomationJobType.INBOX_NUDGE}>
                            Quick nudge
                          </SelectItem>
                          <SelectItem value={AutomationJobType.INBOX_SUMMARY}>
                            Inbox summary
                          </SelectItem>
                        </SelectContent>
                      </Select>
                    </div>

                    <div className="space-y-2">
                      <Label htmlFor="proactive-cron">Schedule</Label>
                      <Select
                        value={cronExpression}
                        onValueChange={setCronExpression}
                      >
                        <SelectTrigger id="proactive-cron">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          {scheduleOptions.map((preset) => (
                            <SelectItem
                              key={preset.cronExpression}
                              value={preset.cronExpression}
                            >
                              {preset.label}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>

                    <div className="space-y-2">
                      <Label htmlFor="proactive-channel">
                        Slack destination
                      </Label>
                      <Select
                        value={messagingChannelId}
                        onValueChange={setMessagingChannelId}
                      >
                        <SelectTrigger id="proactive-channel">
                          <SelectValue placeholder="Select a Slack connection" />
                        </SelectTrigger>
                        <SelectContent>
                          {connectedSlackChannels.map((channel) => (
                            <SelectItem key={channel.id} value={channel.id}>
                              {formatSlackChannelLabel(channel)}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>

                    <div className="space-y-2">
                      <Label htmlFor="proactive-prompt">
                        Custom prompt (optional)
                      </Label>
                      <Textarea
                        id="proactive-prompt"
                        placeholder="Add instructions for what to include."
                        value={prompt}
                        onChange={(event) => setPrompt(event.target.value)}
                      />
                    </div>

                    <div className="flex justify-end gap-2">
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
