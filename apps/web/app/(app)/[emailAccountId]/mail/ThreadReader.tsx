"use client";

import {
  useCallback,
  useState,
  type ComponentProps,
  type ReactNode,
} from "react";
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
import type { EmailLabels } from "@/providers/email-label-types";
import { extractEmailAddress, extractNameFromEmail } from "@/utils/email";

const SenderContextPanel = dynamic(
  () =>
    import("@/app/(app)/[emailAccountId]/mail/SenderContextPanel").then(
      (module) => module.SenderContextPanel,
    ),
  { ssr: false },
);

/**
 * Below this the reader would be squeezed too far by a pane beside it, so the
 * sender profile slides over the reader instead.
 */
const INLINE_SENDER_CONTEXT_MIN_WIDTH = 880;

export type ThreadReaderProps = {
  enableMessageNavigation: boolean;
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
  labelHref: (labelId: string) => string;
  onRemoveLabel?: (labelId: string) => void;
  onBackToInbox: () => void;
  onArchive: () => void;
  showSidebarToggle?: boolean;
  /** Refreshes the open thread after a reply is sent or a draft changes. */
  refetch: () => void;
  /** Opens a different provider thread when a sent message starts one. */
  onSendSuccess?: (messageId: string, threadId: string) => void;
  /**
   * Set by the reply action. Left unset the composer still opens on its own for
   * a message that already has an AI draft.
   */
  autoOpenReplyForMessageId?: string;
  /** The ⋯ dropdown, i.e. `ThreadActionsMenu`, composed by the shell. */
  menu?: ReactNode;
};

export function ThreadReader({
  enableMessageNavigation,
  thread,
  threadId,
  detailSelectionSettled,
  loading,
  error,
  messages,
  userLabels,
  layout,
  labelHref,
  onRemoveLabel,
  onBackToInbox,
  onArchive,
  showSidebarToggle = false,
  refetch,
  onSendSuccess,
  autoOpenReplyForMessageId,
  menu,
}: ThreadReaderProps) {
  const [senderContext, setSenderContext] = useState<{
    messageId: string;
    senderEmail: string;
    senderName: string;
  } | null>(null);
  const [readerRef, readerWidth] = useElementWidth();
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

  /** No list column beside us, so the reader carries the sidebar toggle. */
  const ownsFullWidth = layout === "list" && showSidebarToggle;

  const renderToolbar = (
    messageExpansion?: ComponentProps<typeof ReaderToolbar>["messageExpansion"],
  ) => (
    <ReaderToolbar
      messageExpansion={messageExpansion}
      labelHref={labelHref}
      labels={labels}
      menu={menu}
      onArchive={onArchive}
      onBackToInbox={onBackToInbox}
      onRemoveLabel={onRemoveLabel}
      showSidebarToggle={ownsFullWidth}
      subject={headerMessage.headers.subject}
    />
  );

  return (
    <div className="flex min-h-0 min-w-0 flex-1" ref={readerRef}>
      {/* White, unlike the list: the reader is its own surface, and it has to
      match `EmailThread` below or the toolbar reads as a separate band. */}
      <div
        className="min-h-0 min-w-0 flex-1 overflow-y-auto bg-card"
        data-detail-selection-settled={detailSelectionSettled}
        data-testid="thread-reader"
      >
        <div
          className={readerMeasure({ layout })}
          data-desktop-mac-titlebar-spacer={ownsFullWidth || undefined}
        >
          {messages.length > 0 ? (
            <EmailThread
              renderToolbar={renderToolbar}
              enableMessageNavigation={enableMessageNavigation}
              autoOpenReplyForMessageId={autoOpenReplyForMessageId}
              key={threadId}
              messages={messages}
              onMarkDone={onArchive}
              onOpenSenderContext={(message) => {
                const senderEmail = extractEmailAddress(message.headers.from);
                setSenderContext({
                  messageId: message.id,
                  senderEmail,
                  senderName:
                    extractNameFromEmail(message.headers.from) || senderEmail,
                });
              }}
              refetch={refetch}
              onSendSuccess={onSendSuccess}
              showReplyButton
            />
          ) : (
            renderToolbar()
          )}
        </div>
      </div>

      {senderContext ? (
        <SenderContextPanel
          messageId={senderContext.messageId}
          onClose={() => setSenderContext(null)}
          senderEmail={senderContext.senderEmail}
          senderName={senderContext.senderName}
          variant={
            readerWidth >= INLINE_SENDER_CONTEXT_MIN_WIDTH ? "inline" : "sheet"
          }
        />
      ) : null}
    </div>
  );
}

/**
 * A callback ref rather than an effect: the reader mounts its measured element
 * only once a thread is open, after the loading branch has come and gone.
 */
function useElementWidth() {
  const [width, setWidth] = useState(0);
  const ref = useCallback((element: HTMLElement | null) => {
    if (!element) return;
    const observer = new ResizeObserver(([entry]) => {
      setWidth(entry.contentRect.width);
    });
    observer.observe(element);
    return () => observer.disconnect();
  }, []);

  return [ref, width] as const;
}

/** A readable measure, centred whenever the reader owns the full width. */
function readerMeasure({ layout }: { layout: MailLayoutMode }) {
  if (layout === "split") return "px-2 pt-4 pb-5 sm:px-6 sm:pt-5";
  return "mx-auto w-full max-w-[48rem] px-2 pt-4 pb-5 sm:px-6 sm:pt-5";
}
