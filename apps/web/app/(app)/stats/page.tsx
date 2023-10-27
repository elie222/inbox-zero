"use client";

import { DetailedStats } from "@/app/(app)/stats/DetailedStats";
import { LoadStatsButton } from "@/app/(app)/stats/LoadStatsButton";
import { LargestEmails } from "@/app/(app)/stats/LargestEmails";
// import { StatsChart } from "@/app/(app)/stats/StatsChart";
// import { CombinedStatsChart } from "@/app/(app)/stats/CombinedStatsChart";
import { EmailAnalytics } from "@/app/(app)/stats/EmailAnalytics";
import { StatsSummary } from "@/app/(app)/stats/StatsSummary";
import { NewsletterStats } from "@/app/(app)/stats/NewsletterStats";
import { StatsOnboarding } from "@/app/(app)/stats/StatsOnboarding";
import { ActionBar } from "@/app/(app)/stats/ActionBar";
import { subDays } from "date-fns";
import { useState, useMemo } from "react";
import { DateRange } from "react-day-picker";

const selectOptions = [
  { label: "Last week", value: "7" },
  { label: "Last month", value: "30" },
  { label: "Last 3 months", value: "90" },
  { label: "Last year", value: "365" },
  { label: "All", value: "0" },
];

export default function StatsPage() {
  const [dateDropdown, setDateDropdown] = useState<string>("Last year");

  const now = useMemo(() => new Date(), []);
  const [dateRange, setDateRange] = useState<DateRange | undefined>({
    from: subDays(now, 365),
    to: now,
  });

  return (
    <div className="pb-20">
      <div className="sticky top-0 z-10 flex justify-end space-x-1 border-b bg-white px-4 py-2 shadow">
        <ActionBar
          dateDropdown={dateDropdown}
          setDateDropdown={setDateDropdown}
          dateRange={dateRange}
          setDateRange={setDateRange}
          selectOptions={selectOptions}
        />
        <LoadStatsButton />
      </div>

      <div className="px-4 py-4">
        <StatsSummary />
      </div>

      <div className="px-4">
        <EmailAnalytics />
      </div>

      <div className="mx-4 mt-4">
        <DetailedStats dateRange={dateRange} />
      </div>

      <div className="mx-4 mt-4">
        <NewsletterStats />
      </div>

      {/* <div className="mt-4 grid gap-4 px-4 md:grid-cols-3">
        <div>
          <StatsChart type="inbox" title="Inbox Emails" color="blue" />
        </div>
        <div>
          <StatsChart type="archived" title="Archived Emails" color="lime" />
        </div>
        <div>
          <StatsChart type="sent" title="Sent Emails" color="slate" />
        </div>
      </div>

      <div className="mt-4 px-4">
        <CombinedStatsChart title="Combined Chart" />
      </div> */}

      <div className="mt-4 px-4">
        <LargestEmails />
      </div>

      <StatsOnboarding />
    </div>
  );
}
