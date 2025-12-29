import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { PageWrapper } from "@/components/PageWrapper";
import { PageHeader } from "@/components/PageHeader";
import { CalendarConnections } from "./CalendarConnections";
import { CalendarSettings } from "./CalendarSettings";
import { ConnectCalendar } from "@/app/(app)/[emailAccountId]/calendars/ConnectCalendar";
import { TimezoneDetector } from "./TimezoneDetector";
import { CALENDAR_ONBOARDING_RETURN_COOKIE } from "@/utils/calendar/constants";

export default async function CalendarsPage() {
  const cookieStore = await cookies();
  const returnPathCookie = cookieStore.get(CALENDAR_ONBOARDING_RETURN_COOKIE);

  if (returnPathCookie?.value) {
    const returnPath = decodeURIComponent(returnPathCookie.value);
    cookieStore.delete(CALENDAR_ONBOARDING_RETURN_COOKIE);
    redirect(returnPath);
  }

  return (
    <PageWrapper>
      <TimezoneDetector />
      <div className="flex flex-col lg:flex-row lg:items-center lg:justify-between gap-3 lg:gap-4">
        <PageHeader title="Calendars" />
        <ConnectCalendar />
      </div>
      <div className="mt-6 space-y-4">
        <CalendarSettings />
        <CalendarConnections />
      </div>
    </PageWrapper>
  );
}
