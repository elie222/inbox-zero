"use client";

import { LoadingContent } from "@/components/LoadingContent";
import { PageHeader } from "@/components/PageHeader";
import { PageWrapper } from "@/components/PageWrapper";
import { PremiumAlertWithData } from "@/components/PremiumAlert";
import { useCalendars } from "@/hooks/useCalendars";
import { useMeetingRecorderSettings } from "@/hooks/useMeetingRecorder";
import { useAccount } from "@/providers/EmailAccountProvider";
import { MeetingRecorderSettings } from "@/app/(app)/[emailAccountId]/meetings/MeetingRecorderSettings";
import { MeetingsList } from "@/app/(app)/[emailAccountId]/meetings/MeetingsList";
import { UpcomingMeetingsToggleList } from "@/app/(app)/[emailAccountId]/meetings/UpcomingMeetingsToggleList";

export default function MeetingsPage() {
  const { emailAccountId } = useAccount();
  const { data: calendarsData, isLoading, error } = useCalendars();
  const { data: settings } = useMeetingRecorderSettings(emailAccountId);

  const hasCalendarConnected = !!calendarsData?.connections?.length;

  return (
    <PageWrapper>
      <PageHeader title="Meetings" />

      <div className="mt-4 max-w-3xl space-y-8">
        <PremiumAlertWithData />

        <LoadingContent loading={isLoading} error={error}>
          <MeetingRecorderSettings
            emailAccountId={emailAccountId}
            hasCalendarConnected={hasCalendarConnected}
          />
        </LoadingContent>

        {settings?.enabled && hasCalendarConnected && (
          <>
            <UpcomingMeetingsToggleList emailAccountId={emailAccountId} />
            <MeetingsList />
          </>
        )}
      </div>
    </PageWrapper>
  );
}
