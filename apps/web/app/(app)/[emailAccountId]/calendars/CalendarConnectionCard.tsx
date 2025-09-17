"use client";

import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Calendar, Trash2, CheckCircle, XCircle } from "lucide-react";
import { CalendarList } from "./CalendarList";
import { useAction } from "next-safe-action/hooks";
import {
  disconnectCalendarAction,
  toggleCalendarAction,
} from "@/utils/actions/calendar";
import { useAccount } from "@/providers/EmailAccountProvider";
import { useCalendars } from "@/hooks/useCalendars";
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

  const { execute: executeDisconnect, isExecuting: isDisconnecting } =
    useAction(disconnectCalendarAction.bind(null, emailAccountId));
  const { execute: executeToggle } = useAction(
    toggleCalendarAction.bind(null, emailAccountId),
  );

  const handleDisconnect = async () => {
    if (
      confirm(
        "Are you sure you want to disconnect this calendar? This will remove all associated calendars.",
      )
    ) {
      executeDisconnect({ connectionId: connection.id });
      mutate();
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
      executeToggle({ calendarId, isEnabled });

      setOptimisticUpdates((prev) => {
        const { [calendarId]: _, ...rest } = prev;
        return rest;
      });
    } catch {
      setOptimisticUpdates((prev) => {
        const { [calendarId]: _, ...rest } = prev;
        return rest;
      });
    } finally {
      mutate();
    }
  };

  const enabledCalendars =
    connection.calendars?.filter((cal) => cal.isEnabled)?.length ?? 0;
  const totalCalendars = connection.calendars?.length ?? 0;

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="p-2 bg-blue-100 rounded-lg">
              <Calendar className="h-5 w-5 text-blue-600" />
            </div>
            <div>
              <CardTitle className="text-lg">{connection.email}</CardTitle>
              <CardDescription className="flex items-center gap-2">
                <Badge variant="secondary" className="capitalize">
                  {connection.provider}
                </Badge>
                {connection.isConnected ? (
                  <div className="flex items-center gap-1 text-green-600">
                    <CheckCircle className="h-3 w-3" />
                    <span className="text-xs">Connected</span>
                  </div>
                ) : (
                  <div className="flex items-center gap-1 text-red-600">
                    <XCircle className="h-3 w-3" />
                    <span className="text-xs">Disconnected</span>
                  </div>
                )}
              </CardDescription>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <Button
              variant="destructiveSoft"
              size="sm"
              onClick={handleDisconnect}
              disabled={isDisconnecting}
              Icon={Trash2}
              loading={isDisconnecting}
            >
              Disconnect
            </Button>
          </div>
        </div>
      </CardHeader>
      <CardContent>
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm font-medium">Calendars</p>
              <p className="text-xs text-muted-foreground">
                {enabledCalendars} of {totalCalendars} calendars enabled
              </p>
            </div>
          </div>

          {connection.calendars && connection.calendars.length > 0 ? (
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
          ) : (
            <p className="text-sm text-muted-foreground">
              No calendars available. Calendar details will be synced
              automatically.
            </p>
          )}
        </div>
      </CardContent>
    </Card>
  );
}
