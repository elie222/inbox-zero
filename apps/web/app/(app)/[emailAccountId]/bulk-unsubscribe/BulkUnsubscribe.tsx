"use client";

import subDays from "date-fns/subDays";
import { useCallback, useEffect, useMemo, useState } from "react";
import { useWindowSize } from "usehooks-ts";
import type { DateRange } from "react-day-picker";
import { BulkUnsubscribeSection } from "@/app/(app)/[emailAccountId]/bulk-unsubscribe/BulkUnsubscribeSection";
import { LoadStatsButton } from "@/app/(app)/[emailAccountId]/stats/LoadStatsButton";
import { ActionBar } from "@/app/(app)/[emailAccountId]/stats/ActionBar";
import { useStatLoader } from "@/providers/StatLoaderProvider";
import { OnboardingModal } from "@/components/OnboardingModal";
import { TextLink } from "@/components/Typography";
import { TopBar } from "@/components/TopBar";

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
export function BulkUnsubscribe() {
  const windowSize = useWindowSize();
  const isMobile = windowSize.width < 768;

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
    from: subDays(now, Number.parseInt(defaultSelected.value)),
    to: now,
  });

  const { isLoading, onLoad } = useStatLoader();
  const refreshInterval = isLoading ? 5000 : 1_000_000;
  useEffect(() => {
    onLoad({ loadBefore: false, showToast: false });
  }, [onLoad]);

  return (
    <div>
      <TopBar sticky className="border-border bg-background">
        <OnboardingModal
          title="Getting started with Bulk Unsubscribe"
          description={
            <>
              Learn how to quickly bulk unsubscribe from unwanted emails. You
              can read more in our{" "}
              <TextLink href="https://docs.getinboxzero.com/essentials/bulk-email-unsubscriber">
                documentation
              </TextLink>
              .
            </>
          }
          videoId="T1rnooV4OYc"
        />

        <div className="flex flex-wrap gap-1">
          <ActionBar
            selectOptions={selectOptions}
            dateDropdown={dateDropdown}
            setDateDropdown={onSetDateDropdown}
            dateRange={dateRange}
            setDateRange={setDateRange}
            isMobile={isMobile}
          />
          <LoadStatsButton />
        </div>
      </TopBar>

      <div className="my-2 sm:mx-4 sm:my-4">
        <BulkUnsubscribeSection
          dateRange={dateRange}
          refreshInterval={refreshInterval}
          isMobile={isMobile}
        />
      </div>
    </div>
  );
}
