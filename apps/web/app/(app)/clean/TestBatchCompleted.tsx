"use client";

import { toastError } from "@/components/Toast";
import { Button } from "@/components/ui/button";
import {
  CardGreen,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { cleanInboxAction } from "@/utils/actions/clean";
import { isActionError } from "@/utils/error";
import { CleanAction, type CleanupJob } from "@prisma/client";

export function TestBatchCompleted({
  total,
  archived,
  job,
}: {
  total: number;
  archived: number;
  job: CleanupJob;
}) {
  const handleRunOnFullInbox = async () => {
    const result = await cleanInboxAction({
      daysOld: job.daysOld,
      instructions: job.instructions || "",
      action: job.action,
      skips: {
        skipReply: job.skipReply,
        skipStarred: job.skipStarred,
        skipCalendar: job.skipCalendar,
        skipReceipt: job.skipReceipt,
        skipAttachment: job.skipAttachment,
      },
    });

    if (isActionError(result)) {
      toastError({ description: result.error });
      return;
    }
  };

  return (
    <CardGreen className="mb-4">
      <CardHeader>
        <CardTitle>Batch completed</CardTitle>
        <CardDescription>
          We processed {total} emails. {archived} were{" "}
          {job.action === CleanAction.ARCHIVE ? "archived" : "marked as read"}.
        </CardDescription>
        <CardDescription>
          To undo any, hover over the "
          {job.action === CleanAction.ARCHIVE ? "Archive" : "Mark as read"}"
          badge and click undo.
        </CardDescription>
      </CardHeader>
      <CardContent>
        <Button onClick={handleRunOnFullInbox}>Run on Full Inbox</Button>
      </CardContent>
    </CardGreen>
  );
}
