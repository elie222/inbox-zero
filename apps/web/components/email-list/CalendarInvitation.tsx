"use client";

import { Trans, useLingui } from "@lingui/react/macro";
import { getAccountScopedKey } from "@/utils/swr";
import useSWR from "swr";
import { useAction } from "next-safe-action/hooks";
import { CalendarIcon, MapPinIcon, VideoIcon } from "lucide-react";
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
import { getDateFnsLocale } from "@/utils/i18n/date-fns-locale";

// The card reads the meeting time in the zone the viewer's device is set to.
const viewerTimeZone = Intl.DateTimeFormat().resolvedOptions().timeZone;

export function CalendarInvitation({ messageId }: { messageId: string }) {
  const { t, i18n } = useLingui();
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
  let status = t`No matching calendar event was verified. Your response will be emailed to the organizer.`;
  if (invitation?.calendarSynced)
    status = t`Your response will update your calendar and notify the organizer.`;
  if (submitted) {
    status = submitted.calendarSynced
      ? t`Response sent and calendar updated.`
      : t`Response emailed to the organizer. Calendar sync wasn’t confirmed.`;
  }
  if (isExecuting) status = t`Sending response…`;
  return (
    <section
      className="mb-4 rounded-lg border bg-muted/30 p-4"
      aria-label={t`Calendar invitation`}
    >
      <LoadingContent loading={isLoading} error={error}>
        {invitation && (
          <div className="space-y-3">
            <div className="flex items-start gap-2">
              <CalendarIcon className="mt-0.5 size-4 shrink-0" />
              <div className="min-w-0 space-y-0.5">
                <p className="font-medium break-words">
                  {formatInvitationTime(
                    invitation,
                    viewerTimeZone,
                    getDateFnsLocale(i18n.locale),
                  )}
                </p>
                <p className="break-words">{invitation.title}</p>
                <p className="break-all text-sm text-muted-foreground">
                  {invitation.organizer}
                </p>
                {invitation.recurring && (
                  <p className="text-sm text-muted-foreground">
                    <Trans>Recurring invitation</Trans>
                  </p>
                )}
              </div>
            </div>

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

            <fieldset className="flex flex-wrap gap-2">
              <legend className="sr-only">
                <Trans>Your response</Trans>
              </legend>
              {(
                [
                  ["accepted", t`Yes`],
                  ["declined", t`No`],
                  ["tentative", t`Maybe`],
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
