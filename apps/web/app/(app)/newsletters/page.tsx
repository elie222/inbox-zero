"use client";

import { subDays } from "date-fns";
import { useCallback, useEffect, useMemo, useState } from "react";
import { DateRange } from "react-day-picker";
import { NewsletterStats } from "@/app/(app)/newsletters/NewsletterStats";
import { LoadStatsButton } from "@/app/(app)/stats/LoadStatsButton";
import { ActionBar } from "@/app/(app)/stats/ActionBar";
import { useStatLoader } from "@/providers/StatLoaderProvider";

const selectOptions = [
  { label: "Last week", value: "7" },
  { label: "Last month", value: "30" },
  { label: "Last 3 months", value: "90" },
  { label: "Last year", value: "365" },
  { label: "All", value: "0" },
];
const defaultSelected = selectOptions[2];

// Some copy paste from /stats page in here
// May want to refactor some of this into a shared hook
export default function NewslettersPage() {
  const [dateDropdown, setDateDropdown] = useState<string>(
    defaultSelected.label,
  );

  const onSetDateDropdown = useCallback(
    (option: { label: string; value: string }) => {
      const { label } = option;
      setDateDropdown(label);
    },
    [],
  );

  const now = useMemo(() => new Date(), []);
  const [dateRange, setDateRange] = useState<DateRange | undefined>({
    from: subDays(now, parseInt(defaultSelected.value)),
    to: now,
  });

  const { isLoading, onLoad } = useStatLoader();
  const refreshInterval = isLoading ? 5_000 : 1_000_000;
  useEffect(() => {
    onLoad({ loadBefore: false, showToast: false });
  }, [onLoad]);

  return (
    <div>
      <div className="sticky top-0 z-10 flex border-b bg-white px-4 py-2 shadow sm:justify-between">
        <div />
        <div className="space-y-1 sm:flex sm:space-x-1 sm:space-y-0">
          <ActionBar
            selectOptions={selectOptions}
            dateDropdown={dateDropdown}
            setDateDropdown={onSetDateDropdown}
            dateRange={dateRange}
            setDateRange={setDateRange}
          />
          <LoadStatsButton />
        </div>
      </div>

      <div className="m-4">
        <NewsletterStats
          dateRange={dateRange}
          refreshInterval={refreshInterval}
        />
      </div>
    </div>
  );
}
