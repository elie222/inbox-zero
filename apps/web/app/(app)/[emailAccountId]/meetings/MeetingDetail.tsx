"use client";

import { useAccount } from "@/providers/EmailAccountProvider";
import { type ReactNode, useState } from "react";
import type { I18n } from "@lingui/core";
import { Plural, Trans, useLingui } from "@lingui/react/macro";
import {
  ChevronDownIcon,
  MailPlusIcon,
  MoreHorizontalIcon,
  TextQuoteIcon,
  Trash2Icon,
} from "lucide-react";
import { useAction } from "next-safe-action/hooks";
import { useSWRConfig } from "swr";
import { LoadingContent } from "@/components/LoadingContent";
import { MutedText } from "@/components/Typography";
import { toastError, toastSuccess } from "@/components/Toast";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardBlue, CardContent } from "@/components/ui/card";
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Skeleton } from "@/components/ui/skeleton";
import { getMeetingDetailState } from "@/app/(app)/[emailAccountId]/meetings/meeting-detail-state";
import { useMeetingRecorderMeeting } from "@/hooks/useMeetingRecorder";
import { useProductAnalytics } from "@/hooks/useProductAnalytics";
import { deleteMeetingNotesAction } from "@/utils/actions/meeting-recorder";
import { getActionErrorMessage } from "@/utils/error";
import { formatTranscriptTimestamp } from "@/utils/meeting-recorder/transcript-prompt";
import { getAccountScopedKey } from "@/utils/swr";

export function MeetingDetail({
  meetingId,
  onClose,
}: {
  meetingId: string | null;
  onClose: () => void;
}) {
  const { t, i18n } = useLingui();
  const { emailAccountId } = useAccount();
  const analytics = useProductAnalytics();
  const { mutate } = useSWRConfig();
  const [isDeleteOpen, setIsDeleteOpen] = useState(false);
  const {
    data,
    isLoading,
    error,
    mutate: mutateMeeting,
  } = useMeetingRecorderMeeting(meetingId, emailAccountId);

  const summary = data?.summary;
  const transcript = data?.recording?.transcript;
  const recapSentAt = data?.recapSentAt
    ? formatRecapSentAt(i18n, data.recapSentAt)
    : null;

  const state = getMeetingDetailState({
    hasSummary: !!summary,
    hasTranscript: !!transcript?.length,
    recordingStatus: data?.recording?.status,
    processingStatus: data?.processingStatus,
  });
  const { execute: deleteNotes, isExecuting: isDeleting } = useAction(
    deleteMeetingNotesAction.bind(null, emailAccountId),
    {
      onSuccess: async () => {
        await Promise.all([
          mutateMeeting(undefined, { revalidate: false }),
          mutate(
            getAccountScopedKey(
              "/api/user/meeting-recorder/meetings",
              emailAccountId,
            ),
          ),
        ]);
        toastSuccess({ description: t`Meeting notes deleted.` });
        setIsDeleteOpen(false);
        onClose();
      },
      onError: ({ error: actionError }) => {
        toastError({
          description: getActionErrorMessage(actionError, {
            prefix: t`Failed to delete meeting notes`,
          }),
        });
      },
    },
  );

  return (
    <Dialog open={!!meetingId} onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="max-h-[85vh] overflow-y-auto sm:max-w-2xl">
        <DialogHeader>
          <div className="flex items-start justify-between gap-3 pr-8">
            <div className="space-y-1.5">
              <DialogTitle>{data?.eventTitle ?? t`Meeting`}</DialogTitle>
              {data && (
                <DialogDescription>
                  {formatMeetingTimeRange(i18n, data.startTime, data.endTime)}
                </DialogDescription>
              )}
            </div>
            {data?.recording && (
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon"
                    aria-label={t`Meeting options`}
                  >
                    <MoreHorizontalIcon className="size-4" />
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end">
                  <DropdownMenuItem
                    className="text-destructive focus:text-destructive"
                    onSelect={() => setIsDeleteOpen(true)}
                  >
                    <Trash2Icon className="mr-2 size-4" />
                    <Trans>Delete notes</Trans>
                  </DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
            )}
          </div>
        </DialogHeader>

        <LoadingContent
          loading={isLoading}
          error={error}
          loadingComponent={<Skeleton className="h-64 w-full" />}
        >
          {state === "recording-failed" && (
            <Alert variant="destructive">
              <AlertTitle>
                <Trans>This meeting was not recorded</Trans>
              </AlertTitle>
              <AlertDescription>
                {data?.recording?.failureReason}
              </AlertDescription>
            </Alert>
          )}

          {state === "processing-failed" && (
            <Alert variant="destructive">
              <AlertTitle>
                <Trans>The notes could not be written</Trans>
              </AlertTitle>
              <AlertDescription>
                <Trans>
                  The recording is there, but summarizing it kept failing. The
                  transcript is still available below.
                </Trans>
              </AlertDescription>
            </Alert>
          )}

          {state === "notes-unavailable" && (
            <Alert>
              <AlertTitle>
                <Trans>No summary was created</Trans>
              </AlertTitle>
              <AlertDescription>
                {transcript?.length
                  ? t`The transcript is still available below.`
                  : t`No usable transcript was available for this meeting.`}
              </AlertDescription>
            </Alert>
          )}

          {state === "processing" && (
            <MutedText>
              <Trans>
                The recording is being processed. Notes will appear here when
                they are ready.
              </Trans>
            </MutedText>
          )}

          {state === "not-recorded" && (
            <MutedText>
              <Trans>This meeting has not been recorded yet.</Trans>
            </MutedText>
          )}

          {!summary && state === "notes" && (
            <MutedText>
              <Trans>The summary is still being written.</Trans>
            </MutedText>
          )}

          {summary && (
            <>
              <DetailSection title={t`Summary`}>
                <p className="text-sm leading-relaxed">{summary.overview}</p>
                <SummaryList
                  items={summary.keyDecisions}
                  title={t`Decisions`}
                />
              </DetailSection>

              {summary.actionItems.length > 0 && (
                <DetailSection title={t`Action items`}>
                  <ul className="space-y-2">
                    {summary.actionItems.map((item, index) => (
                      <li
                        key={`action-${index}`}
                        className="flex items-start justify-between gap-3 text-sm"
                      >
                        <span>{item.description}</span>
                        {item.owner && (
                          <Badge variant="secondary" className="shrink-0">
                            {item.owner}
                          </Badge>
                        )}
                      </li>
                    ))}
                  </ul>
                </DetailSection>
              )}

              {!!(
                summary.openQuestions?.length || summary.nextSteps?.length
              ) && (
                <DetailSection title={t`Still open`}>
                  <SummaryList
                    items={summary.openQuestions ?? []}
                    title={t`Open questions`}
                  />
                  <SummaryList
                    items={summary.nextSteps ?? []}
                    title={t`Next steps`}
                  />
                </DetailSection>
              )}
            </>
          )}

          {data?.followUpDraftId && (
            <CardBlue>
              <CardContent className="space-y-3 p-4">
                <div className="flex items-center gap-2">
                  <MailPlusIcon className="size-4 text-blue-600 dark:text-blue-400" />
                  <span className="text-sm font-medium">
                    <Trans>Follow-up draft is ready</Trans>
                  </span>
                </div>
                <MutedText>
                  <Trans>
                    It is sitting in your drafts, addressed to the other
                    attendees. Nothing was sent for you.
                  </Trans>
                </MutedText>
                <Button asChild variant="outline" size="sm">
                  <a
                    href={getFollowUpDraftUrl(data.id, emailAccountId)}
                    target="_blank"
                    rel="noopener noreferrer"
                    onClick={() =>
                      analytics.captureAction(
                        "meeting_recorder_follow_up_draft_opened",
                      )
                    }
                  >
                    <Trans>Go to drafts</Trans>
                  </a>
                </Button>
              </CardContent>
            </CardBlue>
          )}

          {!!transcript?.length && (
            <Collapsible defaultOpen>
              <Card>
                <CollapsibleTrigger className="group flex w-full items-center gap-3 p-4 text-left hover:bg-accent/50">
                  <TextQuoteIcon className="size-4 shrink-0 text-muted-foreground" />
                  <span className="text-sm font-medium">
                    <Trans>Transcript</Trans>
                  </span>
                  <span className="flex-1 text-sm text-muted-foreground">
                    <Plural
                      value={transcript.length}
                      one="# line"
                      other="# lines"
                    />
                  </span>
                  <ChevronDownIcon className="size-4 shrink-0 text-muted-foreground transition-transform group-data-[state=open]:rotate-180" />
                </CollapsibleTrigger>

                <CollapsibleContent>
                  <div className="max-h-[40vh] space-y-3 overflow-y-auto border-t p-4">
                    {transcript.map((utterance, index) => (
                      <div key={`${utterance.startTime}-${index}`}>
                        <p className="text-xs font-medium text-muted-foreground">
                          {utterance.speakerName} ·{" "}
                          {formatTranscriptTimestamp(utterance.startTime)}
                        </p>
                        <p className="text-sm">{utterance.text}</p>
                      </div>
                    ))}
                  </div>
                </CollapsibleContent>
              </Card>
            </Collapsible>
          )}

          {recapSentAt && (
            <MutedText className="text-xs">
              <Trans>Notes emailed {recapSentAt}</Trans>
            </MutedText>
          )}
        </LoadingContent>

        <AlertDialog open={isDeleteOpen} onOpenChange={setIsDeleteOpen}>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>
                <Trans>Delete meeting notes?</Trans>
              </AlertDialogTitle>
              <AlertDialogDescription>
                <Trans>
                  The summary and transcript will be permanently deleted from
                  Inbox Zero. Recap emails already sent and follow-up drafts in
                  your mailbox will remain.
                </Trans>
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel disabled={isDeleting}>
                <Trans>Cancel</Trans>
              </AlertDialogCancel>
              <AlertDialogAction
                className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                disabled={isDeleting || !meetingId}
                onClick={(event) => {
                  event.preventDefault();
                  if (meetingId) deleteNotes({ meetingId });
                }}
              >
                {isDeleting ? (
                  <Trans>Deleting...</Trans>
                ) : (
                  <Trans>Delete</Trans>
                )}
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      </DialogContent>
    </Dialog>
  );
}

function DetailSection({
  title,
  children,
}: {
  title: string;
  children: ReactNode;
}) {
  return (
    <Card>
      <CardContent className="space-y-3 p-4">
        <h3 className="text-sm font-medium">{title}</h3>
        {children}
      </CardContent>
    </Card>
  );
}

function SummaryList({ title, items }: { title: string; items: string[] }) {
  if (items.length === 0) return null;

  return (
    <div>
      <h4 className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
        {title}
      </h4>
      <ul className="mt-1 list-disc space-y-1 pl-5">
        {items.map((item, index) => (
          <li key={`${title}-${index}`} className="text-sm">
            {item}
          </li>
        ))}
      </ul>
    </div>
  );
}

function getFollowUpDraftUrl(meetingId: string, emailAccountId: string) {
  return `/api/user/meeting-recorder/meetings/${encodeURIComponent(meetingId)}/draft?emailAccountId=${encodeURIComponent(emailAccountId)}`;
}

function formatMeetingTimeRange(
  i18n: I18n,
  startTime: string | Date,
  endTime: string | Date,
) {
  const start = new Date(startTime);
  const end = new Date(endTime);
  const time: Intl.DateTimeFormatOptions = {
    hour: "numeric",
    minute: "2-digit",
  };

  return `${i18n.date(start, { weekday: "short", month: "short", day: "numeric" })} · ${i18n.date(start, time)} – ${i18n.date(end, time)}`;
}

function formatRecapSentAt(i18n: I18n, sentAt: string | Date) {
  return i18n.date(new Date(sentAt), {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}
