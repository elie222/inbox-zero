"use client";

import { useCallback, useState, useEffect } from "react";
import { format } from "date-fns";
import { Send, CheckIcon, CalendarIcon, Building2 } from "lucide-react";
import { useAction } from "next-safe-action/hooks";
import { PageHeading, TypographyP } from "@/components/Typography";
import { Button } from "@/components/ui/button";
import { LoadingContent } from "@/components/LoadingContent";
import { toastSuccess, toastError } from "@/components/Toast";
import { IconCircle } from "@/app/(app)/[emailAccountId]/onboarding/IconCircle";
import { useAccount } from "@/providers/EmailAccountProvider";
import { useCalendarUpcomingEvents } from "@/hooks/useCalendarUpcomingEvents";
import { sendBriefAction } from "@/utils/actions/meeting-briefs";
import { cn } from "@/utils";
import { extractDomainFromEmail } from "@/utils/email";
import { sleep } from "@/utils/sleep";

export function StepSendTestBrief({ onNext }: { onNext: () => void }) {
  const { emailAccountId } = useAccount();
  const { data, isLoading, error } = useCalendarUpcomingEvents();
  const [selectedEventId, setSelectedEventId] = useState<string | null>(null);
  const [briefSent, setBriefSent] = useState(false);

  const { execute, isExecuting } = useAction(
    sendBriefAction.bind(null, emailAccountId),
    {
      onSuccess: async ({ data: result }) => {
        toastSuccess({
          description: result.message || "Test brief sent! Check your inbox.",
        });
        setBriefSent(true);
        await sleep(1000);
        onNext();
      },
      onError: ({ error: err }) => {
        toastError({
          description: err.serverError || "Failed to send brief",
        });
      },
    },
  );

  const handleSendTestBrief = useCallback(() => {
    const event = data?.events.find((e) => e.id === selectedEventId);
    if (!event) return;

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
  }, [data?.events, selectedEventId, execute]);

  return (
    <>
      <div className="flex justify-center">
        <IconCircle size="lg">
          <Send className="size-6" />
        </IconCircle>
      </div>

      <div className="text-center">
        <PageHeading className="mt-4">Send a Test Brief</PageHeading>
        <TypographyP className="mt-2 max-w-lg mx-auto">
          Pick an upcoming meeting and we'll send you a sample brief so you can
          see exactly what you'll receive.
        </TypographyP>
      </div>

      <div className="mt-8">
        <LoadingContent loading={isLoading} error={error}>
          {!data?.events.length ? (
            <div className="flex flex-col items-center gap-4 rounded-xl border bg-card p-6 text-center">
              <CalendarIcon className="h-8 w-8 text-muted-foreground" />
              <div>
                <p className="font-medium">No upcoming meetings found</p>
                <p className="text-sm text-muted-foreground mt-1">
                  We couldn't find any upcoming meetings with external guests.
                </p>
              </div>
              <Button onClick={onNext} variant="outline">
                Skip for now
              </Button>
            </div>
          ) : (
            <div className="flex flex-col gap-2">
              {data.events.map((event) => {
                const isSelected = selectedEventId === event.id;
                const companyDomain = extractDomainFromEmail(
                  event.attendees[0]?.email || "",
                );

                return (
                  <button
                    key={event.id}
                    type="button"
                    onClick={() => setSelectedEventId(event.id)}
                    className={cn(
                      "flex items-center justify-between gap-4 rounded-xl border bg-card p-4 text-left transition-all hover:border-border/80 hover:translate-x-1",
                      isSelected && "border-blue-600 ring-2 ring-blue-100",
                    )}
                  >
                    <div className="flex min-w-0 items-center gap-3">
                      <div
                        className={cn(
                          "flex h-10 w-10 shrink-0 items-center justify-center rounded-lg transition-colors",
                          isSelected
                            ? "bg-blue-600 text-white"
                            : "bg-muted text-muted-foreground",
                        )}
                      >
                        <Building2 className="h-5 w-5" />
                      </div>
                      <div className="min-w-0">
                        <p className="truncate font-medium text-foreground">
                          {event.title}
                        </p>
                        <p className="truncate text-sm text-muted-foreground">
                          {companyDomain && `${companyDomain} · `}
                          {format(
                            new Date(event.startTime),
                            "EEE, MMM d 'at' h:mm a",
                          )}
                        </p>
                      </div>
                    </div>
                    <div
                      className={cn(
                        "flex h-5 w-5 shrink-0 items-center justify-center rounded-full border-2 transition-colors",
                        isSelected
                          ? "border-blue-600 bg-blue-600"
                          : "border-muted-foreground/30",
                      )}
                    >
                      {isSelected && (
                        <CheckIcon className="h-3 w-3 text-white" />
                      )}
                    </div>
                  </button>
                );
              })}
            </div>
          )}
        </LoadingContent>
      </div>

      {data?.events.length ? (
        <div className="flex justify-center mt-8">
          <Button
            onClick={handleSendTestBrief}
            disabled={!selectedEventId || isExecuting || briefSent}
            loading={isExecuting}
            size="lg"
            variant={briefSent ? "green" : "default"}
          >
            {briefSent ? (
              <>
                <CheckIcon className="mr-2 h-4 w-4" />
                Brief sent! Check your inbox
              </>
            ) : (
              <>
                <Send className="mr-2 h-4 w-4" />
                Send Test Brief
              </>
            )}
          </Button>
        </div>
      ) : null}
    </>
  );
}
