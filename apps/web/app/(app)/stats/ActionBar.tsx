import React from "react";
import { subDays } from "date-fns";
import { GanttChartIcon } from "lucide-react";
import { DetailedStatsFilter } from "@/app/(app)/stats/DetailedStatsFilter";
import { DatePickerWithRange } from "@/components/DatePickerWithRange";
import { DateRange } from "react-day-picker";

export function ActionBar(props: {
  dateDropdown: string;
  setDateDropdown: (value: string) => void;
  dateRange?: DateRange | undefined;
  setDateRange: (dateRange?: DateRange) => void;
  selectOptions: { label: string; value: string }[];
}) {
  const {
    dateDropdown,
    setDateDropdown,
    setDateRange,
    selectOptions,
    dateRange,
  } = props;

  return (
    <>
      <DetailedStatsFilter
        label={dateDropdown || "Set date range"}
        icon={<GanttChartIcon className="mr-2 h-4 w-4" />}
        columns={selectOptions.map((option) => ({
          ...option,
          checked: option.label === dateDropdown,
          setChecked: () => {
            setDateDropdown(option.label);

            const days = parseInt(option.value);

            if (days === 0) setDateRange(undefined);
            if (days) {
              const now = new Date();
              setDateRange({ from: subDays(now, days), to: now });
            }
          },
        }))}
      />
      <DatePickerWithRange
        dateRange={dateRange}
        onSetDateRange={setDateRange}
      />
    </>
  );
}
