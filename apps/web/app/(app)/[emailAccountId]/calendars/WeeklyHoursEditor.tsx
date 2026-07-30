"use client";

import { useState } from "react";
import { Copy, Plus, X } from "lucide-react";
import { Switch } from "@/components/ui/switch";
import { cn } from "@/utils";
import {
  type AvailabilityWindowInput,
  type DayState,
  type Range,
  buildDayState,
  DAY_LABELS,
  nextRangeAfter,
} from "./availability-schedule";

export function useWeeklyHours(initialWindows: AvailabilityWindowInput[]) {
  const [days, setDays] = useState<DayState[]>(() =>
    buildDayState(initialWindows),
  );

  const updateDay = (index: number, next: Partial<DayState>) => {
    setDays((prev) =>
      prev.map((day, dayIndex) =>
        dayIndex === index ? { ...day, ...next } : day,
      ),
    );
  };

  const addRange = (dayIndex: number) => {
    setDays((prev) =>
      prev.map((day, index) =>
        index === dayIndex
          ? {
              ...day,
              ranges: [
                ...day.ranges,
                nextRangeAfter(day.ranges[day.ranges.length - 1]),
              ],
            }
          : day,
      ),
    );
  };

  const removeRange = (dayIndex: number, rangeIndex: number) => {
    setDays((prev) =>
      prev.map((day, index) =>
        index === dayIndex
          ? {
              ...day,
              ranges: day.ranges.filter((_, i) => i !== rangeIndex),
            }
          : day,
      ),
    );
  };

  const updateRange = (
    dayIndex: number,
    rangeIndex: number,
    next: Partial<Range>,
  ) => {
    setDays((prev) =>
      prev.map((day, index) =>
        index === dayIndex
          ? {
              ...day,
              ranges: day.ranges.map((range, i) =>
                i === rangeIndex ? { ...range, ...next } : range,
              ),
            }
          : day,
      ),
    );
  };

  const copyDayToOthers = (dayIndex: number) => {
    const source = days[dayIndex];
    setDays((prev) =>
      prev.map((day, index) =>
        index === dayIndex
          ? day
          : {
              enabled: source.enabled,
              ranges: source.ranges.map((range) => ({ ...range })),
            },
      ),
    );
  };

  return {
    days,
    updateDay,
    addRange,
    removeRange,
    updateRange,
    copyDayToOthers,
  };
}

export type WeeklyHoursController = ReturnType<typeof useWeeklyHours>;

export function WeeklyHoursEditor({
  controller,
}: {
  controller: WeeklyHoursController;
}) {
  const {
    days,
    updateDay,
    addRange,
    removeRange,
    updateRange,
    copyDayToOthers,
  } = controller;

  return (
    <div className="space-y-4">
      <div className="rounded-lg border bg-card">
        {DAY_LABELS.map((dayLabel, dayIndex) => {
          const day = days[dayIndex];
          return (
            // A label column beside two time inputs and buttons needs ~470px;
            // on phones the day label stacks above its ranges instead
            <div
              key={dayLabel}
              className="flex flex-col gap-2 border-b px-4 py-3 last:border-b-0 sm:flex-row sm:items-start sm:gap-4"
            >
              <div className="flex w-32 items-center gap-2.5 pt-1.5">
                <Switch
                  checked={day.enabled}
                  size="sm"
                  onCheckedChange={(next) =>
                    updateDay(dayIndex, {
                      enabled: next,
                      ranges:
                        next && day.ranges.length === 0
                          ? [{ start: "09:00", end: "17:00" }]
                          : day.ranges,
                    })
                  }
                  aria-label={`Toggle ${dayLabel}`}
                />
                <span
                  className={cn(
                    "text-sm",
                    day.enabled
                      ? "font-medium text-foreground"
                      : "text-muted-foreground",
                  )}
                >
                  {dayLabel}
                </span>
              </div>
              <div className="flex flex-1 flex-col gap-2">
                {day.enabled ? (
                  day.ranges.map((range, rangeIndex) => (
                    <div
                      key={rangeIndex}
                      className="flex flex-wrap items-center gap-2"
                    >
                      <TimeField
                        value={range.start}
                        onChange={(value) =>
                          updateRange(dayIndex, rangeIndex, { start: value })
                        }
                      />
                      <span className="text-sm text-muted-foreground">–</span>
                      <TimeField
                        value={range.end}
                        onChange={(value) =>
                          updateRange(dayIndex, rangeIndex, { end: value })
                        }
                      />
                      {rangeIndex === 0 ? (
                        <>
                          <IconButton
                            title="Add another range"
                            onClick={() => addRange(dayIndex)}
                          >
                            <Plus className="size-4" />
                          </IconButton>
                          <IconButton
                            title="Copy to other days"
                            onClick={() => copyDayToOthers(dayIndex)}
                          >
                            <Copy className="size-3.5" />
                          </IconButton>
                        </>
                      ) : (
                        <IconButton
                          title="Remove range"
                          onClick={() => removeRange(dayIndex, rangeIndex)}
                        >
                          <X className="size-3.5" />
                        </IconButton>
                      )}
                    </div>
                  ))
                ) : (
                  <div className="flex h-8 items-center text-sm text-muted-foreground">
                    Unavailable
                  </div>
                )}
              </div>
            </div>
          );
        })}
      </div>

      <p className="text-xs text-muted-foreground">
        We hide times where you already have events on your connected calendar.
      </p>
    </div>
  );
}

function TimeField({
  value,
  onChange,
}: {
  value: string;
  onChange: (value: string) => void;
}) {
  return (
    <input
      type="time"
      value={value}
      onChange={(event) => onChange(event.target.value)}
      className="min-w-0 flex-1 rounded-md border border-input bg-background px-2.5 py-1.5 text-center text-sm tabular-nums focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring sm:w-[110px] sm:flex-none"
    />
  );
}

function IconButton({
  title,
  onClick,
  children,
}: {
  title: string;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      title={title}
      aria-label={title}
      onClick={onClick}
      // The visual stays a small glyph; the hit area is finger-sized
      className="flex size-9 items-center justify-center rounded-md text-muted-foreground hover:bg-muted hover:text-foreground"
    >
      {children}
    </button>
  );
}
