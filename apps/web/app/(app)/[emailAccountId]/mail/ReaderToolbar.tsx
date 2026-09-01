"use client";

import type { ReactNode } from "react";
import {
  ArchiveIcon,
  ArrowLeftIcon,
  MaximizeIcon,
  MinimizeIcon,
  ReplyIcon,
  Trash2Icon,
} from "lucide-react";
import { MailLabelChip } from "@/app/(app)/[emailAccountId]/mail/MailLabelChip";
import { Kbd } from "@/components/Kbd";
import type { EmailMessageCellLabel } from "@/components/EmailMessageCellLabels";
import { Button } from "@/components/ui/button";
import { getShortcutHint } from "@/lib/shortcuts/registry";

type ReaderToolbarProps = {
  subject: string;
  labels: EmailMessageCellLabel[];
  /**
   * Chips navigate to a label's view and nothing else: a label carries no
   * reason, because several rules — or none at all — can put one on a thread.
   * The "why" is rule-scoped and lives in `menu`.
   */
  labelHref: (labelId: string) => string;
  onRemoveLabel?: (labelId: string) => void;
  isFocusMode: boolean;
  onBackToInbox: () => void;
  onArchive: () => void;
  onReply: () => void;
  onDelete: () => void;
  onToggleFocusMode: () => void;
  /** The ⋯ dropdown, i.e. `ThreadActionsMenu`, composed by the shell. */
  menu?: ReactNode;
};

/**
 * The reader's header: what the thread is, and what you can do to it.
 */
export function ReaderToolbar({
  subject,
  labels,
  labelHref,
  onRemoveLabel,
  isFocusMode,
  onBackToInbox,
  onArchive,
  onReply,
  onDelete,
  onToggleFocusMode,
  menu,
}: ReaderToolbarProps) {
  const FocusIcon = isFocusMode ? MinimizeIcon : MaximizeIcon;

  return (
    <div className="flex flex-wrap items-start gap-x-4 gap-y-3 pb-6">
      <Button
        aria-label="Back to inbox"
        className="h-7 w-7"
        onClick={onBackToInbox}
        size="icon"
        title="Back to inbox"
        variant="ghost"
      >
        <ArrowLeftIcon className="size-3.5" />
      </Button>

      <div className="min-w-56 flex-1">
        <div className="flex flex-wrap items-center gap-2">
          <h1 className="font-title font-medium text-2xl text-foreground leading-tight tracking-tight">
            {subject}
          </h1>
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
  );
}
