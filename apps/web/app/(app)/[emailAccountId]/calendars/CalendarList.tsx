"use client";

import { Toggle } from "@/components/Toggle";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { Calendar as CalendarIcon, Star } from "lucide-react";
import type { GetCalendarsResponse } from "@/app/api/user/calendars/route";

type Calendar = GetCalendarsResponse["connections"][0]["calendars"][0];

interface CalendarListProps {
  calendars: Calendar[];
  onToggleCalendar: (calendarId: string, isEnabled: boolean) => void;
}

export function CalendarList({
  calendars,
  onToggleCalendar,
}: CalendarListProps) {
  return (
    <div className="space-y-2">
      {calendars.map((calendar) => (
        <Card key={calendar.id} className="p-3">
          <CardContent className="p-0">
            <div className="grid grid-cols-[auto_1fr_auto] gap-3 items-start">
              <CalendarIcon className="h-4 w-4 text-muted-foreground flex-shrink-0 mt-0.5" />
              <div className="min-w-0">
                <div className="flex items-center gap-2 min-w-0 mb-1">
                  <p className="text-sm font-medium truncate flex-1 min-w-0">
                    {calendar.name}
                  </p>
                  {calendar.primary && (
                    <Badge variant="outline" className="text-xs flex-shrink-0">
                      <Star className="h-3 w-3 mr-1" />
                      Primary
                    </Badge>
                  )}
                </div>
                {calendar.description && (
                  <p className="text-xs text-muted-foreground truncate block overflow-hidden text-ellipsis whitespace-nowrap">
                    {calendar.description}
                  </p>
                )}
                {calendar.timezone && (
                  <p className="text-xs text-muted-foreground truncate block overflow-hidden text-ellipsis whitespace-nowrap">
                    {calendar.timezone}
                  </p>
                )}
              </div>
              <div className="flex items-center gap-2 flex-shrink-0">
                <Toggle
                  name={`calendar-${calendar.id}`}
                  enabled={calendar.isEnabled}
                  onChange={(checked) => onToggleCalendar(calendar.id, checked)}
                />
              </div>
            </div>
          </CardContent>
        </Card>
      ))}
    </div>
  );
}
