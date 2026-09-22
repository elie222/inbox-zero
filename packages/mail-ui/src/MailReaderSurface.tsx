import type { ReactElement, ReactNode, Ref } from "react";

export type MailReaderToolbarButton = {
  action:
    | "back"
    | "expand_all"
    | "collapse_all"
    | "archive"
    | "mark_read"
    | "mark_unread";
  ariaLabel: string;
  title?: string;
  variant: "ghost" | "outline";
  icon?: ReactNode;
  label?: ReactNode;
  onClick: () => void;
};

export type MailReaderToolbarProps = {
  subject: string;
  isStarred: boolean;
  isUnread: boolean;
  labelChips?: ReactNode[];
  onBackToInbox: () => void;
  onArchive: () => void;
  onMarkRead: () => void;
  onMarkUnread: () => void;
  menu?: ReactNode;
  messageExpansion?: {
    allExpanded: boolean;
    canExpand: boolean;
    onToggleAll: () => void;
  };
  icons?: Partial<Record<MailReaderToolbarButton["action"], ReactNode>>;
  renderButton?: (button: MailReaderToolbarButton) => ReactElement;
  renderActionTooltip?: (
    button: MailReaderToolbarButton,
    children: ReactElement,
  ) => ReactNode;
};

export function MailReaderToolbar({
  subject,
  isStarred,
  isUnread,
  labelChips = [],
  onBackToInbox,
  onArchive,
  onMarkRead,
  onMarkUnread,
  menu,
  messageExpansion,
  icons,
  renderButton = defaultToolbarButton,
  renderActionTooltip = (_button, children) => children,
}: MailReaderToolbarProps) {
  const expansionAction = messageExpansion?.allExpanded
    ? "collapse_all"
    : "expand_all";
  const expansionLabel = messageExpansion?.allExpanded
    ? "Collapse all messages"
    : "Expand all messages";
  const readAction = isUnread ? "mark_read" : "mark_unread";
  const readLabel = isUnread ? "Mark as read" : "Mark as unread";

  const actionButton = (button: MailReaderToolbarButton) =>
    renderActionTooltip(button, renderButton(button));

  return (
    <div className="flex flex-wrap items-start gap-x-4 gap-y-3 pb-3">
      <div className="flex items-center gap-1">
        {renderButton({
          action: "back",
          ariaLabel: "Back to inbox",
          title: "Back to inbox",
          variant: "ghost",
          icon: icons?.back,
          onClick: onBackToInbox,
        })}
      </div>

      <div className="min-w-56 flex-1">
        <div className="flex flex-wrap items-center gap-2">
          <div className="flex min-w-0 items-center gap-2">
            {isStarred && (
              <span
                aria-label="Starred conversation"
                className="size-1.5 shrink-0 rounded-full bg-yellow-400"
                role="img"
                title="Starred conversation"
              />
            )}
            <h1 className="font-title font-medium text-2xl text-foreground leading-tight tracking-tight">
              {subject}
            </h1>
          </div>
          {labelChips}
        </div>
      </div>

      <div
        aria-label="Thread actions"
        className="ml-auto flex flex-wrap items-center gap-1.5"
        role="group"
      >
        {messageExpansion?.canExpand
          ? renderButton({
              action: expansionAction,
              ariaLabel: expansionLabel,
              title: expansionLabel,
              variant: "ghost",
              icon: icons?.[expansionAction],
              onClick: messageExpansion.onToggleAll,
            })
          : null}
        {actionButton({
          action: "archive",
          ariaLabel: "Archive",
          variant: "outline",
          icon: icons?.archive,
          onClick: onArchive,
        })}
        {actionButton({
          action: readAction,
          ariaLabel: readLabel,
          variant: "outline",
          icon: icons?.[readAction],
          onClick: isUnread ? onMarkRead : onMarkUnread,
        })}
        {menu}
      </div>
    </div>
  );
}

export type MailReaderSurfaceProps = {
  layout: "list" | "split";
  detailSelectionSettled: boolean;
  children: ReactNode;
  containerRef?: Ref<HTMLDivElement>;
  sidePanel?: ReactNode;
  localAvailability?: {
    hasMore: boolean;
    loadingMore: boolean;
    loadMore: () => unknown;
    refreshing: boolean;
    providerConfirmed: boolean;
  };
  onRefresh: () => void;
  renderRefreshButton?: (input: {
    disabled: boolean;
    onClick: () => void;
  }) => ReactNode;
  renderLoadMoreButton?: (input: {
    disabled: boolean;
    loading: boolean;
    onClick: () => void;
  }) => ReactNode;
};

export function MailReaderSurface({
  layout,
  detailSelectionSettled,
  children,
  containerRef,
  sidePanel,
  localAvailability,
  onRefresh,
  renderRefreshButton = ({ disabled, onClick }) => (
    <button disabled={disabled} onClick={onClick} type="button">
      Refresh
    </button>
  ),
  renderLoadMoreButton = ({ disabled, loading, onClick }) => (
    <button disabled={disabled} onClick={onClick} type="button">
      {loading ? "Loading messages…" : "Load older messages"}
    </button>
  ),
}: MailReaderSurfaceProps) {
  return (
    <div className="flex min-h-0 min-w-0 flex-1" ref={containerRef}>
      <div
        className="min-h-0 min-w-0 flex-1 overflow-y-auto bg-card"
        data-detail-selection-settled={detailSelectionSettled}
        data-testid="thread-reader"
      >
        <div className={readerMeasure({ layout })}>
          {localAvailability && !localAvailability.providerConfirmed ? (
            <div
              className="mb-3 flex items-center justify-between gap-3 text-muted-foreground text-sm"
              role="status"
            >
              <span>
                {localAvailability.refreshing
                  ? "Checking for more messages…"
                  : "This conversation may be incomplete."}
              </span>
              {renderRefreshButton({
                disabled: localAvailability.refreshing,
                onClick: onRefresh,
              })}
            </div>
          ) : null}
          {localAvailability?.hasMore
            ? renderLoadMoreButton({
                disabled: localAvailability.loadingMore,
                loading: localAvailability.loadingMore,
                onClick: () => localAvailability.loadMore(),
              })
            : null}
          {children}
        </div>
      </div>
      {sidePanel}
    </div>
  );
}

export type MailMessageStackMessage = {
  id: string;
  subject: string;
  from: string;
  receivedAtMs: number;
  body: ReactNode;
};

export function MailMessageStack({
  messages,
  empty = "No messages in this conversation.",
}: {
  messages: MailMessageStackMessage[];
  empty?: ReactNode;
}) {
  if (messages.length === 0) {
    return <div className="text-muted-foreground text-sm">{empty}</div>;
  }
  return (
    <article className="flex flex-col gap-3">
      {messages.map((message) => (
        <section
          className="rounded-lg border border-border p-4"
          key={message.id}
        >
          <h2 className="font-medium text-foreground text-lg">
            {message.subject || "(no subject)"}
          </h2>
          <p className="text-muted-foreground text-sm">{message.from}</p>
          <p className="text-muted-foreground text-xs">
            {new Date(message.receivedAtMs).toLocaleString([], {
              dateStyle: "medium",
              timeStyle: "short",
            })}
          </p>
          <div className="mt-3 whitespace-pre-wrap text-foreground text-sm">
            {message.body}
          </div>
        </section>
      ))}
    </article>
  );
}

function defaultToolbarButton(button: MailReaderToolbarButton) {
  return (
    <button
      aria-label={button.ariaLabel}
      onClick={button.onClick}
      title={button.title}
      type="button"
    >
      {button.icon ?? button.label ?? button.ariaLabel}
    </button>
  );
}

function readerMeasure({ layout }: { layout: "list" | "split" }) {
  if (layout === "split") return "px-2 pt-4 pb-5 sm:px-6 sm:pt-5";
  return "mx-auto w-full max-w-[48rem] px-2 pt-4 pb-5 sm:px-6 sm:pt-5";
}
