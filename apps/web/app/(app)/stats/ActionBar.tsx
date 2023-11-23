import React from "react";
import { subDays } from "date-fns";
import { GanttChartIcon, Tally3Icon } from "lucide-react";
import { DateRange } from "react-day-picker";
import { DetailedStatsFilter } from "@/app/(app)/stats/DetailedStatsFilter";
import { DatePickerWithRange } from "@/components/DatePickerWithRange";

export function ActionBar(props: {
  dateDropdown: string;
  setDateDropdown: (option: { label: string; value: string }) => void;
  dateRange?: DateRange | undefined;
  setDateRange: (dateRange?: DateRange) => void;
  selectOptions: { label: string; value: string }[];
  period?: "day" | "week" | "month" | "year";
  setPeriod?: (value: "day" | "week" | "month" | "year") => void;
}) {
  const {
    selectOptions,
    dateDropdown,
    setDateDropdown,
    dateRange,
    setDateRange,
    period,
    setPeriod,
  } = props;

  return (
    <div className="sm:flex sm:space-x-1">
      {period && setPeriod && (
        <DetailedStatsFilter
          label={`By ${period}`}
          icon={<Tally3Icon className="mr-2 h-4 w-4" />}
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
      )}
      <DetailedStatsFilter
        label={dateDropdown || "Set date range"}
        icon={<GanttChartIcon className="mr-2 h-4 w-4" />}
        columns={selectOptions.map((option) => ({
          ...option,
          checked: option.label === dateDropdown,
          setChecked: () => {
            setDateDropdown(option);

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
    </div>
  );
}
