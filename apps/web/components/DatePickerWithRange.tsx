"use client";

import type * as React from "react";
import format from "date-fns/format";
import { CalendarIcon, ChevronDown } from "lucide-react";
import type { DateRange } from "react-day-picker";
import { cn } from "@/utils";
import { Button } from "@/components/ui/button";
import { Calendar } from "@/components/ui/calendar";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { List } from "@/components/List";
import { differenceInDays, subDays } from "date-fns";
import { useMemo } from "react";

function getRelativeDateLabel(days: number) {
  if (days === 1) return "Last day";
  if (days === 7) return "Last week";
  if (days === 30) return "Last month";
  if (days === 90) return "Last 3 months";
  if (days === 365) return "Last year";
  return "All";
}

interface DatePickerWithRangeProps
  extends React.HTMLAttributes<HTMLDivElement> {
  dateRange?: DateRange;
  onSetDateRange: (dateRange?: DateRange) => void;
  selectOptions: { label: string; value: string }[];
  dateDropdown: string;
  onSetDateDropdown: (option: { label: string; value: string }) => void;
}

export function DatePickerWithRange({
  dateRange,
  onSetDateRange,
  selectOptions,
  dateDropdown,
  onSetDateDropdown,
}: DatePickerWithRangeProps) {
  const now = useMemo(() => new Date(), []);
  const days =
    dateRange?.from && dateRange?.to
      ? differenceInDays(dateRange.to, dateRange.from)
      : 0;
  const relativeDateLabel = getRelativeDateLabel(days);

  return (
    <Popover modal={true}>
      <PopoverTrigger asChild>
        <Button
          id="date"
          variant="outline"
          className={cn(
            "px-3 justify-between whitespace-nowrap text-left font-normal min-w-52",
            !dateRange && "text-muted-foreground",
          )}
        >
          <div className="flex items-center">
            <CalendarIcon className="mr-2 hidden h-4 w-4 sm:block" />
            {relativeDateLabel ||
              (dateRange?.from ? (
                dateRange.to ? (
                  <>
                    {format(dateRange.from, "LLL dd, y")} -{" "}
                    {format(dateRange.to, "LLL dd, y")}
                  </>
                ) : (
                  format(dateRange.from, "LLL dd, y")
                )
              ) : (
                <span>Pick a date</span>
              ))}
          </div>
          <ChevronDown className="ml-2 h-4 w-4 text-gray-400" />
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-auto p-0">
        <Calendar
          initialFocus
          mode="range"
          defaultMonth={dateRange?.from}
          selected={dateRange}
          onSelect={onSetDateRange}
          numberOfMonths={2}
          rightContent={
            <List
              value={
                selectOptions.find((option) => option.label === dateDropdown)
                  ?.value
              }
              items={selectOptions}
              className="min-w-32"
              onSelect={({ label, value }) => {
                onSetDateDropdown({ label, value });
                // When "All" is selected (value "0"), pass undefined to skip date filtering
                if (value === "0") {
                  onSetDateRange(undefined);
                } else {
                  onSetDateRange({
                    from: subDays(now, Number.parseInt(value)),
                    to: now,
                  });
                }
              }}
            />
          }
        />
      </PopoverContent>
    </Popover>
  );
}
