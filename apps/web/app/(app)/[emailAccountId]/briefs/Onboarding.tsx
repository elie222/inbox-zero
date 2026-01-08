"use client";

import { CardFooter, Card } from "@/components/ui/card";
import {
  MessageText,
  SectionDescription,
  TypographyH3,
} from "@/components/Typography";
import { ConnectCalendar } from "@/app/(app)/[emailAccountId]/calendars/ConnectCalendar";
import { MailIcon, LightbulbIcon, UserSearchIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Item,
  ItemContent,
  ItemDescription,
  ItemGroup,
  ItemTitle,
} from "@/components/ui/item";
import Image from "next/image";

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
    <Card className="mx-4 mt-10 max-w-2xl p-6 md:mx-auto">
      <Image
        src="/images/illustrations/communication.svg"
        alt="Meeting Briefs"
        width={200}
        height={200}
        className="mx-auto dark:brightness-90 dark:invert"
        unoptimized
      />

      <div className="text-center">
        <TypographyH3 className="mt-2">Meeting Briefs</TypographyH3>
        <SectionDescription className="mx-auto mt-2 max-w-prose">
          Receive email briefings before meetings with external guests.
        </SectionDescription>
      </div>

      <ItemGroup className="mt-6">
        <Item>
          <UserSearchIcon className="text-blue-500 size-4" />
          <ItemContent>
            <ItemTitle>Attendee research</ItemTitle>
            <ItemDescription>
              Who they are, their company, and role
            </ItemDescription>
          </ItemContent>
        </Item>
        <Item>
          <MailIcon className="text-blue-500 size-4" />
          <ItemContent>
            <ItemTitle>Email history</ItemTitle>
            <ItemDescription>
              Recent conversations with this person
            </ItemDescription>
          </ItemContent>
        </Item>
        <Item>
          <LightbulbIcon className="text-blue-500 size-4" />
          <ItemContent>
            <ItemTitle>Key context</ItemTitle>
            <ItemDescription>
              Important details from past discussions
            </ItemDescription>
          </ItemContent>
        </Item>
      </ItemGroup>

      <CardFooter className="flex flex-col items-center gap-4 mt-6">
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
            <ConnectCalendar
              onboardingReturnPath={`/${emailAccountId}/briefs`}
            />
          </>
        )}
      </CardFooter>
    </Card>
  );
}
