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
import { useDisplayedEmail } from "@/hooks/useDisplayedEmail";

export function ReplyTrackerEmails({
  trackers,
  userEmail,
  isResolved,
}: {
  trackers: ThreadTracker[];
  userEmail: string;
  isResolved?: boolean;
}) {
  const { data: threads } = useThreadsByIds({
    threadIds: trackers.map((t) => t.threadId),
  });

  if (!threads?.threads.length) {
    return (
      <div className="mt-2">
        <EmptyState message="No emails yet!" />
      </div>
    );
  }

  return (
    <Table>
      <TableBody>
        {threads?.threads.map((thread) => (
          <Row
            key={thread.id}
            message={thread.messages?.[thread.messages.length - 1]}
            userEmail={userEmail}
            isResolved={isResolved}
          />
        ))}
      </TableBody>
    </Table>
  );
}

function Row({
  message,
  userEmail,
  isResolved,
}: {
  message: ParsedMessage;
  userEmail: string;
  isResolved?: boolean;
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
            {isResolved ? (
              <UnresolveButton threadId={message.threadId} />
            ) : (
              <>
                <NudgeButton
                  threadId={message.threadId}
                  messageId={message.id}
                />
                <ResolveButton threadId={message.threadId} />
              </>
            )}
          </div>
        </div>
      </TableCell>
    </TableRow>
  );
}

function NudgeButton({
  threadId,
  messageId,
}: {
  threadId: string;
  messageId: string;
}) {
  const { showEmail } = useDisplayedEmail();

  return (
    <Button
      Icon={HandIcon}
      onClick={() => {
        showEmail({
          threadId,
          messageId,
          showReplyButton: true,
          autoOpenReplyForMessageId: messageId,
        });
      }}
    >
      Nudge
    </Button>
  );
}

function ResolveButton({ threadId }: { threadId: string }) {
  return (
    <Button
      variant="outline"
      Icon={CheckCircleIcon}
      onClick={async () => {
        const result = await resolveThreadTrackerAction({
          threadId,
          resolved: true,
        });

        if (isActionError(result)) {
          toastError({
            title: "Error",
            description: result.error,
          });
        } else {
          toastSuccess({
            title: "Success",
            description: "Resolved!",
          });
        }
      }}
    >
      Resolve
    </Button>
  );
}

function UnresolveButton({ threadId }: { threadId: string }) {
  return (
    <Button
      variant="outline"
      Icon={CheckCircleIcon}
      onClick={async () => {
        const result = await resolveThreadTrackerAction({
          threadId,
          resolved: false,
        });

        if (isActionError(result)) {
          toastError({
            title: "Error",
            description: result.error,
          });
        } else {
          toastSuccess({
            title: "Success",
            description: "Unresolved!",
          });
        }
      }}
    >
      Unresolve
    </Button>
  );
}

function EmptyState({ message }: { message: string }) {
  return (
    <div className="content-container">
      <div className="flex min-h-[200px] flex-col items-center justify-center rounded-md border border-dashed bg-slate-50 p-8 text-center animate-in fade-in-50">
        <p className="text-sm text-muted-foreground">{message}</p>
      </div>
    </div>
  );
}
