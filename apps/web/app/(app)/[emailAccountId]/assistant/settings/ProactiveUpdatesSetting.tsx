"use client";

import Link from "next/link";
import { useAction } from "next-safe-action/hooks";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
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
import { useAutomationJob } from "@/hooks/useAutomationJob";
import { useMessagingChannels } from "@/hooks/useMessagingChannels";
import { useAccount } from "@/providers/EmailAccountProvider";
import {
  saveAutomationJobAction,
  toggleAutomationJobAction,
  triggerTestCheckInAction,
} from "@/utils/actions/automation-jobs";
import { getActionErrorMessage } from "@/utils/error";
import {
  AUTOMATION_CRON_PRESETS,
  DEFAULT_AUTOMATION_JOB_CRON,
} from "@/utils/automation-jobs/defaults";
import { describeCronSchedule } from "@/utils/automation-jobs/describe";
import { BRAND_NAME } from "@/utils/branding";

export function ProactiveUpdatesSetting() {
  const [open, setOpen] = useState(false);
  const [cronExpression, setCronExpression] = useState(
    DEFAULT_AUTOMATION_JOB_CRON,
  );
  const [messagingChannelId, setMessagingChannelId] = useState("");
  const [prompt, setPrompt] = useState("");
  const [showCronEditor, setShowCronEditor] = useState(false);
  const [showCustomPrompt, setShowCustomPrompt] = useState(false);
  const isDialogFormInitializedRef = useRef(false);

  const { emailAccountId } = useAccount();
  const { data, isLoading, mutate } = useAutomationJob();
  const {
    data: channelsData,
    isLoading: isLoadingChannels,
    mutate: mutateChannels,
  } = useMessagingChannels();

  const connectedMessagingChannels = useMemo(
    () =>
      channelsData?.channels.filter(
        (channel) =>
          (channel.provider === "SLACK" || channel.provider === "TEAMS") &&
          channel.isConnected &&
          channel.hasSendDestination,
      ) ?? [],
    [channelsData?.channels],
  );

  const hasConnectedMessaging = connectedMessagingChannels.length > 0;
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

  const { execute: executeTestCheckIn, status: testCheckInStatus } = useAction(
    triggerTestCheckInAction.bind(null, emailAccountId),
    {
      onSuccess: () => {
        toastSuccess({ description: "Test check-in sent" });
      },
      onError: (error) => {
        toastError({
          description:
            getActionErrorMessage(error.error) ??
            "Failed to send test check-in",
        });
      },
    },
  );

  const handleToggle = useCallback(
    (nextEnabled: boolean) => {
      if (!emailAccountId || (!hasConnectedMessaging && nextEnabled)) return;
      executeToggle({ enabled: nextEnabled });
    },
    [emailAccountId, hasConnectedMessaging, executeToggle],
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
      description="Your AI checks in on Slack or Teams with updates you can act on."
      right={
        showLoading ? (
          <Skeleton className="h-5 w-24" />
        ) : (
          <div className="flex items-center gap-2">
            {!hasConnectedMessaging && (
              <Button asChild variant="outline" size="sm">
                <Link href="/settings">Connect Slack or Teams</Link>
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
                          Get notified about important emails and take action
                          directly from your messaging app.
                        </DialogDescription>
                      </DialogHeader>

                      <div className="mt-6 space-y-6">
                        <div className="space-y-2">
                          <Label htmlFor="scheduled-checkins-channel">
                            Messaging channel
                          </Label>
                          <Select
                            value={messagingChannelId}
                            onValueChange={setMessagingChannelId}
                          >
                            <SelectTrigger id="scheduled-checkins-channel">
                              <SelectValue placeholder="Select a channel" />
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

                        <div className="flex items-center justify-between pt-2">
                          {job ? (
                            <button
                              type="button"
                              className="text-xs text-muted-foreground underline underline-offset-2 hover:text-foreground disabled:opacity-50"
                              disabled={testCheckInStatus === "executing"}
                              onClick={() => executeTestCheckIn({})}
                            >
                              {testCheckInStatus === "executing"
                                ? "Sending..."
                                : "Send test check-in"}
                            </button>
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
                                !messagingChannelId ||
                                saveStatus === "executing"
                              }
                            >
                              {saveStatus === "executing"
                                ? "Saving..."
                                : "Save"}
                            </Button>
                          </div>
                        </div>
                      </div>
                    </div>

                    <div className="flex flex-col justify-center bg-muted/20 p-6">
                      <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                        Preview
                      </p>
                      <HowItWorksPreview />
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
                (!hasConnectedMessaging && !enabled)
              }
            />
          </div>
        )
      }
    />
  );
}

function formatMessagingChannelLabel(channel: {
  provider: "SLACK" | "TEAMS";
  channelName: string | null;
  channelId: string | null;
  teamName: string | null;
}) {
  if (channel.channelName) {
    if (channel.provider === "SLACK") return `#${channel.channelName}`;
    return channel.channelName;
  }
  if (channel.channelId) return `Channel ${channel.channelId}`;
  if (channel.teamName) return channel.teamName;
  return "Messaging workspace";
}

const SLACK_MESSAGES = [
  {
    sender: BRAND_NAME,
    avatar: "IZ",
    avatarColor:
      "bg-emerald-100 text-emerald-700 dark:bg-emerald-900/50 dark:text-emerald-300",
    lines: [
      "You have 4 new emails since your last check-in.",
      "Jane asked if you want to grab lunch tomorrow. Mike sent the Q4 report you requested.",
    ],
    isUser: false,
  },
  {
    sender: "You",
    avatar: null,
    avatarColor: "",
    lines: ["Tell Jane I'm in. Archive Mike's report."],
    isUser: true,
  },
  {
    sender: BRAND_NAME,
    avatar: "IZ",
    avatarColor:
      "bg-emerald-100 text-emerald-700 dark:bg-emerald-900/50 dark:text-emerald-300",
    lines: ["Done! Reply sent to Jane and Mike's email archived."],
    isUser: false,
  },
];

function HowItWorksPreview() {
  const [stage, setStage] = useState(0);

  useEffect(() => {
    const timings = [
      800, // Stage 1: first message
      1200, // Stage 2: user reply
      1200, // Stage 3: bot response
    ];

    let timeout: NodeJS.Timeout;
    let currentStage = 0;

    const advanceStage = () => {
      if (currentStage >= timings.length) return;

      timeout = setTimeout(() => {
        currentStage++;
        setStage(currentStage);
        advanceStage();
      }, timings[currentStage] ?? 1000);
    };

    advanceStage();

    return () => clearTimeout(timeout);
  }, []);

  return (
    <div className="mt-3 overflow-hidden rounded-md border bg-background shadow-sm">
      {/* Slack-like header */}
      <div className="flex items-center gap-1.5 border-b px-3 py-2">
        <span className="text-xs font-bold text-foreground">
          # inbox-updates
        </span>
      </div>

      {/* Messages area */}
      <div className="space-y-0.5 px-3 py-2">
        <AnimatePresence>
          {SLACK_MESSAGES.map(
            (msg, i) =>
              stage >= i + 1 && (
                <motion.div
                  key={i}
                  initial={{ opacity: 0, y: 8 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ duration: 0.3, ease: "easeOut" }}
                  className="group flex gap-2 rounded px-1 py-1.5 hover:bg-muted/30"
                >
                  {/* Avatar */}
                  <div className="mt-0.5 shrink-0">
                    {msg.isUser ? (
                      <div className="flex h-7 w-7 items-center justify-center rounded-sm bg-blue-100 text-[10px] font-bold text-blue-700 dark:bg-blue-900/50 dark:text-blue-300">
                        You
                      </div>
                    ) : (
                      <div
                        className={`flex h-7 w-7 items-center justify-center rounded-sm text-[10px] font-bold ${msg.avatarColor}`}
                      >
                        {msg.avatar}
                      </div>
                    )}
                  </div>

                  {/* Content */}
                  <div className="min-w-0 flex-1">
                    <span className="text-[13px] font-bold text-foreground">
                      {msg.sender}
                    </span>
                    {msg.lines.map((line, j) => (
                      <p
                        key={j}
                        className="text-[13px] leading-snug text-muted-foreground"
                      >
                        {line}
                      </p>
                    ))}
                  </div>
                </motion.div>
              ),
          )}
        </AnimatePresence>

        {/* Typing indicator */}
        <AnimatePresence>
          {stage >= 1 && stage < 3 && (
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.2 }}
              className="flex items-center gap-2 px-1 py-1"
            >
              <div className="flex h-7 w-7 items-center justify-center rounded-sm bg-emerald-100 text-[10px] font-bold text-emerald-700 dark:bg-emerald-900/50 dark:text-emerald-300">
                IZ
              </div>
              <div className="flex items-center gap-0.5">
                {[0, 1, 2].map((dot) => (
                  <motion.div
                    key={dot}
                    className="h-1.5 w-1.5 rounded-full bg-muted-foreground/40"
                    animate={{ opacity: [0.3, 1, 0.3] }}
                    transition={{
                      duration: 1,
                      repeat: Number.POSITIVE_INFINITY,
                      delay: dot * 0.2,
                    }}
                  />
                ))}
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </div>
  );
}
