"use client";

import { useState, useMemo, useCallback, useEffect } from "react";
import type { DateRange } from "react-day-picker";
import subDays from "date-fns/subDays";
import { DetailedStats } from "@/app/(app)/[emailAccountId]/stats/DetailedStats";
import { LoadStatsButton } from "@/app/(app)/[emailAccountId]/stats/LoadStatsButton";
import { EmailAnalytics } from "@/app/(app)/[emailAccountId]/stats/EmailAnalytics";
import { StatsSummary } from "@/app/(app)/[emailAccountId]/stats/StatsSummary";
import { StatsOnboarding } from "@/app/(app)/[emailAccountId]/stats/StatsOnboarding";
import { ActionBar } from "@/app/(app)/[emailAccountId]/stats/ActionBar";
import { LoadProgress } from "@/app/(app)/[emailAccountId]/stats/LoadProgress";
import { useStatLoader } from "@/providers/StatLoaderProvider";
import { EmailActionsAnalytics } from "@/app/(app)/[emailAccountId]/stats/EmailActionsAnalytics";
import { BulkUnsubscribeSummary } from "@/app/(app)/[emailAccountId]/bulk-unsubscribe/BulkUnsubscribeSummary";
import { CardBasic } from "@/components/ui/card";
import { Title } from "@tremor/react";
import { PageHeading } from "@/components/Typography";
import { PageWrapper } from "@/components/PageWrapper";

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
  const refreshInterval = isLoading ? 5000 : 1_000_000;
  useEffect(() => {
    onLoad({ loadBefore: false, showToast: false });
  }, [onLoad]);

  return (
    <PageWrapper className="pb-20">
      <PageHeading>Analytics</PageHeading>
      <div className="flex items-center justify-between">
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
      </div>

      <div className="py-4">
        <StatsSummary dateRange={dateRange} refreshInterval={refreshInterval} />
      </div>

      <EmailAnalytics dateRange={dateRange} refreshInterval={refreshInterval} />

      <div className="mt-4">
        <DetailedStats
          dateRange={dateRange}
          period={period}
          refreshInterval={refreshInterval}
        />
      </div>

      <div className="mt-4">
        <CardBasic>
          <Title>
            How many emailers you've handled with Inbox Zero bulk unsubscribe
          </Title>
          <div className="mt-2">
            <BulkUnsubscribeSummary />
          </div>
        </CardBasic>
      </div>

      <div className="mt-4">
        <EmailActionsAnalytics />
      </div>

      <StatsOnboarding />
    </PageWrapper>
  );
}
