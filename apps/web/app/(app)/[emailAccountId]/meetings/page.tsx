"use client";

import { useState } from "react";
import Link from "next/link";
import { MicIcon, SettingsIcon } from "lucide-react";
import { useAction } from "next-safe-action/hooks";
import { LoadingContent } from "@/components/LoadingContent";
import { PageHeader } from "@/components/PageHeader";
import { PageWrapper } from "@/components/PageWrapper";
import { PremiumAlertWithData } from "@/components/PremiumAlert";
import { toastError } from "@/components/Toast";
import { Button } from "@/components/ui/button";
import { ActionCard } from "@/components/ui/card";
import type { MeetingJoinRule } from "@/generated/prisma/enums";
import { useCalendars } from "@/hooks/useCalendars";
import { useMeetingRecorderEnabled } from "@/hooks/useFeatureFlags";
import { useMeetingRecorderSettings } from "@/hooks/useMeetingRecorder";
import { useAccount } from "@/providers/EmailAccountProvider";
import { updateMeetingRecorderSettingsAction } from "@/utils/actions/meeting-recorder";
import { getActionErrorMessage } from "@/utils/error";
import { MeetingRecorderOnboarding } from "@/app/(app)/[emailAccountId]/meetings/MeetingRecorderOnboarding";
import { MeetingRecorderSettingsDialog } from "@/app/(app)/[emailAccountId]/meetings/MeetingRecorderSettingsDialog";
import { MeetingsList } from "@/app/(app)/[emailAccountId]/meetings/MeetingsList";
import { UpcomingMeetingsToggleList } from "@/app/(app)/[emailAccountId]/meetings/UpcomingMeetingsToggleList";
import { hasConnectedCalendar } from "@/app/(app)/[emailAccountId]/meetings/calendar-connection-state";

export default function MeetingsPage() {
  const meetingRecorderEnabled = useMeetingRecorderEnabled();

  if (!meetingRecorderEnabled) {
    return (
      <PageWrapper>
        <PageHeader title="Meetings" />

        <div className="mt-8 max-w-3xl">
          <ActionCard
            variant="blue"
            icon={<MicIcon className="h-5 w-5" />}
            title="Meeting notetaker is not enabled"
            description="This feature is in limited rollout. Join early access to enable it for your account."
            action={
              <Button asChild variant="outline">
                <Link href="/early-access">Join Early Access</Link>
              </Button>
            }
          />
        </div>
      </PageWrapper>
    );
  }

  return <MeetingRecorderPageContent />;
}

function MeetingRecorderPageContent() {
  const { emailAccountId } = useAccount();
  const [isSettingsOpen, setIsSettingsOpen] = useState(false);

  const {
    data: calendarsData,
    isLoading: isLoadingCalendars,
    error: calendarsError,
  } = useCalendars();
  const {
    data: settings,
    isLoading: isLoadingSettings,
    error: settingsError,
    mutate,
  } = useMeetingRecorderSettings(emailAccountId);

  const { execute, status } = useAction(
    updateMeetingRecorderSettingsAction.bind(null, emailAccountId),
    {
      onSuccess: () => mutate(),
      onError: ({ error }) => {
        toastError({
          description: getActionErrorMessage(error, {
            prefix: "Failed to turn on the notetaker",
          }),
        });
      },
    },
  );

  const isLoading = isLoadingCalendars || isLoadingSettings;
  const error = calendarsError || settingsError;

  if (isLoading || error) {
    return (
      <PageWrapper>
        <LoadingContent loading={isLoading} error={error}>
          <div />
        </LoadingContent>
      </PageWrapper>
    );
  }

  const hasCalendarConnected = hasConnectedCalendar(calendarsData?.connections);

  // Enabling is entitlement-gated server-side, so a non-premium user needs the
  // upgrade path on the onboarding screen too, not just once they are set up.
  if (!settings?.enabled) {
    return (
      <PageWrapper>
        <div className="mx-auto max-w-lg">
          <PremiumAlertWithData />
        </div>

        <MeetingRecorderOnboarding
          emailAccountId={emailAccountId}
          hasCalendarConnected={hasCalendarConnected}
          currentJoinRule={settings?.joinRule}
          onEnable={(joinRule: MeetingJoinRule) =>
            execute({ enabled: true, joinRule })
          }
          isEnabling={status === "executing"}
        />
      </PageWrapper>
    );
  }

  return (
    <PageWrapper>
      <div className="flex items-start justify-between gap-4">
        <PageHeader title="Meetings" />

        <Button
          variant="outline"
          Icon={SettingsIcon}
          onClick={() => setIsSettingsOpen(true)}
        >
          Settings
        </Button>
      </div>

      <div className="mt-6 max-w-3xl space-y-8">
        <PremiumAlertWithData />

        <UpcomingMeetingsToggleList emailAccountId={emailAccountId} />

        <MeetingsList />
      </div>

      <MeetingRecorderSettingsDialog
        emailAccountId={emailAccountId}
        open={isSettingsOpen}
        onClose={() => setIsSettingsOpen(false)}
      />
    </PageWrapper>
  );
}
