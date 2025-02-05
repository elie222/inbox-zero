"use client";

import { useState } from "react";
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
import { Loading } from "@/components/Loading";
import { TablePagination } from "@/components/TablePagination";
import {
  ResizableHandle,
  ResizablePanelGroup,
  ResizablePanel,
} from "@/components/ui/resizable";
import { ThreadContent } from "@/components/EmailViewer";

export function ReplyTrackerEmails({
  trackers,
  userEmail,
  type,
  isResolved,
  totalPages,
}: {
  trackers: ThreadTracker[];
  userEmail: string;
  type?: ThreadTrackerType;
  isResolved?: boolean;
  totalPages: number;
}) {
  const [selectedEmail, setSelectedEmail] = useState<{
    threadId: string;
    messageId: string;
  } | null>(null);

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

  const listView = (
    <>
      <Table>
        <TableBody>
          {data?.threads.map((thread) => (
            <Row
              key={thread.id}
              message={thread.messages?.[thread.messages.length - 1]}
              userEmail={userEmail}
              isResolved={isResolved}
              type={type}
              setSelectedEmail={setSelectedEmail}
            />
          ))}
        </TableBody>
      </Table>
      <TablePagination totalPages={totalPages} />
    </>
  );

  if (!selectedEmail) {
    return listView;
  }

  return (
    <ResizablePanelGroup direction="horizontal" className="h-full">
      <ResizablePanel defaultSize={40} minSize={35}>
        {listView}
      </ResizablePanel>
      <ResizableHandle withHandle />
      <ResizablePanel defaultSize={60} minSize={35} className="bg-slate-100">
        <ThreadContent
          threadId={selectedEmail.threadId}
          showReplyButton={true}
          autoOpenReplyForMessageId={selectedEmail.messageId}
          userEmail={userEmail}
        />
      </ResizablePanel>
    </ResizablePanelGroup>
  );
}

function Row({
  message,
  userEmail,
  isResolved,
  type,
  setSelectedEmail,
}: {
  message: ParsedMessage;
  userEmail: string;
  isResolved?: boolean;
  type?: ThreadTrackerType;
  setSelectedEmail: (email: { threadId: string; messageId: string }) => void;
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
            hideViewEmailButton
          />
          <div className="ml-4 flex items-center gap-1">
            {isResolved ? (
              <UnresolveButton threadId={message.threadId} />
            ) : (
              <>
                {!!type && (
                  <NudgeButton
                    type={type}
                    onClick={() => {
                      setSelectedEmail({
                        threadId: message.threadId,
                        messageId: message.id,
                      });
                    }}
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
  type,
  onClick,
}: {
  type: ThreadTrackerType;
  onClick: () => void;
}) {
  const showNudge = type === ThreadTrackerType.AWAITING;

  return (
    <Button Icon={showNudge ? HandIcon : MailIcon} onClick={onClick}>
      {showNudge ? "Nudge" : "Reply"}
    </Button>
  );
}

function ResolveButton({ threadId }: { threadId: string }) {
  const [isLoading, setIsLoading] = useState(false);

  return (
    <Button
      variant="outline"
      Icon={CheckCircleIcon}
      loading={isLoading}
      onClick={async () => {
        if (isLoading) return;
        setIsLoading(true);
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
        setIsLoading(false);
      }}
    >
      Resolve
    </Button>
  );
}

function UnresolveButton({ threadId }: { threadId: string }) {
  const [isLoading, setIsLoading] = useState(false);

  return (
    <Button
      variant="outline"
      Icon={CheckCircleIcon}
      loading={isLoading}
      onClick={async () => {
        if (isLoading) return;
        setIsLoading(true);
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
        setIsLoading(false);
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
