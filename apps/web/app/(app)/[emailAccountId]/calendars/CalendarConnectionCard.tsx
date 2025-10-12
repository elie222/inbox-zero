"use client";

import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Trash2, CheckCircle, XCircle } from "lucide-react";
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
import Image from "next/image";
import { TypographyP } from "@/components/Typography";

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

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <Image
              src="/images/product/google-calendar.svg"
              alt="Google Calendar"
              width={32}
              height={32}
              unoptimized
            />
            <div>
              <CardTitle className="text-lg">Google Calendar</CardTitle>
              <CardDescription className="flex items-center gap-2">
                {connection.email}
                {!connection.isConnected && (
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
          <TypographyP className="text-sm">
            Toggle the calendars you want to check for conflicts to prevent
            double bookings.
          </TypographyP>

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
