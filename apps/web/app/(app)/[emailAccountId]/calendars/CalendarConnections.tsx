"use client";

import { CalendarCheckIcon, FileTextIcon } from "lucide-react";
import { LoadingContent } from "@/components/LoadingContent";
import { useCalendars } from "@/hooks/useCalendars";
import { CalendarConnectionCard } from "./CalendarConnectionCard";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { ConnectCalendar } from "@/app/(app)/[emailAccountId]/calendars/ConnectCalendar";
import { TypographyP } from "@/components/Typography";

export function CalendarConnections() {
  const { data, isLoading, error } = useCalendars();
  const connections = data?.connections || [];

  return (
    <LoadingContent loading={isLoading} error={error}>
      <div className="space-y-6">
        {connections.length === 0 ? (
          <Card>
            <CardHeader className="pb-2">
              <CardTitle>Connected Calendars</CardTitle>
            </CardHeader>

            <CardContent>
              <div className="space-y-2">
                <TypographyP className="text-sm">
                  Connect your calendar to unlock:
                </TypographyP>

                <TypographyP className="text-sm flex items-center gap-2">
                  <CalendarCheckIcon className="size-4 text-blue-600" />
                  <span className="min-w-0">
                    AI replies based on your real availability
                  </span>
                </TypographyP>

                <TypographyP className="text-sm flex items-center gap-2">
                  <FileTextIcon className="size-4 text-blue-600" />
                  <span className="min-w-0">
                    Meeting briefs before every call
                  </span>
                </TypographyP>
              </div>

              <div className="mt-4">
                <ConnectCalendar />
              </div>
            </CardContent>
          </Card>
        ) : (
          <div className="grid gap-4">
            <ConnectCalendar />

            {connections.map((connection) => (
              <CalendarConnectionCard
                key={connection.id}
                connection={connection}
              />
            ))}
          </div>
        )}
      </div>
    </LoadingContent>
  );
}
