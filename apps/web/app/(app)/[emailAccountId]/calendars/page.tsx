import { PageHeading } from "@/components/Typography";
import { PageWrapper } from "@/components/PageWrapper";
import { CalendarConnections } from "./CalendarConnections";
import { ConnectCalendarButton } from "@/app/(app)/[emailAccountId]/calendars/ConnectCalendarButton";

export default function CalendarsPage() {
  return (
    <PageWrapper>
      <div className="flex items-center justify-between">
        <PageHeading>Calendars</PageHeading>
        <ConnectCalendarButton />
      </div>
      <div className="mt-4">
        <CalendarConnections />
      </div>
    </PageWrapper>
  );
}
