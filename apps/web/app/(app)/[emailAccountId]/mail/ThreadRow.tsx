"use client";

import { memo, useMemo, type Ref } from "react";
import { CopyIcon, PaperclipIcon } from "lucide-react";
import { MailThreadRow } from "@inboxzero/mail-ui/MailThreadRow";
import { isThreadStarred } from "@/app/(app)/[emailAccountId]/mail/star-state";
import { MailLabelChip } from "@/app/(app)/[emailAccountId]/mail/MailLabelChip";
import { isThreadUnread } from "@/app/(app)/[emailAccountId]/mail/read-state";
import { getThreadParticipantNames } from "@/app/(app)/[emailAccountId]/mail/thread-participants";
import type {
  ListThread,
  MailLayoutMode,
} from "@/app/(app)/[emailAccountId]/mail/types";
import { SentMessageOpenStatus } from "@/components/email-list/SentMessageOpenStatus";
import { getEmailThreadLabels } from "@/components/EmailMessageCellLabels";
import { toastError, toastSuccess } from "@/components/Toast";
import { Tooltip } from "@/components/Tooltip";
import { Checkbox } from "@/components/ui/checkbox";
import { mailCheckboxClassName } from "@/app/(app)/[emailAccountId]/mail/SelectAllCheckbox";
import {
  Avatar,
  AvatarFallbackColor,
  AvatarImage,
} from "@/components/ui/avatar";
import type { EmailLabels } from "@/providers/email-label-types";
import { cn } from "@/utils";
import { formatShortDate, internalDateToDate } from "@/utils/date";
import { decodeSnippet } from "@/utils/gmail/decode";
import { GmailLabel } from "@/utils/gmail/label";
import { getConversationSubject } from "@/utils/email/subject";
import { extractOtpCode, isOtpSubject } from "@/utils/otp";
import { getRuleLabel } from "@/utils/rule/consts";
import { SystemType } from "@/generated/prisma/enums";

const OTP_LABEL = getRuleLabel(SystemType.OTP).toLowerCase();

export type ThreadRowProps = {
  thread: ListThread;
  /** Position in the rendered list — selection and focus are index-addressed. */
  index: number;
  layout: MailLayoutMode;
  userEmail: string;
  userLabels: EmailLabels;
  isFocused: boolean;
  isSelected: boolean;
  /** Keeps every checkbox visible once the list has a selection. */
  hasAnySelection: boolean;
  compact?: boolean;
  /** Wraps the snippet onto its own line so more of it is readable. */
  expandedPreview?: boolean;
  selectionEnabled?: boolean;
  onOpen: (index: number) => void;
  onToggleSelect: (index: number) => void;
  onSelectRangeTo: (index: number) => void;
  rowRef?: Ref<HTMLDivElement>;
  sentMessageOpen?: {
    firstOpenedAt: string | null;
    lastOpenedAt: string | null;
    openCount: number;
  };
};

export const ThreadRow = memo(function ThreadRow({
  thread,
  index,
  layout,
  userEmail,
  userLabels,
  isFocused,
  isSelected,
  hasAnySelection,
  compact = false,
  expandedPreview = false,
  selectionEnabled = true,
  onOpen,
  onToggleSelect,
  onSelectRangeTo,
  rowRef,
  sentMessageOpen,
}: ThreadRowProps) {
  const message = thread.messages.at(-1);
  const labels = useMemo(
    () =>
      getEmailThreadLabels({
        messages: thread.messages,
        userLabels,
      }),
    [thread.messages, userLabels],
  );
  const account = "account" in thread ? thread.account : null;
  const accountEmail = account?.email ?? userEmail;
  const participantSummary = useMemo(
    () =>
      getThreadParticipantNames(
        [...(thread.participantMessages ?? []), ...thread.messages],
        accountEmail,
      ).join(", "),
    [thread.messages, thread.participantMessages, accountEmail],
  );

  if (!message) return null;

  const chips = labels.slice(0, layout === "list" && !compact ? 3 : 2);
  const isDraft = thread.messages.some((message) =>
    message.labelIds?.includes(GmailLabel.DRAFT),
  );
  const hasAttachment = thread.messages.some(
    (message) => message.hasAttachment,
  );
  const snippet = decodeSnippet(thread.snippet || message.snippet);
  const isOtp =
    labels.some((label) => label.name.toLowerCase() === OTP_LABEL) ||
    isOtpSubject(message.subject);
  const otpCode = isOtp ? extractOtpCode([message.subject, snippet]) : null;

  return (
    <MailThreadRow
      accountAvatar={account ? <AccountAvatar account={account} /> : null}
      compact={compact}
      date={
        <div className="flex items-center justify-end gap-1.5">
          {hasAttachment ? (
            <>
              <PaperclipIcon
                aria-hidden
                className="size-3.5 shrink-0 text-muted-foreground"
              />
              <span className="sr-only">Has attachment</span>
            </>
          ) : null}
          {sentMessageOpen ? (
            <SentMessageOpenStatus compact open={sentMessageOpen} />
          ) : null}
          <span className="text-muted-foreground text-xs">
            {formatShortDate(internalDateToDate(message.internalDate), {
              lowercase: true,
            })}
          </span>
        </div>
      }
      expandedPreview={expandedPreview}
      hasAnySelection={hasAnySelection}
      index={index}
      isDraft={isDraft}
      isFocused={isFocused}
      isSelected={isSelected}
      isStarred={isThreadStarred(thread.messages)}
      isUnread={isThreadUnread(thread.messages)}
      labels={[
        ...chips.map((label) => (
          <MailLabelChip color={label.color} key={label.id} name={label.name} />
        )),
        ...(otpCode ? [<OtpCodeButton code={otpCode} key="otp-code" />] : []),
      ]}
      layout={layout}
      messageCount={thread.messages.length}
      onOpen={onOpen}
      onSelectRangeTo={onSelectRangeTo}
      onToggleSelect={onToggleSelect}
      participantSummary={participantSummary}
      renderSelectionControl={({ ariaLabel, checked, onClick, visible }) => (
        // Opening above would cover the select-all checkbox for the first row.
        <Tooltip shortcuts={["select"]} side="right">
          <Checkbox
            aria-label={ariaLabel}
            checked={checked}
            className={cn(
              mailCheckboxClassName,
              "transition-opacity",
              visible
                ? "opacity-100"
                : "opacity-0 group-focus-within:opacity-100 group-hover:opacity-100",
            )}
            onClick={onClick}
          />
        </Tooltip>
      )}
      rowRef={rowRef}
      selectionEnabled={selectionEnabled}
      snippet={snippet}
      subject={getConversationSubject(thread.messages)}
    />
  );
});

function OtpCodeButton({ code }: { code: string }) {
  return (
    <button
      aria-label={`Copy code ${code}`}
      className="inline-flex shrink-0 items-center gap-1 rounded-md border border-border bg-background px-1.5 py-px font-medium text-foreground text-xs tabular-nums leading-4 hover:bg-muted"
      onClick={async (event) => {
        event.stopPropagation();
        try {
          await navigator.clipboard.writeText(code);
          toastSuccess({ description: "Code copied" });
        } catch {
          toastError({ description: "Failed to copy code" });
        }
      }}
      // Enter would otherwise bubble to the row and open the thread.
      onKeyDown={(event) => event.stopPropagation()}
      type="button"
    >
      {code}
      <CopyIcon aria-hidden className="size-3 text-muted-foreground" />
    </button>
  );
}

function AccountAvatar({
  account,
}: {
  account: { email: string; image: string | null; name: string | null };
}) {
  const label = account.name || account.email;
  const initial = label.trim().at(0)?.toUpperCase() || "A";

  return (
    <Avatar
      aria-label={`Inbox: ${label}`}
      className="size-5"
      title={account.email}
    >
      <AvatarImage alt="" src={account.image || undefined} />
      <AvatarFallbackColor
        className="text-[10px] font-medium"
        content={initial}
      />
    </Avatar>
  );
}
