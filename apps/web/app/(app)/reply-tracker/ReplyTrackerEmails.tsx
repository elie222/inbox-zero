"use client";

import type { ParsedMessage } from "@/utils/types";
import type { ThreadTracker } from "@prisma/client";
import { Table, TableBody, TableCell, TableRow } from "@/components/ui/table";
import { EmailMessageCell } from "@/components/EmailMessageCell";
import { Button } from "@/components/ui/button";
import { CheckCircleIcon, HandIcon } from "lucide-react";
import { useThreadsByIds } from "@/hooks/useThreadsByIds";
import { resolveThreadTrackerAction } from "@/utils/actions/reply-tracking";
import { isActionError } from "@/utils/error";
import { toastError, toastSuccess } from "@/components/Toast";

export function ReplyTrackerEmails({
  trackers,
  userEmail,
}: {
  trackers: ThreadTracker[];
  userEmail: string;
}) {
  const { data: threads } = useThreadsByIds({
    threadIds: trackers.map((t) => t.threadId),
  });

  return (
    <Table>
      <TableBody>
        {threads?.threads.map((thread) => (
          <Row
            key={thread.id}
            message={thread.messages?.[thread.messages.length - 1]}
            userEmail={userEmail}
          />
        ))}
      </TableBody>
    </Table>
  );
}

function Row({
  message,
  userEmail,
}: {
  message: ParsedMessage;
  userEmail: string;
}) {
  return (
    <TableRow>
      <TableCell>
        <div className="flex items-center justify-between">
          <EmailMessageCell
            from={message.headers.from}
            subject={message.headers.subject}
            snippet={message.snippet}
            userEmail={userEmail}
            threadId={message.threadId}
            messageId={message.id}
          />
          <div className="ml-4 flex items-center gap-1">
            <Button Icon={HandIcon}>Nudge</Button>
            <Button
              variant="outline"
              Icon={CheckCircleIcon}
              onClick={async () => {
                const result = await resolveThreadTrackerAction({
                  threadId: message.threadId,
                });

                if (isActionError(result)) {
                  toastError({
                    title: "Error",
                    description: result.error,
                  });
                } else {
                  toastSuccess({
                    title: "Success",
                    description: "Thread resolved",
                  });
                }
              }}
            >
              Resolve
            </Button>
          </div>
        </div>
      </TableCell>
    </TableRow>
  );
}
