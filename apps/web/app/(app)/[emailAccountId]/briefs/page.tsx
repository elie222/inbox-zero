"use client";

import Link from "next/link";
import { AlertCircleIcon } from "lucide-react";
import { PageWrapper } from "@/components/PageWrapper";
import { PageHeader } from "@/components/PageHeader";
import { SettingCard } from "@/components/SettingCard";
import { Button } from "@/components/ui/button";
import { Toggle } from "@/components/Toggle";
import { toastSuccess, toastError } from "@/components/Toast";
import { LoadingContent } from "@/components/LoadingContent";
import { PremiumAlertWithData } from "@/components/PremiumAlert";
import { useCalendars } from "@/hooks/useCalendars";
import { useAccount } from "@/providers/EmailAccountProvider";
import { useAction } from "next-safe-action/hooks";
import { updateMeetingBriefsEnabledAction } from "@/utils/actions/meeting-briefs";
import { useMeetingBriefSettings } from "@/hooks/useMeetingBriefs";
import {
  Item,
  ItemContent,
  ItemTitle,
  ItemDescription,
  ItemActions,
  ItemMedia,
} from "@/components/ui/item";
import { TimeDurationSetting } from "@/app/(app)/[emailAccountId]/briefs/TimeDurationSetting";
import { UpcomingMeetings } from "@/app/(app)/[emailAccountId]/briefs/UpcomingMeetings";
import { EnableReplyTracker } from "@/app/(app)/[emailAccountId]/reply-zero/EnableReplyTracker";
import { BriefsOnboarding } from "@/app/(app)/[emailAccountId]/briefs/Onboarding";

export default function MeetingBriefsPage() {
  const { emailAccountId } = useAccount();
  const { data: calendarsData, isLoading: isLoadingCalendars } = useCalendars();
  const { data, isLoading, error, mutate } = useMeetingBriefSettings();

  const hasCalendarConnected =
    calendarsData?.connections && calendarsData.connections.length > 0;

  const { execute } = useAction(
    updateMeetingBriefsEnabledAction.bind(null, emailAccountId),
    {
      onSuccess: () => {
        toastSuccess({ description: "Settings saved!" });
        mutate();
      },
      onError: () => {
        toastError({ description: "Failed to save settings" });
      },
    },
  );

  if (!isLoadingCalendars && !hasCalendarConnected) {
    return <BriefsOnboarding emailAccountId={emailAccountId} />;
  }

  return (
    <PageWrapper>
      <PageHeader title="Meeting Briefs" />

      <div className="mt-4 space-y-4">
        <PremiumAlertWithData />

        <LoadingContent loading={isLoading} error={error}>
          <div className="space-y-2">
            <SettingCard
              title="Enable Meeting Briefs"
              description="Receive email briefings before meetings with external guests"
              right={
                <Toggle
                  name="enabled"
                  enabled={!!data?.enabled}
                  onChange={(enabled) => execute({ enabled })}
                  disabled={!hasCalendarConnected}
                />
              }
            />

            {!!data?.enabled && (
              <SettingCard
                title="Send briefing before meeting"
                description="How long before the meeting to send the briefing"
                collapseOnMobile
                right={
                  <TimeDurationSetting
                    initialMinutes={data?.minutesBefore ?? 240}
                    onSaved={mutate}
                  />
                }
              />
            )}
          </div>
        </LoadingContent>

        {!!data?.enabled && hasCalendarConnected && (
          <div className="mt-8">
            <UpcomingMeetings emailAccountId={emailAccountId} />
          </div>
        )}
      </div>
    </PageWrapper>
  );
}
