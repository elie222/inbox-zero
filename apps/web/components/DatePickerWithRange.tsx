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

export function DatePickerWithRange({
  dateRange,
  onSetDateRange,
  rightContent,
  label,
}: React.HTMLAttributes<HTMLDivElement> & {
  dateRange?: DateRange;
  onSetDateRange: (dateRange?: DateRange) => void;
  rightContent?: React.ReactNode;
  label?: string;
}) {
  return (
    <Popover modal={true}>
      <PopoverTrigger asChild>
        <Button
          id="date"
          variant="outline"
          className={cn(
            "justify-between whitespace-nowrap text-left font-normal min-w-52",
            !dateRange && "text-muted-foreground",
          )}
        >
          <div className="flex items-center">
            <CalendarIcon className="mr-2 hidden h-4 w-4 sm:block" />
            {label ||
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
          rightContent={rightContent}
        />
      </PopoverContent>
    </Popover>
  );
}
