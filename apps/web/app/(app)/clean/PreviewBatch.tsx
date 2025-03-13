"use client";

import { parseAsBoolean, useQueryState } from "nuqs";
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

export function PreviewBatch({ job }: { job: CleanupJob }) {
  const [, setIsPreviewBatch] = useQueryState("isPreviewBatch", parseAsBoolean);
  const handleRunOnFullInbox = async () => {
    setIsPreviewBatch(false);
    const result = await cleanInboxAction({
      daysOld: job.daysOld,
      instructions: job.instructions || "",
      action: job.action,
      skips: {
        reply: job.skipReply,
        starred: job.skipStarred,
        calendar: job.skipCalendar,
        receipt: job.skipReceipt,
        attachment: job.skipAttachment,
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
        <CardTitle>Preview run</CardTitle>
        {/* <CardDescription>
          We processed {total} emails. {archived} were{" "}
          {job.action === CleanAction.ARCHIVE ? "archived" : "marked as read"}.
        </CardDescription> */}
        <CardDescription>
          To undo any, hover over the "
          {job.action === CleanAction.ARCHIVE ? "Archive" : "Mark as read"}"
          badge and click undo.
        </CardDescription>
      </CardHeader>
      <CardContent className="flex items-center gap-4">
        <Button onClick={handleRunOnFullInbox}>Run on Full Inbox</Button>
        {/* {disableRunOnFullInbox && (
          <CardDescription className="font-semibold">
            All emails have been processed
          </CardDescription>
        )} */}
      </CardContent>
    </CardGreen>
  );
}
