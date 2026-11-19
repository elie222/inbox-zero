"use client";

import { useState } from "react";
import { msg } from "@lingui/core/macro";
import { Trans, useLingui } from "@lingui/react/macro";
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
import { getMeetingBotDisplayName } from "@/utils/meeting-recorder/bot-provider";
import { ConnectCalendar } from "@/app/(app)/[emailAccountId]/calendars/ConnectCalendar";
import { JOIN_RULE_OPTIONS } from "@/app/(app)/[emailAccountId]/meetings/join-rule-options";

const features = [
  {
    icon: <MicIcon className="size-4 text-blue-500" />,
    title: msg`Notes and transcript`,
    description: msg`A summary of every call`,
  },
  {
    icon: <ListChecksIcon className="size-4 text-blue-500" />,
    title: msg`Action items with owners`,
    description: msg`What was decided, and who owns what`,
  },
  {
    icon: <MailPlusIcon className="size-4 text-blue-500" />,
    title: msg`Follow-up drafted for you`,
    description: msg`Waiting in your drafts, never sent`,
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
  const { t, i18n } = useLingui();
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
      imageAlt={t`Meeting notetaker`}
      title={t`Never write meeting notes again`}
      description={t`Inbox Zero joins your calls, takes the notes, and drafts the follow-up email.`}
      features={features.map((feature) => ({
        ...feature,
        title: i18n._(feature.title),
        description: i18n._(feature.description),
      }))}
    >
      {hasCalendarConnected ? (
        <Button onClick={() => setJoinRule(MeetingJoinRule.ALL)}>
          <Trans>Get started</Trans>
        </Button>
      ) : (
        <>
          <MessageText>
            <Trans>Connect your calendar to get started:</Trans>
          </MessageText>
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
  const { t, i18n } = useLingui();
  const { emailAccount, userEmail } = useAccount();
  const botName = getMeetingBotDisplayName({
    ownerName: emailAccount?.name ?? null,
    ownerEmail: userEmail,
  });

  return (
    <div className="mx-4 mt-16 flex max-w-lg flex-col gap-6 md:mx-auto">
      <div className="flex flex-col gap-3">
        <PageHeading>
          <Trans>Which meetings should we join?</Trans>
        </PageHeading>

        <MutedText className="flex flex-wrap items-center gap-x-2">
          <CheckIcon className="size-4 shrink-0 text-green-600" />
          <Trans>{userEmail} connected</Trans>
          <TextLink href={`/${emailAccountId}/calendars`}>
            <Trans>Change</Trans>
          </TextLink>
        </MutedText>
      </div>

      <RadioCardGroup
        name="joinRule"
        ariaLabel={t`Which meetings to join`}
        value={joinRule}
        onChange={onChange}
        options={JOIN_RULE_OPTIONS.map((option) => ({
          ...option,
          label: i18n._(option.label),
        }))}
        disabled={isEnabling}
      />

      <Button className="self-start" loading={isEnabling} onClick={onConfirm}>
        <Trans>Start recording my meetings</Trans>
      </Button>

      <MutedText className="flex items-start gap-2 text-xs">
        <ShieldIcon className="mt-0.5 size-3.5 shrink-0" />
        <Trans>Joins as a visible participant called {botName}.</Trans>
      </MutedText>
    </div>
  );
}
