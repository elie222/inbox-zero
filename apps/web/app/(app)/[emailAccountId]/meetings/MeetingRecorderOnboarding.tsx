"use client";

import { useState } from "react";
import {
  CheckIcon,
  ListChecksIcon,
  MailPlusIcon,
  MicIcon,
  ShieldIcon,
} from "lucide-react";
import { SetupCard } from "@/components/SetupCard";
import {
  MessageText,
  MutedText,
  TextLink,
  TypographyH3,
} from "@/components/Typography";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { MeetingJoinRule } from "@/generated/prisma/enums";
import { useAccount } from "@/providers/EmailAccountProvider";
import { MEETING_BOT_DISPLAY_NAME } from "@/utils/meeting-recorder/bot-provider";
import { ConnectCalendar } from "@/app/(app)/[emailAccountId]/calendars/ConnectCalendar";
import { JoinRuleChooser } from "@/app/(app)/[emailAccountId]/meetings/JoinRuleChooser";

const features = [
  {
    icon: <MicIcon className="size-4 text-blue-500" />,
    title: "Notes and transcript",
    description: "A written summary of every call, searchable afterwards",
  },
  {
    icon: <ListChecksIcon className="size-4 text-blue-500" />,
    title: "Action items with owners",
    description: "What was decided, and who agreed to do what",
  },
  {
    icon: <MailPlusIcon className="size-4 text-blue-500" />,
    title: "Follow-up drafted for you",
    description: "Waiting in your drafts. Nothing is ever sent for you",
  },
];

export function MeetingRecorderOnboarding({
  emailAccountId,
  hasCalendarConnected,
  currentJoinRule,
  onEnable,
  isEnabling,
}: {
  emailAccountId: string;
  hasCalendarConnected: boolean;
  currentJoinRule: MeetingJoinRule | undefined;
  onEnable: (joinRule: MeetingJoinRule) => void;
  isEnabling: boolean;
}) {
  if (!hasCalendarConnected) {
    return (
      <SetupCard
        imageSrc="/images/illustrations/calling-help.svg"
        imageAlt="Meeting notetaker"
        title="Never write meeting notes again"
        description="Inbox Zero joins your calls, takes the notes, and drafts the follow-up email."
        features={features}
      >
        <MessageText>Connect your calendar to get started:</MessageText>
        <ConnectCalendar
          analyticsPage="meetings"
          onboardingReturnPath={`/${emailAccountId}/meetings`}
        />
        <BotVisibilityNote />
      </SetupCard>
    );
  }

  return (
    <ChooseJoinRuleStep
      currentJoinRule={currentJoinRule}
      onEnable={onEnable}
      isEnabling={isEnabling}
    />
  );
}

function ChooseJoinRuleStep({
  currentJoinRule,
  onEnable,
  isEnabling,
}: {
  currentJoinRule: MeetingJoinRule | undefined;
  onEnable: (joinRule: MeetingJoinRule) => void;
  isEnabling: boolean;
}) {
  const { emailAccountId, userEmail } = useAccount();
  const [joinRule, setJoinRule] = useState(
    currentJoinRule ?? MeetingJoinRule.EXTERNAL_ONLY,
  );

  return (
    <Card className="mx-4 mt-10 flex max-w-lg flex-col gap-5 p-6 md:mx-auto">
      <div>
        <TypographyH3>Which meetings should we join?</TypographyH3>

        <MutedText className="mt-2 flex flex-wrap items-center gap-x-2 gap-y-1">
          <CheckIcon className="size-4 shrink-0 text-green-600" />
          <span>{userEmail} connected</span>
          <TextLink href={`/${emailAccountId}/calendars`}>Change</TextLink>
        </MutedText>
      </div>

      <JoinRuleChooser
        value={joinRule}
        onChange={setJoinRule}
        disabled={isEnabling}
      />

      <CardContent className="flex flex-col gap-3 p-0">
        <Button
          className="w-full"
          loading={isEnabling}
          onClick={() => onEnable(joinRule)}
        >
          Start recording my meetings
        </Button>

        <MutedText className="text-center">
          You can change this any time, or turn the notetaker off for a single
          meeting.
        </MutedText>

        <BotVisibilityNote />
      </CardContent>
    </Card>
  );
}

function BotVisibilityNote() {
  return (
    <div className="flex items-start gap-2 text-xs text-muted-foreground">
      <ShieldIcon className="mt-0.5 size-3.5 shrink-0" />
      <span>
        It joins as a visible participant called {MEETING_BOT_DISPLAY_NAME}, so
        everyone in the call knows it is there.
      </span>
    </div>
  );
}
