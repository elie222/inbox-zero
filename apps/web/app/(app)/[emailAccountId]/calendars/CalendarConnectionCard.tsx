"use client";

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Calendar, Trash2, CheckCircle, XCircle } from "lucide-react";
import { CalendarList } from "./CalendarList";
import {
  disconnectCalendarAction,
  toggleCalendarAction,
} from "@/utils/actions/calendar";
import { useAccount } from "@/providers/EmailAccountProvider";
import { useCalendars } from "@/hooks/useCalendars";
import { toastSuccess, toastError } from "@/components/Toast";
import { ConfirmDialog } from "@/components/ConfirmDialog";
import { useState } from "react";
import type { GetCalendarsResponse } from "@/app/api/user/calendars/route";

type CalendarConnection = GetCalendarsResponse["connections"][0];

interface CalendarConnectionCardProps {
  connection: CalendarConnection;
}

export function CalendarConnectionCard({
  connection,
}: CalendarConnectionCardProps) {
  const { emailAccountId } = useAccount();
  const { data, mutate } = useCalendars();
  const [optimisticUpdates, setOptimisticUpdates] = useState<
    Record<string, boolean>
  >({});

  const executeDisconnect = disconnectCalendarAction.bind(null, emailAccountId);
  const [isDisconnecting, setIsDisconnecting] = useState(false);

  const executeToggle = toggleCalendarAction.bind(null, emailAccountId);

  const handleDisconnect = async () => {
    setIsDisconnecting(true);
    try {
      await executeDisconnect({ connectionId: connection.id });
      toastSuccess({
        title: "Disconnected successfully",
        description: "Calendar has been disconnected",
      });
      mutate();
    } catch (error) {
      mutate();
      toastError({
        title: "Error disconnecting",
        description: error instanceof Error ? error.message : "Unknown error",
      });
    } finally {
      setIsDisconnecting(false);
    }
  };

  const handleToggleCalendar = async (
    calendarId: string,
    isEnabled: boolean,
  ) => {
    setOptimisticUpdates((prev) => ({ ...prev, [calendarId]: isEnabled }));

    if (data) {
      mutate(
        {
          ...data,
          connections: data.connections.map((conn) =>
            conn.id === connection.id
              ? {
                  ...conn,
                  calendars:
                    conn.calendars?.map((cal) =>
                      cal.id === calendarId ? { ...cal, isEnabled } : cal,
                    ) || [],
                }
              : conn,
          ),
        },
        false,
      );
    }

    try {
      await executeToggle({ calendarId, isEnabled });
      toastSuccess({
        description: `Calendar ${isEnabled ? "enabled" : "disabled"} successfully`,
      });

      setOptimisticUpdates((prev) => {
        const { [calendarId]: _, ...rest } = prev;
        return rest;
      });

      mutate();
    } catch (error) {
      mutate();
      toastError({
        title: "Error updating calendar",
        description: error instanceof Error ? error.message : "Unknown error",
      });

      setOptimisticUpdates((prev) => {
        const { [calendarId]: _, ...rest } = prev;
        return rest;
      });
    }
  };

  const enabledCalendars =
    connection.calendars?.filter((cal) => cal.isEnabled)?.length ?? 0;
  const totalCalendars = connection.calendars?.length ?? 0;

  return (
    <Card className="border-l-4 border-l-blue-500">
      <CardHeader className="pb-4">
        <div className="flex items-start justify-between">
          <div className="flex items-start gap-3">
            <div className="flex h-12 w-12 items-center justify-center rounded-lg bg-blue-50 dark:bg-blue-950">
              <Calendar className="h-6 w-6 text-blue-600 dark:text-blue-400" />
            </div>
            <div className="space-y-1">
              <CardTitle className="text-lg font-semibold">
                {connection.email}
              </CardTitle>
              <div className="flex items-center gap-2">
                <Badge variant="secondary" className="capitalize text-xs">
                  {connection.provider}
                </Badge>
                {connection.isConnected ? (
                  <div className="flex items-center gap-1 text-green-600 dark:text-green-400">
                    <CheckCircle className="h-3 w-3" />
                    <span className="text-xs font-medium">Connected</span>
                  </div>
                ) : (
                  <div className="flex items-center gap-1 text-red-600 dark:text-red-400">
                    <XCircle className="h-3 w-3" />
                    <span className="text-xs font-medium">Disconnected</span>
                  </div>
                )}
              </div>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <ConfirmDialog
              trigger={
                <Button
                  variant="destructiveSoft"
                  size="sm"
                  disabled={isDisconnecting}
                  Icon={Trash2}
                  loading={isDisconnecting}
                >
                  Disconnect
                </Button>
              }
              title="Disconnect Calendar"
              description="Are you sure you want to disconnect this calendar? This will remove all associated calendars and any meeting transcript generation will stop."
              confirmText="Disconnect"
              onConfirm={handleDisconnect}
            />
          </div>
        </div>
      </CardHeader>
      <CardContent className="pt-0">
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <div>
              <h4 className="text-sm font-semibold text-foreground">
                Calendars
              </h4>
              <p className="text-xs text-muted-foreground">
                {enabledCalendars} of {totalCalendars} calendars enabled
              </p>
            </div>
          </div>

          {connection.calendars && connection.calendars.length > 0 ? (
            <div className="rounded-lg border bg-muted/30 p-3">
              <CalendarList
                calendars={connection.calendars.map((cal) => ({
                  ...cal,
                  isEnabled:
                    optimisticUpdates[cal.id] !== undefined
                      ? optimisticUpdates[cal.id]
                      : cal.isEnabled,
                }))}
                onToggleCalendar={handleToggleCalendar}
              />
            </div>
          ) : (
            <div className="rounded-lg border border-dashed bg-muted/20 p-4 text-center">
              <p className="text-sm text-muted-foreground">
                No calendars available. Calendar details will be synced
                automatically.
              </p>
            </div>
          )}
        </div>
      </CardContent>
    </Card>
  );
}
