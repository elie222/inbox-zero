import { PageWrapper } from "@/components/PageWrapper";
import { PageHeader } from "@/components/PageHeader";
import { CalendarConnections } from "./CalendarConnections";
import { CalendarSettings } from "./CalendarSettings";
import { ConnectCalendar } from "@/app/(app)/[emailAccountId]/calendars/ConnectCalendar";
import { TimezoneDetector } from "./TimezoneDetector";

export default function CalendarsPage() {
  return (
    <PageWrapper>
      <TimezoneDetector />
      <div className="flex flex-col lg:flex-row lg:items-center lg:justify-between gap-3 lg:gap-4">
        <PageHeader
          title="Calendars"
          description="Connect your calendar to allow our AI to suggest meeting times based on your availability when drafting replies."
        />
        <ConnectCalendar />
      </div>
      <div className="mt-6 space-y-4">
        <CalendarSettings />
        <CalendarConnections />
      </div>
    </PageWrapper>
  );
}
