"use client";

import { useState } from "react";
import {
  CheckIcon,
  ListChecksIcon,
  MailPlusIcon,
  MicIcon,
  ShieldIcon,
} from "lucide-react";
import { RadioCardGroup } from "@/components/RadioCardGroup";
import { SetupCard } from "@/components/SetupCard";
import {
  MessageText,
  MutedText,
  PageHeading,
  TextLink,
} from "@/components/Typography";
import { Button } from "@/components/ui/button";
import { MeetingJoinRule } from "@/generated/prisma/enums";
import { useAccount } from "@/providers/EmailAccountProvider";
import { MEETING_BOT_DISPLAY_NAME } from "@/utils/meeting-recorder/bot-provider";
import { ConnectCalendar } from "@/app/(app)/[emailAccountId]/calendars/ConnectCalendar";
import { JOIN_RULE_OPTIONS } from "@/app/(app)/[emailAccountId]/meetings/join-rule-options";

const features = [
  {
    icon: <MicIcon className="size-4 text-blue-500" />,
    title: "Notes and transcript",
    description: "A summary of every call",
  },
  {
    icon: <ListChecksIcon className="size-4 text-blue-500" />,
    title: "Action items with owners",
    description: "What was decided, and who owns what",
  },
  {
    icon: <MailPlusIcon className="size-4 text-blue-500" />,
    title: "Follow-up drafted for you",
    description: "Waiting in your drafts, never sent",
  },
];

export function MeetingRecorderOnboarding({
  emailAccountId,
  hasCalendarConnected,
  onEnable,
  isEnabling,
}: {
  emailAccountId: string;
  hasCalendarConnected: boolean;
  onEnable: (joinRule: MeetingJoinRule) => void;
  isEnabling: boolean;
}) {
  const [joinRule, setJoinRule] = useState<MeetingJoinRule | null>(null);

  // Nothing is written until the second step, so leaving the flow part way
  // through does not enable anything.
  if (joinRule !== null) {
    return (
      <ChooseJoinRule
        emailAccountId={emailAccountId}
        joinRule={joinRule}
        onChange={setJoinRule}
        onConfirm={() => onEnable(joinRule)}
        isEnabling={isEnabling}
      />
    );
  }

  return (
    <SetupCard
      imageSrc="/images/illustrations/calling-help.svg"
      imageAlt="Meeting notetaker"
      title="Never write meeting notes again"
      description="Inbox Zero joins your calls, takes the notes, and drafts the follow-up email."
      features={features}
    >
      {hasCalendarConnected ? (
        <Button onClick={() => setJoinRule(MeetingJoinRule.EXTERNAL_ONLY)}>
          Get started
        </Button>
      ) : (
        <>
          <MessageText>Connect your calendar to get started:</MessageText>
          <ConnectCalendar
            analyticsPage="meetings"
            onboardingReturnPath={`/${emailAccountId}/meetings`}
          />
        </>
      )}
    </SetupCard>
  );
}

function ChooseJoinRule({
  emailAccountId,
  joinRule,
  onChange,
  onConfirm,
  isEnabling,
}: {
  emailAccountId: string;
  joinRule: MeetingJoinRule;
  onChange: (rule: MeetingJoinRule) => void;
  onConfirm: () => void;
  isEnabling: boolean;
}) {
  const { userEmail } = useAccount();

  return (
    <div className="mx-4 mt-16 flex max-w-lg flex-col gap-6 md:mx-auto">
      <div className="flex flex-col gap-3">
        <PageHeading>Which meetings should we join?</PageHeading>

        <MutedText className="flex flex-wrap items-center gap-x-2">
          <CheckIcon className="size-4 shrink-0 text-green-600" />
          {userEmail} connected
          <TextLink href={`/${emailAccountId}/calendars`}>Change</TextLink>
        </MutedText>
      </div>

      <RadioCardGroup
        name="joinRule"
        ariaLabel="Which meetings to join"
        value={joinRule}
        onChange={onChange}
        options={JOIN_RULE_OPTIONS}
        disabled={isEnabling}
      />

      <Button className="self-start" loading={isEnabling} onClick={onConfirm}>
        Start recording my meetings
      </Button>

      <MutedText className="flex items-start gap-2 text-xs">
        <ShieldIcon className="mt-0.5 size-3.5 shrink-0" />
        Joins as a visible participant called {MEETING_BOT_DISPLAY_NAME}.
      </MutedText>
    </div>
  );
}
