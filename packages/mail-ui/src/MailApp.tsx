import { useMemo, useState } from "react";
import { useMailboxView } from "@inboxzero/mail-react/use-mailbox-view";
import { useConversation } from "@inboxzero/mail-react/use-conversation";
import { useMailClient } from "@inboxzero/mail-react/MailEngineProvider";
import type { ConversationQuery } from "@inboxzero/mail-core/queries";
import type { MailUiHost } from "./host";

const EMPTY_CONVERSATION = { accountId: "", conversationId: "" };
const CONVERSATION_PAGE = { after: null, pageSize: 50 };

export function MailApp({
  accountIds,
  host,
}: {
  accountIds: string[];
  host: MailUiHost;
}) {
  const [selected, setSelected] = useState<{
    accountId: string;
    conversationId: string;
  } | null>(null);
  const [search, setSearch] = useState("");
  const query: ConversationQuery = useMemo(
    () => ({
      accountIds,
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
    [accountIds, search],
  );
  const snapshot = useMailboxView(query);
  const client = useMailClient();
  const conversations = snapshot.data?.conversations ?? [];
  const conversation = useConversation(
    selected ?? EMPTY_CONVERSATION,
    CONVERSATION_PAGE,
  );

  return (
    <main>
      <header>
        <button type="button" onClick={() => host.compose()}>
          Compose
        </button>
        <label>
          Search
          <input
            aria-label="Search"
            value={search}
            onChange={(event) => setSearch(event.target.value)}
          />
        </label>
      </header>
      <p>
        {snapshot.status === "ready"
          ? `${snapshot.data?.counts.matchingConversations ?? 0} conversations`
          : snapshot.status}
      </p>
      {snapshot.data?.connection === "blocked_auth" ? (
        <p role="status">
          Reconnect this account to continue syncing.
          <button
            type="button"
            onClick={() => {
              client.requestSync(accountIds).catch(() => undefined);
            }}
          >
            Reconnect
          </button>
        </p>
      ) : null}
      {snapshot.data?.connection === "offline" ? (
        <p role="status">Waiting to sync. Catch-up will retry automatically.</p>
      ) : null}
      <ul aria-label="Conversations">
        {conversations.map((item) => (
          <li key={`${item.key.accountId}:${item.key.conversationId}`}>
            <button type="button" onClick={() => setSelected(item.key)}>
              {item.subject || "(no subject)"}
            </button>
            <button
              type="button"
              onClick={async () => {
                const diagnostics = await client.getDiagnostics(
                  item.key.accountId,
                );
                await client.submitConversations({
                  accountId: item.key.accountId,
                  commandId: crypto.randomUUID(),
                  conversations: [item.key],
                  change: { kind: "archive" },
                  observedRevision: diagnostics.revision,
                });
              }}
            >
              Archive
            </button>
            <button
              type="button"
              onClick={async () => {
                const diagnostics = await client.getDiagnostics(
                  item.key.accountId,
                );
                await client.submitConversations({
                  accountId: item.key.accountId,
                  commandId: crypto.randomUUID(),
                  conversations: [item.key],
                  change: { kind: "set_read", read: true },
                  observedRevision: diagnostics.revision,
                });
              }}
            >
              Mark as read
            </button>
          </li>
        ))}
      </ul>
      {selected ? (
        <article aria-label="Reader">
          {(conversation.data?.messages ?? []).map((message) => (
            <section key={message.key.messageId}>
              <h2>{message.metadata.subject}</h2>
              <p>{message.metadata.from}</p>
              <div>
                {message.content.status === "available"
                  ? (message.content.text ?? message.content.html)
                  : message.content.status}
              </div>
            </section>
          ))}
        </article>
      ) : null}
    </main>
  );
}
