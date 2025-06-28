"use client";

import type * as React from "react";
import format from "date-fns/format";
import { CalendarIcon } from "lucide-react";
import type { DateRange } from "react-day-picker";

import { cn } from "@/utils";
import { Button } from "@/components/ui/button";
import { Calendar } from "@/components/ui/calendar";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";

export function DatePickerWithRange({
  dateRange,
  onSetDateRange,
}: React.HTMLAttributes<HTMLDivElement> & {
  dateRange?: DateRange;
  onSetDateRange: (dateRange?: DateRange) => void;
}) {
  return (
    <Popover modal={true}>
      <PopoverTrigger asChild>
        <Button
          id="date"
          variant="outline"
          className={cn(
            "justify-start whitespace-nowrap text-left font-normal",
            !dateRange && "text-muted-foreground",
          )}
        >
          <CalendarIcon className="mr-2 hidden h-4 w-4 sm:block" />
          {dateRange?.from ? (
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
          )}
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-auto p-0" align="start">
        <Calendar
          initialFocus
          mode="range"
          defaultMonth={dateRange?.from}
          selected={dateRange}
          onSelect={onSetDateRange}
          numberOfMonths={2}
        />
      </PopoverContent>
    </Popover>
  );
}
