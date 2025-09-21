import { useCallback, useEffect, useState } from "react";
import { useForm, type SubmitHandler } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import useSWR from "swr";
import { z } from "zod";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { toastError, toastSuccess } from "@/components/Toast";
import { LoadingContent } from "@/components/LoadingContent";
import { useRules } from "@/hooks/useRules";
import { MultiSelectFilter } from "@/components/MultiSelectFilter";
import {
  updateDigestItemsAction,
  updateDigestScheduleAction,
} from "@/utils/actions/settings";
import type { UpdateDigestItemsBody } from "@/utils/actions/settings.validation";
import { ActionType } from "@prisma/client";
import { useAccount } from "@/providers/EmailAccountProvider";
import type { GetDigestSettingsResponse } from "@/app/api/user/digest-settings/route";
import type { GetDigestScheduleResponse } from "@/app/api/user/digest-schedule/route";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Select,
  SelectItem,
  SelectContent,
  SelectTrigger,
} from "@/components/ui/select";
import { FormItem } from "@/components/ui/form";
import {
  createCanonicalTimeOfDay,
  dayOfWeekToBitmask,
  bitmaskToDayOfWeek,
} from "@/utils/schedule";
import { useAction } from "next-safe-action/hooks";
import DigestEmail, {
  type DigestEmailProps,
} from "@inboxzero/resend/emails/digest";

const digestSettingsSchema = z.object({
  selectedItems: z.set(z.string()),
  // Schedule
  schedule: z.string().min(1, "Please select a frequency"),
  dayOfWeek: z.string().min(1, "Please select a day"),
  hour: z.string().min(1, "Please select an hour"),
  minute: z.string().min(1, "Please select minutes"),
  ampm: z.enum(["AM", "PM"], { required_error: "Please select AM or PM" }),
});

type DigestSettingsFormValues = z.infer<typeof digestSettingsSchema>;

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

export function DigestSettingsForm() {
  const { emailAccountId } = useAccount();
  const {
    data: rules,
    isLoading: rulesLoading,
    error: rulesError,
    mutate: mutateRules,
  } = useRules();

  const {
    data: digestSettings,
    isLoading: digestLoading,
    error: digestError,
    mutate: mutateDigestSettings,
  } = useSWR<GetDigestSettingsResponse>("/api/user/digest-settings");

  const {
    data: scheduleData,
    isLoading: scheduleLoading,
    error: scheduleError,
    mutate: mutateSchedule,
  } = useSWR<GetDigestScheduleResponse>("/api/user/digest-schedule");

  const isLoading = rulesLoading || digestLoading || scheduleLoading;
  const error = rulesError || digestError || scheduleError;

  // Use local state for MultiSelectFilter
  const [selectedDigestItems, setSelectedDigestItems] = useState<Set<string>>(
    new Set(),
  );

  const {
    handleSubmit,
    formState: { isSubmitting },
    watch,
    setValue,
    reset,
  } = useForm<DigestSettingsFormValues>({
    resolver: zodResolver(digestSettingsSchema),
    defaultValues: {
      selectedItems: new Set(),
      schedule: "daily",
      dayOfWeek: "1",
      hour: "09",
      minute: "00",
      ampm: "AM",
    },
  });

  const watchedValues = watch();

  const { execute: executeItems } = useAction(
    updateDigestItemsAction.bind(null, emailAccountId),
    {
      onSuccess: () => {
        mutateRules();
        mutateDigestSettings();
      },
      onError: (error) => {
        toastError({
          title: "Error updating digest items",
          description: error.error.serverError || "An error occurred",
        });
      },
    },
  );

  const { execute: executeSchedule } = useAction(
    updateDigestScheduleAction.bind(null, emailAccountId),
    {
      onSuccess: () => {
        mutateSchedule();
      },
      onError: (error) => {
        toastError({
          title: "Error updating digest schedule",
          description: error.error.serverError || "An error occurred",
        });
      },
    },
  );

  // Initialize selected items and form data from API responses
  useEffect(() => {
    if (rules && digestSettings && scheduleData) {
      const selectedItems = new Set<string>();

      // Add rules that have digest actions
      rules.forEach((rule) => {
        if (rule.actions.some((action) => action.type === ActionType.DIGEST)) {
          selectedItems.add(rule.id);
        }
      });

      // Add cold email if enabled
      if (digestSettings.coldEmail) {
        selectedItems.add("cold-emails");
      }

      setSelectedDigestItems(selectedItems);

      // Initialize schedule form data
      const initialScheduleProps = getInitialScheduleProps(scheduleData);
      reset({
        selectedItems,
        ...initialScheduleProps,
      });
    }
  }, [rules, digestSettings, scheduleData, reset]);

  // Update form when selectedDigestItems changes
  useEffect(() => {
    setValue("selectedItems", selectedDigestItems);
  }, [selectedDigestItems, setValue]);

  const onSubmit: SubmitHandler<DigestSettingsFormValues> = useCallback(
    async (data) => {
      // Handle items update
      const ruleDigestPreferences: Record<string, boolean> = {};
      const coldEmailDigest = data.selectedItems.has("cold-emails");

      // Set all rules to false first
      rules?.forEach((rule) => {
        ruleDigestPreferences[rule.id] = false;
      });

      // Then set selected rules to true
      data.selectedItems.forEach((itemId) => {
        if (itemId !== "cold-emails") {
          ruleDigestPreferences[itemId] = true;
        }
      });

      const itemsData: UpdateDigestItemsBody = {
        ruleDigestPreferences,
        coldEmailDigest,
      };

      // Handle schedule update
      const { schedule, dayOfWeek, hour, minute, ampm } = data;

      let intervalDays: number;
      switch (schedule) {
        case "daily":
          intervalDays = 1;
          break;
        case "weekly":
          intervalDays = 7;
          break;
        default:
          intervalDays = 1;
      }

      let hour24 = Number.parseInt(hour, 10);
      if (ampm === "AM" && hour24 === 12) hour24 = 0;
      else if (ampm === "PM" && hour24 !== 12) hour24 += 12;

      const timeOfDay = createCanonicalTimeOfDay(
        hour24,
        Number.parseInt(minute, 10),
      );

      const scheduleUpdateData = {
        intervalDays,
        occurrences: 1,
        daysOfWeek: dayOfWeekToBitmask(Number.parseInt(dayOfWeek, 10)),
        timeOfDay,
      };

      // Execute both updates
      try {
        await Promise.all([
          executeItems(itemsData),
          executeSchedule(scheduleUpdateData),
        ]);
        toastSuccess({
          description: "Your digest settings have been updated!",
        });
      } catch {
        toastError({
          title: "Error updating digest settings",
          description: "An error occurred while saving your settings",
        });
      }
    },
    [rules, executeItems, executeSchedule],
  );

  // Create options for MultiSelectFilter
  const digestOptions = [
    ...(rules?.map((rule) => ({
      label: rule.name,
      value: rule.id,
    })) || []),
    {
      label: "Cold Emails",
      value: "cold-emails",
    },
  ];

  return (
    <div className="grid lg:grid-cols-2 gap-8 h-full">
      <div className="space-y-6">
        <LoadingContent
          loading={isLoading}
          error={error}
          loadingComponent={<Skeleton className="min-h-[200px] w-full" />}
        >
          <form onSubmit={handleSubmit(onSubmit)} className="space-y-6">
            <div>
              <Label>What to include in the digest email</Label>
              <div className="mt-3">
                <MultiSelectFilter
                  title="Digest Items"
                  options={digestOptions}
                  selectedValues={selectedDigestItems}
                  setSelectedValues={setSelectedDigestItems}
                  maxDisplayedValues={3}
                />
              </div>
            </div>

            <div>
              <Label>Send the digest email</Label>

              <div className="grid lg:grid-cols-3 gap-3 mt-3">
                <FormItem>
                  <Label htmlFor="frequency-select">Every</Label>
                  <Select
                    value={watchedValues.schedule}
                    onValueChange={(val) => setValue("schedule", val)}
                  >
                    <SelectTrigger id="frequency-select">
                      {watchedValues.schedule
                        ? frequencies.find(
                            (f) => f.value === watchedValues.schedule,
                          )?.label
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

                {watchedValues.schedule !== "daily" && (
                  <FormItem>
                    <Label htmlFor="dayofweek-select">on</Label>
                    <Select
                      value={watchedValues.dayOfWeek}
                      onValueChange={(val) => setValue("dayOfWeek", val)}
                    >
                      <SelectTrigger id="dayofweek-select">
                        {watchedValues.dayOfWeek
                          ? daysOfWeek.find(
                              (d) => d.value === watchedValues.dayOfWeek,
                            )?.label
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
                        onValueChange={(val) =>
                          setValue("ampm", val as "AM" | "PM")
                        }
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
                </div>
              </div>
            </div>

            <Button type="submit" loading={isSubmitting} className="mt-4">
              Save Settings
            </Button>
          </form>
        </LoadingContent>
      </div>

      <EmailPreview
        selectedDigestItems={selectedDigestItems}
        rules={rules || []}
      />
    </div>
  );
}

function EmailPreview({
  selectedDigestItems,
  rules,
}: {
  selectedDigestItems: Set<string>;
  rules: { id: string; name: string }[];
}) {
  return (
    <div>
      <Label>Preview</Label>
      <div className="mt-3 border rounded-lg p-4 bg-slate-50 overflow-auto max-h-[700px]">
        {selectedDigestItems.size > 0 ? (
          <div className="bg-white rounded shadow-sm p-4">
            <DigestEmail
              {...createMockDigestData(selectedDigestItems, rules || [])}
            />
          </div>
        ) : (
          <div className="text-center text-slate-500 py-8">
            <p>Select digest items to see a preview</p>
          </div>
        )}
      </div>
    </div>
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

const createMockDigestData = (
  selectedItems: Set<string>,
  rules: { id: string; name: string }[],
): DigestEmailProps => {
  const mockData: DigestEmailProps = {
    baseUrl: "https://www.getinboxzero.com",
    unsubscribeToken: "mock-token",
    emailAccountId: "mock-account",
    date: new Date(),
    ruleNames: {},
  };

  rules?.forEach((rule) => {
    mockData.ruleNames![rule.id] = rule.name;
  });
  mockData.ruleNames!["cold-emails"] = "Cold Emails";

  const mockDataTemplates = {
    newsletter: [
      {
        from: "Morning Brew",
        subject: "🔥 Today's top business stories",
        content:
          "Apple unveils Vision Pro 2 with 40% lighter design and $2,499 price tag",
      },
      {
        from: "The New York Times",
        subject: "Breaking News: Latest developments",
        content:
          "Fed signals potential rate cuts as inflation shows signs of cooling to 3.2%",
      },
    ],
    receipt: [
      {
        from: "Amazon",
        subject: "Order #123-4567890-1234567",
        content: "Your order has been delivered to your doorstep.",
      },
      {
        from: "Uber Eats",
        subject: "Your food is on the way!",
        content: "Estimated delivery: 15-20 minutes",
      },
    ],
    marketing: [
      {
        from: "Spotify",
        subject: "Limited offer: 3 months premium for $0.99",
        content: "Upgrade your music experience with this exclusive deal",
      },
      {
        from: "Nike",
        subject: "JUST IN: New Summer Collection 🔥",
        content: "Be the first to shop our latest styles before they sell out",
      },
    ],
    calendar: [
      {
        from: "Sarah Johnson",
        subject: "Team Weekly Sync",
        content:
          "Title: Team Weekly Sync\nDate: Tomorrow, 10:00 AM - 11:00 AM • Meeting Room 3 / Zoom",
      },
    ],
    coldEmail: [
      {
        from: "David Williams",
        subject: "Partnership opportunity for your business",
        content: "Growth Solutions Inc.",
      },
      {
        from: "Jennifer Lee",
        subject: "Request for a quick call this week",
        content: "Venture Capital Partners",
      },
    ],
  };

  selectedItems.forEach((itemId) => {
    if (itemId === "cold-emails") {
      mockData.coldEmail = mockDataTemplates.coldEmail;
    } else {
      // For rules, use the rule name to determine mock data type
      const rule = rules?.find((r) => r.id === itemId);
      if (rule) {
        const ruleName = rule.name.toLowerCase();
        if (ruleName.includes("newsletter")) {
          mockData.newsletter = mockDataTemplates.newsletter;
        } else if (ruleName.includes("receipt") || ruleName.includes("order")) {
          mockData.receipt = mockDataTemplates.receipt;
        } else if (
          ruleName.includes("marketing") ||
          ruleName.includes("promo")
        ) {
          mockData.marketing = mockDataTemplates.marketing;
        } else if (
          ruleName.includes("calendar") ||
          ruleName.includes("meeting")
        ) {
          mockData.calendar = mockDataTemplates.calendar;
        } else {
          // Default to newsletter for unknown rule types
          mockData[itemId] = mockDataTemplates.newsletter;
        }
      }
    }
  });

  return mockData;
};
