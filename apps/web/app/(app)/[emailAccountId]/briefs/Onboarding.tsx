"use client";

import {
  CardContent,
  CardHeader,
  CardFooter,
  CardTitle,
  CardDescription,
} from "@/components/ui/card";
import { MessageText } from "@/components/Typography";
import { ConnectCalendar } from "@/app/(app)/[emailAccountId]/calendars/ConnectCalendar";
import { UserIcon, MailIcon, LightbulbIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Item,
  ItemContent,
  ItemDescription,
  ItemGroup,
  ItemMedia,
  ItemTitle,
} from "@/components/ui/item";

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
    <div className="mx-4 mt-10 max-w-2xl md:mx-auto">
      <CardHeader>
        <CardTitle>Meeting Briefs</CardTitle>
        <CardDescription>
          Receive email briefings before meetings with external guests.
        </CardDescription>
      </CardHeader>

      <CardContent>
        <ItemGroup className="grid gap-2">
          <Item variant="outline">
            <ItemMedia variant="icon" className="bg-blue-50">
              <UserIcon className="text-blue-600" />
            </ItemMedia>
            <ItemContent>
              <ItemTitle>Attendee research</ItemTitle>
              <ItemDescription>
                Who they are, their company, and role
              </ItemDescription>
            </ItemContent>
          </Item>
          <Item variant="outline">
            <ItemMedia variant="icon" className="bg-blue-50">
              <MailIcon className="text-blue-600" />
            </ItemMedia>
            <ItemContent>
              <ItemTitle>Email history</ItemTitle>
              <ItemDescription>
                Recent conversations with this person
              </ItemDescription>
            </ItemContent>
          </Item>
          <Item variant="outline">
            <ItemMedia variant="icon" className="bg-blue-50">
              <LightbulbIcon className="text-blue-600" />
            </ItemMedia>
            <ItemContent>
              <ItemTitle>Key context</ItemTitle>
              <ItemDescription>
                Important details from past discussions
              </ItemDescription>
            </ItemContent>
          </Item>
        </ItemGroup>
      </CardContent>

      <CardFooter className="flex flex-col items-center gap-4">
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
    </div>
  );
}
