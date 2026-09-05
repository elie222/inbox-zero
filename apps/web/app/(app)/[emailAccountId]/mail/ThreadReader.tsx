"use client";

import { useState, type ComponentProps, type ReactNode } from "react";
import dynamic from "next/dynamic";
import { Loader2Icon, MailIcon } from "lucide-react";
import { ReaderToolbar } from "@/app/(app)/[emailAccountId]/mail/ReaderToolbar";
import type {
  ListThread,
  MailLayoutMode,
} from "@/app/(app)/[emailAccountId]/mail/types";
import { EmailThread } from "@/components/email-list/EmailThread";
import type { ThreadMessage } from "@/components/email-list/types";
import { getEmailMessageCellLabels } from "@/components/EmailMessageCellLabels";
import { LoadingContent } from "@/components/LoadingContent";
import { SidebarTrigger } from "@/components/ui/sidebar";
import type { EmailLabels } from "@/providers/email-label-types";
import { extractEmailAddress, extractNameFromEmail } from "@/utils/email";

const SenderContextSheet = dynamic(
  () =>
    import("@/app/(app)/[emailAccountId]/mail/SenderContextSheet").then(
      (module) => module.SenderContextSheet,
    ),
  { ssr: false },
);

export type ThreadReaderProps = {
  /** The row that is open. It may lag behind the selected thread while loading. */
  thread: ListThread | null;
  /** The selected thread, including while its row and messages are loading. */
  threadId: string | null;
  /** Whether the deferred detail selection has caught up to the open row. */
  detailSelectionSettled: boolean;
  loading: boolean;
  error?: ComponentProps<typeof LoadingContent>["error"];
  /**
   * The open thread's full messages. The list payload has no bodies, so this
   * arrives from a second fetch; the header renders before it lands.
   */
  messages: ThreadMessage[];
  userLabels: EmailLabels;
  layout: MailLayoutMode;
  isFocusMode: boolean;
  labelHref: (labelId: string) => string;
  onRemoveLabel?: (labelId: string) => void;
  onBackToInbox: () => void;
  onArchive: () => void;
  onReply: () => void;
  onDelete: () => void;
  onToggleFocusMode: () => void;
  showSidebarToggle?: boolean;
  /** Refreshes the open thread after a reply is sent or a draft changes. */
  refetch: () => void;
  /**
   * Set by the reply action. Left unset the composer still opens on its own for
   * a message that already has an AI draft.
   */
  autoOpenReplyForMessageId?: string;
  /** The ⋯ dropdown, i.e. `ThreadActionsMenu`, composed by the shell. */
  menu?: ReactNode;
};

export function ThreadReader({
  thread,
  threadId,
  detailSelectionSettled,
  loading,
  error,
  messages,
  userLabels,
  layout,
  isFocusMode,
  labelHref,
  onRemoveLabel,
  onBackToInbox,
  onArchive,
  onReply,
  onDelete,
  onToggleFocusMode,
  showSidebarToggle = false,
  refetch,
  autoOpenReplyForMessageId,
  menu,
}: ThreadReaderProps) {
  const [senderContext, setSenderContext] = useState<{
    messageId: string;
    senderEmail: string;
    senderName: string;
    open: boolean;
  } | null>(null);
  const headerMessage = thread?.messages.at(-1) ?? messages.at(-1);

  if (error || !headerMessage) {
    return (
      <div
        className="flex min-h-0 min-w-0 flex-1 flex-col items-center justify-center gap-2 px-6 py-16 text-center"
        data-detail-selection-settled={detailSelectionSettled}
        data-testid="thread-reader"
      >
        <LoadingContent
          error={error}
          loading={loading}
          loadingComponent={
            <Loader2Icon
              aria-label="Loading email"
              className="size-6 animate-spin text-muted-foreground"
            />
          }
        >
          <MailIcon className="size-6 text-muted-foreground" />
          <div className="text-foreground text-sm">Nothing selected</div>
          <div className="text-muted-foreground text-xs">
            Pick another view, or head back to the inbox.
          </div>
        </LoadingContent>
      </div>
    );
  }

  const labels =
    getEmailMessageCellLabels({
      labelIds: headerMessage.labelIds,
      userLabels,
    }) ?? [];

  return (
    <>
      {/* White, unlike the list: the reader is its own surface, and it has to
      match `EmailThread` below or the toolbar reads as a separate band. */}
      <div
        className="min-h-0 min-w-0 flex-1 overflow-y-auto bg-card"
        data-detail-selection-settled={detailSelectionSettled}
        data-testid="thread-reader"
      >
        {layout === "list" && !isFocusMode && showSidebarToggle ? (
          <div
            className="hidden px-3 py-3 lg:flex"
            data-desktop-mac-titlebar-spacer
          >
            <SidebarTrigger name="left-sidebar" />
          </div>
        ) : null}

        <div className={readerMeasure({ layout, isFocusMode })}>
          <ReaderToolbar
            isFocusMode={isFocusMode}
            labelHref={labelHref}
            labels={labels}
            menu={menu}
            onArchive={onArchive}
            onBackToInbox={onBackToInbox}
            onDelete={onDelete}
            onRemoveLabel={onRemoveLabel}
            onReply={onReply}
            onToggleFocusMode={onToggleFocusMode}
            subject={headerMessage.headers.subject}
          />

          {messages.length > 0 ? (
            <EmailThread
              autoOpenReplyForMessageId={autoOpenReplyForMessageId}
              key={threadId}
              messages={messages}
              onOpenSenderContext={(message) => {
                const senderEmail = extractEmailAddress(message.headers.from);
                setSenderContext({
                  messageId: message.id,
                  senderEmail,
                  senderName:
                    extractNameFromEmail(message.headers.from) || senderEmail,
                  open: true,
                });
              }}
              refetch={refetch}
              showReplyButton
            />
          ) : null}
        </div>
      </div>

      {senderContext ? (
        <SenderContextSheet
          messageId={senderContext.messageId}
          onOpenChange={(open: boolean) =>
            setSenderContext((current) =>
              current ? { ...current, open } : current,
            )
          }
          open={senderContext.open}
          senderEmail={senderContext.senderEmail}
          senderName={senderContext.senderName}
        />
      ) : null}
    </>
  );
}

/** A readable measure, centred whenever the reader owns the full width. */
function readerMeasure({
  layout,
  isFocusMode,
}: {
  layout: MailLayoutMode;
  isFocusMode: boolean;
}) {
  // Keep the reading measure consistent between full-width and focus views.
  if (isFocusMode)
    return "mx-auto w-full max-w-[48rem] px-4 py-6 sm:px-10 sm:py-10";
  if (layout === "split") return "px-4 pt-6 pb-5 sm:px-6 sm:pt-8";
  return "mx-auto w-full max-w-[48rem] px-4 pt-6 pb-5 sm:px-6 sm:pt-8";
}
