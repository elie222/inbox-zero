"use client";

import { useState } from "react";
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
import { CleanAction, type CleanupJob } from "@prisma/client";
import { PREVIEW_RUN_COUNT } from "@/app/(app)/[emailAccountId]/clean/consts";
import { useAccount } from "@/providers/EmailAccountProvider";

export function PreviewBatch({ job }: { job: CleanupJob }) {
  const { emailAccountId } = useAccount();
  const [, setIsPreviewBatch] = useQueryState("isPreviewBatch", parseAsBoolean);
  const [isLoading, setIsLoading] = useState(false);

  const handleRunOnFullInbox = async () => {
    setIsLoading(true);
    setIsPreviewBatch(false);
    const result = await cleanInboxAction(emailAccountId, {
      daysOld: job.daysOld,
      instructions: job.instructions || "",
      action: job.action,
      skips: {
        reply: job.skipReply,
        starred: job.skipStarred,
        calendar: job.skipCalendar,
        receipt: job.skipReceipt,
        attachment: job.skipAttachment,
        conversation: job.skipConversation,
      },
    });

    setIsLoading(false);

    if (result?.serverError) {
      toastError({ description: result.serverError });
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
          We're cleaning up {PREVIEW_RUN_COUNT} emails so you can see how it
          works.
        </CardDescription>
        <CardDescription>
          To undo any, hover over the "
          {job.action === CleanAction.ARCHIVE ? "Archive" : "Mark as read"}"
          badge and click undo.
        </CardDescription>
      </CardHeader>
      <CardContent className="flex items-center gap-4">
        <Button onClick={handleRunOnFullInbox} loading={isLoading}>
          Run on Full Inbox
        </Button>
        {/* {disableRunOnFullInbox && (
          <CardDescription className="font-semibold">
            All emails have been processed
          </CardDescription>
        )} */}
      </CardContent>
    </CardGreen>
  );
}
