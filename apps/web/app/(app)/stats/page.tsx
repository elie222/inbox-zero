"use client";

import { subDays } from "date-fns";
import { useState, useMemo, useCallback, useEffect, useRef } from "react";
import { DateRange } from "react-day-picker";
import { DetailedStats } from "@/app/(app)/stats/DetailedStats";
import { LoadStatsButton, useLoading } from "@/app/(app)/stats/LoadStatsButton";
import { LargestEmails } from "@/app/(app)/stats/LargestEmails";
import { EmailAnalytics } from "@/app/(app)/stats/EmailAnalytics";
import { StatsSummary } from "@/app/(app)/stats/StatsSummary";
import { NewsletterStats } from "@/app/(app)/stats/NewsletterStats";
import { StatsOnboarding } from "@/app/(app)/stats/StatsOnboarding";
import { ActionBar } from "@/app/(app)/stats/ActionBar";

const selectOptions = [
  { label: "Last week", value: "7" },
  { label: "Last month", value: "30" },
  { label: "Last 3 months", value: "90" },
  { label: "Last year", value: "365" },
  { label: "All", value: "0" },
];
const defaultSelected = selectOptions[1];

export default function StatsPage() {
  const [dateDropdown, setDateDropdown] = useState<string>(
    defaultSelected.label
  );

  const now = useMemo(() => new Date(), []);
  const [dateRange, setDateRange] = useState<DateRange | undefined>({
    from: subDays(now, parseInt(defaultSelected.value)),
    to: now,
  });

  const [period, setPeriod] = useState<"day" | "week" | "month" | "year">(
    "week"
  );

  const onSetDateDropdown = useCallback(
    (option: { label: string; value: string }) => {
      const { label, value } = option;
      setDateDropdown(label);

      if (value === "7") {
        setPeriod("day");
      } else if (value === "30" && (period === "month" || period === "year")) {
        setPeriod("week");
      } else if (value === "90" && period === "year") {
        setPeriod("month");
      }
    },
    [period]
  );

  const { loading, onLoad } = useLoading();

  const isLoading = useRef(false);
  useEffect(() => {
    if (!isLoading.current) {
      onLoad();
      isLoading.current = true;
    }
  }, [onLoad]);

  return (
    <div className="pb-20">
      <div className="sticky top-0 z-10 flex justify-end space-x-1 border-b bg-white px-4 py-2 shadow">
        <ActionBar
          selectOptions={selectOptions}
          dateDropdown={dateDropdown}
          setDateDropdown={onSetDateDropdown}
          dateRange={dateRange}
          setDateRange={setDateRange}
          period={period}
          setPeriod={setPeriod}
        />
        <LoadStatsButton loading={loading} onLoad={onLoad} />
      </div>

      <div className="px-4 py-4">
        <StatsSummary dateRange={dateRange} />
      </div>

      <div className="px-4">
        <EmailAnalytics dateRange={dateRange} />
      </div>

      <div className="mx-4 mt-4">
        <DetailedStats dateRange={dateRange} period={period} />
      </div>

      <div className="mx-4 mt-4">
        <NewsletterStats dateRange={dateRange} />
      </div>

      <div className="mt-4 px-4">
        <LargestEmails />
      </div>

      <StatsOnboarding />
    </div>
  );
}
