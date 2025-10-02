import { XIcon } from "lucide-react";
import { ActionButtons } from "@/components/ActionButtons";
import { Tooltip } from "@/components/Tooltip";
import type { Thread } from "@/components/email-list/types";
import { Button } from "@/components/ui/button";
import { PlanExplanation } from "@/components/email-list/PlanExplanation";
import { useIsInAiQueue } from "@/store/ai-queue";
import { EmailThread } from "@/components/email-list/EmailThread";
import { useAccount } from "@/providers/EmailAccountProvider";

export function EmailPanel({
  row,
  onPlanAiAction,
  onArchive,
  advanceToAdjacentThread,
  close,
  refetch,
}: {
  row: Thread;
  onPlanAiAction: (thread: Thread) => void;
  onArchive: (thread: Thread) => void;
  advanceToAdjacentThread: () => void;
  close: () => void;
  refetch: () => void;
}) {
  const { provider } = useAccount();
  const isPlanning = useIsInAiQueue(row.id);

  const lastMessage = row.messages?.[row.messages.length - 1];

  const plan = row.plan;

  return (
    <div className="flex h-full flex-col overflow-y-hidden border-l border-border">
      <div className="sticky border-b border-border p-4 md:flex md:items-center md:justify-between">
        <div className="md:w-0 md:flex-1">
          <h1
            id="message-heading"
            className="text-lg font-medium text-foreground"
          >
            {lastMessage.headers.subject}
          </h1>
          <p className="mt-1 truncate text-sm text-muted-foreground">
            {lastMessage.headers.from}
          </p>
        </div>

        <div className="mt-3 flex items-center md:ml-2 md:mt-0">
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
      <div className="flex flex-1 flex-col overflow-y-auto">
        {plan?.rule && <PlanExplanation thread={row} provider={provider} />}
        <EmailThread
          key={row.id}
          messages={row.messages}
          refetch={refetch}
          showReplyButton
        />
      </div>
    </div>
  );
}
