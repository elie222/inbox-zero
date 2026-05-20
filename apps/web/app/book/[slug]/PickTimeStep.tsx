"use client";

import { useMemo, useState } from "react";
import { Calendar } from "@/components/ui/calendar";
import { cn } from "@/utils";
import {
  dateKeyToLocalDate,
  detectDefaultHourFormat,
  formatDateKey,
  formatSelectedDateHeading,
  formatShortWeekdayName,
  formatSlotTime,
  groupSlotsByDay,
  isBeforeToday,
  type HourFormat,
  type Slot,
} from "./booking-helpers";
import { HourFormatToggle } from "./BookingSidebar";

export function PickTimeStep({
  timezone,
  visibleMonth,
  onMonthChange,
  selectedDateKey,
  onSelectDate,
  slotsByDay,
  slotsForDay,
  loading,
  error,
  onPickSlot,
  sidebar,
}: {
  timezone: string;
  visibleMonth: Date;
  onMonthChange: (month: Date) => void;
  selectedDateKey: string | null;
  onSelectDate: (key: string) => void;
  slotsByDay: Map<string, Slot[]>;
  slotsForDay: Slot[];
  loading: boolean;
  error: string | null;
  onPickSlot: (slot: Slot) => void;
  sidebar: React.ReactNode;
}) {
  const [hourFormat, setHourFormat] = useState<HourFormat>(() =>
    detectDefaultHourFormat(),
  );
  return (
    <div className="grid min-w-0 grid-cols-1 overflow-hidden md:grid-cols-[260px_minmax(0,1fr)_240px]">
      {sidebar}
      <div className="min-w-0 border-t p-4 sm:p-6 md:border-l md:border-t-0 md:p-7">
        <BookingCalendar
          visibleMonth={visibleMonth}
          onMonthChange={onMonthChange}
          selectedDateKey={selectedDateKey}
          onSelectDate={onSelectDate}
          slotsByDay={slotsByDay}
          timezone={timezone}
        />
      </div>
      <div className="min-w-0 border-t bg-muted/30 md:relative md:border-l md:border-t-0">
        <div className="flex flex-col p-4 sm:p-6 md:absolute md:inset-0 md:p-7">
          <div className="mb-3 flex shrink-0 flex-wrap items-center justify-between gap-2">
            <div className="min-w-0 text-sm font-semibold text-foreground">
              {selectedDateKey
                ? formatSelectedDateHeading(selectedDateKey)
                : "Pick a date"}
            </div>
            <HourFormatToggle value={hourFormat} onChange={setHourFormat} />
          </div>
          {loading ? (
            <SlotSkeleton />
          ) : error ? (
            <p className="text-sm text-red-500">{error}</p>
          ) : slotsForDay.length === 0 ? (
            <p className="text-sm text-muted-foreground">
              No slots available on this day.
            </p>
          ) : (
            <div className="flex max-h-[min(50vh,22rem)] flex-col gap-1.5 overflow-y-auto pr-1 md:max-h-none md:min-h-0 md:flex-1">
              {slotsForDay.map((slot) => (
                <button
                  key={slot.startTime}
                  type="button"
                  onClick={() => onPickSlot(slot)}
                  className="rounded-lg border border-input bg-background px-3 py-2.5 text-sm font-medium tabular-nums text-foreground transition-colors hover:border-blue-600 hover:text-blue-700"
                >
                  {formatSlotTime(slot.startTime, timezone, hourFormat)}
                </button>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

function BookingCalendar({
  visibleMonth,
  onMonthChange,
  selectedDateKey,
  onSelectDate,
  slotsByDay,
  timezone,
}: {
  visibleMonth: Date;
  onMonthChange: (month: Date) => void;
  selectedDateKey: string | null;
  onSelectDate: (key: string) => void;
  slotsByDay: Map<string, Slot[]>;
  timezone: string;
}) {
  const todayKey = formatDateKey(new Date(), timezone);
  const selectedDate = selectedDateKey
    ? dateKeyToLocalDate(selectedDateKey)
    : undefined;

  const isUnavailable = (date: Date) => {
    const key = formatDateKey(date, timezone);
    return isBeforeToday(date, todayKey, timezone) || !slotsByDay.has(key);
  };

  return (
    <Calendar
      mode="single"
      weekStartsOn={1}
      month={visibleMonth}
      onMonthChange={onMonthChange}
      selected={selectedDate}
      onSelect={(date) => {
        if (!date || isUnavailable(date)) return;
        onSelectDate(formatDateKey(date, timezone));
      }}
      disabled={isUnavailable}
      showOutsideDays={false}
      formatters={{ formatWeekdayName: formatShortWeekdayName }}
      modifiers={{
        available: (date) => !isUnavailable(date),
      }}
      modifiersClassNames={{
        available:
          "bg-blue-50 font-semibold text-blue-700 hover:bg-blue-100 dark:bg-blue-950 dark:text-blue-300",
      }}
      className="mx-auto w-fit max-w-full"
      classNames={{
        month: "space-y-4",
        table: "w-full border-collapse space-y-1",
        head_row: "flex gap-0.5 sm:gap-1 md:gap-1.5",
        head_cell:
          "w-9 text-muted-foreground font-normal text-[0.6rem] uppercase tracking-wider sm:w-10 sm:text-[0.65rem] md:w-14 md:text-[0.7rem]",
        row: "flex w-full mt-1 gap-0.5 sm:mt-1.5 sm:gap-1 md:gap-1.5",
        cell: "size-9 p-0 text-center text-xs sm:size-10 sm:text-sm md:size-14",
        day: cn(
          "size-9 rounded-lg p-0 text-xs font-normal tabular-nums aria-selected:opacity-100 sm:size-10 sm:text-sm md:size-14",
        ),
        day_selected:
          "bg-blue-600 text-white hover:bg-blue-600 hover:text-white focus:bg-blue-600 focus:text-white",
        day_today: "ring-1 ring-blue-200",
        day_disabled:
          "pointer-events-none cursor-not-allowed text-muted-foreground opacity-40 hover:bg-transparent hover:text-muted-foreground",
      }}
    />
  );
}

function SlotSkeleton() {
  return (
    <div className="flex flex-col gap-1.5">
      {Array.from({ length: 5 }).map((_, index) => (
        <div key={index} className="h-9 animate-pulse rounded-lg bg-muted" />
      ))}
    </div>
  );
}

export function useSlotSelection({
  data,
  loadingSlots,
  timezone,
  selectedSlot,
}: {
  data: { slots: Slot[] } | undefined;
  loadingSlots: boolean;
  timezone: string;
  selectedSlot: Slot | null;
}) {
  const slotsByDay = useMemo(
    () => groupSlotsByDay(data?.slots ?? [], timezone),
    [data?.slots, timezone],
  );

  const firstAvailableDateKey = useMemo(() => {
    let earliest: string | null = null;
    for (const key of slotsByDay.keys()) {
      if (earliest === null || key < earliest) earliest = key;
    }
    return earliest;
  }, [slotsByDay]);

  const [selectedDateKey, setSelectedDateKey] = useState<string | null>(() =>
    formatDateKey(
      selectedSlot ? new Date(selectedSlot.startTime) : new Date(),
      timezone,
    ),
  );

  const displayedSelectedDateKey = useMemo(() => {
    if (loadingSlots) return selectedDateKey;
    if (selectedDateKey && slotsByDay.has(selectedDateKey)) {
      return selectedDateKey;
    }
    return firstAvailableDateKey;
  }, [loadingSlots, selectedDateKey, slotsByDay, firstAvailableDateKey]);

  const slotsForDay = useMemo(
    () =>
      displayedSelectedDateKey
        ? (slotsByDay.get(displayedSelectedDateKey) ?? [])
        : [],
    [displayedSelectedDateKey, slotsByDay],
  );

  return {
    slotsByDay,
    selectedDateKey: displayedSelectedDateKey,
    setSelectedDateKey,
    slotsForDay,
  };
}
