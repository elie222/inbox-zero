"use client";

import { useState } from "react";
import { useAction } from "next-safe-action/hooks";
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
import { sendBriefAction } from "@/utils/actions/meeting-briefs";
import { toastSuccess, toastError } from "@/components/Toast";
import { useAccount } from "@/providers/EmailAccountProvider";

export default function BriefsPage() {
  const { emailAccountId } = useAccount();
  const { data, isLoading, error } = useCalendarUpcomingEvents();
  const [sendingEventId, setSendingEventId] = useState<string | null>(null);

  const { execute } = useAction(sendBriefAction.bind(null, emailAccountId), {
    onSuccess: ({ data: result }) => {
      if (result?.success) {
        toastSuccess({
          description: result.message || "Brief sent successfully!",
        });
      } else {
        toastError({
          description: result?.message || "Failed to send brief",
        });
      }
    },
    onError: ({ error }) => {
      toastError({
        description: error.serverError || "Failed to send brief",
      });
    },
    onSettled: () => {
      setSendingEventId(null);
    },
  });

  return (
    <PageWrapper>
      <PageHeader title="Meeting Briefs" />

      <LoadingContent loading={isLoading} error={error}>
        {data && (
          <ItemGroup className="gap-2">
            {data.events.map((event) => (
              <Item key={event.id} variant="outline">
                <ItemContent>
                  <ItemTitle>{event.title}</ItemTitle>
                  <ItemDescription>
                    {event.attendees.map((a) => a.email).join(", ")} -{" "}
                    {new Date(event.startTime).toLocaleString()} -{" "}
                    {new Date(event.endTime).toLocaleString()}
                  </ItemDescription>
                </ItemContent>
                <ItemActions>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => {
                      setSendingEventId(event.id);
                      execute({
                        event: {
                          id: event.id,
                          title: event.title,
                          description: event.description,
                          location: event.location,
                          eventUrl: event.eventUrl,
                          videoConferenceLink: event.videoConferenceLink,
                          startTime: new Date(event.startTime).toISOString(),
                          endTime: new Date(event.endTime).toISOString(),
                          attendees: event.attendees,
                        },
                      });
                    }}
                    loading={sendingEventId === event.id}
                  >
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
