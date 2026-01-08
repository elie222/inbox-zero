"use client";

import { useCallback, useEffect, useMemo } from "react";
import { useForm, type SubmitHandler } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import type { z } from "zod";
import { Input } from "@/components/Input";
import { Button } from "@/components/ui/button";
import { toastSuccess } from "@/components/Toast";
import { LoadingContent } from "@/components/LoadingContent";
import { SettingCard } from "@/components/SettingCard";
import { Skeleton } from "@/components/ui/skeleton";
import { useCalendars } from "@/hooks/useCalendars";
import { useAccount } from "@/providers/EmailAccountProvider";
import { useAction } from "next-safe-action/hooks";
import {
  updateEmailAccountTimezoneAction,
  updateCalendarBookingLinkAction,
} from "@/utils/actions/calendar";
import {
  updateTimezoneBody,
  updateBookingLinkBody,
} from "@/utils/actions/calendar.validation";
import { Select } from "@/components/Select";

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
  const { data, isLoading, error, mutate } = useCalendars();
  const timezone = data?.timezone || null;
  const calendarBookingLink = data?.calendarBookingLink || null;

  // Calculate timezone options on the client side
  const timezoneOptions = useMemo(() => {
    const detectedTz = Intl.DateTimeFormat().resolvedOptions().timeZone;
    const offset = -new Date().getTimezoneOffset() / 60;
    const offsetStr = offset >= 0 ? `+${offset}` : `${offset}`;
    const autoDetectOption = {
      label: `🌍 Current timezone (${detectedTz} GMT${offsetStr})`,
      value: "auto-detect",
    };

    // Insert auto-detect option after UTC
    const utcIndex = BASE_TIMEZONES.findIndex((tz) => tz.value === "UTC");
    const options = [...BASE_TIMEZONES];
    options.splice(utcIndex + 1, 0, autoDetectOption);

    // Ensure the currently stored timezone is also selectable
    if (timezone && !options.some((tz) => tz.value === timezone)) {
      options.push({ label: timezone, value: timezone });
    }

    return options;
  }, [timezone]);

  const { execute: executeUpdateTimezone, isExecuting: isUpdatingTimezone } =
    useAction(updateEmailAccountTimezoneAction.bind(null, emailAccountId), {
      onSuccess: () => {
        toastSuccess({ description: "Timezone updated!" });
        mutate();
      },
    });

  const {
    execute: executeUpdateBookingLink,
    isExecuting: isUpdatingBookingLink,
  } = useAction(updateCalendarBookingLinkAction.bind(null, emailAccountId), {
    onSuccess: () => {
      toastSuccess({ description: "Booking link updated!" });
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

  const {
    register: registerBookingLink,
    handleSubmit: handleSubmitBookingLink,
    reset: resetBookingLink,
    formState: { errors: bookingLinkErrors },
  } = useForm<z.infer<typeof updateBookingLinkBody>>({
    resolver: zodResolver(updateBookingLinkBody),
    defaultValues: {
      bookingLink: calendarBookingLink || "",
    },
  });

  // Update form values when data loads
  useEffect(() => {
    if (timezone !== null) {
      resetTimezone({ timezone: timezone || "UTC" });
    }
  }, [timezone, resetTimezone]);

  useEffect(() => {
    if (calendarBookingLink !== null || data) {
      resetBookingLink({ bookingLink: calendarBookingLink || "" });
    }
  }, [calendarBookingLink, resetBookingLink, data]);

  const onSubmitTimezone: SubmitHandler<z.infer<typeof updateTimezoneBody>> =
    useCallback(
      (data) => {
        // If user selected "auto-detect", detect and save the actual timezone
        if (data.timezone === "auto-detect") {
          const detected = Intl.DateTimeFormat().resolvedOptions().timeZone;
          executeUpdateTimezone({ timezone: detected });
        } else {
          executeUpdateTimezone(data);
        }
      },
      [executeUpdateTimezone],
    );

  const onSubmitBookingLink: SubmitHandler<
    z.infer<typeof updateBookingLinkBody>
  > = useCallback(
    (data) => {
      executeUpdateBookingLink(data);
    },
    [executeUpdateBookingLink],
  );

  return (
    <div className="space-y-2">
      <SettingCard
        title="Calendar Booking Link"
        description="Your booking link for the AI to share when scheduling meetings"
        collapseOnMobile
        right={
          <LoadingContent
            loading={isLoading}
            error={error}
            loadingComponent={<Skeleton className="h-10 w-80" />}
          >
            <form
              onSubmit={handleSubmitBookingLink(onSubmitBookingLink)}
              className="flex flex-col gap-2 sm:flex-row sm:items-center w-full md:w-auto"
            >
              <div className="w-full sm:w-80">
                <Input
                  type="url"
                  name="bookingLink"
                  placeholder="https://cal.com/your-link"
                  registerProps={registerBookingLink("bookingLink")}
                  error={bookingLinkErrors.bookingLink}
                />
              </div>
              <Button
                type="submit"
                loading={isUpdatingBookingLink}
                size="sm"
                className="w-full sm:w-auto"
              >
                Save
              </Button>
            </form>
          </LoadingContent>
        }
      />

      <SettingCard
        title="Timezone"
        description="Your timezone for calendar scheduling suggestions"
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
    </div>
  );
}
