import { t } from "@lingui/core/macro";
import { PageWrapper } from "@/components/PageWrapper";
import { PageHeader } from "@/components/PageHeader";
import { CalendarConnections } from "./CalendarConnections";
import { CalendarSettings } from "./CalendarSettings";
import { BookingLinksSection } from "./BookingLinksSection";
import { AvailabilitySection } from "./AvailabilitySection";
import { TimezoneDetector } from "@/components/TimezoneDetector";
import { initLingui } from "@/utils/i18n/server";

export default async function CalendarsPage() {
  const i18n = await initLingui();

  return (
    <PageWrapper>
      <TimezoneDetector />
      <PageHeader
        title={t(i18n)`Calendars`}
        description={t(i18n)`Powering AI scheduling and meeting briefs.`}
      />
      <div className="mt-6 max-w-4xl space-y-4">
        <CalendarConnections />
        <BookingLinksSection />
        <AvailabilitySection />
        <CalendarSettings />
      </div>
    </PageWrapper>
  );
}
