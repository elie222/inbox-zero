import type { CSSProperties, MouseEventHandler, ReactNode, Ref } from "react";
import { cx } from "./utils";

export type MailThreadRowSelectionInput = {
  ariaLabel: string;
  checked: boolean;
  visible: boolean;
  onClick: MouseEventHandler;
};

export type MailThreadRowProps = {
  className?: string;
  style?: CSSProperties;
  index: number;
  layout: "list" | "split";
  participantSummary: string;
  subject: ReactNode;
  snippet: ReactNode;
  date: ReactNode;
  labels?: ReactNode[];
  accountLabel?: string;
  accountEmail?: string;
  actions?: ReactNode;
  isUnread: boolean;
  isStarred: boolean;
  isDraft: boolean;
  messageCount: number;
  isFocused: boolean;
  isSelected: boolean;
  hasAnySelection: boolean;
  compact?: boolean;
  expandedPreview?: boolean;
  selectionEnabled?: boolean;
  onOpen: (index: number) => void;
  onToggleSelect: (index: number) => void;
  onSelectRangeTo: (index: number) => void;
  rowRef?: Ref<HTMLDivElement>;
  renderSelectionControl?: (input: MailThreadRowSelectionInput) => ReactNode;
};

export function MailThreadRow({
  className,
  style,
  index,
  layout,
  participantSummary,
  subject,
  snippet,
  date,
  labels = [],
  accountLabel,
  accountEmail,
  actions,
  isUnread,
  isStarred,
  isDraft,
  messageCount,
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
  renderSelectionControl,
}: MailThreadRowProps) {
  const isWide = layout === "list" && !compact;
  const showSelection = isSelected || hasAnySelection;
  const selectionControl =
    selectionEnabled && renderSelectionControl
      ? renderSelectionControl({
          ariaLabel: `Select conversation with ${participantSummary}`,
          checked: isSelected,
          visible: showSelection,
          onClick: (event) => {
            event.stopPropagation();
            if (event.shiftKey) onSelectRangeTo(index);
            else onToggleSelect(index);
          },
        })
      : null;
  const draftMarker = isDraft ? (
    <span className="shrink-0 text-muted-foreground text-sm">Draft</span>
  ) : null;
  const messageCountMarker =
    messageCount > 1 ? (
      <span className="shrink-0 font-normal text-muted-foreground text-xs">
        {messageCount}
      </span>
    ) : null;
  const participantLine = (
    <span className="flex min-w-0 flex-1 items-center gap-1.5">
      {labels.length ? (
        <span
          className="flex min-w-0 max-w-[35%] shrink-0 items-center gap-1 overflow-hidden"
          data-mail-thread-labels
        >
          {labels}
        </span>
      ) : null}
      <span
        className={cx(
          "min-w-0 truncate text-foreground text-sm",
          isUnread && "font-semibold",
        )}
        data-mail-thread-sender
      >
        {participantSummary}
      </span>
      {accountEmail ? (
        <span
          className="min-w-0 max-w-[45%] shrink-0 truncate font-normal text-muted-foreground text-[11px]"
          title={`→ ${accountEmail}`}
          data-mail-thread-recipient
        >
          → {accountEmail}
        </span>
      ) : null}
      {draftMarker}
      {messageCountMarker}
    </span>
  );
  const headline = (
    <>
      <span
        className={cx(
          "truncate whitespace-nowrap text-sm",
          expandedPreview ? "min-w-0" : "max-w-[46%] shrink-0",
          isUnread
            ? "font-semibold text-foreground"
            : "font-normal text-foreground",
        )}
        data-mail-thread-subject
      >
        {subject}
      </span>
    </>
  );

  return (
    <div
      aria-selected={isSelected}
      data-mail-thread-row
      className={cx(
        "group relative flex cursor-pointer border-border/40 border-b outline-none",
        isWide
          ? cx(
              "gap-2.5 py-2 pr-5 pl-3",
              expandedPreview ? "items-start" : "items-center",
            )
          : "items-start gap-2 px-3.5 py-2",
        rowBackground({ isSelected, isFocused }),
        isFocused &&
          "before:absolute before:inset-y-1 before:left-0 before:w-0.5 before:rounded-full before:bg-primary before:content-['']",
        className,
      )}
      onClick={(event) => {
        if (selectionEnabled && event.shiftKey) onSelectRangeTo(index);
        else onOpen(index);
      }}
      onKeyDown={(event) => {
        if (event.key !== "Enter") return;
        event.preventDefault();
        onOpen(index);
      }}
      ref={rowRef}
      style={style}
      role="option"
      tabIndex={isFocused ? 0 : -1}
    >
      {accountLabel ? (
        <span className="sr-only">Inbox: {accountLabel}</span>
      ) : null}
      {isStarred && <span className="sr-only">Starred conversation</span>}
      <span
        className={cx(
          "flex h-3.5 shrink-0 items-center gap-1.5",
          (!isWide || expandedPreview) && "mt-0.5",
        )}
      >
        {selectionControl}
        <span
          aria-hidden
          className="pointer-events-none flex h-1.5 w-2.5 shrink-0 items-center justify-center"
        >
          {isStarred && (
            <span className="relative z-10 size-1.5 shrink-0 rounded-full bg-yellow-400" />
          )}
          {isUnread && (
            <span
              className={cx(
                "size-1.5 shrink-0 rounded-full bg-primary",
                isStarred && "-ml-0.5",
              )}
            />
          )}
        </span>
      </span>

      {isWide ? (
        <>
          <div className="flex w-[28rem] shrink-0 items-center gap-1.5 overflow-hidden whitespace-nowrap">
            {participantLine}
          </div>
          {expandedPreview ? (
            <div className="flex min-w-0 flex-1 flex-col gap-0.5">
              <div className="flex min-w-0 items-center gap-2.5">
                {headline}
              </div>
              <span className="line-clamp-2 text-muted-foreground text-sm">
                {snippet}
              </span>
            </div>
          ) : (
            <div className="flex min-w-0 flex-1 items-center gap-2.5">
              {headline}
              <span className="min-w-0 flex-1 truncate text-muted-foreground text-sm">
                {snippet}
              </span>
            </div>
          )}
          <div className="w-16 shrink-0 text-right">{date}</div>
        </>
      ) : (
        <div className="flex min-w-0 flex-1 flex-col gap-0.5">
          <div className="flex items-center gap-1.5">
            {participantLine}
            <div className="ml-auto shrink-0">{date}</div>
          </div>
          <div
            className={cx(
              "truncate text-sm",
              isUnread
                ? "font-semibold text-foreground"
                : "font-normal text-foreground",
            )}
            data-mail-thread-subject
          >
            {subject}
          </div>
          <div
            className={cx(
              "text-muted-foreground text-xs",
              expandedPreview ? "line-clamp-3" : "truncate",
            )}
          >
            {snippet}
          </div>
        </div>
      )}
      {actions ? <div className="ml-auto shrink-0">{actions}</div> : null}
    </div>
  );
}

function rowBackground({
  isSelected,
  isFocused,
}: {
  isSelected: boolean;
  isFocused: boolean;
}) {
  if (isSelected) return "bg-primary/10";
  if (isFocused) return "bg-primary/5";
  return "bg-background hover:bg-muted/50";
}
