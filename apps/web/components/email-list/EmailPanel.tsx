import { useCallback, useState } from "react";
import { XIcon } from "lucide-react";
import { ActionButtons } from "@/components/ActionButtons";
import { Tooltip } from "@/components/Tooltip";
import type { Thread } from "@/components/email-list/types";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { PlanExplanation } from "@/components/email-list/PlanExplanation";
import { useIsInAiQueue } from "@/store/ai-queue";
import { EmailThread } from "@/components/email-list/EmailThread";
import { useAccount } from "@/providers/EmailAccountProvider";
import { MutedText } from "@/components/Typography";
import { LoadingContent } from "@/components/LoadingContent";
import { useThread } from "@/hooks/useThread";
import { useLabels } from "@/hooks/useLabels";
import { getDisplayedMessage } from "@/utils/email/displayed-message";
import { useChat } from "@/providers/ChatProvider";
import { FixWithChat } from "@/app/(app)/[emailAccountId]/assistant/FixWithChat";
import { runRulesAction } from "@/utils/actions/ai-rule";
import { ActionType } from "@/generated/prisma/enums";
import { toastError, toastSuccess } from "@/components/Toast";

export function EmailPanel({
  row,
  folderType,
  onArchive,
  advanceToAdjacentThread,
  close,
  refetch,
}: {
  row: Thread;
  folderType?: string;
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

  // Reprocessing the open email dry-runs first: when the AI's decision
  // differs from where the email currently sits, a dialog asks before
  // anything moves. Bulk/row processing stays the direct queue.
  const { emailAccountId } = useAccount();
  const { userLabels } = useLabels();
  const [checking, setChecking] = useState(false);
  const [applying, setApplying] = useState(false);
  const [proposal, setProposal] = useState<{
    ruleName: string | null;
    folderName: string | null;
  } | null>(null);

  const currentFolderNames = [
    ...new Set(
      (row.messages ?? [])
        .flatMap((message) => message.labelIds ?? [])
        .map((id) => userLabels.find((label) => label.id === id)?.name)
        .filter((name): name is string => !!name),
    ),
  ];

  const reprocess = async () => {
    setChecking(true);
    try {
      const result = await runRulesAction(emailAccountId, {
        messageId: lastMessage.id,
        threadId: row.id!,
        isTest: true,
        rerun: true,
      });
      if (result?.serverError || !result?.data) {
        toastError({
          description: result?.serverError ?? "Couldn't check this email",
        });
        return;
      }
      const matched = result.data.find((entry) => entry.rule);
      const labelItem = matched?.actionItems?.find(
        (item) => item.type === ActionType.LABEL,
      );
      const folderName =
        labelItem?.label ??
        (labelItem?.labelId
          ? (userLabels.find((label) => label.id === labelItem.labelId)?.name ??
            null)
          : null);

      if (folderName && currentFolderNames.includes(folderName)) {
        toastSuccess({
          description: `Already filed under ${folderName} — nothing to change.`,
        });
        return;
      }
      setProposal({
        ruleName: matched?.rule?.name ?? null,
        folderName,
      });
    } finally {
      setChecking(false);
    }
  };

  const applyProposal = async () => {
    setApplying(true);
    try {
      const result = await runRulesAction(emailAccountId, {
        messageId: lastMessage.id,
        threadId: row.id!,
        isTest: false,
        rerun: true,
      });
      if (result?.serverError) {
        toastError({ description: result.serverError });
        return;
      }
      toastSuccess({
        description: proposal?.folderName
          ? `Moved to ${proposal.folderName}`
          : "Cleaned up — returned to the inbox.",
      });
      setProposal(null);
      refetchThread();
    } finally {
      setApplying(false);
    }
  };

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
            isPlanning={isPlanning || checking}
            onPlanAiAction={reprocess}
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

      {proposal && (
        <Dialog open onOpenChange={(isOpen) => !isOpen && setProposal(null)}>
          <DialogContent className="sm:max-w-md">
            <DialogHeader>
              <DialogTitle>
                {proposal.folderName
                  ? `Move to ${proposal.folderName}?`
                  : "No rules match this email"}
              </DialogTitle>
              <DialogDescription>
                {proposal.folderName ? (
                  <>
                    The AI files this under{" "}
                    <span className="font-medium text-foreground">
                      {proposal.folderName}
                    </span>
                    {proposal.ruleName ? ` (rule: ${proposal.ruleName})` : ""}
                    {currentFolderNames.length
                      ? ` — it currently sits in ${currentFolderNames.join(", ")}.`
                      : "."}
                  </>
                ) : currentFolderNames.length ? (
                  <>
                    It currently sits in {currentFolderNames.join(", ")}.
                    Applying removes AI-applied folder labels and returns it to
                    the inbox.
                  </>
                ) : (
                  <>Nothing to move — no rule files this email anywhere.</>
                )}
              </DialogDescription>
            </DialogHeader>
            <DialogFooter>
              <Button variant="ghost" onClick={() => setProposal(null)}>
                Leave it
              </Button>
              <Button loading={applying} onClick={applyProposal}>
                {proposal.folderName
                  ? `Move to ${proposal.folderName}`
                  : "Return to inbox"}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      )}
    </div>
  );
}
