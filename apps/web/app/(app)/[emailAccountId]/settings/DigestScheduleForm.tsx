import { z } from "zod";
import { type SubmitHandler, useForm } from "react-hook-form";
import { useCallback } from "react";
import useSWR from "swr";
import {
  Select,
  SelectItem,
  SelectContent,
  SelectTrigger,
} from "@/components/ui/select";
import { Label } from "@/components/ui/label";
import { FormItem } from "@/components/ui/form";
import {
  createCanonicalTimeOfDay,
  dayOfWeekToBitmask,
  bitmaskToDayOfWeek,
} from "@/utils/schedule";
import { Button } from "@/components/ui/button";
import { toastError, toastSuccess } from "@/components/Toast";
import { updateDigestScheduleAction } from "@/utils/actions/settings";
import { useAccount } from "@/providers/EmailAccountProvider";
import { useAction } from "next-safe-action/hooks";
import type { GetDigestScheduleResponse } from "@/app/api/user/digest-schedule/route";
import { LoadingContent } from "@/components/LoadingContent";
import { ErrorMessage } from "@/components/Input";
import { zodResolver } from "@hookform/resolvers/zod";
import { Skeleton } from "@/components/ui/skeleton";

const digestScheduleFormSchema = z.object({
  schedule: z.string().min(1, "Please select a frequency"),
  dayOfWeek: z.string().min(1, "Please select a day"),
  hour: z.string().min(1, "Please select an hour"),
  minute: z.string().min(1, "Please select minutes"),
  ampm: z.enum(["AM", "PM"], { required_error: "Please select AM or PM" }),
});

type DigestScheduleFormValues = z.infer<typeof digestScheduleFormSchema>;

const frequencies = [
  { value: "daily", label: "Day" },
  { value: "weekly", label: "Week" },
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

export function DigestScheduleForm({
  showSaveButton,
}: {
  showSaveButton: boolean;
}) {
  const { data, isLoading, error, mutate } = useSWR<GetDigestScheduleResponse>(
    "/api/user/digest-schedule",
  );

  return (
    <LoadingContent
      loading={isLoading}
      error={error}
      loadingComponent={<Skeleton className="min-h-[200px] w-full" />}
    >
      <DigestScheduleFormInner
        data={data}
        mutate={mutate}
        showSaveButton={showSaveButton}
      />
    </LoadingContent>
  );
}

function DigestScheduleFormInner({
  data,
  mutate,
  showSaveButton,
}: {
  data: GetDigestScheduleResponse | undefined;
  mutate: () => void;
  showSaveButton: boolean;
}) {
  const { emailAccountId } = useAccount();

  const {
    handleSubmit,
    watch,
    setValue,
    formState: { errors, isSubmitting },
  } = useForm<DigestScheduleFormValues>({
    resolver: zodResolver(digestScheduleFormSchema),
    defaultValues: getInitialScheduleProps(data),
  });

  const watchedValues = watch();

  const { execute, isExecuting } = useAction(
    updateDigestScheduleAction.bind(null, emailAccountId),
    {
      onSuccess: () => {
        toastSuccess({
          description: "Your digest settings have been updated!",
        });
        mutate();
      },
      onError: (error) => {
        toastError({
          description:
            error.error.serverError ??
            "An unknown error occurred while updating your settings",
        });
      },
    },
  );

  const onSubmit: SubmitHandler<DigestScheduleFormValues> = useCallback(
    async (data) => {
      const { schedule, dayOfWeek, hour, minute, ampm } = data;

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

      let hour24 = Number.parseInt(hour, 10);
      if (ampm === "AM" && hour24 === 12) hour24 = 0;
      else if (ampm === "PM" && hour24 !== 12) hour24 += 12;

      // Use canonical date (1970-01-01) to store only time information
      const timeOfDay = createCanonicalTimeOfDay(
        hour24,
        Number.parseInt(minute, 10),
      );

      const scheduleData = {
        intervalDays,
        occurrences: 1,
        daysOfWeek: dayOfWeekToBitmask(Number.parseInt(dayOfWeek, 10)),
        timeOfDay,
      };

      execute(scheduleData);
    },
    [execute],
  );

  return (
    <form onSubmit={handleSubmit(onSubmit)}>
      <Label className="mb-2 mt-4">Send the digest email</Label>

      <div className="grid grid-cols-3 gap-2">
        <FormItem>
          <Label htmlFor="frequency-select">Every</Label>
          <Select
            value={watchedValues.schedule}
            onValueChange={(val) => setValue("schedule", val)}
          >
            <SelectTrigger id="frequency-select">
              {watchedValues.schedule
                ? frequencies.find((f) => f.value === watchedValues.schedule)
                    ?.label
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
          {errors.schedule && (
            <ErrorMessage
              message={errors.schedule.message || "This field is required"}
            />
          )}
        </FormItem>

        {watchedValues.schedule !== "daily" && (
          <FormItem>
            <Label htmlFor="dayofweek-select">
              {watchedValues.schedule === "monthly" ||
              watchedValues.schedule === "biweekly"
                ? "on the first"
                : "on"}
            </Label>
            <Select
              value={watchedValues.dayOfWeek}
              onValueChange={(val) => setValue("dayOfWeek", val)}
            >
              <SelectTrigger id="dayofweek-select">
                {watchedValues.dayOfWeek
                  ? daysOfWeek.find((d) => d.value === watchedValues.dayOfWeek)
                      ?.label
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
            {errors.dayOfWeek && (
              <ErrorMessage
                message={errors.dayOfWeek.message || "Please select a day"}
              />
            )}
          </FormItem>
        )}

        <div className="space-y-2">
          <Label>at</Label>
          <div className="flex items-end gap-2">
            <FormItem>
              <Select
                value={watchedValues.hour}
                onValueChange={(val) => setValue("hour", val)}
              >
                <SelectTrigger id="hour-select">
                  {watchedValues.hour}
                </SelectTrigger>
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
                value={watchedValues.minute}
                onValueChange={(val) => setValue("minute", val)}
              >
                <SelectTrigger id="minute-select">
                  {watchedValues.minute}
                </SelectTrigger>
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
                value={watchedValues.ampm}
                onValueChange={(val) => setValue("ampm", val as "AM" | "PM")}
              >
                <SelectTrigger id="ampm-select">
                  {watchedValues.ampm}
                </SelectTrigger>
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
          {(errors.hour || errors.minute || errors.ampm) && (
            <div className="space-y-1">
              {errors.hour && (
                <ErrorMessage
                  message={errors.hour.message || "Please select an hour"}
                />
              )}
              {errors.minute && (
                <ErrorMessage
                  message={errors.minute.message || "Please select minutes"}
                />
              )}
              {errors.ampm && (
                <ErrorMessage
                  message={errors.ampm.message || "Please select AM or PM"}
                />
              )}
            </div>
          )}
        </div>
      </div>
      {showSaveButton && (
        <Button
          type="submit"
          loading={isExecuting || isSubmitting}
          className="mt-4"
        >
          Save
        </Button>
      )}
    </form>
  );
}

function getInitialScheduleProps(
  digestSchedule?: GetDigestScheduleResponse | null,
) {
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
    const dayOfWeek = bitmaskToDayOfWeek(digestSchedule.daysOfWeek);
    return dayOfWeek !== null ? dayOfWeek.toString() : "1";
  })();

  const initialTimeOfDay = digestSchedule?.timeOfDay
    ? (() => {
        // Extract time from canonical date (1970-01-01T00:00:00Z + time)
        const hours = new Date(digestSchedule.timeOfDay)
          .getHours()
          .toString()
          .padStart(2, "0");
        const minutes = new Date(digestSchedule.timeOfDay)
          .getMinutes()
          .toString()
          .padStart(2, "0");
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
