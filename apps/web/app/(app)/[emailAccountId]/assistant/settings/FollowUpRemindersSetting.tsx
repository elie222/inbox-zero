"use client";

import { useState, useCallback } from "react";
import { useForm } from "react-hook-form";
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
import { getEmailTerminology } from "@/utils/terminology";
import { getGmailBasicSearchUrl } from "@/utils/url";
import { FOLLOW_UP_LABEL } from "@/utils/label";
import { isGoogleProvider } from "@/utils/email/provider-types";

export function FollowUpRemindersSetting() {
  const isFeatureEnabled = useFollowUpRemindersEnabled();

  if (!isFeatureEnabled) return null;

  return <FollowUpRemindersSettingContent />;
}

function FollowUpRemindersSettingContent() {
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
      title="Follow-up reminders"
      description="Get reminded when you haven't heard back or haven't replied."
      right={
        isLoading ? (
          <Skeleton className="h-5 w-9" />
        ) : (
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
                  emailAddress={data?.email ?? ""}
                  followUpAwaitingReplyDays={data?.followUpAwaitingReplyDays}
                  followUpNeedsReplyDays={data?.followUpNeedsReplyDays}
                  followUpAutoDraftEnabled={
                    data?.followUpAutoDraftEnabled ?? true
                  }
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

function FollowUpSettingsDialog({
  emailAccountId,
  emailAddress,
  followUpAwaitingReplyDays,
  followUpNeedsReplyDays,
  followUpAutoDraftEnabled,
  onSuccess,
}: {
  emailAccountId: string;
  emailAddress: string;
  followUpAwaitingReplyDays: number | null | undefined;
  followUpNeedsReplyDays: number | null | undefined;
  followUpAutoDraftEnabled: boolean;
  onSuccess: () => void;
}) {
  const { provider } = useAccount();
  const terminology = getEmailTerminology(provider);

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
      followUpAutoDraftEnabled,
    },
  });

  const autoDraftValue = watch("followUpAutoDraftEnabled");
  const { start: startScanTiming, getElapsedMs: getScanElapsedMs } =
    useActionTiming();

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

  const { execute: executeScan, isExecuting: isScanning } = useAction(
    scanFollowUpRemindersAction.bind(null, emailAccountId),
    {
      onSuccess: () => {
        showScanCompleteToast(provider, emailAddress);
      },
      onError: (error) => {
        const ranForMinutes = getScanElapsedMs() > 4 * 60 * 1000;

        if (ranForMinutes) {
          showScanCompleteToast(provider, emailAddress);
        } else {
          toastError({
            description: error.error?.serverError ?? "Failed to scan",
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
      followUpAutoDraftEnabled: formData.followUpAutoDraftEnabled,
    });
  };

  return (
    <DialogContent>
      <DialogHeader>
        <DialogTitle>Follow-up reminders</DialogTitle>
        <DialogDescription>
          Get reminded about conversations that need attention.
          <br />
          We'll add a <Badge color="blue">Follow-up</Badge>{" "}
          {terminology.label.singular} so you can easily find them.
        </DialogDescription>
      </DialogHeader>

      <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
        <Input
          type="number"
          name="followUpAwaitingReplyDays"
          label="Remind me when they haven't replied after"
          registerProps={register("followUpAwaitingReplyDays")}
          error={errors.followUpAwaitingReplyDays}
          min={0.001}
          max={90}
          step={0.001}
          rightText="days"
        />

        <Input
          type="number"
          name="followUpNeedsReplyDays"
          label="Remind me when I haven't replied after"
          registerProps={register("followUpNeedsReplyDays")}
          error={errors.followUpNeedsReplyDays}
          min={0.001}
          max={90}
          step={0.001}
          rightText="days"
        />

        <div className="flex items-center justify-between">
          <div>
            <label
              htmlFor="followUpAutoDraftEnabled"
              className="block text-sm font-medium text-foreground"
            >
              Auto-generate drafts
            </label>
            <p className="text-muted-foreground text-sm">
              Draft a nudge when you haven't heard back.
            </p>
          </div>
          <Toggle
            name="followUpAutoDraftEnabled"
            enabled={autoDraftValue}
            onChange={(value) => setValue("followUpAutoDraftEnabled", value)}
          />
        </div>

        <div className="flex items-center gap-2">
          <Button type="submit" size="sm" loading={isExecuting}>
            Save
          </Button>
          <Button
            type="button"
            variant="outline"
            size="sm"
            loading={isScanning}
            onClick={() => {
              startScanTiming();
              toast.info("Scanning your emails...", {
                description:
                  "This may take a few minutes depending on how many emails need to be checked.",
              });
              executeScan({});
            }}
          >
            Find follow-ups
          </Button>
        </div>
      </form>
    </DialogContent>
  );
}

function showScanCompleteToast(
  provider: string | undefined,
  emailAddress: string,
) {
  if (isGoogleProvider(provider)) {
    const searchUrl = getGmailBasicSearchUrl(
      emailAddress,
      `label:${FOLLOW_UP_LABEL}`,
    );
    toast.success("Scan complete!", {
      description: "View your follow-ups in Gmail.",
      action: {
        label: "View",
        onClick: () => window.open(searchUrl, "_blank"),
      },
    });
  } else {
    toast.success("Scan complete!", {
      description: `Look for the "${FOLLOW_UP_LABEL}" category in Outlook.`,
    });
  }
}
