"use client";

import type { ReactNode } from "react";
import {
  ArchiveIcon,
  ArrowLeftIcon,
  MaximizeIcon,
  MinimizeIcon,
  ReplyIcon,
  Trash2Icon,
  UserRoundSearchIcon,
} from "lucide-react";
import { MailLabelChip } from "@/app/(app)/[emailAccountId]/mail/MailLabelChip";
import { Kbd } from "@/components/Kbd";
import type { EmailMessageCellLabel } from "@/components/EmailMessageCellLabels";
import { Button } from "@/components/ui/button";
import { SidebarTrigger } from "@/components/ui/sidebar";
import { getShortcutHint } from "@/lib/shortcuts/registry";

type ReaderToolbarProps = {
  subject: string;
  /** Display name of the other party. Falls back to the address when absent. */
  senderName: string;
  senderEmail: string;
  labels: EmailMessageCellLabel[];
  /**
   * Chips navigate to a label's view and nothing else: a label carries no
   * reason, because several rules — or none at all — can put one on a thread.
   * The "why" is rule-scoped and lives in `menu`.
   */
  labelHref: (labelId: string) => string;
  onRemoveLabel?: (labelId: string) => void;
  isFocusMode: boolean;
  onArchive: () => void;
  onReply: () => void;
  onDelete: () => void;
  onToggleFocusMode: () => void;
  onOpenSenderContext?: () => void;
  /** The ⋯ dropdown, i.e. `ThreadActionsMenu`, composed by the shell. */
  menu?: ReactNode;
};

type ReaderNavigationProps = {
  /** 1-based position of the open thread in the list, for the "N of M" readout. */
  position?: { index: number; total: number };
  onBack: () => void;
  showSidebarToggle?: boolean;
};

export function ReaderNavigation({
  position,
  onBack,
  showSidebarToggle = false,
}: ReaderNavigationProps) {
  return (
    <>
      <div className="h-5" />
      <div className="sticky top-0 z-10 mb-4 flex items-center bg-card">
        {showSidebarToggle ? (
          <div className="flex w-10 shrink-0 justify-end">
            <SidebarTrigger
              name="left-sidebar"
              className="hidden lg:inline-flex"
            />
          </div>
        ) : null}

        <div className="min-w-0 flex-1">
          <div className="mx-auto w-full max-w-[54rem] px-6">
            <div className="-mx-1 flex items-center gap-3 px-1 py-2">
              <Button
                onClick={onBack}
                size="xs-2"
                type="button"
                variant="outline"
              >
                <ArrowLeftIcon className="mr-1.5 size-3.5" />
                Back
                <Kbd className="ml-1.5">{getShortcutHint("backToList")}</Kbd>
              </Button>
              {position ? (
                <span className="font-mono text-muted-foreground text-xs">
                  {`${position.index} of ${position.total}`}
                </span>
              ) : null}
            </div>
          </div>
        </div>

        {showSidebarToggle ? <div className="w-10 shrink-0" /> : null}
      </div>
    </>
  );
}

/**
 * The reader's header: what the thread is, and what you can do to it.
 */
export function ReaderToolbar({
  subject,
  senderName,
  senderEmail,
  labels,
  labelHref,
  onRemoveLabel,
  isFocusMode,
  onArchive,
  onReply,
  onDelete,
  onToggleFocusMode,
  onOpenSenderContext,
  menu,
}: ReaderToolbarProps) {
  const FocusIcon = isFocusMode ? MinimizeIcon : MaximizeIcon;

  return (
    <div>
      <div className="flex flex-wrap items-start gap-x-4 gap-y-3 border-border border-b pb-4">
        <div className="min-w-56 flex-1">
          <h1 className="font-title font-medium text-2xl text-foreground leading-tight tracking-tight">
            {subject}
          </h1>
          <div className="mt-2 flex flex-wrap items-center gap-2">
            {onOpenSenderContext ? (
              <Button
                aria-label={`View public profile for ${senderName}`}
                className="-ml-2 h-7 gap-1.5 px-2"
                onClick={onOpenSenderContext}
                title="View public profile"
                variant="ghost"
              >
                <span className="font-medium text-foreground text-sm">
                  {senderName}
                </span>
                <UserRoundSearchIcon className="size-3.5 text-muted-foreground" />
              </Button>
            ) : (
              <span className="font-medium text-foreground text-sm">
                {senderName}
              </span>
            )}
            {senderEmail && senderEmail !== senderName ? (
              <span className="text-muted-foreground text-sm">
                {senderEmail}
              </span>
            ) : null}
            {labels.map((label) => (
              <MailLabelChip
                color={label.color}
                href={labelHref(label.id)}
                key={label.id}
                name={label.name}
                onRemove={
                  onRemoveLabel ? () => onRemoveLabel(label.id) : undefined
                }
              />
            ))}
          </div>
        </div>

        <div className="ml-auto flex flex-wrap items-center gap-1.5">
          <Button onClick={onArchive} size="xs-2" variant="outline">
            <ArchiveIcon className="mr-1.5 size-3.5" />
            Archive
            <Kbd className="ml-1.5">{getShortcutHint("archive")}</Kbd>
          </Button>
          <Button onClick={onReply} size="xs-2" variant="outline">
            <ReplyIcon className="mr-1.5 size-3.5" />
            Reply
            <Kbd className="ml-1.5">{getShortcutHint("reply")}</Kbd>
          </Button>
          <Button
            aria-label={`Delete (${getShortcutHint("delete")})`}
            className="h-7 w-7 hover:border-destructive/30 hover:bg-destructive/5 hover:text-destructive"
            onClick={onDelete}
            size="icon"
            title={`Delete (${getShortcutHint("delete")})`}
            variant="outline"
          >
            <Trash2Icon className="size-3.5" />
          </Button>
          <Button
            aria-label={`${isFocusMode ? "Exit focus mode" : "Focus mode"} (${getShortcutHint("focusMode")})`}
            aria-pressed={isFocusMode}
            className="h-7 w-7"
            onClick={onToggleFocusMode}
            size="icon"
            title={`${isFocusMode ? "Exit focus mode" : "Focus mode"} (${getShortcutHint("focusMode")})`}
            variant="outline"
          >
            <FocusIcon className="size-3.5" />
          </Button>
          {menu}
        </div>
      </div>
    </div>
  );
}
