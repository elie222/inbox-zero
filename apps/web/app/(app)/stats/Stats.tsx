"use client";

import { subDays } from "date-fns";
import { useState, useMemo, useCallback, useEffect } from "react";
import type { DateRange } from "react-day-picker";
import { DetailedStats } from "@/app/(app)/stats/DetailedStats";
import { LoadStatsButton } from "@/app/(app)/stats/LoadStatsButton";
import { LargestEmails } from "@/app/(app)/stats/LargestEmails";
import { EmailAnalytics } from "@/app/(app)/stats/EmailAnalytics";
import { StatsSummary } from "@/app/(app)/stats/StatsSummary";
import { StatsOnboarding } from "@/app/(app)/stats/StatsOnboarding";
import { ActionBar } from "@/app/(app)/stats/ActionBar";
import { LoadProgress } from "@/app/(app)/stats/LoadProgress";
import { useStatLoader } from "@/providers/StatLoaderProvider";
import { EmailActionsAnalytics } from "@/app/(app)/stats/EmailActionsAnalytics";
import { BulkUnsubscribeSummary } from "@/app/(app)/bulk-unsubscribe/BulkUnsubscribeSummary";
import { Card } from "@/components/Card";
import { Title } from "@tremor/react";
import { TopBar } from "@/components/TopBar";
// import { Insights } from "@/app/(app)/stats/Insights";

const selectOptions = [
  { label: "Last week", value: "7" },
  { label: "Last month", value: "30" },
  { label: "Last 3 months", value: "90" },
  { label: "Last year", value: "365" },
  { label: "All", value: "0" },
];
const defaultSelected = selectOptions[1];

export function Stats() {
  const [dateDropdown, setDateDropdown] = useState<string>(
    defaultSelected.label,
  );

  const now = useMemo(() => new Date(), []);
  const [dateRange, setDateRange] = useState<DateRange | undefined>({
    from: subDays(now, Number.parseInt(defaultSelected.value)),
    to: now,
  });

  const [period, setPeriod] = useState<"day" | "week" | "month" | "year">(
    "week",
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
    [period],
  );

  const { isLoading, onLoad } = useStatLoader();
  const refreshInterval = isLoading ? 5_000 : 1_000_000;
  useEffect(() => {
    onLoad({ loadBefore: false, showToast: false });
  }, [onLoad]);

  return (
    <div className="pb-20">
      <TopBar sticky>
        {isLoading ? <LoadProgress /> : <div />}
        <div className="flex flex-wrap gap-1">
          <ActionBar
            selectOptions={selectOptions}
            dateDropdown={dateDropdown}
            setDateDropdown={onSetDateDropdown}
            dateRange={dateRange}
            setDateRange={setDateRange}
            period={period}
            setPeriod={setPeriod}
            isMobile={false}
          />
          <LoadStatsButton />
        </div>
      </TopBar>

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

      <div className="mt-4 px-4">
        <Card>
          <Title>
            How many emailers you've handled with Inbox Zero bulk unsubscribe
          </Title>
          <div className="mt-2">
            <BulkUnsubscribeSummary />
          </div>
        </Card>
      </div>

      <div className="mt-4 px-4">
        <EmailActionsAnalytics />
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
