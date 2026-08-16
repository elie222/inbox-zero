"use client";

import type { ReactNode } from "react";
import { MailIcon } from "lucide-react";
import { ReaderToolbar } from "@/app/(app)/[emailAccountId]/mail/ReaderToolbar";
import type {
  ListThread,
  MailLayoutMode,
} from "@/app/(app)/[emailAccountId]/mail/types";
import { EmailThread } from "@/components/email-list/EmailThread";
import type { ThreadMessage } from "@/components/email-list/types";
import { getEmailMessageCellLabels } from "@/components/EmailMessageCellLabels";
import type { EmailLabels } from "@/providers/email-label-types";
import {
  extractEmailAddress,
  extractNameFromEmail,
  participant,
} from "@/utils/email";

export type ThreadReaderProps = {
  /** The row that is open. `null` renders the empty state. */
  thread: ListThread | null;
  /**
   * The open thread's full messages. The list payload has no bodies, so this
   * arrives from a second fetch; the header renders before it lands.
   */
  messages: ThreadMessage[];
  userEmail: string;
  userLabels: EmailLabels;
  layout: MailLayoutMode;
  isFocusMode: boolean;
  /** 1-based position of the open thread in the list. */
  position?: { index: number; total: number };
  labelHref: (labelId: string) => string;
  onRemoveLabel?: (labelId: string) => void;
  onBack: () => void;
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
  messages,
  userEmail,
  userLabels,
  layout,
  isFocusMode,
  position,
  labelHref,
  onRemoveLabel,
  onBack,
  onArchive,
  onReply,
  onDelete,
  onToggleFocusMode,
  showSidebarToggle = false,
  refetch,
  autoOpenReplyForMessageId,
  menu,
}: ThreadReaderProps) {
  const headerMessage = thread?.messages.at(-1);

  if (!thread || !headerMessage) {
    return (
      <div className="flex h-full flex-col items-center justify-center gap-2 px-6 py-16 text-center">
        <MailIcon className="size-6 text-muted-foreground" />
        <div className="text-foreground text-sm">Nothing selected</div>
        <div className="text-muted-foreground text-xs">
          Pick another view, or head back to the inbox.
        </div>
      </div>
    );
  }

  const sender = participant(headerMessage, userEmail);
  const labels =
    getEmailMessageCellLabels({
      labelIds: headerMessage.labelIds,
      userLabels,
    }) ?? [];

  return (
    // White, unlike the list: the reader is its own surface, and it has to
    // match `EmailThread` below or the toolbar reads as a separate band.
    <div className="min-h-0 min-w-0 flex-1 overflow-y-auto bg-card">
      <div className={readerMeasure({ layout, isFocusMode })}>
        <ReaderToolbar
          isFocusMode={isFocusMode}
          labelHref={labelHref}
          labels={labels}
          layout={layout}
          menu={menu}
          onArchive={onArchive}
          onBack={onBack}
          onDelete={onDelete}
          onRemoveLabel={onRemoveLabel}
          onReply={onReply}
          onToggleFocusMode={onToggleFocusMode}
          position={position}
          senderEmail={extractEmailAddress(sender)}
          senderName={extractNameFromEmail(sender)}
          showSidebarToggle={showSidebarToggle}
          subject={headerMessage.headers.subject}
        />

        {messages.length > 0 ? (
          <EmailThread
            autoOpenReplyForMessageId={autoOpenReplyForMessageId}
            key={thread.id}
            messages={messages}
            refetch={refetch}
            showReplyButton
          />
        ) : null}
      </div>
    </div>
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
  // ~860px: the mock's measure, and about as wide as an email body stays legible.
  if (isFocusMode) return "mx-auto w-full max-w-[54rem] px-10 py-10";
  if (layout === "split") return "px-6 py-5";
  return "mx-auto w-full max-w-[54rem] px-6 py-5";
}
