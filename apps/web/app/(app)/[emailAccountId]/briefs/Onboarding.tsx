"use client";

import {
  Card,
  CardContent,
  CardHeader,
  CardFooter,
  CardTitle,
  CardDescription,
} from "@/components/ui/card";
import {
  SectionHeader,
  SectionDescription,
  MessageText,
} from "@/components/Typography";
import { ConnectCalendar } from "@/app/(app)/[emailAccountId]/calendars/ConnectCalendar";
import { IconCircle } from "@/app/(app)/[emailAccountId]/onboarding/IconCircle";
import { User, Mail, Lightbulb } from "lucide-react";

export function BriefsOnboarding({
  emailAccountId,
}: {
  emailAccountId: string;
}) {
  return (
    <Card className="mx-4 mt-10 max-w-2xl md:mx-auto">
      <CardHeader>
        <CardTitle>Meeting Briefs</CardTitle>
        <CardDescription>
          Receive email briefings before meetings with external guests.
        </CardDescription>
      </CardHeader>

      <CardContent>
        <div className="flex flex-col space-y-6 max-w-md mx-auto">
          <div className="flex gap-4 items-center">
            <IconCircle Icon={User} />
            <div>
              <SectionHeader>Attendee research</SectionHeader>
              <SectionDescription className="mt-0">
                Who they are, their company, and role
              </SectionDescription>
            </div>
          </div>

          <div className="flex gap-4 items-center">
            <IconCircle Icon={Mail} />
            <div>
              <SectionHeader>Email history</SectionHeader>
              <SectionDescription className="mt-0">
                Recent conversations with this person
              </SectionDescription>
            </div>
          </div>

          <div className="flex gap-4 items-center">
            <IconCircle Icon={Lightbulb} />
            <div>
              <SectionHeader>Key context</SectionHeader>
              <SectionDescription className="mt-0">
                Important details from past discussions
              </SectionDescription>
            </div>
          </div>
        </div>
      </CardContent>

      <CardFooter className="flex flex-col items-center gap-4 pt-4">
        <MessageText>Connect your calendar to get started:</MessageText>
        <ConnectCalendar onboardingReturnPath={`/${emailAccountId}/briefs`} />
      </CardFooter>
    </Card>
  );
}
