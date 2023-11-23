"use client";

import { subDays } from "date-fns";
import { useState, useMemo, useCallback, useEffect, useRef } from "react";
import { DateRange } from "react-day-picker";
import { DetailedStats } from "@/app/(app)/stats/DetailedStats";
import { LoadStatsButton, useLoading } from "@/app/(app)/stats/LoadStatsButton";
import { LargestEmails } from "@/app/(app)/stats/LargestEmails";
import { EmailAnalytics } from "@/app/(app)/stats/EmailAnalytics";
import { StatsSummary } from "@/app/(app)/stats/StatsSummary";
import { StatsOnboarding } from "@/app/(app)/stats/StatsOnboarding";
import { ActionBar } from "@/app/(app)/stats/ActionBar";
import { LoadProgress } from "@/app/(app)/stats/LoadProgress";
// import { Insights } from "@/app/(app)/stats/Insights";

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
      onLoad(false, false);
      isLoading.current = true;
    }
  }, [onLoad]);

  const refreshInterval = loading ? 3_000 : 1_000_000;

  return (
    <div className="pb-20">
      <div className="sticky top-0 z-10 justify-between border-b bg-white px-4 py-2 shadow sm:flex">
        {loading ? <LoadProgress /> : <div />}
        <div className="space-y-1 sm:flex sm:space-x-1 sm:space-y-0">
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
      </div>

      <div className="px-4 py-4">
        <StatsSummary dateRange={dateRange} refreshInterval={refreshInterval} />
      </div>

      <div className="px-4">
        <EmailAnalytics
          dateRange={dateRange}
          refreshInterval={refreshInterval}
        />
      </div>

      <div className="mx-4 mt-4">
        <DetailedStats
          dateRange={dateRange}
          period={period}
          refreshInterval={refreshInterval}
        />
      </div>

      {/* <div className="px-4">
        <Insights />
      </div> */}

      <div className="mt-4 px-4">
        <LargestEmails refreshInterval={refreshInterval} />
      </div>

      <StatsOnboarding />
    </div>
  );
}
