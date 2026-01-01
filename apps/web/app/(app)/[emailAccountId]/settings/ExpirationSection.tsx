"use client";

import { useCallback } from "react";
import useSWR from "swr";
import { type SubmitHandler, useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { FormSection, FormSectionLeft } from "@/components/Form";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/Input";
import { Toggle } from "@/components/Toggle";
import { toastError, toastSuccess } from "@/components/Toast";
import { useAccount } from "@/providers/EmailAccountProvider";
import type { ExpirationSettingsResponse } from "@/app/api/user/expiration-settings/route";
import { LoadingContent } from "@/components/LoadingContent";

const CATEGORIES = [
  {
    id: "NOTIFICATION",
    name: "Notifications",
    description: "Package tracking, alerts, system notifications",
    field: "notificationDays" as const,
    defaultDays: 7,
  },
  {
    id: "NEWSLETTER",
    name: "Newsletters",
    description: "Subscribed email newsletters",
    field: "newsletterDays" as const,
    defaultDays: 30,
  },
  {
    id: "MARKETING",
    name: "Marketing",
    description: "Promotional emails and offers",
    field: "marketingDays" as const,
    defaultDays: 14,
  },
  {
    id: "SOCIAL",
    name: "Social",
    description: "Social media notifications",
    field: "socialDays" as const,
    defaultDays: 7,
  },
  {
    id: "CALENDAR",
    name: "Calendar",
    description: "Days after event to expire",
    field: "calendarDays" as const,
    defaultDays: 1,
  },
];

const formSchema = z.object({
  enabled: z.boolean(),
  notificationDays: z.number().min(1).max(365),
  newsletterDays: z.number().min(1).max(365),
  marketingDays: z.number().min(1).max(365),
  socialDays: z.number().min(1).max(365),
  calendarDays: z.number().min(1).max(30),
  applyLabel: z.boolean(),
  enabledCategories: z.array(z.string()),
});

type FormValues = z.infer<typeof formSchema>;

export function ExpirationSection() {
  const { emailAccountId } = useAccount();
  const { data, isLoading, mutate } = useSWR<ExpirationSettingsResponse>(
    "/api/user/expiration-settings",
  );

  const {
    register,
    handleSubmit,
    watch,
    setValue,
    formState: { errors, isSubmitting },
  } = useForm<FormValues>({
    resolver: zodResolver(formSchema),
    values: {
      enabled: data?.settings?.enabled ?? false,
      notificationDays: data?.settings?.notificationDays ?? 7,
      newsletterDays: data?.settings?.newsletterDays ?? 30,
      marketingDays: data?.settings?.marketingDays ?? 14,
      socialDays: data?.settings?.socialDays ?? 7,
      calendarDays: data?.settings?.calendarDays ?? 1,
      applyLabel: data?.settings?.applyLabel ?? true,
      enabledCategories: data?.settings?.enabledCategories ?? [
        "NOTIFICATION",
        "NEWSLETTER",
        "MARKETING",
        "SOCIAL",
        "CALENDAR",
      ],
    },
  });

  const enabled = watch("enabled");
  const enabledCategories = watch("enabledCategories");

  const toggleCategory = useCallback(
    (categoryId: string) => {
      const current = enabledCategories || [];
      if (current.includes(categoryId)) {
        setValue(
          "enabledCategories",
          current.filter((c) => c !== categoryId),
        );
      } else {
        setValue("enabledCategories", [...current, categoryId]);
      }
    },
    [enabledCategories, setValue],
  );

  const onSubmit: SubmitHandler<FormValues> = useCallback(
    async (formData) => {
      try {
        const res = await fetch("/api/user/expiration-settings", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(formData),
        });

        if (!res.ok) {
          toastError({
            description: "There was an error saving settings.",
          });
        } else {
          toastSuccess({ description: "Expiration settings saved!" });
          mutate();
        }
      } catch {
        toastError({
          description: "There was an error saving settings.",
        });
      }
    },
    [mutate],
  );

  return (
    <FormSection>
      <FormSectionLeft
        title="Email Expiration & Auto-Cleanup"
        description="Automatically archive old emails that are no longer timely. AI analyzes each email to set smart expiration dates based on content."
      />

      <div className="sm:col-span-2">
        <LoadingContent loading={isLoading}>
          <form onSubmit={handleSubmit(onSubmit)} className="space-y-6">
            {/* Master toggle */}
            <div className="flex items-center justify-between rounded-lg border p-4">
              <div>
                <p className="font-medium">Enable Auto-Expiration</p>
                <p className="text-sm text-muted-foreground">
                  Automatically archive emails when they expire
                </p>
              </div>
              <Toggle
                name="enabled"
                enabled={enabled}
                onChange={(value) => setValue("enabled", value)}
              />
            </div>

            {enabled && (
              <>
                {/* Apply label toggle */}
                <div className="flex items-center justify-between rounded-lg border p-4">
                  <div>
                    <p className="font-medium">Apply "Expired" Label</p>
                    <p className="text-sm text-muted-foreground">
                      Add an "Inbox Zero/Expired" label when archiving
                    </p>
                  </div>
                  <Toggle
                    name="applyLabel"
                    enabled={watch("applyLabel")}
                    onChange={(value) => setValue("applyLabel", value)}
                  />
                </div>

                {/* Category settings */}
                <div className="space-y-4">
                  <p className="text-sm font-medium">
                    Default Expiration by Category
                  </p>
                  <p className="text-sm text-muted-foreground">
                    AI will analyze email content for specific dates (e.g.,
                    "package arrives Tuesday"). When no date is found, these
                    defaults apply.
                  </p>

                  <div className="space-y-3">
                    {CATEGORIES.map((category) => {
                      const isEnabled = enabledCategories?.includes(
                        category.id,
                      );
                      return (
                        <div
                          key={category.id}
                          className="flex items-center justify-between rounded-lg border p-3"
                        >
                          <div className="flex items-center gap-3">
                            <Toggle
                              name={`category-${category.id}`}
                              enabled={isEnabled}
                              onChange={() => toggleCategory(category.id)}
                            />
                            <div>
                              <p className="font-medium">{category.name}</p>
                              <p className="text-sm text-muted-foreground">
                                {category.description}
                              </p>
                            </div>
                          </div>

                          <div className="flex items-center gap-2">
                            <Input
                              type="number"
                              name={category.field}
                              className="w-20"
                              min={1}
                              max={category.id === "CALENDAR" ? 30 : 365}
                              disabled={!isEnabled}
                              registerProps={register(category.field, {
                                valueAsNumber: true,
                              })}
                            />
                            <span className="text-sm text-muted-foreground">
                              days
                            </span>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              </>
            )}

            <Button type="submit" loading={isSubmitting}>
              Save Settings
            </Button>
          </form>
        </LoadingContent>
      </div>
    </FormSection>
  );
}
