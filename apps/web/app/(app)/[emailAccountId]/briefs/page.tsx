"use client";

import { PageWrapper } from "@/components/PageWrapper";
import { PageHeader } from "@/components/PageHeader";
import { SettingCard } from "@/components/SettingCard";
import { Toggle } from "@/components/Toggle";
import { toastSuccess, toastError } from "@/components/Toast";
import { LoadingContent } from "@/components/LoadingContent";
import { PremiumAlertWithData } from "@/components/PremiumAlert";
import { useCalendars } from "@/hooks/useCalendars";
import { useAccount } from "@/providers/EmailAccountProvider";
import { useAction } from "next-safe-action/hooks";
import { updateMeetingBriefsEnabledAction } from "@/utils/actions/meeting-briefs";
import { useMeetingBriefSettings } from "@/hooks/useMeetingBriefs";
import { TimeDurationSetting } from "@/app/(app)/[emailAccountId]/briefs/TimeDurationSetting";
import { UpcomingMeetings } from "@/app/(app)/[emailAccountId]/briefs/UpcomingMeetings";
import { BriefsOnboarding } from "@/app/(app)/[emailAccountId]/briefs/Onboarding";
import { IntegrationsSetting } from "@/app/(app)/[emailAccountId]/briefs/IntegrationsSetting";

export default function MeetingBriefsPage() {
  const { emailAccountId } = useAccount();
  const { data: calendarsData, isLoading: isLoadingCalendars } = useCalendars();
  const { data, isLoading, error, mutate } = useMeetingBriefSettings();

  const hasCalendarConnected =
    calendarsData?.connections && calendarsData.connections.length > 0;

  const { execute, status } = useAction(
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

  if (isLoadingCalendars || isLoading || error) {
    return (
      <PageWrapper>
        <LoadingContent loading={isLoadingCalendars || isLoading} error={error}>
          <div />
        </LoadingContent>
      </PageWrapper>
    );
  }

  if (!hasCalendarConnected || !data?.enabled) {
    return (
      <BriefsOnboarding
        emailAccountId={emailAccountId}
        hasCalendarConnected={hasCalendarConnected}
        onEnable={() => execute({ enabled: true })}
        isEnabling={status === "executing"}
      />
    );
  }

  return (
    <PageWrapper>
      <PageHeader title="Meeting Briefs" />

      <div className="mt-4 space-y-4 max-w-3xl">
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
              <>
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

                <IntegrationsSetting />
              </>
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
