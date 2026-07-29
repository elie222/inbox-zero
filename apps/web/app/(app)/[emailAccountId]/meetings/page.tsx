"use client";

import Link from "next/link";
import { MicIcon } from "lucide-react";
import { LoadingContent } from "@/components/LoadingContent";
import { PageHeader } from "@/components/PageHeader";
import { PageWrapper } from "@/components/PageWrapper";
import { PremiumAlertWithData } from "@/components/PremiumAlert";
import { Button } from "@/components/ui/button";
import { ActionCard } from "@/components/ui/card";
import { useCalendars } from "@/hooks/useCalendars";
import { useMeetingRecorderEnabled } from "@/hooks/useFeatureFlags";
import { useMeetingRecorderSettings } from "@/hooks/useMeetingRecorder";
import { useAccount } from "@/providers/EmailAccountProvider";
import { MeetingRecorderSettings } from "@/app/(app)/[emailAccountId]/meetings/MeetingRecorderSettings";
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
  const { data: calendarsData, isLoading, error } = useCalendars();
  const { data: settings } = useMeetingRecorderSettings(emailAccountId);

  const hasCalendarConnected = hasConnectedCalendar(calendarsData?.connections);

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
