"use client";

import { LoadingContent } from "@/components/LoadingContent";
import { PageHeader } from "@/components/PageHeader";
import { PageWrapper } from "@/components/PageWrapper";
import { Button } from "@/components/ui/button";
import {
  ItemContent,
  ItemDescription,
  Item,
  ItemActions,
  ItemGroup,
  ItemTitle,
} from "@/components/ui/item";
import { useCalendarUpcomingEvents } from "@/hooks/useCalendarUpcomingEvents";

export default function BriefsPage() {
  const { data, isLoading, error } = useCalendarUpcomingEvents();

  return (
    <PageWrapper>
      <PageHeader title="Meeting Briefs" />

      <LoadingContent loading={isLoading} error={error}>
        {data && (
          <ItemGroup className="gap-2">
            {data.events.map((event) => (
              <Item key={event.title} variant="outline">
                <ItemContent>
                  <ItemTitle>{event.title}</ItemTitle>
                  <ItemDescription>
                    {event.attendees.join(", ")} -{" "}
                    {new Date(event.startTime).toLocaleString()} -{" "}
                    {new Date(event.endTime).toLocaleString()}
                  </ItemDescription>
                </ItemContent>
                <ItemActions>
                  <Button variant="outline" size="sm">
                    Send brief
                  </Button>
                </ItemActions>
              </Item>
            ))}
          </ItemGroup>
        )}
      </LoadingContent>
    </PageWrapper>
  );
}
