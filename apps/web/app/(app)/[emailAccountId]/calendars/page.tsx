import { PageHeading } from "@/components/Typography";
import { PageWrapper } from "@/components/PageWrapper";
import { CalendarConnections } from "./CalendarConnections";

export default function CalendarsPage() {
  return (
    <PageWrapper>
      <div className="content-container mb-8">
        <PageHeading>Calendars</PageHeading>
      </div>

      <CalendarConnections />
    </PageWrapper>
  );
}
