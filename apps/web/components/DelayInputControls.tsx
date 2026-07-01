"use client";

import { Input } from "@/components/Input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

export function DelayInputControls({
  value,
  onChange,
  name = "delay",
}: {
  value: number | null | undefined;
  onChange: (minutes: number | null) => void;
  name?: string;
}) {
  const { value: displayValue, unit } = getDisplayValueAndUnit(value);

  const handleValueChange = (newValue: string, currentUnit: string) => {
    onChange(convertToMinutes(newValue, currentUnit));
  };

  const handleUnitChange = (newUnit: string) => {
    if (displayValue) {
      onChange(convertToMinutes(displayValue, newUnit));
    }
  };

  return (
    <div className="flex items-center space-x-2">
      <Input
        name={name}
        type="text"
        placeholder="0"
        className="w-20"
        registerProps={{
          value: displayValue,
          onChange: (e: React.ChangeEvent<HTMLInputElement>) => {
            const nextValue = e.target.value.replace(/[^0-9]/g, "");
            handleValueChange(nextValue, unit);
          },
        }}
      />
      <Select value={unit} onValueChange={handleUnitChange}>
        <SelectTrigger className="w-24">
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="minutes">
            {value === 1 ? "Minute" : "Minutes"}
          </SelectItem>
          <SelectItem value="hours">
            {value === 60 ? "Hour" : "Hours"}
          </SelectItem>
          <SelectItem value="days">
            {value === 1440 ? "Day" : "Days"}
          </SelectItem>
        </SelectContent>
      </Select>
    </div>
  );
}

// minutes to user-friendly UI format
function getDisplayValueAndUnit(minutes: number | null | undefined) {
  if (minutes === null || minutes === undefined)
    return { value: "", unit: "hours" };
  if (minutes === -1 || minutes <= 0) return { value: "", unit: "hours" };

  if (minutes >= 1440 && minutes % 1440 === 0) {
    return { value: (minutes / 1440).toString(), unit: "days" };
  } else if (minutes >= 60 && minutes % 60 === 0) {
    return { value: (minutes / 60).toString(), unit: "hours" };
  } else {
    return { value: minutes.toString(), unit: "minutes" };
  }
}

// user-friendly UI format to minutes
function convertToMinutes(value: string, unit: string) {
  const numValue = Number.parseInt(value, 10);
  if (Number.isNaN(numValue) || numValue <= 0) return -1;

  switch (unit) {
    case "minutes":
      return numValue;
    case "hours":
      return numValue * 60;
    case "days":
      return numValue * 1440;
    default:
      return numValue;
  }
}
