import { PageWrapper } from "@/components/PageWrapper";
import { PageHeader } from "@/components/PageHeader";
import { CalendarConnections } from "./CalendarConnections";
import { CalendarSettings } from "./CalendarSettings";
import { TimezoneDetector } from "./TimezoneDetector";

export default async function CalendarsPage() {
  return (
    <PageWrapper>
      <TimezoneDetector />
      <PageHeader
        title="Calendars"
        description="Powering AI scheduling and meeting briefs."
      />
      <div className="mt-6 max-w-4xl space-y-4">
        <CalendarConnections />
        <CalendarSettings />
      </div>
    </PageWrapper>
  );
}
