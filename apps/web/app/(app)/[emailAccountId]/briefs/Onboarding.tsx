"use client";

import { MailIcon, LightbulbIcon, UserSearchIcon } from "lucide-react";
import { SetupCard } from "@/components/SetupCard";
import { MessageText } from "@/components/Typography";
import { Button } from "@/components/ui/button";
import { ConnectCalendar } from "@/app/(app)/[emailAccountId]/calendars/ConnectCalendar";

const features = [
  {
    icon: <UserSearchIcon className="size-4 text-blue-500" />,
    title: "Attendee research",
    description: "Who they are, their company, and role",
  },
  {
    icon: <MailIcon className="size-4 text-blue-500" />,
    title: "Email history",
    description: "Recent conversations with this person",
  },
  {
    icon: <LightbulbIcon className="size-4 text-blue-500" />,
    title: "Key context",
    description: "Important details from past discussions",
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
  return (
    <SetupCard
      imageSrc="/images/illustrations/communication.svg"
      imageAlt="Meeting Briefs"
      title="Meeting Briefs"
      description="Receive email briefings before meetings with external guests."
      features={features}
    >
      {hasCalendarConnected ? (
        <>
          <MessageText>
            You're all set! Enable meeting briefs to get started:
          </MessageText>
          <Button onClick={onEnable} loading={isEnabling}>
            Enable Meeting Briefs
          </Button>
        </>
      ) : (
        <>
          <MessageText>Connect your calendar to get started:</MessageText>
          <ConnectCalendar onboardingReturnPath={`/${emailAccountId}/briefs`} />
        </>
      )}
    </SetupCard>
  );
}
