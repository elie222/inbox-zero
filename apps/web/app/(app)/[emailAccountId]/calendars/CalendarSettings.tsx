"use client";

import { useMemo, useState } from "react";
import { Button } from "@/components/ui/button";
import { Combobox } from "@/components/Combobox";
import { toastSuccess } from "@/components/Toast";
import { LoadingContent } from "@/components/LoadingContent";
import { SettingCard } from "@/components/SettingCard";
import { Skeleton } from "@/components/ui/skeleton";
import { useCalendars } from "@/hooks/useCalendars";
import { useAccount } from "@/providers/EmailAccountProvider";
import { useAction } from "next-safe-action/hooks";
import { updateEmailAccountTimezoneAction } from "@/utils/actions/calendar";
import { getSupportedTimezonesWithOffsets } from "@/utils/timezone";
import { useProductAnalytics } from "@/hooks/useProductAnalytics";

export function CalendarSettings() {
  const { emailAccountId } = useAccount();
  const analytics = useProductAnalytics("calendars");
  const { data, isLoading, error, mutate } = useCalendars();
  const timezone = data?.timezone || null;

  const [selectedTimezone, setSelectedTimezone] = useState<string | null>(null);
  const detectedTimezone = Intl.DateTimeFormat().resolvedOptions().timeZone;
  const timezoneValue = selectedTimezone ?? timezone ?? detectedTimezone;

  const timezoneOptions = useMemo(() => {
    const options = getSupportedTimezonesWithOffsets(timezone ?? undefined).map(
      ({ zone, city, genericName, offsetLabel }) => ({
        value: zone,
        label: `${city} (${offsetLabel})`,
        keywords: genericName ? [zone, genericName] : [zone],
      }),
    );
    const detectedIndex = options.findIndex(
      (option) => option.value === detectedTimezone,
    );
    if (detectedIndex > 0) {
      options.unshift(...options.splice(detectedIndex, 1));
    }
    return options;
  }, [timezone, detectedTimezone]);

  const { execute: executeUpdateTimezone, isExecuting: isUpdatingTimezone } =
    useAction(updateEmailAccountTimezoneAction.bind(null, emailAccountId), {
      onSuccess: () => {
        analytics.captureAction("calendar_timezone_saved", {
          had_existing_timezone: Boolean(timezone),
        });
        toastSuccess({ description: "Timezone updated!" });
        setSelectedTimezone(null);
        mutate();
      },
    });

  const handleSaveTimezone = () => {
    analytics.captureAction("calendar_timezone_save_started", {
      matches_detected: timezoneValue === detectedTimezone,
    });
    executeUpdateTimezone({ timezone: timezoneValue });
  };

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
          <div className="flex w-full flex-col gap-2 sm:flex-row sm:items-center md:w-auto">
            <div className="w-full sm:w-64">
              <Combobox
                options={timezoneOptions}
                placeholder="Select timezone"
                emptyText="No timezone found."
                value={timezoneValue}
                onChangeValue={(value) => {
                  if (value) setSelectedTimezone(value);
                }}
                loading={false}
              />
            </div>
            <Button
              loading={isUpdatingTimezone}
              size="sm"
              className="w-full sm:w-auto"
              onClick={handleSaveTimezone}
            >
              Save
            </Button>
          </div>
        </LoadingContent>
      }
    />
  );
}
