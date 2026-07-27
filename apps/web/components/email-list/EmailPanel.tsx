import { useCallback } from "react";
import { XIcon } from "lucide-react";
import { ActionButtons } from "@/components/ActionButtons";
import { Tooltip } from "@/components/Tooltip";
import type { Thread } from "@/components/email-list/types";
import { Button } from "@/components/ui/button";
import { PlanExplanation } from "@/components/email-list/PlanExplanation";
import { useIsInAiQueue } from "@/store/ai-queue";
import { EmailThread } from "@/components/email-list/EmailThread";
import { useAccount } from "@/providers/EmailAccountProvider";
import { MutedText } from "@/components/Typography";
import { LoadingContent } from "@/components/LoadingContent";
import { useThread } from "@/hooks/useThread";
import { getDisplayedMessage } from "@/utils/email/displayed-message";
import { useChat } from "@/providers/ChatProvider";
import { FixWithChat } from "@/app/(app)/[emailAccountId]/assistant/FixWithChat";

export function EmailPanel({
  row,
  folderType,
  onPlanAiAction,
  onArchive,
  advanceToAdjacentThread,
  close,
  refetch,
}: {
  row: Thread;
  folderType?: string;
  onPlanAiAction: (thread: Thread) => void;
  onArchive: (thread: Thread) => void;
  advanceToAdjacentThread: () => void;
  close: () => void;
  refetch: () => void;
}) {
  const { provider } = useAccount();
  const isPlanning = useIsInAiQueue(row.id);
  const { setInput } = useChat();

  // The list only carries message metadata; load the full thread (bodies,
  // attachments, drafts) when the panel opens.
  const {
    data,
    isLoading,
    error,
    mutate: mutateThread,
  } = useThread({ id: row.id }, { includeDrafts: true });

  // "This was filed wrong" flow: hand the email + what matched to the
  // assistant chat so the user can correct the rule/folder. Uses the
  // folder's lead message (in the inbox: the mail actually sitting there),
  // not blindly the thread's newest.
  const fullLastMessage = data?.thread
    ? getDisplayedMessage(data.thread, folderType)
    : undefined;
  const fixResults = row.plan?.rule
    ? [
        {
          rule: row.plan.rule,
          reason: row.plan.reason ?? undefined,
          status: row.plan.status,
          createdAt: new Date(row.plan.rule.createdAt),
        },
      ]
    : [];

  const refetchThread = useCallback(() => {
    mutateThread();
    refetch();
  }, [mutateThread, refetch]);

  const lastMessage =
    getDisplayedMessage(row, folderType) ??
    row.messages?.[row.messages.length - 1];

  const plan = row.plan;

  return (
    <div className="flex h-full min-w-0 flex-col overflow-y-hidden border-l border-border">
      <div className="sticky border-b border-border p-4 md:flex md:items-center md:justify-between">
        <div className="md:w-0 md:flex-1">
          <h1
            id="message-heading"
            className="text-lg font-medium text-foreground"
          >
            {lastMessage.headers.subject}
          </h1>
          <MutedText className="mt-1 truncate">
            {lastMessage.headers.from}
          </MutedText>
        </div>

        <div className="mt-3 flex items-center md:ml-2 md:mt-0">
          {fullLastMessage && (
            <div className="mr-1">
              <FixWithChat
                setInput={setInput}
                message={fullLastMessage}
                results={fixResults}
              />
            </div>
          )}
          <ActionButtons
            threadId={row.id!}
            isPlanning={isPlanning}
            onPlanAiAction={() => onPlanAiAction(row)}
            onArchive={() => {
              onArchive(row);
              advanceToAdjacentThread();
            }}
            refetch={refetch}
          />
          <Tooltip content="Close">
            <Button onClick={close} size="icon" variant="ghost">
              <span className="sr-only">Close</span>
              <XIcon className="h-4 w-4" aria-hidden="true" />
            </Button>
          </Tooltip>
        </div>
      </div>
      <div className="flex min-w-0 flex-1 flex-col overflow-y-auto">
        {plan?.rule && <PlanExplanation thread={row} provider={provider} />}
        <LoadingContent loading={isLoading} error={error}>
          {data && (
            <EmailThread
              key={row.id}
              messages={data.thread.messages}
              folderType={folderType}
              refetch={refetchThread}
              showReplyButton
            />
          )}
        </LoadingContent>
      </div>
    </div>
  );
}
