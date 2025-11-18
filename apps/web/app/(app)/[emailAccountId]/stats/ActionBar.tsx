import { Tally3Icon } from "lucide-react";
import type { DateRange } from "react-day-picker";
import { DetailedStatsFilter } from "@/app/(app)/[emailAccountId]/stats/DetailedStatsFilter";
import { DatePickerWithRange } from "@/components/DatePickerWithRange";
import { LoadStatsButton } from "@/app/(app)/[emailAccountId]/stats/LoadStatsButton";
import { cx } from "class-variance-authority";

interface ActionBarProps {
  dateRange?: DateRange | undefined;
  setDateRange: (dateRange?: DateRange) => void;
  period?: "day" | "week" | "month" | "year";
  setPeriod?: (value: "day" | "week" | "month" | "year") => void;
  isMobile: boolean;
  className?: string;
  datePickerRightContent?: React.ReactNode;
}

export function ActionBar({
  dateRange,
  setDateRange,
  period,
  setPeriod,
  className,
  datePickerRightContent,
}: ActionBarProps) {
  return (
    <div
      className={cx(
        "flex items-center justify-between w-full gap-3",
        className,
      )}
    >
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
        <DatePickerWithRange
          dateRange={dateRange}
          onSetDateRange={setDateRange}
          rightContent={datePickerRightContent}
        />
      </div>
      <LoadStatsButton />
    </div>
  );
}
