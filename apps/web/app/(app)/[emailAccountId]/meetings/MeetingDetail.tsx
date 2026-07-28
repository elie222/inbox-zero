"use client";

import { format } from "date-fns";
import { LoadingContent } from "@/components/LoadingContent";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Skeleton } from "@/components/ui/skeleton";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { MeetingRecordingStatus } from "@/generated/prisma/enums";
import { useMeetingRecorderMeeting } from "@/hooks/useMeetingRecorder";
import type { MeetingSummary } from "@/utils/ai/meeting-recorder/summarize-meeting";
import { formatTranscriptTimestamp } from "@/utils/meeting-recorder/transcript-prompt";

export function MeetingDetail({
  meetingId,
  onClose,
}: {
  meetingId: string | null;
  onClose: () => void;
}) {
  const { data, isLoading, error } = useMeetingRecorderMeeting(meetingId);

  const summary = data?.summary;
  const transcript = data?.recording?.transcript;

  return (
    <Dialog open={!!meetingId} onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle>{data?.eventTitle ?? "Meeting"}</DialogTitle>
        </DialogHeader>

        <LoadingContent
          loading={isLoading}
          error={error}
          loadingComponent={<Skeleton className="h-64 w-full" />}
        >
          {data?.recording?.status === MeetingRecordingStatus.FAILED && (
            <Alert variant="destructive">
              <AlertTitle>This meeting was not recorded</AlertTitle>
              <AlertDescription>
                {data.recording.failureReason}
              </AlertDescription>
            </Alert>
          )}

          {(summary || transcript?.length) && (
            <Tabs defaultValue="summary">
              <TabsList>
                <TabsTrigger value="summary">Summary</TabsTrigger>
                <TabsTrigger value="transcript">Transcript</TabsTrigger>
              </TabsList>

              <TabsContent
                value="summary"
                className="max-h-[60vh] overflow-y-auto"
              >
                {summary ? (
                  <MeetingSummaryView summary={summary} />
                ) : (
                  <p className="text-sm text-muted-foreground">
                    The summary is still being written.
                  </p>
                )}
              </TabsContent>

              <TabsContent
                value="transcript"
                className="max-h-[60vh] space-y-3 overflow-y-auto"
              >
                {transcript?.map((utterance, index) => (
                  <div key={`${utterance.startTime}-${index}`}>
                    <p className="text-xs font-medium text-muted-foreground">
                      {utterance.speakerName} ·{" "}
                      {formatTranscriptTimestamp(utterance.startTime)}
                    </p>
                    <p className="text-sm">{utterance.text}</p>
                  </div>
                ))}
              </TabsContent>
            </Tabs>
          )}

          {data?.followUpDraftId && (
            <p className="text-sm text-muted-foreground">
              A follow-up email is waiting in your drafts.
            </p>
          )}

          {data?.recapSentAt && (
            <p className="text-xs text-muted-foreground">
              Notes emailed{" "}
              {format(new Date(data.recapSentAt), "MMM d 'at' h:mm a")}
            </p>
          )}
        </LoadingContent>
      </DialogContent>
    </Dialog>
  );
}

function MeetingSummaryView({ summary }: { summary: MeetingSummary }) {
  return (
    <div className="space-y-4">
      <p className="text-sm">{summary.overview}</p>

      <SummarySection title="Decisions" items={summary.keyDecisions} />
      <SummarySection
        title="Action items"
        items={summary.actionItems.map((item) =>
          item.owner ? `${item.owner}: ${item.description}` : item.description,
        )}
      />
      <SummarySection
        title="Open questions"
        items={summary.openQuestions ?? []}
      />
      <SummarySection title="Next steps" items={summary.nextSteps ?? []} />
    </div>
  );
}

function SummarySection({ title, items }: { title: string; items: string[] }) {
  if (items.length === 0) return null;

  return (
    <div>
      <h4 className="text-sm font-medium">{title}</h4>
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
