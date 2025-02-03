"use client";

import type { ParsedMessage } from "@/utils/types";
import { type ThreadTracker, ThreadTrackerType } from "@prisma/client";
import { Table, TableBody, TableCell, TableRow } from "@/components/ui/table";
import { EmailMessageCell } from "@/components/EmailMessageCell";
import { Button } from "@/components/ui/button";
import { CheckCircleIcon, HandIcon, MailIcon } from "lucide-react";
import { useThreadsByIds } from "@/hooks/useThreadsByIds";
import { resolveThreadTrackerAction } from "@/utils/actions/reply-tracking";
import { isActionError } from "@/utils/error";
import { toastError, toastSuccess } from "@/components/Toast";
import { useDisplayedEmail } from "@/hooks/useDisplayedEmail";
import { Loading } from "@/components/Loading";

export function ReplyTrackerEmails({
  trackers,
  userEmail,
  type,
  isResolved,
}: {
  trackers: ThreadTracker[];
  userEmail: string;
  type?: ThreadTrackerType;
  isResolved?: boolean;
}) {
  const { data, isLoading } = useThreadsByIds({
    threadIds: trackers.map((t) => t.threadId),
  });

  if (isLoading && !data) {
    return <Loading />;
  }

  if (!data?.threads.length) {
    return (
      <div className="mt-2">
        <EmptyState message="No emails yet!" />
      </div>
    );
  }

  return (
    <Table>
      <TableBody>
        {data?.threads.map((thread) => (
          <Row
            key={thread.id}
            message={thread.messages?.[thread.messages.length - 1]}
            userEmail={userEmail}
            isResolved={isResolved}
            type={type}
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
  type,
}: {
  message: ParsedMessage;
  userEmail: string;
  isResolved?: boolean;
  type?: ThreadTrackerType;
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
                {!!type && (
                  <NudgeButton
                    threadId={message.threadId}
                    messageId={message.id}
                    type={type}
                  />
                )}
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
  type,
}: {
  threadId: string;
  messageId: string;
  type: ThreadTrackerType;
}) {
  const { showEmail } = useDisplayedEmail();

  const showNudge = type === ThreadTrackerType.AWAITING;

  return (
    <Button
      Icon={showNudge ? HandIcon : MailIcon}
      onClick={() => {
        showEmail({
          threadId,
          messageId,
          showReplyButton: true,
          autoOpenReplyForMessageId: messageId,
        });
      }}
    >
      {showNudge ? "Nudge" : "Reply"}
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
