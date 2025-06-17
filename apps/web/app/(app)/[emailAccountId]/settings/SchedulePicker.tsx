import React, { useState } from "react";
import {
  Select,
  SelectItem,
  SelectContent,
  SelectTrigger,
} from "@/components/ui/select";
import { Label } from "@/components/ui/label";
import { FormItem } from "@/components/ui/form";

const frequencies = [
  { value: "daily", label: "Day" },
  { value: "weekly", label: "Week" },
  { value: "biweekly", label: "Two weeks" },
  { value: "monthly", label: "Month" },
];
const daysOfWeek = [
  { value: "0", label: "Sunday" },
  { value: "1", label: "Monday" },
  { value: "2", label: "Tuesday" },
  { value: "3", label: "Wednesday" },
  { value: "4", label: "Thursday" },
  { value: "5", label: "Friday" },
  { value: "6", label: "Saturday" },
];
const hours = Array.from({ length: 12 }, (_, i) => ({
  value: (i + 1).toString().padStart(2, "0"),
  label: (i + 1).toString(),
}));
const minutes = ["00", "15", "30", "45"].map((m) => ({
  value: m,
  label: m,
}));
const ampmOptions = [
  { value: "AM", label: "AM" },
  { value: "PM", label: "PM" },
];

export type SchedulePickerFormValues = {
  schedule: string;
  dayOfWeek: string;
  hour: string;
  minute: string;
  ampm: "AM" | "PM";
};

export function getInitialScheduleProps(digestSchedule?: {
  intervalDays?: number | null;
  daysOfWeek?: number | null;
  timeOfDay?: string | Date | null;
}): SchedulePickerFormValues {
  const initialSchedule = (() => {
    if (!digestSchedule) return "daily";
    switch (digestSchedule.intervalDays) {
      case 1:
        return "daily";
      case 7:
        return "weekly";
      case 14:
        return "biweekly";
      case 30:
        return "monthly";
      default:
        return "daily";
    }
  })();
  const initialDayOfWeek = (() => {
    if (!digestSchedule || digestSchedule.daysOfWeek == null) return "1";
    for (let i = 0; i < 7; i++) {
      if ((digestSchedule.daysOfWeek & (1 << (6 - i))) !== 0)
        return i.toString();
    }
    return "1";
  })();
  const initialTimeOfDay = digestSchedule?.timeOfDay
    ? (() => {
        const date = new Date(digestSchedule.timeOfDay);
        const hours = date.getHours().toString().padStart(2, "0");
        const minutes = date.getMinutes().toString().padStart(2, "0");
        return `${hours}:${minutes}`;
      })()
    : "09:00";
  const [initHour24, initMinute] = initialTimeOfDay.split(":");
  const hour12 = (Number.parseInt(initHour24, 10) % 12 || 12)
    .toString()
    .padStart(2, "0");
  const ampm = (Number.parseInt(initHour24, 10) < 12 ? "AM" : "PM") as
    | "AM"
    | "PM";
  return {
    schedule: initialSchedule,
    dayOfWeek: initialDayOfWeek,
    hour: hour12,
    minute: initMinute || "00",
    ampm,
  };
}

export function mapToSchedule({
  schedule,
  dayOfWeek,
  hour,
  minute,
  ampm,
}: SchedulePickerFormValues) {
  let intervalDays: number;
  switch (schedule) {
    case "daily":
      intervalDays = 1;
      break;
    case "weekly":
      intervalDays = 7;
      break;
    case "biweekly":
      intervalDays = 14;
      break;
    case "monthly":
      intervalDays = 30;
      break;
    default:
      intervalDays = 1;
  }
  let hour24 = Number.parseInt(hour, 10) % 12;
  if (ampm === "PM") hour24 += 12;
  if (ampm === "AM" && hour24 === 12) hour24 = 0;

  // Create a date object in the user's local timezone
  const today = new Date();
  const timeOfDay = new Date(
    today.getFullYear(),
    today.getMonth(),
    today.getDate(),
    hour24,
    Number.parseInt(minute, 10),
  );

  return {
    intervalDays,
    occurrences: 1,
    daysOfWeek: 1 << (6 - Number.parseInt(dayOfWeek, 10)),
    timeOfDay,
  };
}

export function SchedulePicker({
  defaultValue,
  onChange,
  hideDayOfWeekIfDaily = true,
  disabled = false,
}: {
  defaultValue?: SchedulePickerFormValues;
  onChange?: (backendValue: ReturnType<typeof mapToSchedule>) => void;
  hideDayOfWeekIfDaily?: boolean;
  disabled?: boolean;
}) {
  const [value, setValue] = useState<SchedulePickerFormValues>(
    defaultValue || {
      schedule: "daily",
      dayOfWeek: "1",
      hour: "11",
      minute: "00",
      ampm: "AM",
    },
  );

  const handleFieldChange = (
    field: keyof SchedulePickerFormValues,
    fieldValue: string,
  ) => {
    const newValue = { ...value, [field]: fieldValue };
    setValue(newValue);
    onChange?.(mapToSchedule(newValue));
  };

  return (
    <div className="flex flex-col gap-4">
      <FormItem>
        <Label htmlFor="frequency-select">Every</Label>
        <Select
          value={value.schedule}
          onValueChange={(val) => handleFieldChange("schedule", val)}
          disabled={disabled}
        >
          <SelectTrigger id="frequency-select">
            {value.schedule
              ? frequencies.find((f) => f.value === value.schedule)?.label
              : "Select..."}
          </SelectTrigger>
          <SelectContent>
            {frequencies.map((f) => (
              <SelectItem key={f.value} value={f.value}>
                {f.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </FormItem>
      {(!hideDayOfWeekIfDaily || value.schedule !== "daily") && (
        <FormItem>
          <Label htmlFor="dayofweek-select">
            {value.schedule === "monthly" || value.schedule === "biweekly"
              ? "on the first"
              : "on"}
          </Label>
          <Select
            value={value.dayOfWeek}
            onValueChange={(val) => handleFieldChange("dayOfWeek", val)}
            disabled={disabled}
          >
            <SelectTrigger id="dayofweek-select">
              {value.dayOfWeek
                ? daysOfWeek.find((d) => d.value === value.dayOfWeek)?.label
                : "Select..."}
            </SelectTrigger>
            <SelectContent>
              {daysOfWeek.map((d) => (
                <SelectItem key={d.value} value={d.value}>
                  {d.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </FormItem>
      )}
      <div className="space-y-2">
        <Label>at</Label>
        <div className="flex items-end gap-2">
          <FormItem>
            <Select
              value={value.hour}
              onValueChange={(val) => handleFieldChange("hour", val)}
              disabled={disabled}
            >
              <SelectTrigger id="hour-select">{value.hour}</SelectTrigger>
              <SelectContent>
                {hours.map((h) => (
                  <SelectItem key={h.value} value={h.value}>
                    {h.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </FormItem>
          <span className="pb-2">:</span>
          <FormItem>
            <Select
              value={value.minute}
              onValueChange={(val) => handleFieldChange("minute", val)}
              disabled={disabled}
            >
              <SelectTrigger id="minute-select">{value.minute}</SelectTrigger>
              <SelectContent>
                {minutes.map((m) => (
                  <SelectItem key={m.value} value={m.value}>
                    {m.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </FormItem>
          <FormItem>
            <Select
              value={value.ampm}
              onValueChange={(val) =>
                handleFieldChange("ampm", val as "AM" | "PM")
              }
              disabled={disabled}
            >
              <SelectTrigger id="ampm-select">{value.ampm}</SelectTrigger>
              <SelectContent>
                {ampmOptions.map((a) => (
                  <SelectItem key={a.value} value={a.value}>
                    {a.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </FormItem>
        </div>
      </div>
    </div>
  );
}
