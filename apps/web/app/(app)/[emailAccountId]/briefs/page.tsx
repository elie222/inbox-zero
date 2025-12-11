"use client";

import { useCallback, useState, useEffect } from "react";
import Link from "next/link";
import { PageWrapper } from "@/components/PageWrapper";
import { PageHeader } from "@/components/PageHeader";
import { SettingCard } from "@/components/SettingCard";
import { Button } from "@/components/ui/button";
import { Toggle } from "@/components/Toggle";
import { toastSuccess, toastError } from "@/components/Toast";
import { LoadingContent } from "@/components/LoadingContent";
import { PremiumAlertWithData, usePremium } from "@/components/PremiumAlert";
import { useCalendars } from "@/hooks/useCalendars";
import { useAccount } from "@/providers/EmailAccountProvider";
import { useAction } from "next-safe-action/hooks";
import { updateMeetingBriefsSettingsAction } from "@/utils/actions/meeting-briefs";
import { useMeetingBriefs } from "@/hooks/useMeetingBriefs";
import { AlertCircleIcon } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import {
  Item,
  ItemContent,
  ItemTitle,
  ItemDescription,
  ItemActions,
  ItemGroup,
} from "@/components/ui/item";
import { formatDistanceToNow } from "date-fns";
import { SectionDescription } from "@/components/Typography";
import { TimeDurationSetting } from "@/app/(app)/[emailAccountId]/briefs/TimeDurationSetting";

export default function MeetingBriefsPage() {
  const { emailAccountId } = useAccount();
  const { hasAiAccess, isLoading: isLoadingPremium } = usePremium();
  const { data: calendarsData, isLoading: isLoadingCalendars } = useCalendars();
  const {
    data: briefsData,
    isLoading: isLoadingBriefs,
    error: briefsError,
    mutate,
  } = useMeetingBriefs();

  const hasCalendarConnected =
    calendarsData?.connections && calendarsData.connections.length > 0;

  const [enabled, setEnabled] = useState(false);

  // Sync state with fetched data
  useEffect(() => {
    if (briefsData) {
      setEnabled(briefsData.enabled);
    }
  }, [briefsData]);

  const { execute, isExecuting } = useAction(
    updateMeetingBriefsSettingsAction.bind(null, emailAccountId),
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

  const handleToggle = useCallback(
    (newEnabled: boolean) => {
      setEnabled(newEnabled);
      const minutesBefore = briefsData?.minutesBefore ?? 240;
      execute({ enabled: newEnabled, minutesBefore });
    },
    [execute, briefsData?.minutesBefore],
  );

  const isLoading = isLoadingPremium || isLoadingCalendars || isLoadingBriefs;

  return (
    <PageWrapper>
      <PageHeader title="Meeting Briefs" />
      <SectionDescription className="mt-2">
        Get AI-powered briefings before your meetings with context from past
        emails and calendar events.
      </SectionDescription>

      <div className="mt-6 space-y-4">
        <PremiumAlertWithData />

        {!isLoadingPremium && hasAiAccess && (
          <>
            {!isLoadingCalendars && !hasCalendarConnected && (
              <Card>
                <CardContent className="p-4">
                  <div className="flex items-center gap-3">
                    <AlertCircleIcon className="h-5 w-5 text-amber-500" />
                    <div className="flex-1">
                      <p className="font-medium">Calendar Required</p>
                      <p className="text-sm text-muted-foreground">
                        Connect a calendar to enable meeting briefings.
                      </p>
                    </div>
                    <Button asChild variant="outline">
                      <Link href={`/${emailAccountId}/calendars`}>
                        Connect Calendar
                      </Link>
                    </Button>
                  </div>
                </CardContent>
              </Card>
            )}

            <LoadingContent loading={isLoading} error={briefsError}>
              <div className="space-y-2">
                <SettingCard
                  title="Enable Meeting Briefs"
                  description="Receive email briefings before meetings with external guests"
                  right={
                    <Toggle
                      name="enabled"
                      enabled={enabled}
                      onChange={handleToggle}
                      disabled={!hasCalendarConnected || isExecuting}
                    />
                  }
                />

                {enabled && (
                  <SettingCard
                    title="Send briefing before meeting"
                    description="How long before the meeting to send the briefing"
                    collapseOnMobile
                    right={
                      <TimeDurationSetting
                        initialMinutes={briefsData?.minutesBefore ?? 240}
                        enabled={enabled}
                        onSaved={mutate}
                      />
                    }
                  />
                )}
              </div>
            </LoadingContent>

            {!!briefsData?.recentBriefings.length && (
              <div className="mt-8">
                <h3 className="text-lg font-medium mb-4">Recent Briefings</h3>
                <ItemGroup className="gap-2">
                  {briefsData.recentBriefings.map((briefing) => (
                    <Item key={briefing.id} variant="outline">
                      <ItemContent>
                        <ItemTitle>{briefing.eventTitle}</ItemTitle>
                        <ItemDescription>
                          {briefing.guestCount} guest
                          {briefing.guestCount !== 1 ? "s" : ""} •{" "}
                          {formatDistanceToNow(new Date(briefing.createdAt), {
                            addSuffix: true,
                          })}
                        </ItemDescription>
                      </ItemContent>
                      <ItemActions>
                        <span
                          className={`text-xs px-2 py-1 rounded ${
                            briefing.status === "SENT"
                              ? "bg-green-100 text-green-800"
                              : "bg-red-100 text-red-800"
                          }`}
                        >
                          {briefing.status}
                        </span>
                      </ItemActions>
                    </Item>
                  ))}
                </ItemGroup>
              </div>
            )}
          </>
        )}
      </div>
    </PageWrapper>
  );
}
