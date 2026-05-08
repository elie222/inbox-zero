"use client";

import { useCallback, useEffect, useMemo } from "react";
import { useForm, type SubmitHandler } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import type { z } from "zod";
import { Button } from "@/components/ui/button";
import { toastSuccess } from "@/components/Toast";
import { LoadingContent } from "@/components/LoadingContent";
import { SettingCard } from "@/components/SettingCard";
import { Skeleton } from "@/components/ui/skeleton";
import { useCalendars } from "@/hooks/useCalendars";
import { useAccount } from "@/providers/EmailAccountProvider";
import { useAction } from "next-safe-action/hooks";
import { updateEmailAccountTimezoneAction } from "@/utils/actions/calendar";
import { updateTimezoneBody } from "@/utils/actions/calendar.validation";
import { Select } from "@/components/Select";
import { useProductAnalytics } from "@/hooks/useProductAnalytics";

const BASE_TIMEZONES = [
  { label: "Samoa (GMT-11)", value: "Pacific/Samoa" },
  { label: "Hawaii (GMT-10)", value: "Pacific/Honolulu" },
  { label: "Alaska (GMT-9)", value: "America/Anchorage" },
  { label: "Pacific Time (GMT-8)", value: "America/Los_Angeles" },
  { label: "Mountain Time (GMT-7)", value: "America/Denver" },
  { label: "Central Time (GMT-6)", value: "America/Chicago" },
  { label: "Eastern Time (GMT-5)", value: "America/New_York" },
  { label: "Caracas (GMT-4)", value: "America/Caracas" },
  { label: "Buenos Aires (GMT-3)", value: "America/Argentina/Buenos_Aires" },
  { label: "UTC", value: "UTC" },
  { label: "London (GMT+0)", value: "Europe/London" },
  { label: "Paris (GMT+1)", value: "Europe/Paris" },
  { label: "Berlin (GMT+1)", value: "Europe/Berlin" },
  { label: "Athens (GMT+2)", value: "Europe/Athens" },
  { label: "Jerusalem (GMT+2)", value: "Asia/Jerusalem" },
  { label: "Istanbul (GMT+3)", value: "Europe/Istanbul" },
  { label: "Moscow (GMT+3)", value: "Europe/Moscow" },
  { label: "Dubai (GMT+4)", value: "Asia/Dubai" },
  { label: "Karachi (GMT+5)", value: "Asia/Karachi" },
  { label: "Mumbai (GMT+5:30)", value: "Asia/Kolkata" },
  { label: "Dhaka (GMT+6)", value: "Asia/Dhaka" },
  { label: "Bangkok (GMT+7)", value: "Asia/Bangkok" },
  { label: "Singapore (GMT+8)", value: "Asia/Singapore" },
  { label: "Hong Kong (GMT+8)", value: "Asia/Hong_Kong" },
  { label: "Tokyo (GMT+9)", value: "Asia/Tokyo" },
  { label: "Sydney (GMT+10)", value: "Australia/Sydney" },
  { label: "Noumea (GMT+11)", value: "Pacific/Noumea" },
  { label: "Auckland (GMT+12)", value: "Pacific/Auckland" },
];

export function CalendarSettings() {
  const { emailAccountId } = useAccount();
  const analytics = useProductAnalytics("calendars");
  const { data, isLoading, error, mutate } = useCalendars();
  const timezone = data?.timezone || null;

  const timezoneOptions = useMemo(() => {
    const detectedTz = Intl.DateTimeFormat().resolvedOptions().timeZone;
    const offset = -new Date().getTimezoneOffset() / 60;
    const offsetStr = offset >= 0 ? `+${offset}` : `${offset}`;
    const autoDetectOption = {
      label: `🌍 Current timezone (${detectedTz} GMT${offsetStr})`,
      value: "auto-detect",
    };

    const utcIndex = BASE_TIMEZONES.findIndex((tz) => tz.value === "UTC");
    const options = [...BASE_TIMEZONES];
    options.splice(utcIndex + 1, 0, autoDetectOption);

    if (timezone && !options.some((tz) => tz.value === timezone)) {
      options.push({ label: timezone, value: timezone });
    }

    return options;
  }, [timezone]);

  const { execute: executeUpdateTimezone, isExecuting: isUpdatingTimezone } =
    useAction(updateEmailAccountTimezoneAction.bind(null, emailAccountId), {
      onSuccess: () => {
        analytics.captureAction("calendar_timezone_saved", {
          had_existing_timezone: Boolean(timezone),
        });
        toastSuccess({ description: "Timezone updated!" });
        mutate();
      },
    });

  const {
    register: registerTimezone,
    handleSubmit: handleSubmitTimezone,
    reset: resetTimezone,
    formState: { errors: timezoneErrors },
  } = useForm<z.infer<typeof updateTimezoneBody>>({
    resolver: zodResolver(updateTimezoneBody),
    defaultValues: {
      timezone: timezone || "UTC",
    },
  });

  useEffect(() => {
    if (timezone !== null) {
      resetTimezone({ timezone: timezone || "UTC" });
    }
  }, [timezone, resetTimezone]);

  const onSubmitTimezone: SubmitHandler<z.infer<typeof updateTimezoneBody>> =
    useCallback(
      (data) => {
        analytics.captureAction("calendar_timezone_save_started", {
          auto_detect: data.timezone === "auto-detect",
        });
        if (data.timezone === "auto-detect") {
          const detected = Intl.DateTimeFormat().resolvedOptions().timeZone;
          executeUpdateTimezone({ timezone: detected });
        } else {
          executeUpdateTimezone(data);
        }
      },
      [analytics, executeUpdateTimezone],
    );

  return (
    <SettingCard
      title="Timezone"
      description="Used for AI scheduling and booking-link availability."
      collapseOnMobile
      right={
        <LoadingContent
          loading={isLoading}
          error={error}
          loadingComponent={<Skeleton className="h-10 w-64" />}
        >
          <form
            onSubmit={handleSubmitTimezone(onSubmitTimezone)}
            className="flex flex-col gap-2 sm:flex-row sm:items-center w-full md:w-auto"
          >
            <div className="w-full sm:w-64">
              <Select
                options={timezoneOptions}
                {...registerTimezone("timezone")}
                error={timezoneErrors.timezone}
              />
            </div>
            <Button
              type="submit"
              loading={isUpdatingTimezone}
              size="sm"
              className="w-full sm:w-auto"
            >
              Save
            </Button>
          </form>
        </LoadingContent>
      }
    />
  );
}
