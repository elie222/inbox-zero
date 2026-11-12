"use client";

import type { I18n } from "@lingui/core";
import { msg } from "@lingui/core/macro";
import { Trans, useLingui } from "@lingui/react/macro";
import Link from "next/link";
import { useState, useCallback } from "react";
import { useForm } from "react-hook-form";
import { Button } from "@/components/ui/button";
import { SettingCard } from "@/components/SettingCard";
import { MutedText } from "@/components/Typography";
import { prefixPath } from "@/utils/path";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Input } from "@/components/Input";
import { Toggle } from "@/components/Toggle";
import { Skeleton } from "@/components/ui/skeleton";
import { Badge } from "@/components/Badge";
import { useActionTiming } from "@/hooks/useActionTiming";
import { useEmailAccountFull } from "@/hooks/useEmailAccountFull";
import { useFollowUpRemindersEnabled } from "@/hooks/useFeatureFlags";
import { useAccount } from "@/providers/EmailAccountProvider";
import { useAction } from "next-safe-action/hooks";
import {
  toggleFollowUpRemindersAction,
  updateFollowUpSettingsAction,
  scanFollowUpRemindersAction,
} from "@/utils/actions/follow-up-reminders";
import {
  type SaveFollowUpSettingsFormInput,
  DEFAULT_FOLLOW_UP_DAYS,
} from "@/utils/actions/follow-up-reminders.validation";
import { toast } from "sonner";
import { toastError, toastSuccess } from "@/components/Toast";
import { getGmailBasicSearchUrl } from "@/utils/url";
import { FOLLOW_UP_LABEL } from "@/utils/label";
import {
  isGoogleProvider,
  isMicrosoftProvider,
} from "@/utils/email/provider-types";
import { env } from "@/env";

export function FollowUpRemindersSetting() {
  const isFeatureEnabled = useFollowUpRemindersEnabled();

  if (!isFeatureEnabled) return null;

  return <FollowUpRemindersSettingContent />;
}

function FollowUpRemindersSettingContent() {
  const { t } = useLingui();
  const [open, setOpen] = useState(false);
  const { data, isLoading, mutate } = useEmailAccountFull();

  const enabled =
    data?.followUpAwaitingReplyDays !== null ||
    data?.followUpNeedsReplyDays !== null;

  const { execute: executeToggle } = useAction(
    toggleFollowUpRemindersAction.bind(null, data?.id ?? ""),
    {
      onError: (error) => {
        mutate();
        toastError({
          description: error.error?.serverError ?? t`Failed to update settings`,
        });
      },
    },
  );

  const handleToggle = useCallback(
    (enable: boolean) => {
      if (!data) return;

      const optimisticData = {
        ...data,
        followUpAwaitingReplyDays: enable ? DEFAULT_FOLLOW_UP_DAYS : null,
        followUpNeedsReplyDays: enable ? DEFAULT_FOLLOW_UP_DAYS : null,
      };
      mutate(optimisticData as typeof data, false);
      executeToggle({ enabled: enable });
    },
    [data, mutate, executeToggle],
  );

  return (
    <SettingCard
      title={t`Follow-up reminders`}
      description={t`Label emails where you haven't heard back or haven't replied.`}
      right={
        isLoading ? (
          <Skeleton className="h-5 w-9" />
        ) : (
          <div className="flex items-center gap-2">
            {enabled && (
              <Dialog open={open} onOpenChange={setOpen}>
                <DialogTrigger asChild>
                  <Button variant="outline" size="sm">
                    <Trans>Configure</Trans>
                  </Button>
                </DialogTrigger>
                <FollowUpSettingsDialogContent
                  showChannelsHint
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
        )
      }
    />
  );
}

export function FollowUpSettingsDialogContent({
  onSuccess,
  showChannelsHint = true,
}: {
  onSuccess: () => void;
  showChannelsHint?: boolean;
}) {
  const { data } = useEmailAccountFull();

  if (!data) return null;

  return (
    <FollowUpSettingsDialog
      emailAccountId={data.id}
      emailAddress={data.email ?? ""}
      followUpAwaitingReplyDays={data.followUpAwaitingReplyDays}
      followUpNeedsReplyDays={data.followUpNeedsReplyDays}
      followUpAutoDraftEnabled={data.followUpAutoDraftEnabled ?? true}
      showChannelsHint={showChannelsHint}
      onSuccess={onSuccess}
    />
  );
}

function FollowUpSettingsDialog({
  emailAccountId,
  emailAddress,
  followUpAwaitingReplyDays,
  followUpNeedsReplyDays,
  followUpAutoDraftEnabled,
  showChannelsHint,
  onSuccess,
}: {
  emailAccountId: string;
  emailAddress: string;
  followUpAwaitingReplyDays: number | null | undefined;
  followUpNeedsReplyDays: number | null | undefined;
  followUpAutoDraftEnabled: boolean;
  showChannelsHint: boolean;
  onSuccess: () => void;
}) {
  const { t, i18n } = useLingui();
  const { provider } = useAccount();
  const autoDraftDisabled = env.NEXT_PUBLIC_AUTO_DRAFT_DISABLED;

  const {
    register,
    handleSubmit,
    watch,
    setValue,
    formState: { errors },
  } = useForm<SaveFollowUpSettingsFormInput>({
    defaultValues: {
      followUpAwaitingReplyDays: followUpAwaitingReplyDays?.toString() ?? "",
      followUpNeedsReplyDays: followUpNeedsReplyDays?.toString() ?? "",
      followUpAutoDraftEnabled: autoDraftDisabled
        ? false
        : followUpAutoDraftEnabled,
    },
  });

  const autoDraftValue = watch("followUpAutoDraftEnabled");
  const { start: startScanTiming, getElapsedMs: getScanElapsedMs } =
    useActionTiming();

  const { execute, isExecuting } = useAction(
    updateFollowUpSettingsAction.bind(null, emailAccountId),
    {
      onSuccess: () => {
        toastSuccess({ description: t`Settings saved!` });
        onSuccess();
      },
      onError: (error) => {
        toastError({
          description: error.error?.serverError ?? t`Failed to save settings`,
        });
      },
    },
  );

  const { execute: executeScan, isExecuting: isScanning } = useAction(
    scanFollowUpRemindersAction.bind(null, emailAccountId),
    {
      onSuccess: () => {
        showScanCompleteToast(provider, emailAddress, i18n);
      },
      onError: (error) => {
        const ranForMinutes = getScanElapsedMs() > 4 * 60 * 1000;

        if (ranForMinutes) {
          showScanCompleteToast(provider, emailAddress, i18n);
        } else {
          toastError({
            description: error.error?.serverError ?? t`Failed to scan`,
          });
        }
      },
    },
  );

  const onSubmit = (formData: SaveFollowUpSettingsFormInput) => {
    execute({
      followUpAwaitingReplyDays: formData.followUpAwaitingReplyDays
        ? Number(formData.followUpAwaitingReplyDays)
        : null,
      followUpNeedsReplyDays: formData.followUpNeedsReplyDays
        ? Number(formData.followUpNeedsReplyDays)
        : null,
      followUpAutoDraftEnabled: autoDraftDisabled
        ? false
        : formData.followUpAutoDraftEnabled,
    });
  };

  return (
    <DialogContent>
      <DialogHeader>
        <DialogTitle>
          <Trans>Follow-up reminders</Trans>
        </DialogTitle>
        <DialogDescription>
          <Trans>Get reminded about conversations that need attention.</Trans>
          <br />
          {isMicrosoftProvider(provider) ? (
            <Trans>
              We'll add a <Badge color="blue">{FOLLOW_UP_LABEL}</Badge> category
              so you can easily find them. Saturdays and Sundays do not count.
            </Trans>
          ) : (
            <Trans>
              We'll add a <Badge color="blue">{FOLLOW_UP_LABEL}</Badge> label so
              you can easily find them. Saturdays and Sundays do not count.
            </Trans>
          )}
        </DialogDescription>
      </DialogHeader>

      <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
        <Input
          type="number"
          name="followUpAwaitingReplyDays"
          label={t`Remind me when they haven't replied after`}
          registerProps={register("followUpAwaitingReplyDays")}
          error={errors.followUpAwaitingReplyDays}
          min={0.001}
          max={90}
          step={0.001}
          rightText={t`days`}
        />

        <Input
          type="number"
          name="followUpNeedsReplyDays"
          label={t`Remind me when I haven't replied after`}
          registerProps={register("followUpNeedsReplyDays")}
          error={errors.followUpNeedsReplyDays}
          min={0.001}
          max={90}
          step={0.001}
          rightText={t`days`}
        />

        {!autoDraftDisabled && (
          <div className="flex items-center justify-between">
            <div>
              <label
                htmlFor="followUpAutoDraftEnabled"
                className="block text-sm font-medium text-foreground"
              >
                <Trans>Auto-generate drafts</Trans>
              </label>
              <p className="text-muted-foreground text-sm">
                <Trans>Draft a nudge when you haven't heard back.</Trans>
              </p>
            </div>
            <Toggle
              name="followUpAutoDraftEnabled"
              enabled={autoDraftValue}
              onChange={(value) => setValue("followUpAutoDraftEnabled", value)}
            />
          </div>
        )}

        <div className="flex items-center gap-2">
          <Button type="submit" size="sm" loading={isExecuting}>
            <Trans>Save</Trans>
          </Button>
          <Button
            type="button"
            variant="outline"
            size="sm"
            loading={isScanning}
            onClick={() => {
              startScanTiming();
              toast.info(t`Scanning your emails...`, {
                description: t`This may take a few minutes depending on how many emails need to be checked.`,
              });
              executeScan({});
            }}
          >
            <Trans>Find follow-ups</Trans>
          </Button>
        </div>

        {showChannelsHint && (
          <MutedText>
            <Trans>
              Want pings in your chat app?{" "}
              <Link
                href={prefixPath(emailAccountId, "/channels")}
                className="text-foreground underline"
              >
                Configure on the Channels page
              </Link>
              .
            </Trans>
          </MutedText>
        )}
      </form>
    </DialogContent>
  );
}

function showScanCompleteToast(
  provider: string | undefined,
  emailAddress: string,
  i18n: I18n,
) {
  if (isGoogleProvider(provider)) {
    const searchUrl = getGmailBasicSearchUrl(
      emailAddress,
      `label:${FOLLOW_UP_LABEL}`,
    );
    toast.success(i18n._(msg`Scan complete!`), {
      description: i18n._(msg`View your follow-ups in Gmail.`),
      action: {
        label: i18n._(msg`View`),
        onClick: () => window.open(searchUrl, "_blank"),
      },
    });
  } else {
    toast.success(i18n._(msg`Scan complete!`), {
      description: i18n._(
        msg`Look for the "${FOLLOW_UP_LABEL}" category in Outlook.`,
      ),
    });
  }
}
