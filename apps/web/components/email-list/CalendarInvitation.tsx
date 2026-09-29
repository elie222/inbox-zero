"use client";

import { getAccountScopedKey } from "@/utils/swr";
import useSWR from "swr";
import { useAction } from "next-safe-action/hooks";
import {
  CalendarIcon,
  MapPinIcon,
  RepeatIcon,
  UsersIcon,
  VideoIcon,
} from "lucide-react";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { LoadingContent } from "@/components/LoadingContent";
import { toastError } from "@/components/Toast";
import { useAccount } from "@/providers/EmailAccountProvider";
import { respondToCalendarInvitationAction } from "@/utils/actions/calendar-invitation";
import { getActionErrorMessage } from "@/utils/error";
import type { CalendarInvitationResponse } from "@/app/api/messages/calendar-invitation/route";
import { formatInvitationTime } from "@/utils/calendar/invitations/format-time";
import type { InvitationResponse } from "@/utils/calendar/invitations/parser";

type Invitation = NonNullable<CalendarInvitationResponse["invitation"]>;

const COLLAPSED_GUESTS = 5;

// Drives both the RSVP buttons and the guest list's response labels, so the two
// cannot disagree.
const RESPONSE_OPTIONS = [
  ["accepted", "Yes"],
  ["declined", "No"],
  ["tentative", "Maybe"],
] as const satisfies ReadonlyArray<readonly [InvitationResponse, string]>;

const RESPONSE_LABEL: Record<string, string | undefined> =
  Object.fromEntries(RESPONSE_OPTIONS);

// The card reads the meeting time in the zone the viewer's device is set to.
const viewerTimeZone = Intl.DateTimeFormat().resolvedOptions().timeZone;

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
    "No matching calendar event was verified. Your response will be emailed to the organizer.";
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
              <div className="min-w-0 space-y-0.5">
                <p className="font-medium break-words">
                  {formatInvitationTime(invitation, viewerTimeZone)}
                </p>
                <p className="break-words">{invitation.title}</p>
              </div>
            </div>

            {invitation.recurring && (
              <DetailRow icon={RepeatIcon}>Recurring invitation</DetailRow>
            )}

            {invitation.location && (
              <DetailRow icon={MapPinIcon}>
                <span className="break-words">{invitation.location}</span>
              </DetailRow>
            )}

            {invitation.conferenceUrl && (
              <DetailRow icon={VideoIcon}>
                <a
                  href={invitation.conferenceUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="break-all underline underline-offset-2"
                >
                  {invitation.conferenceUrl.replace(/^https?:\/\//, "")}
                </a>
              </DetailRow>
            )}

            <Guests invitation={invitation} response={response} />

            <fieldset className="flex flex-wrap gap-2">
              <legend className="sr-only">Your response</legend>
              {RESPONSE_OPTIONS.map(([value, label]) => (
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

function Guests({
  invitation,
  response,
}: {
  invitation: Invitation;
  response: string | null | undefined;
}) {
  const [expanded, setExpanded] = useState(false);
  const guests = getGuests(invitation);
  const visible = expanded ? guests : guests.slice(0, COLLAPSED_GUESTS);
  return (
    <DetailRow icon={UsersIcon}>
      <ul className="space-y-0.5">
        {visible.map((guest) => {
          // The viewer's own row follows the RSVP on the buttons: the PARTSTAT in
          // the invitation is the organizer's copy, so it goes stale as soon as
          // they answer.
          const guestResponse =
            guest.email === invitation.attendee ? response : guest.response;
          const tags = [
            guest.email === invitation.organizer && "Organizer",
            guest.optional && "Optional",
            guestResponse && RESPONSE_LABEL[guestResponse],
          ].filter(Boolean);
          return (
            <li key={guest.email} className="break-words">
              {guest.name ?? guest.email}
              {tags.length > 0 && (
                <span className="text-muted-foreground">
                  {" "}
                  · {tags.join(" · ")}
                </span>
              )}
            </li>
          );
        })}
      </ul>
      {guests.length > COLLAPSED_GUESTS && (
        <Button
          variant="link"
          size="sm"
          className="h-auto p-0"
          onClick={() => setExpanded(!expanded)}
        >
          {expanded ? "Show fewer" : `Show all ${guests.length} guests`}
        </Button>
      )}
    </DetailRow>
  );
}

function DetailRow({
  icon: Icon,
  children,
}: {
  icon: typeof CalendarIcon;
  children: React.ReactNode;
}) {
  return (
    <div className="flex items-start gap-2 text-sm">
      <Icon className="mt-0.5 size-4 shrink-0 text-muted-foreground" />
      <div className="min-w-0">{children}</div>
    </div>
  );
}

// The organizer leads the list, and only appears once even when they also
// invited themselves as an attendee.
function getGuests({ attendees, organizer, organizerName }: Invitation) {
  const listed = attendees.find((attendee) => attendee.email === organizer);
  return [
    {
      response: listed?.response ?? null,
      email: organizer,
      name: organizerName ?? listed?.name ?? null,
      optional: false,
    },
    ...attendees.filter((attendee) => attendee.email !== organizer),
  ];
}
