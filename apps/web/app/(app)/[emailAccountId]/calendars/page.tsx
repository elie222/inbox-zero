import { PageHeading } from "@/components/Typography";
import { PageWrapper } from "@/components/PageWrapper";
import { CalendarConnections } from "./CalendarConnections";

export default function CalendarsPage() {
  return (
    <PageWrapper>
      <PageHeading>Calendars</PageHeading>
      <CalendarConnections />
    </PageWrapper>
  );
}
