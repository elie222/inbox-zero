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
import { RuleStatsChart } from "./RuleStatsChart";
import { CardBasic } from "@/components/ui/card";
import { Title } from "@tremor/react";
import { PageHeading } from "@/components/Typography";
import { PageWrapper } from "@/components/PageWrapper";
import { useOrgAccess } from "@/hooks/useOrgAccess";

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

  const { isAccountOwner, accountInfo } = useOrgAccess();

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
    // Skip stat loading when viewing someone else's account
    if (isAccountOwner) {
      onLoad({ loadBefore: false, showToast: false });
    }
  }, [onLoad, isAccountOwner]);

  return (
    <PageWrapper>
      <PageHeading>
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            {!isAccountOwner && accountInfo?.name
              ? `Analytics for ${accountInfo.name}`
              : "Analytics"}
            <LoadStatsButton />
          </div>
          <div className="flex items-center justify-between mt-2 sm:mt-0">
            {/* {isLoading ? <LoadProgress /> : <div />} */}
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
            </div>
          </div>
        </div>
      </PageHeading>

      <div className="grid gap-2 sm:gap-4 mt-2 sm:mt-4">
        <StatsSummary dateRange={dateRange} refreshInterval={refreshInterval} />

        {isAccountOwner && (
          <EmailAnalytics
            dateRange={dateRange}
            refreshInterval={refreshInterval}
          />
        )}

        <RuleStatsChart
          dateRange={dateRange}
          title="Assistant processed emails"
        />

        {/* <DetailedStats
          dateRange={dateRange}
          period={period}
          refreshInterval={refreshInterval}
        /> */}

        <CardBasic>
          <Title>
            How many emailers you've handled with Inbox Zero bulk unsubscribe
          </Title>
          <div className="mt-2">
            <BulkUnsubscribeSummary />
          </div>
        </CardBasic>

        {isAccountOwner && <EmailActionsAnalytics />}
      </div>

      <StatsOnboarding />
    </PageWrapper>
  );
}
