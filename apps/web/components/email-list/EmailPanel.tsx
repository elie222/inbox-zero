import { useCallback, useMemo, useState } from "react";
import { XIcon } from "lucide-react";
import { ActionButtons } from "@/components/ActionButtons";
import { Tooltip } from "@/components/Tooltip";
import type { Thread } from "@/components/email-list/types";
import { Button } from "@/components/ui/button";
import { PlanExplanation } from "@/components/email-list/PlanExplanation";
import { ReprocessEmailDialog } from "@/components/email-list/ReprocessEmailDialog";
import { useIsInAiQueue } from "@/store/ai-queue";
import { EmailThread } from "@/components/email-list/EmailThread";
import { useAccount } from "@/providers/EmailAccountProvider";
import { MutedText } from "@/components/Typography";
import { LoadingContent } from "@/components/LoadingContent";
import { useThread } from "@/hooks/useThread";
import { getDisplayedMessage } from "@/utils/email/displayed-message";
import { useChat } from "@/providers/ChatProvider";
import { FixWithChat } from "@/app/(app)/[emailAccountId]/assistant/FixWithChat";
import { SenderAvatar } from "@/components/email-list/SenderAvatar";
import { useContactPeek } from "@/components/email-list/contact-peek-context";
import {
  extractEmailAddress,
  extractNameFromEmail,
  isSameEmailAddress,
  normalizeEmailAddress,
  splitRecipientList,
} from "@/utils/email";
import type { ParsedMessage } from "@/utils/types";

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

  // Reprocessing the open email goes through the shared ask-before-move
  // dialog (dry-run, then confirm)
  const [reprocessOpen, setReprocessOpen] = useState(false);

  return (
    // The hosting sheet is full-bleed on phones, so the panel itself keeps
    // its header out from under the status bar and its tail clear of the
    // home indicator
    <div className="flex h-full min-w-0 flex-col overflow-y-hidden pt-[env(safe-area-inset-top,0px)]">
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
            onPlanAiAction={() => setReprocessOpen(true)}
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
      <div className="flex min-w-0 flex-1 flex-col overflow-y-auto pb-[env(safe-area-inset-bottom,0px)]">
        {plan?.rule && <PlanExplanation thread={row} provider={provider} />}
        <LoadingContent loading={isLoading} error={error}>
          {data && (
            <>
              <EmailThread
                key={row.id}
                messages={data.thread.messages}
                folderType={folderType}
                refetch={refetchThread}
                showReplyButton
              />
              <ThreadParticipants messages={data.thread.messages} />
            </>
          )}
        </LoadingContent>
      </div>

      {reprocessOpen && (
        <ReprocessEmailDialog
          thread={row}
          folderType={folderType}
          onClose={() => setReprocessOpen(false)}
          refetch={refetchThread}
        />
      )}
    </div>
  );
}

// Everyone on the conversation in one place — senders, then direct
// recipients, then cc — each row opening their contact sheet. Reading it off
// the loaded thread means late replies and cc'd colleagues show up too.
function ThreadParticipants({ messages }: { messages: ParsedMessage[] }) {
  const openContactPeek = useContactPeek();
  const { userEmail } = useAccount();

  const participants = useMemo(() => {
    const byAddress = new Map<
      string,
      { email: string; name: string; role: string }
    >();

    const collect = (header: string | undefined, role: string) => {
      for (const recipient of splitRecipientList(header ?? "")) {
        const email = extractEmailAddress(recipient);
        if (!email) continue;
        // Someone who both sent and received keeps the first (strongest) role
        const key = normalizeEmailAddress(email);
        if (byAddress.has(key)) continue;
        byAddress.set(key, {
          email,
          name: extractNameFromEmail(recipient) || email,
          role,
        });
      }
    };

    for (const message of messages) collect(message.headers.from, "From");
    for (const message of messages) collect(message.headers.to, "To");
    for (const message of messages) collect(message.headers.cc, "Cc");

    return [...byAddress.values()];
  }, [messages]);

  // A two-person exchange is already obvious from the message headers
  if (participants.length < 3) return null;

  return (
    <div className="mx-4 mb-4 rounded-[10px] border border-border bg-card p-3">
      <h3 className="mb-2 text-[10.5px] font-semibold uppercase tracking-[0.14em] text-muted-foreground/80">
        People on this email
      </h3>
      <div className="flex flex-col">
        {participants.map((participant) => {
          const isYou = isSameEmailAddress(participant.email, userEmail);

          return (
            <button
              key={participant.email}
              type="button"
              disabled={!openContactPeek}
              className="-mx-2 flex items-center gap-2.5 rounded-[7px] px-2 py-1.5 text-left enabled:hover:bg-muted/60"
              onClick={() => openContactPeek?.(participant.email)}
            >
              <SenderAvatar
                name={participant.name}
                className="size-[26px] text-[10.5px]"
              />
              <span className="min-w-0 flex-1 truncate text-[13px]">
                <span className="font-medium">
                  {isYou ? "You" : participant.name}
                </span>
                <span className="text-muted-foreground">
                  {" "}
                  · {participant.email}
                </span>
              </span>
              <span className="shrink-0 text-[11px] font-medium uppercase tracking-[0.08em] text-muted-foreground">
                {participant.role}
              </span>
            </button>
          );
        })}
      </div>
    </div>
  );
}
