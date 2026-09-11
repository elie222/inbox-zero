"use client";

import { useState } from "react";
import { CalendarIcon, MicIcon, SettingsIcon } from "lucide-react";
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
import { useProductAnalytics } from "@/hooks/useProductAnalytics";
import { useAccount } from "@/providers/EmailAccountProvider";
import { updateMeetingRecorderSettingsAction } from "@/utils/actions/meeting-recorder";
import { getActionErrorMessage } from "@/utils/error";
import { MeetingRecorderOnboarding } from "@/app/(app)/[emailAccountId]/meetings/MeetingRecorderOnboarding";
import { MeetingRecorderSettingsDialog } from "@/app/(app)/[emailAccountId]/meetings/MeetingRecorderSettingsDialog";
import { MeetingDetail } from "@/app/(app)/[emailAccountId]/meetings/MeetingDetail";
import { MeetingsList } from "@/app/(app)/[emailAccountId]/meetings/MeetingsList";
import { UpcomingMeetingsToggleList } from "@/app/(app)/[emailAccountId]/meetings/UpcomingMeetingsToggleList";
import { hasConnectedCalendar } from "@/app/(app)/[emailAccountId]/meetings/calendar-connection-state";
import { ConnectCalendar } from "@/app/(app)/[emailAccountId]/calendars/ConnectCalendar";

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
            title="Meeting notetaker is disabled"
            description="The meeting notetaker is turned off on this server. Set NEXT_PUBLIC_MEETING_RECORDER_ENABLED=true and see the self-hosting docs to configure it."
          />
        </div>
      </PageWrapper>
    );
  }

  return <MeetingRecorderPageContent />;
}

function MeetingRecorderPageContent() {
  const { emailAccountId } = useAccount();
  const analytics = useProductAnalytics();
  const [isSettingsOpen, setIsSettingsOpen] = useState(false);
  const [openMeetingId, setOpenMeetingId] = useState<string | null>(null);

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
      onSuccess: () => {
        analytics.captureAction("meeting_recorder_enabled");
        mutate();
      },
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

  const openMeeting = (meetingId: string) => {
    analytics.captureAction("meeting_recorder_meeting_opened");
    setOpenMeetingId(meetingId);
  };

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
          onEnable={(joinRule: MeetingJoinRule) => {
            analytics.captureAction("meeting_recorder_enable_started", {
              join_rule: joinRule,
              has_calendar_connected: hasCalendarConnected,
            });
            execute({ enabled: true, joinRule });
          }}
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

        {!hasCalendarConnected && (
          <ActionCard
            variant="blue"
            icon={<CalendarIcon className="h-5 w-5" />}
            title="Reconnect your calendar"
            description={
              <div className="space-y-4">
                <p>
                  Your meeting notetaker is still enabled. Connect a calendar so
                  it can find upcoming meetings.
                </p>
                <ConnectCalendar
                  analyticsPage="meetings"
                  onboardingReturnPath={`/${emailAccountId}/meetings`}
                />
              </div>
            }
          />
        )}

        <UpcomingMeetingsToggleList
          emailAccountId={emailAccountId}
          onOpenMeeting={openMeeting}
        />

        <MeetingsList onOpenMeeting={openMeeting} />
      </div>

      <MeetingDetail
        meetingId={openMeetingId}
        onClose={() => setOpenMeetingId(null)}
      />

      <MeetingRecorderSettingsDialog
        emailAccountId={emailAccountId}
        open={isSettingsOpen}
        onClose={() => setIsSettingsOpen(false)}
      />
    </PageWrapper>
  );
}
