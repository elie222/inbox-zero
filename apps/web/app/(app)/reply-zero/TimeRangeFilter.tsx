"use client";

import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import type { TimeRange } from "./date-filter";

const timeRangeOptions = [
  { value: "all", label: "All" },
  { value: "3d", label: "3+ days old" },
  { value: "1w", label: "1+ week old" },
  { value: "2w", label: "2+ weeks old" },
  { value: "1m", label: "1+ month old" },
] as const;

export function TimeRangeFilter() {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const timeRange = (searchParams.get("timeRange") as TimeRange) || "all";

  // nuqs would have been cleaner, but didn't seem to work for some reason
  const createQueryString = (value: TimeRange) => {
    const params = new URLSearchParams(searchParams);
    params.set("timeRange", value);
    params.delete("page");
    return params.toString();
  };

  return (
    <Select
      value={timeRange}
      onValueChange={(value: TimeRange) => {
        router.push(`${pathname}?${createQueryString(value)}`);
      }}
    >
      <SelectTrigger className="w-[180px]">
        <SelectValue placeholder="Select time range" />
      </SelectTrigger>
      <SelectContent>
        {timeRangeOptions.map((option) => (
          <SelectItem key={option.value} value={option.value}>
            {option.label}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}
