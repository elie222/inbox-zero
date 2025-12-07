"use client";

import { useState, useMemo, useCallback, useEffect } from "react";
import type { DateRange } from "react-day-picker";
import { subDays } from "date-fns/subDays";
import { EmailAnalytics } from "@/app/(app)/[emailAccountId]/stats/EmailAnalytics";
import { StatsSummary } from "@/app/(app)/[emailAccountId]/stats/StatsSummary";
import { StatsOnboarding } from "@/app/(app)/[emailAccountId]/stats/StatsOnboarding";
import { useStatLoader } from "@/providers/StatLoaderProvider";
import { EmailActionsAnalytics } from "@/app/(app)/[emailAccountId]/stats/EmailActionsAnalytics";
import { RuleStatsChart } from "./RuleStatsChart";
import { PageHeading } from "@/components/Typography";
import { PageWrapper } from "@/components/PageWrapper";
import { useOrgAccess } from "@/hooks/useOrgAccess";
import { LoadStatsButton } from "@/app/(app)/[emailAccountId]/stats/LoadStatsButton";
import { ActionBar } from "@/app/(app)/[emailAccountId]/stats/ActionBar";
import { DetailedStatsFilter } from "@/app/(app)/[emailAccountId]/stats/DetailedStatsFilter";
import { LayoutGrid } from "lucide-react";
import { DatePickerWithRange } from "@/components/DatePickerWithRange";

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

  const title =
    !isAccountOwner && accountInfo?.name
      ? `Analytics for ${accountInfo.name}`
      : "Analytics";

  return (
    <PageWrapper>
      <PageHeading>{title}</PageHeading>
      <ActionBar className="mt-6" rightContent={<LoadStatsButton />}>
        <DatePickerWithRange
          dateRange={dateRange}
          onSetDateRange={setDateRange}
          selectOptions={selectOptions}
          dateDropdown={dateDropdown}
          onSetDateDropdown={onSetDateDropdown}
        />
        <DetailedStatsFilter
          label={`Group by ${period}`}
          icon={<LayoutGrid className="mr-2 h-4 w-4" />}
          columns={[
            {
              label: "Day",
              checked: period === "day",
              setChecked: () => setPeriod("day"),
            },
            {
              label: "Week",
              checked: period === "week",
              setChecked: () => setPeriod("week"),
            },
            {
              label: "Month",
              checked: period === "month",
              setChecked: () => setPeriod("month"),
            },
            {
              label: "Year",
              checked: period === "year",
              setChecked: () => setPeriod("year"),
            },
          ]}
        />
      </ActionBar>
      <div className="grid gap-2 sm:gap-4 mt-2 sm:mt-4">
        <StatsSummary
          dateRange={dateRange}
          refreshInterval={refreshInterval}
          period={period}
        />
        <EmailAnalytics
          dateRange={dateRange}
          refreshInterval={refreshInterval}
        />
        <RuleStatsChart
          dateRange={dateRange}
          title="Assistant processed emails"
        />
        {isAccountOwner && <EmailActionsAnalytics />}
      </div>
      <StatsOnboarding />
    </PageWrapper>
  );
}
