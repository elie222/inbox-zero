"use client";

import {
  parseAsStringEnum,
  parseAsString,
  parseAsInteger,
  useQueryState,
} from "nuqs";
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
import { CleanAction } from "@prisma/client";

export function TestBatchCompleted({
  total,
  archived,
}: {
  total: number;
  archived: number;
}) {
  const [action] = useQueryState(
    "action",
    parseAsStringEnum([CleanAction.ARCHIVE, CleanAction.MARK_READ]),
  );
  const [timeRange] = useQueryState("timeRange", parseAsInteger);
  const [instructions] = useQueryState("instructions", parseAsString);

  const handleRunOnFullInbox = async () => {
    // TODO: use from existing job instead
    const result = await cleanInboxAction({
      daysOld: timeRange ?? 7,
      instructions: instructions || "",
      action: action || CleanAction.ARCHIVE,
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
          We've processed {total} emails. {archived} were archived.
        </CardDescription>
        <CardDescription>
          To undo any, hover over the "Archive" badge and click undo.
        </CardDescription>
      </CardHeader>
      <CardContent>
        <Button onClick={handleRunOnFullInbox}>Run on Full Inbox</Button>
      </CardContent>
    </CardGreen>
  );
}
