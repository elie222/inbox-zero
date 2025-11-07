import { PageWrapper } from "@/components/PageWrapper";
import { PageHeader } from "@/components/PageHeader";
import { CalendarConnections } from "./CalendarConnections";
import { ConnectCalendar } from "@/app/(app)/[emailAccountId]/calendars/ConnectCalendar";

export default function CalendarsPage() {
  return (
    <PageWrapper>
      <div className="flex flex-col lg:flex-row lg:items-center lg:justify-between gap-3 lg:gap-4">
        <PageHeader
          title="Calendars"
          description="Connect your calendar to allow our AI to suggest meeting times based on your availability when drafting replies."
        />
        <ConnectCalendar />
      </div>
      <div className="mt-6">
        <CalendarConnections />
      </div>
    </PageWrapper>
  );
}
