"use client";

import { CalendarIcon } from "lucide-react";
import { LoadingContent } from "@/components/LoadingContent";
import {
  Empty,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
} from "@/components/ui/empty";
import { useCalendars } from "@/hooks/useCalendars";
import { CalendarConnectionCard } from "./CalendarConnectionCard";

export function CalendarConnections() {
  const { data, isLoading, error } = useCalendars();
  const connections = data?.connections || [];

  return (
    <LoadingContent loading={isLoading} error={error}>
      <div className="space-y-6">
        {connections.length === 0 ? (
          <Empty>
            <EmptyHeader>
              <EmptyMedia variant="icon">
                <CalendarIcon />
              </EmptyMedia>
              <EmptyTitle>No calendars connected</EmptyTitle>
              <EmptyDescription>
                Connect your calendar so the AI can draft replies with your real
                availability when scheduling.
              </EmptyDescription>
            </EmptyHeader>
          </Empty>
        ) : (
          <div className="grid gap-4">
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
