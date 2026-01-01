import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { PageWrapper } from "@/components/PageWrapper";
import { PageHeader } from "@/components/PageHeader";
import { CalendarConnections } from "./CalendarConnections";
import { CalendarSettings } from "./CalendarSettings";
import { TimezoneDetector } from "./TimezoneDetector";
import { CALENDAR_ONBOARDING_RETURN_COOKIE } from "@/utils/calendar/constants";

export default async function CalendarsPage() {
  const cookieStore = await cookies();
  const returnPathCookie = cookieStore.get(CALENDAR_ONBOARDING_RETURN_COOKIE);

  if (returnPathCookie?.value) {
    const returnPath = decodeURIComponent(returnPathCookie.value);
    const isInternalPath =
      returnPath.startsWith("/") && !returnPath.startsWith("//");
    if (isInternalPath) {
      redirect(returnPath);
    }
  }

  return (
    <PageWrapper>
      <TimezoneDetector />
      <PageHeader
        title="Calendars"
        description="Powering AI scheduling and meeting briefs."
      />
      <div className="mt-6 space-y-4">
        <CalendarConnections />
        <CalendarSettings />
      </div>
    </PageWrapper>
  );
}
