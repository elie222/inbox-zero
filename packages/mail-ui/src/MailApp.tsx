import { useEffect, useMemo, useState, type Ref } from "react";
import { useMailboxWindow } from "@inboxzero/mail-react/use-mailbox-window";
import { useConversation } from "@inboxzero/mail-react/use-conversation";
import { useMailClient } from "@inboxzero/mail-react/MailEngineProvider";
import type { ConversationKey } from "@inboxzero/mail-core/identities";
import type {
  ConversationQuery,
  ConversationSummary,
} from "@inboxzero/mail-core/queries";
import type { MailUiHost } from "./host";
import { MailMessageBody } from "./MailBody";
import { MailProductFrame } from "./MailProductFrame";
import { MailboxThreadList, MailReaderPane } from "./MailboxSurface";
import {
  MailMessageStack,
  MailReaderSurface,
  MailReaderToolbar,
} from "./MailReaderSurface";
import { MailThreadRow } from "./MailThreadRow";

type MailAccountSummary = {
  id: string;
  email?: string | null;
  name?: string | null;
};

export function MailApp({
  accountIds,
  accounts,
  host,
}: {
  accountIds: string[];
  accounts?: MailAccountSummary[];
  host: MailUiHost;
}) {
  const client = useMailClient();
  const accountList = useMemo(
    () =>
      accountIds.map((id) => ({
        id,
        email: accounts?.find((account) => account.id === id)?.email ?? id,
        name: accounts?.find((account) => account.id === id)?.name ?? null,
      })),
    [accountIds, accounts],
  );
  const [activeAccountId, setActiveAccountId] = useState(accountIds[0] ?? "");
  const [selected, setSelected] = useState<ConversationKey | null>(null);
  const [readerPage, setReaderPage] = useState<{
    key: string;
    cursors: Array<string | null>;
  }>({ key: "", cursors: [null] });
  const selectedKey = selected ? keyString(selected) : "";
  const cursors = readerPage.key === selectedKey ? readerPage.cursors : [null];
  const [search, setSearch] = useState("");
  const query: ConversationQuery = useMemo(
    () => ({
      accountIds: activeAccountId ? [activeAccountId] : accountIds,
      predicate: search
        ? {
            kind: "text",
            field: "any",
            value: search,
            match: "phrase",
          }
        : { kind: "role", role: "inbox" },
      order: "newest_first",
      pageSize: 50,
      after: null,
    }),
    [accountIds, activeAccountId, search],
  );
  const mailbox = useMailboxWindow(query, {
    enabled: query.accountIds.length > 0,
  });
  const conversation = useConversation(selected, {
    after: cursors.at(-1) ?? null,
    pageSize: 50,
  });
  const conversations = mailbox.data?.conversations ?? [];

  useEffect(() => {
    for (const message of conversation.data?.messages ?? []) {
      if (message.content.status === "available") continue;
      client.ensureMessageContent(message.key).catch(() => undefined);
    }
  }, [client, conversation.data]);

  useEffect(() => {
    if (!query.accountIds.length) return;
    client.requestSync(query.accountIds).catch(() => undefined);
  }, [client, query.accountIds]);

  useEffect(() => {
    if (!activeAccountId && accountIds[0]) setActiveAccountId(accountIds[0]);
  }, [accountIds, activeAccountId]);

  const sidebar = (
    <aside style={styles.sidebar}>
      <div style={styles.brand}>Inbox Zero</div>
      {host.compose ? (
        <button
          style={styles.primaryButton}
          type="button"
          onClick={() => host.compose?.()}
        >
          Compose
        </button>
      ) : null}
      <button
        style={styles.navButton}
        type="button"
        onClick={() => setSearch("")}
      >
        Inbox
      </button>
      <div style={styles.sidebarHeading}>Accounts</div>
      {accountList.map((account) => (
        <button
          key={account.id}
          style={
            account.id === activeAccountId
              ? styles.activeAccountButton
              : styles.accountButton
          }
          type="button"
          onClick={() => {
            setActiveAccountId(account.id);
            setSelected(null);
            host.openAccount?.(account.id);
          }}
        >
          <span style={styles.accountName}>
            {account.name || account.email || account.id}
          </span>
          {account.email && account.email !== account.id ? (
            <span style={styles.accountEmail}>{account.email}</span>
          ) : null}
        </button>
      ))}
      <button
        style={styles.navButton}
        type="button"
        onClick={() => host.openSettings()}
      >
        Settings
      </button>
    </aside>
  );

  return (
    <MailProductFrame
      className="mail-product-frame"
      bodyClassName="mail-product-body"
      sidebarClassName="mail-product-sidebar"
      style={styles.frame}
      bodyStyle={styles.body}
      sidebar={sidebar}
    >
      <section aria-label="Mailbox" style={styles.listPane}>
        <header style={styles.toolbar}>
          <label style={styles.searchLabel}>
            Search
            <input
              aria-label="Search"
              style={styles.searchInput}
              value={search}
              onChange={(event) => setSearch(event.target.value)}
            />
          </label>
          <button
            style={styles.secondaryButton}
            type="button"
            disabled={query.accountIds.length === 0}
            onClick={() =>
              client.requestSync(query.accountIds).catch(() => undefined)
            }
          >
            Sync
          </button>
        </header>
        <StatusLine mailbox={mailbox} />
        <MailboxThreadList
          className="mail-thread-list"
          emptyMessage="No emails in this view"
          focusedIndex={Math.max(
            0,
            conversations.findIndex(
              (item) =>
                selected &&
                item.key.accountId === selected.accountId &&
                item.key.conversationId === selected.conversationId,
            ),
          )}
          getGroupLabel={(item) => groupLabel(item.latestMessageAtMs)}
          getKey={conversationKeyString}
          isLoadingMore={mailbox.isLoadingMore}
          isSelected={(key) => key === (selected ? keyString(selected) : null)}
          items={conversations}
          listClassName="mail-conversation-list"
          listKey={`${activeAccountId}:${search}`}
          listStyle={styles.conversationList}
          loadMoreStyle={styles.loadMore}
          onLoadMore={mailbox.loadMore}
          onOpen={(index) => {
            const item = conversations[index];
            if (item) setSelected(item.key);
          }}
          onSelectRangeTo={() => undefined}
          onToggleSelect={(index) => {
            const item = conversations[index];
            if (item) setSelected(item.key);
          }}
          renderItem={(row) => (
            <ConversationListRow
              item={row.item}
              key={row.rowKey}
              onArchive={() => {
                archiveConversation(client, row.item.key)
                  .then((accepted) => {
                    if (
                      accepted &&
                      selected &&
                      keyString(selected) === row.rowKey
                    ) {
                      setSelected(null);
                    }
                  })
                  .catch(() => undefined);
              }}
              onMarkRead={() => setRead(client, row.item.key, true)}
              onOpen={() => setSelected(row.item.key)}
              rowRef={row.rowRef}
              selected={row.isSelected}
            />
          )}
          scrollClassName="mail-thread-list-scroll"
          scrollStyle={styles.listScroll}
          selectedCount={selected ? 1 : 0}
          selectionEnabled={false}
          showLoadMore={mailbox.canLoadMore}
        />
      </section>
      <MailReaderPane
        bodyStyle={styles.emptyReader}
        className="mail-reader-pane"
        empty="Select an email to read it."
        error={
          conversation.error
            ? "This conversation could not be loaded."
            : undefined
        }
        loading={conversation.status === "loading"}
        selected={Boolean(selected)}
        style={styles.readerPane}
      >
        <ConversationReader
          conversation={conversation}
          onNextPage={() => {
            const nextPage = conversation.data?.nextPage;
            if (nextPage)
              setReaderPage({
                key: selectedKey,
                cursors: [...cursors, nextPage],
              });
          }}
          onPreviousPage={
            cursors.length > 1
              ? () =>
                  setReaderPage({
                    key: selectedKey,
                    cursors: cursors.slice(0, -1),
                  })
              : undefined
          }
          onRefresh={() => {
            if (selected)
              client.requestSync([selected.accountId]).catch(() => undefined);
          }}
          onArchive={() => {
            if (!selected) return;
            archiveConversation(client, selected)
              .then((accepted) => {
                if (accepted) setSelected(null);
              })
              .catch(() => undefined);
          }}
          onBack={() => setSelected(null)}
          onMarkRead={(read) => {
            if (selected)
              setRead(client, selected, read).catch(() => undefined);
          }}
        />
      </MailReaderPane>
    </MailProductFrame>
  );
}

function ConversationListRow({
  item,
  onArchive,
  onMarkRead,
  onOpen,
  rowRef,
  selected,
}: {
  item: ConversationSummary;
  onArchive: () => void;
  onMarkRead: () => void;
  onOpen: () => void;
  rowRef?: Ref<HTMLDivElement>;
  selected: boolean;
}) {
  return (
    <MailThreadRow
      actions={
        <div style={styles.rowActions}>
          <button
            type="button"
            onClick={(event) => {
              event.stopPropagation();
              onArchive();
            }}
          >
            Archive
          </button>
          <button
            type="button"
            onClick={(event) => {
              event.stopPropagation();
              onMarkRead();
            }}
          >
            Mark as read
          </button>
        </div>
      }
      date={formatDate(item.latestMessageAtMs)}
      expandedPreview
      hasAnySelection={false}
      index={0}
      isDraft={false}
      isFocused={false}
      isSelected={selected}
      isStarred={item.starred}
      isUnread={item.unread}
      labels={item.labelIds.slice(0, 2).map((labelId) => (
        <span key={labelId} style={styles.labelChip}>
          {labelId}
        </span>
      ))}
      layout="split"
      messageCount={Math.max(1, item.senders.length)}
      onOpen={onOpen}
      onSelectRangeTo={() => undefined}
      onToggleSelect={() => undefined}
      participantSummary={item.from}
      rowRef={rowRef}
      selectionEnabled={false}
      snippet={item.preview}
      subject={item.subject || "(no subject)"}
    />
  );
}

function StatusLine({
  mailbox,
}: {
  mailbox: ReturnType<typeof useMailboxWindow>;
}) {
  if (mailbox.data?.connection === "blocked_auth") {
    return (
      <p role="status" style={styles.status}>
        Reconnect this account to continue syncing.
      </p>
    );
  }
  if (mailbox.data?.connection === "offline") {
    return (
      <p role="status" style={styles.status}>
        Waiting to sync. Catch-up will retry automatically.
      </p>
    );
  }
  return (
    <p style={styles.status}>
      {mailbox.status === "ready"
        ? `${mailbox.data?.counts.matchingConversations ?? 0} conversations`
        : mailbox.status}
    </p>
  );
}

function ConversationReader({
  conversation,
  onNextPage,
  onPreviousPage,
  onRefresh,
  onArchive,
  onBack,
  onMarkRead,
}: {
  conversation: ReturnType<typeof useConversation>;
  onNextPage: () => void;
  onPreviousPage?: () => void;
  onRefresh: () => void;
  onArchive: () => void;
  onBack: () => void;
  onMarkRead: (read: boolean) => void;
}) {
  if (conversation.status === "loading")
    return <div style={styles.emptyReader}>Loading…</div>;
  if (conversation.error)
    return (
      <div style={styles.emptyReader}>
        This conversation could not be loaded.
      </div>
    );

  const messages = conversation.data?.messages ?? [];
  const header = messages.at(-1);
  const isUnread = messages.some((message) => !message.metadata.read);
  const isStarred = messages.some((message) => message.metadata.starred);

  return (
    <MailReaderSurface
      detailSelectionSettled
      layout="split"
      onRefresh={onRefresh}
      localAvailability={{
        hasMore: Boolean(conversation.data?.nextPage),
        loadingMore: conversation.refreshing,
        loadMore: onNextPage,
        refreshing: conversation.refreshing,
        providerConfirmed:
          Boolean(conversation.data?.coverage.length) &&
          conversation.data!.coverage.every(
            (scope) => scope.metadata === "complete",
          ),
      }}
      renderLoadMoreButton={({ disabled, onClick }) => (
        <button disabled={disabled} onClick={onClick} type="button">
          Next messages
        </button>
      )}
    >
      {onPreviousPage ? (
        <button onClick={onPreviousPage} type="button">
          Previous messages
        </button>
      ) : null}
      <MailReaderToolbar
        isStarred={isStarred}
        isUnread={isUnread}
        labelChips={(header?.metadata.labelIds ?? []).slice(0, 4).map((id) => (
          <span key={id} style={styles.labelChip}>
            {id}
          </span>
        ))}
        onArchive={onArchive}
        onBackToInbox={onBack}
        onMarkRead={() => onMarkRead(true)}
        onMarkUnread={() => onMarkRead(false)}
        subject={header?.metadata.subject || "Conversation"}
      />
      <MailMessageStack
        messages={messages.map((message) => ({
          id: message.key.messageId,
          subject: message.metadata.subject || "(no subject)",
          from: message.metadata.from,
          receivedAtMs: message.metadata.receivedAtMs,
          body:
            message.content.status === "available" ? (
              <MailMessageBody
                html={message.content.html}
                messageId={message.key.messageId}
                text={message.content.text}
              />
            ) : (
              message.metadata.preview || message.content.status
            ),
        }))}
      />
    </MailReaderSurface>
  );
}

async function archiveConversation(
  client: ReturnType<typeof useMailClient>,
  key: ConversationKey,
) {
  const diagnostics = await client.getDiagnostics(key.accountId);
  const admission = await client.submitConversations({
    accountId: key.accountId,
    commandId: crypto.randomUUID(),
    conversations: [key],
    change: { kind: "archive" },
    observedRevision: diagnostics.revision,
  });
  return admission.status !== "rejected";
}

async function setRead(
  client: ReturnType<typeof useMailClient>,
  key: ConversationKey,
  read: boolean,
) {
  const diagnostics = await client.getDiagnostics(key.accountId);
  await client.submitConversations({
    accountId: key.accountId,
    commandId: crypto.randomUUID(),
    conversations: [key],
    change: { kind: "set_read", read },
    observedRevision: diagnostics.revision,
  });
}

function conversationKeyString(item: ConversationSummary) {
  return `${item.key.accountId}:${item.key.conversationId}`;
}

function keyString(key: ConversationKey) {
  return `${key.accountId}:${key.conversationId}`;
}

function groupLabel(ms: number) {
  const date = new Date(ms);
  const now = new Date();
  if (date.toDateString() === now.toDateString()) return "Today";
  const yesterday = new Date(now);
  yesterday.setDate(now.getDate() - 1);
  if (date.toDateString() === yesterday.toDateString()) return "Yesterday";
  return date.toLocaleDateString([], { month: "short", day: "numeric" });
}

function formatDate(ms: number) {
  return new Date(ms).toLocaleDateString([], {
    month: "short",
    day: "numeric",
  });
}

const styles = {
  frame: {
    height: "100vh",
    minHeight: 0,
    display: "flex",
    flexDirection: "column",
    background: "white",
    color: "#111827",
    fontFamily:
      'Inter, ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
  },
  body: {
    minHeight: 0,
    flex: 1,
    display: "flex",
  },
  sidebar: {
    width: 224,
    minWidth: 224,
    borderRight: "1px solid #e5e7eb",
    padding: 12,
    display: "flex",
    flexDirection: "column",
    gap: 8,
    background: "#f8fafc",
  },
  brand: { fontWeight: 700, fontSize: 18, marginBottom: 8 },
  primaryButton: {
    border: 0,
    borderRadius: 10,
    padding: "10px 12px",
    background: "#111827",
    color: "white",
    textAlign: "left",
    cursor: "pointer",
  },
  secondaryButton: {
    border: "1px solid #d1d5db",
    borderRadius: 8,
    padding: "8px 10px",
    background: "white",
    cursor: "pointer",
  },
  navButton: {
    border: 0,
    borderRadius: 8,
    padding: "8px 10px",
    background: "transparent",
    textAlign: "left",
    cursor: "pointer",
  },
  sidebarHeading: {
    marginTop: 12,
    color: "#6b7280",
    fontSize: 12,
    textTransform: "uppercase",
  },
  accountButton: {
    border: 0,
    borderRadius: 8,
    padding: "8px 10px",
    background: "transparent",
    textAlign: "left",
    cursor: "pointer",
    display: "flex",
    flexDirection: "column",
  },
  activeAccountButton: {
    border: 0,
    borderRadius: 8,
    padding: "8px 10px",
    background: "#e0e7ff",
    textAlign: "left",
    cursor: "pointer",
    display: "flex",
    flexDirection: "column",
  },
  accountName: { fontWeight: 600 },
  accountEmail: { color: "#6b7280", fontSize: 12 },
  listPane: {
    width: 390,
    minWidth: 320,
    borderRight: "1px solid #e5e7eb",
    display: "flex",
    flexDirection: "column",
  },
  toolbar: {
    display: "flex",
    gap: 8,
    padding: 12,
    borderBottom: "1px solid #e5e7eb",
    alignItems: "end",
  },
  searchLabel: {
    display: "flex",
    flex: 1,
    flexDirection: "column",
    gap: 4,
    fontSize: 12,
    color: "#6b7280",
  },
  searchInput: {
    border: "1px solid #d1d5db",
    borderRadius: 8,
    padding: "8px 10px",
    fontSize: 14,
  },
  status: {
    margin: 0,
    padding: "8px 12px",
    color: "#6b7280",
    fontSize: 13,
    borderBottom: "1px solid #f3f4f6",
  },
  conversationList: {
    margin: 0,
    padding: 0,
  },
  listScroll: {
    minHeight: 0,
    flex: 1,
    overflow: "auto",
  },
  loadMore: { padding: 16 },
  rowActions: {
    display: "flex",
    flexDirection: "column",
    gap: 4,
    fontSize: 11,
  },
  labelChip: {
    border: "1px solid #dbe3ef",
    borderRadius: 999,
    color: "#475569",
    fontSize: 11,
    padding: "1px 6px",
  },
  readerPane: { minWidth: 0, flex: 1, overflow: "auto", background: "white" },
  emptyReader: {
    height: "100%",
    display: "grid",
    placeItems: "center",
    color: "#6b7280",
  },
} satisfies Record<string, import("react").CSSProperties>;
