"use client";

import type { ParsedMessage } from "@/utils/types";
import type { ThreadTracker } from "@prisma/client";
import { Table, TableBody, TableCell, TableRow } from "@/components/ui/table";
import { EmailMessageCell } from "@/components/EmailMessageCell";
import { Button } from "@/components/ui/button";
import { CheckCircleIcon, HandIcon } from "lucide-react";
import { useThreadsByIds } from "@/hooks/useThreadsByIds";

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
          <AwaitingReplyRow
            key={thread.id}
            message={thread.messages?.[thread.messages.length - 1]}
            userEmail={userEmail}
          />
        ))}
      </TableBody>
    </Table>
  );
}

function AwaitingReplyRow({
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
            <Button variant="default" Icon={HandIcon}>
              Nudge
            </Button>
            <Button variant="default" Icon={CheckCircleIcon}>
              Resolve
            </Button>
          </div>
        </div>
      </TableCell>
    </TableRow>
  );
}
