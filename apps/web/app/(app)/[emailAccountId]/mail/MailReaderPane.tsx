"use client";

import { type ComponentProps, memo, useCallback } from "react";
import { BufferedThreadReader } from "@/app/(app)/[emailAccountId]/mail/BufferedThreadReader";
import { MailPanelErrorBoundary } from "@/app/(app)/[emailAccountId]/mail/MailPanelErrorBoundary";
import { MessageActionsMenu } from "@/app/(app)/[emailAccountId]/mail/MessageActionsMenu";
import { ThreadActionsMenu } from "@/app/(app)/[emailAccountId]/mail/ThreadActionsMenu";
import {
  ThreadReader,
  type ThreadReaderProps,
} from "@/app/(app)/[emailAccountId]/mail/ThreadReader";
import type { ThreadSelection } from "@/app/(app)/[emailAccountId]/mail/types";
import type { ThreadMessage } from "@/components/email-list/types";
import { useThreadPlans } from "@/hooks/useThreadPlans";
import { EmailAccountScopeProvider } from "@/providers/EmailAccountProvider";

const NO_PLANS: never[] = [];

type ReaderEmailAccount = ComponentProps<
  typeof EmailAccountScopeProvider
>["emailAccount"];

/**
 * The open conversation. Memoized so list snapshots, selection, and other
 * screen state only re-render it when something it shows has changed.
 */
export const MailReaderPane = memo(function MailReaderPane({
  readerEmailAccount,
  readerKey,
  planSelection,
  dataReady,
  onReady,
  onClose,
  showFixWithChat,
  lastMessage,
  isStarred,
  onToggleStar,
  onMarkSpam,
  onDelete,
  onLabel,
  onMove,
  isMenuOpen,
  onMenuOpenChange,
  ...readerProps
}: Omit<ThreadReaderProps, "onBackToInbox" | "menu" | "renderMessageMenu"> & {
  /** Undefined while the account owning the open thread is still loading. */
  readerEmailAccount: ReaderEmailAccount;
  /** The open thread, or null for the empty reader. */
  readerKey: string | null;
  /** The settled selection whose matched rules the message menus show. */
  planSelection: ThreadSelection | null;
  dataReady: boolean;
  onReady: (threadKey: string) => void;
  onClose: () => void;
  showFixWithChat: boolean;
  lastMessage: ThreadMessage | null;
  isStarred: boolean;
  onToggleStar: () => void;
  onMarkSpam: () => void;
  onDelete: () => void;
  onLabel?: () => void;
  onMove?: () => void;
  isMenuOpen: boolean;
  onMenuOpenChange: (open: boolean) => void;
}) {
  const { data: planData } = useThreadPlans({
    threadId: planSelection?.threadId,
    emailAccountId: planSelection?.emailAccountId,
  });
  const plans = planData?.plans ?? NO_PLANS;
  const renderMessageMenu = useCallback(
    (message: ThreadMessage) => (
      <MessageActionsMenu
        message={message}
        plans={plans}
        showFixWithChat={showFixWithChat}
      />
    ),
    [plans, showFixWithChat],
  );

  if (readerKey && !readerEmailAccount) {
    return (
      <div
        aria-label="Loading"
        className="flex min-h-0 min-w-0 flex-1 items-center justify-center text-muted-foreground text-sm"
        role="status"
      >
        Loading…
      </div>
    );
  }

  return (
    <MailPanelErrorBoundary
      resetKey={readerKey ?? "empty"}
      title="Unable to show this conversation"
      onBack={onClose}
    >
      <EmailAccountScopeProvider emailAccount={readerEmailAccount}>
        <BufferedThreadReader
          key={readerEmailAccount?.id ?? "empty"}
          threadKey={readerKey ?? "empty"}
          dataReady={dataReady}
          onReady={onReady}
        >
          <ThreadReader
            {...readerProps}
            onBackToInbox={onClose}
            renderMessageMenu={renderMessageMenu}
            menu={
              <ThreadActionsMenu
                message={lastMessage}
                isStarred={isStarred}
                onToggleStar={onToggleStar}
                onMarkSpam={onMarkSpam}
                onDelete={onDelete}
                onLabel={onLabel}
                onMove={onMove}
                open={isMenuOpen}
                onOpenChange={onMenuOpenChange}
              />
            }
          />
        </BufferedThreadReader>
      </EmailAccountScopeProvider>
    </MailPanelErrorBoundary>
  );
});
