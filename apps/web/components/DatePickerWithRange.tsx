"use client";

import type * as React from "react";
import { format } from "date-fns/format";
import type { MessageDescriptor } from "@lingui/core";
import { msg } from "@lingui/core/macro";
import { Trans, useLingui } from "@lingui/react/macro";
import { CalendarIcon, ChevronDown } from "lucide-react";
import type { DateRange } from "react-day-picker";
import { cn } from "@/utils";
import { getDateFnsLocale } from "@/utils/i18n/date-fns-locale";
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
import { useIsMobile } from "@/hooks/use-mobile";

function getRelativeDateLabel(days: number) {
  if (days === 1) return "Last day";
  if (days === 7) return "Last week";
  if (days === 30) return "Last month";
  if (days === 90) return "Last 3 months";
  if (days === 365) return "Last year";
  return "All";
}

// Option labels stay English because callers store and report them; these are
// their display translations.
const dateLabelMessages: Record<string, MessageDescriptor> = {
  "Last day": msg`Last day`,
  "Last week": msg`Last week`,
  "Last month": msg`Last month`,
  "Last 3 months": msg`Last 3 months`,
  "Last year": msg`Last year`,
  All: msg`All`,
  "All time": msg`All time`,
};

interface DatePickerWithRangeProps
  extends React.HTMLAttributes<HTMLDivElement> {
  dateDropdown: string;
  dateRange?: DateRange;
  onSetDateDropdown: (option: { label: string; value: string }) => void;
  onSetDateRange: (dateRange?: DateRange) => void;
  selectOptions: { label: string; value: string }[];
}

export function DatePickerWithRange({
  dateRange,
  onSetDateRange,
  selectOptions,
  dateDropdown,
  onSetDateDropdown,
  className,
}: DatePickerWithRangeProps) {
  const { i18n } = useLingui();
  const dateFnsLocale = getDateFnsLocale(i18n.locale);
  const now = useMemo(() => new Date(), []);
  const isMobile = useIsMobile();
  const days =
    dateRange?.from && dateRange?.to
      ? differenceInDays(dateRange.to, dateRange.from)
      : 0;
  const getDisplayLabel = (label: string) => {
    const message = dateLabelMessages[label];
    return message ? i18n._(message) : label;
  };
  const relativeDateLabel = getDisplayLabel(getRelativeDateLabel(days));

  return (
    <Popover modal={true}>
      <PopoverTrigger asChild>
        <Button
          id="date"
          variant="outline"
          className={cn(
            "px-3 justify-between whitespace-nowrap text-left font-normal min-w-52",
            !dateRange && "text-muted-foreground",
            className,
          )}
        >
          <div className="flex items-center">
            <CalendarIcon className="mr-2 hidden h-4 w-4 sm:block" />
            {relativeDateLabel ||
              (dateRange?.from ? (
                dateRange.to ? (
                  <>
                    {format(dateRange.from, "LLL dd, y", {
                      locale: dateFnsLocale,
                    })}{" "}
                    -{" "}
                    {format(dateRange.to, "LLL dd, y", {
                      locale: dateFnsLocale,
                    })}
                  </>
                ) : (
                  format(dateRange.from, "LLL dd, y", { locale: dateFnsLocale })
                )
              ) : (
                <span>
                  <Trans>Pick a date</Trans>
                </span>
              ))}
          </div>
          <ChevronDown className="ml-2 h-4 w-4 text-gray-400" />
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-auto max-h-[var(--radix-popover-content-available-height)] overflow-y-auto p-0">
        <Calendar
          locale={dateFnsLocale}
          initialFocus
          mode="range"
          defaultMonth={dateRange?.from}
          selected={dateRange}
          onSelect={onSetDateRange}
          numberOfMonths={isMobile ? 1 : 2}
          rightContent={
            <List
              value={
                selectOptions.find((option) => option.label === dateDropdown)
                  ?.value
              }
              items={selectOptions.map((option) => ({
                value: option.value,
                label: getDisplayLabel(option.label),
              }))}
              className="min-w-32"
              onSelect={({ value }) => {
                const option = selectOptions.find(
                  (selectOption) => selectOption.value === value,
                );
                if (!option) return;
                onSetDateDropdown(option);
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
