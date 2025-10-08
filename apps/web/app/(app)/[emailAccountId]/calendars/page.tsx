import { PageWrapper } from "@/components/PageWrapper";
import { PageHeader } from "@/components/PageHeader";
import { CalendarConnections } from "./CalendarConnections";
import { ConnectCalendarButton } from "@/app/(app)/[emailAccountId]/calendars/ConnectCalendarButton";

export default function CalendarsPage() {
  return (
    <PageWrapper>
      <div className="flex items-center justify-between gap-4">
        <PageHeader
          title="Calendars"
          description="Connect your calendar to allow our AI to suggest meeting times based on your availability when drafting replies."
        />
        <ConnectCalendarButton />
      </div>
      <div className="mt-6">
        <CalendarConnections />
      </div>
    </PageWrapper>
  );
}
