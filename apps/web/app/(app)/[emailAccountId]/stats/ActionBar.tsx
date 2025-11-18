import subDays from "date-fns/subDays";
import { GanttChartIcon, Tally3Icon } from "lucide-react";
import type { DateRange } from "react-day-picker";
import { DetailedStatsFilter } from "@/app/(app)/[emailAccountId]/stats/DetailedStatsFilter";
import { DatePickerWithRange } from "@/components/DatePickerWithRange";
import { LoadStatsButton } from "@/app/(app)/[emailAccountId]/stats/LoadStatsButton";

export function ActionBar({
  selectOptions,
  dateDropdown,
  setDateDropdown,
  dateRange,
  setDateRange,
  period,
  setPeriod,
  isMobile,
}: {
  dateDropdown: string;
  setDateDropdown: (option: { label: string; value: string }) => void;
  dateRange?: DateRange | undefined;
  setDateRange: (dateRange?: DateRange) => void;
  selectOptions: { label: string; value: string }[];
  period?: "day" | "week" | "month" | "year";
  setPeriod?: (value: "day" | "week" | "month" | "year") => void;
  isMobile: boolean;
}) {
  return (
    <div className="flex items-center justify-between w-full gap-3">
      <div className="flex items-center gap-3">
        {period && setPeriod && (
          <DetailedStatsFilter
            label={`Group by ${period}`}
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
        {!isMobile && (
          <DetailedStatsFilter
            label={dateDropdown || "Set date range"}
            icon={<GanttChartIcon className="mr-2 h-4 w-4" />}
            columns={selectOptions.map((option) => ({
              ...option,
              checked: option.label === dateDropdown,
              setChecked: () => {
                setDateDropdown(option);

                const days = Number.parseInt(option.value);

                if (days === 0) setDateRange(undefined);
                if (days) {
                  const now = new Date();
                  setDateRange({ from: subDays(now, days), to: now });
                }
              },
            }))}
          />
        )}
        <DatePickerWithRange
          dateRange={dateRange}
          onSetDateRange={setDateRange}
        />
      </div>
      <LoadStatsButton />
    </div>
  );
}
