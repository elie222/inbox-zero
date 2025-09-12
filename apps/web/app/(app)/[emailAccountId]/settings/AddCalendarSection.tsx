"use client";

import { Button } from "@/components/ui/button";
import { FormSection, FormSectionLeft } from "@/components/Form";
import { useCalendars } from "@/hooks/useCalendars";
import type { GetCalendarsResponse } from "@/app/api/user/calendars/route";
import {
  connectGoogleCalendarAction,
  disconnectCalendarAction,
  toggleCalendarAction,
} from "@/utils/actions/calendar";
import { LoadingContent } from "@/components/LoadingContent";
import { toastSuccess, toastError } from "@/components/Toast";
import { useCallback, useState, useEffect } from "react";
import { Toggle } from "@/components/Toggle";
import { Trash2 } from "lucide-react";
import { useAccount } from "@/providers/EmailAccountProvider";
import { useSearchParams } from "next/navigation";

export function AddCalendarSection() {
  const { emailAccountId } = useAccount();
  const { data, isLoading, error, mutate } = useCalendars();
  const [isConnecting, setIsConnecting] = useState(false);
  const searchParams = useSearchParams();

  // Handle callback messages
  useEffect(() => {
    const message = searchParams.get("message");
    const errorParam = searchParams.get("error");

    if (message === "calendar_connected") {
      toastSuccess({ description: "Google Calendar connected successfully!" });
      mutate();
    } else if (message === "calendar_already_connected") {
      toastError({ description: "This Google Calendar is already connected." });
    } else if (errorParam) {
      toastError({
        title: "Error connecting Google Calendar",
        description:
          "Please try again or contact support if the problem persists.",
      });
    }
  }, [searchParams, mutate]);

  const handleConnectGoogle = useCallback(async () => {
    setIsConnecting(true);
    try {
      // This will redirect to Google OAuth, so we won't return here
      await connectGoogleCalendarAction(emailAccountId);
    } catch (error) {
      setIsConnecting(false);
      toastError({
        title: "Error connecting Google Calendar",
        description: error instanceof Error ? error.message : "Unknown error",
      });
    }
  }, [emailAccountId]);

  const handleDisconnect = useCallback(
    async (connectionId: string) => {
      try {
        const result = await disconnectCalendarAction(emailAccountId, {
          connectionId,
        });

        if (result?.serverError) {
          toastError({
            title: "Error disconnecting calendar",
            description: result.serverError,
          });
        } else {
          toastSuccess({ description: "Calendar disconnected successfully!" });
          mutate();
        }
      } catch (error) {
        toastError({
          title: "Error disconnecting calendar",
          description: error instanceof Error ? error.message : "Unknown error",
        });
      }
    },
    [emailAccountId, mutate],
  );

  const handleToggleCalendar = useCallback(
    async (calendarId: string, isEnabled: boolean) => {
      try {
        const result = await toggleCalendarAction(emailAccountId, {
          calendarId,
          isEnabled,
        });

        if (result?.serverError) {
          toastError({
            title: "Error updating calendar",
            description: result.serverError,
          });
        } else {
          mutate();
        }
      } catch (error) {
        toastError({
          title: "Error updating calendar",
          description: error instanceof Error ? error.message : "Unknown error",
        });
      }
    },
    [emailAccountId, mutate],
  );

  type Connection = GetCalendarsResponse["connections"][0];

  return (
    <FormSection>
      <FormSectionLeft
        title="Add calendars"
        description="Add calendars to your account. This will allow us to check your calendars for available time slots when drafting emails."
      />

      <div className="space-y-4">
        <div className="flex gap-2">
          <Button onClick={handleConnectGoogle} loading={isConnecting}>
            Add Google Calendar
          </Button>
          <Button disabled>Add Microsoft Calendar (Coming Soon)</Button>
        </div>

        <LoadingContent loading={isLoading} error={error}>
          {data?.connections && data.connections.length > 0 && (
            <div className="space-y-4">
              <h3 className="text-sm font-medium">Connected Calendars</h3>
              {data.connections.map((connection: Connection) => (
                <div key={connection.id} className="border rounded-lg p-4">
                  <div className="flex items-center justify-between mb-3">
                    <div>
                      <h4 className="font-medium capitalize">
                        {connection.provider} Calendar
                      </h4>
                      <p className="text-sm text-gray-600">
                        {connection.email}
                      </p>
                      <p className="text-xs text-gray-500">
                        {connection.isConnected ? "Connected" : "Disconnected"}
                      </p>
                    </div>
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => handleDisconnect(connection.id)}
                    >
                      <Trash2 className="h-4 w-4 mr-1" />
                      Disconnect
                    </Button>
                  </div>

                  {connection.calendars.length > 0 && (
                    <div className="space-y-2">
                      <h5 className="text-sm font-medium">Calendars</h5>
                      {connection.calendars.map(
                        (calendar: Connection["calendars"][0]) => (
                          <div
                            key={calendar.id}
                            className="flex items-center justify-between py-2"
                          >
                            <div className="flex items-center space-x-3">
                              <div>
                                <p className="text-sm font-medium">
                                  {calendar.name}
                                </p>
                                {calendar.description && (
                                  <p className="text-xs text-gray-500">
                                    {calendar.description}
                                  </p>
                                )}
                              </div>
                            </div>
                            <Toggle
                              name={`calendar-${calendar.id}`}
                              enabled={calendar.isEnabled}
                              onChange={(enabled: boolean) =>
                                handleToggleCalendar(calendar.id, enabled)
                              }
                            />
                          </div>
                        ),
                      )}
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}
        </LoadingContent>
      </div>
    </FormSection>
  );
}
