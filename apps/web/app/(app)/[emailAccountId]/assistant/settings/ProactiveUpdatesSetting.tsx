"use client";

import { Trans, useLingui } from "@lingui/react/macro";
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
import { getActionErrorMessage } from "@/utils/error";
import { getMessagingProviderName } from "@/utils/messaging/platforms";
import { cn } from "@/utils";
import {
  MessagingProvider,
  MessagingRoutePurpose,
} from "@/generated/prisma/enums";
import type { GetMessagingChannelsResponse } from "@/app/api/user/messaging-channels/route";
import { describeCronScheduleText } from "@/app/(app)/[emailAccountId]/assistant/settings/cron-schedule-messages";

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
  const { t, i18n } = useLingui();
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
        toastSuccess({ description: t`Scheduled check-ins updated` });
      },
      onError: createSettingActionErrorHandler({
        mutate,
        defaultMessage: t`Failed to update setting`,
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
        toastSuccess({ description: t`Scheduled check-in settings saved` });
      },
      onError: createSettingActionErrorHandler({
        defaultMessage: t`Failed to save settings`,
      }),
    },
  );

  const { execute: executeTestCheckIn, status: testCheckInStatus } = useAction(
    triggerTestCheckInAction.bind(null, emailAccountId),
    {
      onSuccess: () => {
        toastSuccess({ description: t`Test check-in sent` });
      },
      onError: (error) => {
        const description =
          getActionErrorMessage(error.error) ?? t`Failed to send test check-in`;
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
    () => describeCronScheduleText(cronExpression, i18n),
    [cronExpression, i18n],
  );
  const isSlack = channel.provider === MessagingProvider.SLACK;
  let summaryText = t`Get periodic summaries in chat.`;
  if (activeForChannel && job) {
    summaryText = describeCronScheduleText(
      job.cronExpression ?? DEFAULT_AUTOMATION_JOB_CRON,
      i18n,
    );
  }

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
          <ItemTitle>
            <Trans>Scheduled check-ins</Trans>
          </ItemTitle>
          <ItemDescription>{summaryText}</ItemDescription>
        </ItemContent>
        <ItemActions>
          <Tooltip content={t`Configure`}>
            <Button variant="ghost" size="iconSm" onClick={() => setOpen(true)}>
              <Settings2Icon className="h-4 w-4" />
            </Button>
          </Tooltip>
          {isSlack && (
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
            />
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
            <DialogTitle>
              <Trans>Scheduled check-ins</Trans>
            </DialogTitle>
            <DialogDescription>
              <Trans>
                Configure when Inbox Zero sends scheduled summaries to{" "}
                {getMessagingProviderName(channel.provider)}.
              </Trans>
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-6">
            <div className="space-y-3">
              <Label>
                <Trans>Schedule</Trans>
              </Label>
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
                    {i18n._(preset.label)}
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
                  {showCronEditor ? <Trans>done</Trans> : <Trans>edit</Trans>}
                </Button>
              </div>
              {showCronEditor && (
                <>
                  <Input
                    value={cronExpression}
                    onChange={(event) => setCronExpression(event.target.value)}
                    placeholder={t`Cron expression in UTC`}
                  />
                  <p className="text-xs text-muted-foreground">
                    <Trans>
                      This is a cron expression (UTC). Ask ChatGPT or Claude to
                      generate one for your preferred schedule.
                    </Trans>
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
                <Trans>+ Add check-in instructions</Trans>
              </Button>
              {showCustomPrompt && (
                <Textarea
                  id={`scheduled-checkins-prompt-${channel.id}`}
                  placeholder={t`Example: Only include emails that need a reply today or have a deadline in the next 2 days. Skip newsletters, receipts, and FYI updates.`}
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
                  {testCheckInStatus === "executing" ? (
                    <Trans>Sending...</Trans>
                  ) : (
                    <Trans>Send test check-in</Trans>
                  )}
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
                  <Trans>Cancel</Trans>
                </Button>
                <Button
                  onClick={handleSave}
                  disabled={saveStatus === "executing"}
                >
                  {saveStatus === "executing" ? (
                    <Trans>Saving...</Trans>
                  ) : (
                    <Trans>Save</Trans>
                  )}
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
