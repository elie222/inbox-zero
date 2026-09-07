"use client";

import { getAccountScopedKey } from "@/utils/swr";
import useSWR from "swr";
import { useAction } from "next-safe-action/hooks";
import { CalendarIcon } from "lucide-react";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { LoadingContent } from "@/components/LoadingContent";
import { toastError } from "@/components/Toast";
import { useAccount } from "@/providers/EmailAccountProvider";
import { respondToCalendarInvitationAction } from "@/utils/actions/calendar-invitation";
import { getActionErrorMessage } from "@/utils/error";
import type { CalendarInvitationResponse } from "@/app/api/messages/calendar-invitation/route";
import type { InvitationResponse } from "@/utils/calendar/invitations/parser";

export function CalendarInvitation({ messageId }: { messageId: string }) {
  const { emailAccountId } = useAccount();
  const { data, isLoading, error, mutate } = useSWR<CalendarInvitationResponse>(
    getAccountScopedKey(
      `/api/messages/calendar-invitation?messageId=${encodeURIComponent(messageId)}`,
      emailAccountId,
    ),
  );
  const [submitted, setSubmitted] = useState<{
    response: InvitationResponse;
    calendarSynced: boolean;
  } | null>(null);
  const { execute, isExecuting } = useAction(
    respondToCalendarInvitationAction.bind(null, emailAccountId),
    {
      onSuccess: ({ data }) => {
        if (!data) return;
        setSubmitted(data);
        mutate();
      },
      onError: ({ error }) =>
        toastError({ description: getActionErrorMessage(error) }),
    },
  );
  if (!isLoading && !error && !data?.invitation) return null;
  const invitation = data?.invitation;
  const response = submitted?.response ?? invitation?.response;
  let status =
    "Your response will be emailed to the organizer. Calendar sync isn’t available for this invitation.";
  if (invitation?.calendarSynced)
    status =
      "Your response will update your calendar and notify the organizer.";
  if (submitted) {
    status = submitted.calendarSynced
      ? "Response sent and calendar updated."
      : "Response emailed to the organizer. Calendar sync wasn’t confirmed.";
  }
  if (isExecuting) status = "Sending response…";
  return (
    <section
      className="mb-4 rounded-lg border bg-muted/30 p-4"
      aria-label="Calendar invitation"
    >
      <LoadingContent loading={isLoading} error={error}>
        {invitation && (
          <div className="space-y-3">
            <div className="flex items-start gap-2">
              <CalendarIcon className="mt-0.5 size-4 shrink-0" />
              <div className="min-w-0">
                <p className="font-medium break-words">{invitation.title}</p>
                <p className="break-all text-sm text-muted-foreground">
                  {invitation.organizer}
                </p>
                {invitation.recurring && (
                  <p className="text-sm text-muted-foreground">
                    Recurring invitation
                  </p>
                )}
              </div>
            </div>
            <fieldset className="flex flex-wrap gap-2">
              <legend className="sr-only">Your response</legend>
              {(
                [
                  ["accepted", "Yes"],
                  ["declined", "No"],
                  ["tentative", "Maybe"],
                ] as const
              ).map(([value, label]) => (
                <Button
                  key={value}
                  size="sm"
                  variant={response === value ? "default" : "outline"}
                  aria-pressed={response === value}
                  disabled={isExecuting}
                  onClick={() => execute({ messageId, response: value })}
                >
                  {label}
                </Button>
              ))}
            </fieldset>
            <p className="text-sm text-muted-foreground" role="status">
              {status}
            </p>
          </div>
        )}
      </LoadingContent>
    </section>
  );
}
