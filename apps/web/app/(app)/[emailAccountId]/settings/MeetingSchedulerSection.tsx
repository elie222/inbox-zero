"use client";

import { useCallback } from "react";
import { useForm, type SubmitHandler } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { useAction } from "next-safe-action/hooks";
import useSWR from "swr";
import { Input } from "@/components/Input";
import { Button } from "@/components/ui/button";
import { toastError, toastSuccess } from "@/components/Toast";
import {
  FormSection,
  FormSectionLeft,
  FormSectionRight,
} from "@/components/Form";
import { LoadingContent } from "@/components/LoadingContent";
import {
  updateMeetingSchedulerSettingsAction,
  connectCalendarWebhookAction,
} from "@/utils/actions/meeting-scheduler";
import {
  updateMeetingSchedulerSettingsBody,
  type UpdateMeetingSchedulerSettingsBody,
} from "@/utils/actions/meeting-scheduler.validation";
import type { GetMeetingSchedulerSettingsResponse } from "@/app/api/user/meeting-scheduler-settings/route";
import { useAccount } from "@/providers/EmailAccountProvider";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

export function MeetingSchedulerSection() {
  const { emailAccountId, provider } = useAccount();
  const { data, isLoading, error, mutate } =
    useSWR<GetMeetingSchedulerSettingsResponse>(
      "/api/user/meeting-scheduler-settings",
    );

  const { executeAsync: executeUpdateSettings, isExecuting } = useAction(
    updateMeetingSchedulerSettingsAction.bind(null, emailAccountId),
  );

  const { executeAsync: executeConnectCalendar, isExecuting: isConnecting } =
    useAction(connectCalendarWebhookAction.bind(null, emailAccountId));

  const {
    register,
    handleSubmit,
    formState: { errors },
    watch,
    setValue,
  } = useForm<UpdateMeetingSchedulerSettingsBody>({
    resolver: zodResolver(updateMeetingSchedulerSettingsBody),
    values: data
      ? {
          meetingSchedulerEnabled: data.meetingSchedulerEnabled,
          meetingSchedulerDefaultDuration: data.meetingSchedulerDefaultDuration,
          meetingSchedulerPreferredProvider:
            data.meetingSchedulerPreferredProvider as
              | "auto"
              | "teams"
              | "google-meet"
              | "zoom"
              | "none"
              | null,
          meetingSchedulerWorkingHoursStart:
            data.meetingSchedulerWorkingHoursStart,
          meetingSchedulerWorkingHoursEnd: data.meetingSchedulerWorkingHoursEnd,
          meetingSchedulerAutoCreate: data.meetingSchedulerAutoCreate,
        }
      : undefined,
  });

  const onSubmit: SubmitHandler<UpdateMeetingSchedulerSettingsBody> =
    useCallback(
      async (formData) => {
        const result = await executeUpdateSettings(formData);

        if (result?.serverError) {
          toastError({
            title: "Error updating settings",
            description: result.serverError,
          });
        } else {
          toastSuccess({ description: "Settings updated successfully!" });
          mutate();
        }
      },
      [executeUpdateSettings, mutate],
    );

  const handleConnectCalendar = useCallback(async () => {
    const result = await executeConnectCalendar();

    if (result?.serverError) {
      toastError({
        title: "Connection failed",
        description: result.serverError,
      });
    } else {
      toastSuccess({ description: "Calendar connected successfully!" });
      mutate();
    }
  }, [executeConnectCalendar, mutate]);

  const isEnabled = watch("meetingSchedulerEnabled");
  const preferredProvider = watch("meetingSchedulerPreferredProvider");

  // Determine available providers based on account type
  const availableProviders =
    provider === "google"
      ? ["auto", "google-meet", "zoom", "none"]
      : provider === "microsoft"
        ? ["auto", "teams", "zoom", "none"]
        : ["auto", "zoom", "none"];

  // Webhook status
  const isMicrosoft = data?.account?.provider === "microsoft";
  const webhookExpiration = data?.watchEmailsExpirationDate
    ? new Date(data.watchEmailsExpirationDate)
    : null;
  const isWebhookActive = webhookExpiration && webhookExpiration > new Date();
  const webhookStatusText = isWebhookActive
    ? `Connected (expires ${webhookExpiration.toLocaleDateString()})`
    : "Not connected";

  return (
    <FormSection>
      <FormSectionLeft
        title="Meeting Scheduler"
        description="Automatically schedule meetings when someone sends you a meeting request via email. The system will check your calendar availability and create meetings with the appropriate video conferencing link."
      />

      <FormSectionRight>
        <LoadingContent loading={isLoading} error={error}>
          {data && (
            <form
              className="space-y-4 sm:col-span-6"
              onSubmit={handleSubmit(onSubmit)}
            >
              {/* Enable/Disable Toggle */}
              <div className="flex items-center space-x-2">
                <input
                  type="checkbox"
                  id="meetingSchedulerEnabled"
                  {...register("meetingSchedulerEnabled")}
                  className="rounded border-gray-300"
                />
                <label
                  htmlFor="meetingSchedulerEnabled"
                  className="text-sm font-medium"
                >
                  Enable automatic meeting scheduling
                </label>
              </div>

              {isEnabled && (
                <>
                  {/* Default Duration */}
                  <Input
                    type="number"
                    name="meetingSchedulerDefaultDuration"
                    label="Default Meeting Duration (minutes)"
                    placeholder="60"
                    registerProps={register("meetingSchedulerDefaultDuration", {
                      valueAsNumber: true,
                    })}
                    error={errors.meetingSchedulerDefaultDuration}
                    explainText="Duration for meetings in minutes (15-240)"
                  />

                  {/* Preferred Provider */}
                  <div className="space-y-2">
                    <label
                      htmlFor="meetingSchedulerPreferredProvider"
                      className="text-sm font-medium"
                    >
                      Preferred Meeting Provider
                    </label>
                    <Select
                      value={preferredProvider || "auto"}
                      onValueChange={(value) =>
                        setValue(
                          "meetingSchedulerPreferredProvider",
                          value as
                            | "auto"
                            | "teams"
                            | "google-meet"
                            | "zoom"
                            | "none",
                        )
                      }
                    >
                      <SelectTrigger>
                        <SelectValue placeholder="Select provider" />
                      </SelectTrigger>
                      <SelectContent>
                        {availableProviders.includes("auto") && (
                          <SelectItem value="auto">
                            Auto (use account default)
                          </SelectItem>
                        )}
                        {availableProviders.includes("google-meet") && (
                          <SelectItem value="google-meet">
                            Google Meet
                          </SelectItem>
                        )}
                        {availableProviders.includes("teams") && (
                          <SelectItem value="teams">Microsoft Teams</SelectItem>
                        )}
                        {availableProviders.includes("zoom") && (
                          <SelectItem value="zoom">Zoom</SelectItem>
                        )}
                        {availableProviders.includes("none") && (
                          <SelectItem value="none">
                            None (calendar event only)
                          </SelectItem>
                        )}
                      </SelectContent>
                    </Select>
                    <p className="text-xs text-gray-500">
                      {provider === "google" &&
                        "Google accounts support Google Meet"}
                      {provider === "microsoft" &&
                        "Microsoft accounts support Teams"}
                    </p>
                  </div>

                  {/* Working Hours */}
                  <div className="grid grid-cols-2 gap-4">
                    <Input
                      type="number"
                      name="meetingSchedulerWorkingHoursStart"
                      label="Working Hours Start"
                      placeholder="9"
                      registerProps={register(
                        "meetingSchedulerWorkingHoursStart",
                        {
                          valueAsNumber: true,
                        },
                      )}
                      error={errors.meetingSchedulerWorkingHoursStart}
                      explainText="Hour (0-23)"
                    />
                    <Input
                      type="number"
                      name="meetingSchedulerWorkingHoursEnd"
                      label="Working Hours End"
                      placeholder="17"
                      registerProps={register(
                        "meetingSchedulerWorkingHoursEnd",
                        {
                          valueAsNumber: true,
                        },
                      )}
                      error={errors.meetingSchedulerWorkingHoursEnd}
                      explainText="Hour (0-23)"
                    />
                  </div>

                  {/* Auto Create */}
                  <div className="flex items-center space-x-2">
                    <input
                      type="checkbox"
                      id="meetingSchedulerAutoCreate"
                      {...register("meetingSchedulerAutoCreate")}
                      className="rounded border-gray-300"
                    />
                    <label
                      htmlFor="meetingSchedulerAutoCreate"
                      className="text-sm font-medium"
                    >
                      Automatically create meetings without confirmation
                    </label>
                  </div>

                  {/* Calendar Connection Status (Microsoft only) */}
                  {isMicrosoft && (
                    <div className="space-y-2 rounded-md border border-gray-200 bg-gray-50 p-4">
                      <div className="flex items-center justify-between">
                        <div>
                          <p className="text-sm font-medium text-gray-900">
                            Calendar Connection
                          </p>
                          <p className="text-xs text-gray-600">
                            {webhookStatusText}
                          </p>
                        </div>
                        <Button
                          type="button"
                          variant="outline"
                          size="sm"
                          onClick={handleConnectCalendar}
                          loading={isConnecting}
                        >
                          {isWebhookActive ? "Reconnect" : "Connect Calendar"}
                        </Button>
                      </div>
                      <p className="text-xs text-gray-500">
                        Calendar connection is required for automatic meeting
                        scheduling to work in real-time.
                      </p>
                    </div>
                  )}
                </>
              )}

              <Button type="submit" loading={isExecuting}>
                Save Settings
              </Button>
            </form>
          )}
        </LoadingContent>
      </FormSectionRight>
    </FormSection>
  );
}
