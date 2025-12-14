import { XIcon } from "lucide-react";
import { ActionButtons } from "@/components/ActionButtons";
import { Tooltip } from "@/components/Tooltip";
import type { Thread } from "@/components/email-list/types";
import { Button } from "@/components/ui/button";
import { PlanExplanation } from "@/components/email-list/PlanExplanation";
import { useIsInAiQueue } from "@/store/ai-queue";
import { EmailThread } from "@/components/email-list/EmailThread";
import { useAccount } from "@/providers/EmailAccountProvider";
import { BimiAvatar } from "@/components/ui/bimi-avatar";
import { participant, extractNameFromEmail } from "@/utils/email";

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
  const { provider, emailAccount } = useAccount();
  const isPlanning = useIsInAiQueue(row.id);

  const lastMessage = row.messages?.[row.messages.length - 1];
  const plan = row.plan;

  // Get sender info for header avatar
  const senderEmail = participant(lastMessage, emailAccount?.email || "");
  const senderName = extractNameFromEmail(senderEmail);

  return (
    <div className="flex h-full flex-col overflow-hidden border-l border-border/50 bg-background">
      {/* Header with glassmorphism effect */}
      <div className="sticky top-0 z-10 border-b border-border/50 bg-background/80 backdrop-blur-sm p-4 md:flex md:items-center md:justify-between">
        <div className="flex items-center gap-3 md:w-0 md:flex-1 min-w-0">
          <BimiAvatar
            email={senderEmail}
            name={senderName}
            size="lg"
            className="flex-shrink-0"
          />
          <div className="min-w-0 flex-1">
            <h1
              id="message-heading"
              className="text-lg font-semibold text-foreground truncate"
            >
              {lastMessage.headers.subject}
            </h1>
            <p className="mt-0.5 truncate text-sm text-muted-foreground">
              {senderName}
              <span className="mx-1.5 text-muted-foreground/50">•</span>
              <span className="text-muted-foreground/70">{senderEmail}</span>
            </p>
          </div>
        </div>

        <div className="mt-3 flex items-center gap-1 md:ml-2 md:mt-0 flex-shrink-0">
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
            <Button
              onClick={close}
              size="icon"
              variant="ghost"
              className="hover:bg-accent"
            >
              <span className="sr-only">Close</span>
              <XIcon className="h-4 w-4" aria-hidden="true" />
            </Button>
          </Tooltip>
        </div>
      </div>

      {/* Thread content with custom scrollbar */}
      <div className="flex flex-1 flex-col overflow-y-auto overflow-x-hidden style-scrollbar">
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
