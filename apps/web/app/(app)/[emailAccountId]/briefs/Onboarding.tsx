"use client";

import { msg } from "@lingui/core/macro";
import { Trans, useLingui } from "@lingui/react/macro";
import { MailIcon, LightbulbIcon, UserSearchIcon } from "lucide-react";
import { SetupCard } from "@/components/SetupCard";
import { MessageText } from "@/components/Typography";
import { Button } from "@/components/ui/button";
import { ConnectCalendar } from "@/app/(app)/[emailAccountId]/calendars/ConnectCalendar";

const features = [
  {
    icon: <UserSearchIcon className="size-4 text-blue-500" />,
    title: msg`Attendee research`,
    description: msg`Who they are, their company, and role`,
  },
  {
    icon: <MailIcon className="size-4 text-blue-500" />,
    title: msg`Email history`,
    description: msg`Recent conversations with this person`,
  },
  {
    icon: <LightbulbIcon className="size-4 text-blue-500" />,
    title: msg`Key context`,
    description: msg`Important details from past discussions`,
  },
];

export function BriefsOnboarding({
  emailAccountId,
  hasCalendarConnected = false,
  onEnable,
  isEnabling = false,
}: {
  emailAccountId: string;
  hasCalendarConnected?: boolean;
  onEnable?: () => void;
  isEnabling?: boolean;
}) {
  const { t, i18n } = useLingui();

  return (
    <SetupCard
      imageSrc="/images/illustrations/communication.svg"
      imageAlt={t`Meeting Briefs`}
      title={t`Meeting Briefs`}
      description={t`Receive briefings by email or in your chat app before meetings with external guests.`}
      features={features.map((feature) => ({
        ...feature,
        title: i18n._(feature.title),
        description: i18n._(feature.description),
      }))}
    >
      {hasCalendarConnected ? (
        <>
          <MessageText>
            <Trans>You're all set! Enable meeting briefs to get started:</Trans>
          </MessageText>
          <Button onClick={onEnable} loading={isEnabling}>
            <Trans>Enable Meeting Briefs</Trans>
          </Button>
        </>
      ) : (
        <>
          <MessageText>
            <Trans>Connect your calendar to get started:</Trans>
          </MessageText>
          <ConnectCalendar
            analyticsPage="meeting_briefs"
            onboardingReturnPath={`/${emailAccountId}/briefs`}
          />
        </>
      )}
    </SetupCard>
  );
}
