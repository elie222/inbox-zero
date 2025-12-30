"use client";

import { Calendar, CheckIcon } from "lucide-react";
import { PageHeading, TypographyP } from "@/components/Typography";
import { useCalendars } from "@/hooks/useCalendars";
import { IconCircle } from "@/app/(app)/[emailAccountId]/onboarding/IconCircle";
import { ConnectCalendar } from "@/app/(app)/[emailAccountId]/calendars/ConnectCalendar";
import { Button } from "@/components/ui/button";
import { useAccount } from "@/providers/EmailAccountProvider";
import { prefixPath } from "@/utils/path";

export function StepConnectCalendar({ onNext }: { onNext: () => void }) {
  const { emailAccountId } = useAccount();
  const { data: calendarsData } = useCalendars();

  const hasCalendarConnected =
    calendarsData?.connections && calendarsData.connections.length > 0;

  return (
    <>
      <div className="flex justify-center">
        <IconCircle size="lg">
          <Calendar className="size-6" />
        </IconCircle>
      </div>

      <div className="text-center">
        <PageHeading className="mt-4">Connect Your Calendar</PageHeading>
        <TypographyP className="mt-2 max-w-lg mx-auto">
          We'll automatically detect your upcoming meetings with external guests
          and prepare personalized briefings.
        </TypographyP>
      </div>

      <div className="flex flex-col items-center justify-center mt-8 gap-4">
        {hasCalendarConnected ? (
          <>
            <div className="flex items-center gap-2 text-green-600 font-medium animate-in fade-in zoom-in duration-300">
              <CheckIcon className="h-5 w-5" />
              Calendar Connected!
            </div>
            <Button onClick={onNext} className="mt-2">
              Continue
            </Button>
          </>
        ) : (
          <ConnectCalendar
            onboardingReturnPath={prefixPath(
              emailAccountId,
              "/onboarding-brief?step=2",
            )}
          />
        )}
      </div>
    </>
  );
}
