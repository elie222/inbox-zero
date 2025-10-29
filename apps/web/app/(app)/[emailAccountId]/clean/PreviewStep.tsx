"use client";

import { useCallback, useEffect, useState, useMemo } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { CleanAction } from "@prisma/client";
import { LoadingContent } from "@/components/LoadingContent";
import { EmailFirehose } from "@/app/(app)/[emailAccountId]/clean/EmailFirehose";
import { cleanInboxAction } from "@/utils/actions/clean";
import { PREVIEW_RUN_COUNT } from "@/app/(app)/[emailAccountId]/clean/consts";
import { useAccount } from "@/providers/EmailAccountProvider";
import { toastError } from "@/components/Toast";
import { Button } from "@/components/ui/button";
import {
  CardGreen,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { useEmailStream } from "@/app/(app)/[emailAccountId]/clean/useEmailStream";

export function PreviewStep() {
  const router = useRouter();
  const { emailAccountId } = useAccount();
  const searchParams = useSearchParams();
  const [isLoading, setIsLoading] = useState(true);
  const [jobId, setJobId] = useState<string | null>(null);
  const [error, setError] = useState<string | undefined>(undefined);
  const [isLoadingPreview, setIsLoadingPreview] = useState(false);
  const [isLoadingFull, setIsLoadingFull] = useState(false);

  const action =
    (searchParams.get("action") as CleanAction) ?? CleanAction.ARCHIVE;
  const timeRange = searchParams.get("timeRange")
    ? Number.parseInt(searchParams.get("timeRange")!)
    : 7;
  const instructions = searchParams.get("instructions") ?? undefined;
  const skipReply = searchParams.get("skipReply") === "true";
  const skipStarred = searchParams.get("skipStarred") === "true";
  const skipCalendar = searchParams.get("skipCalendar") === "true";
  const skipReceipt = searchParams.get("skipReceipt") === "true";
  const skipAttachment = searchParams.get("skipAttachment") === "true";

  const runPreview = useCallback(async () => {
    setIsLoading(true);
    setError(null);

    const result = await cleanInboxAction(emailAccountId, {
      daysOld: timeRange,
      instructions: instructions || "",
      action,
      maxEmails: PREVIEW_RUN_COUNT,
      skips: {
        reply: skipReply,
        starred: skipStarred,
        calendar: skipCalendar,
        receipt: skipReceipt,
        attachment: skipAttachment,
        conversation: false,
      },
    });

    if (result?.serverError) {
      setError(result.serverError);
      toastError({ description: result.serverError });
    } else if (result?.data?.jobId) {
      setJobId(result.data.jobId);
    }

    setIsLoading(false);
  }, [
    emailAccountId,
    action,
    timeRange,
    instructions,
    skipReply,
    skipStarred,
    skipCalendar,
    skipReceipt,
    skipAttachment,
  ]);

  const handleProcessPreviewOnly = async () => {
    setIsLoadingPreview(true);
    const result = await cleanInboxAction(emailAccountId, {
      daysOld: timeRange,
      instructions: instructions || "",
      action,
      maxEmails: PREVIEW_RUN_COUNT,
      skips: {
        reply: skipReply,
        starred: skipStarred,
        calendar: skipCalendar,
        receipt: skipReceipt,
        attachment: skipAttachment,
        conversation: false,
      },
    });

    setIsLoadingPreview(false);

    if (result?.serverError) {
      toastError({ description: result.serverError });
    } else if (result?.data?.jobId) {
      setJobId(result.data.jobId);
    }
  };

  const handleRunOnFullInbox = async () => {
    setIsLoadingFull(true);
    const result = await cleanInboxAction(emailAccountId, {
      daysOld: timeRange,
      instructions: instructions || "",
      action,
      skips: {
        reply: skipReply,
        starred: skipStarred,
        calendar: skipCalendar,
        receipt: skipReceipt,
        attachment: skipAttachment,
        conversation: false,
      },
    });

    setIsLoadingFull(false);

    if (result?.serverError) {
      toastError({ description: result.serverError });
    } else if (result?.data?.jobId) {
      setJobId(result.data.jobId);
    }
  };

  useEffect(() => {
    runPreview();
  }, [runPreview]);

  // Use the email stream hook to get real-time email data
  const { emails } = useEmailStream(emailAccountId, false, []);

  // Calculate stats from the emails
  const stats = useMemo(() => {
    const total = emails.length;
    const done = emails.filter(
      (email) => email.archive || email.label || email.status === "completed",
    ).length;
    return { total, done };
  }, [emails]);

  return (
    <LoadingContent loading={isLoading} error={error}>
      {jobId && (
        <>
          <div className="mb-4">
            <Button
              variant="outline"
              onClick={() =>
                router.push(`/${emailAccountId}/clean/onboarding?step=4`)
              }
            >
              ← Back
            </Button>
          </div>
          <CardGreen className="mb-4">
            <CardHeader>
              <CardTitle>Preview run</CardTitle>
              <CardDescription>
                We're cleaning up {PREVIEW_RUN_COUNT} emails so you can see how
                it works.
              </CardDescription>
              <CardDescription>
                To undo any, hover over the "
                {action === CleanAction.ARCHIVE ? "Archive" : "Mark as read"}"
                badge and click undo.
              </CardDescription>
            </CardHeader>
            <CardContent className="flex flex-col gap-3">
              <div className="flex items-center gap-3">
                {/* Temporarily hidden as requested */}
                {/* <Button
                  onClick={handleProcessPreviewOnly}
                  loading={isLoadingPreview}
                  variant="secondary"
                >
                  Process Only These {PREVIEW_RUN_COUNT} Emails
                </Button> */}
                <Button onClick={handleRunOnFullInbox} loading={isLoadingFull}>
                  Run on Full Inbox
                </Button>
              </div>
              <CardDescription className="text-sm">
                Click to process your entire mailbox
              </CardDescription>
            </CardContent>
          </CardGreen>
          <EmailFirehose threads={emails} stats={stats} action={action} />
        </>
      )}
    </LoadingContent>
  );
}
