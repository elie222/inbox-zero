import { describe, expect, it } from "vitest";
import type { Admission, SubmitConversationCommand } from "./commands";
import type { MailClient } from "./engine";
import type { MessageMetadata } from "./messages";
import { withOptimisticChanges } from "./optimistic-client";
import type { ConversationView } from "./ports/mail-store";
import type {
  ConversationSummary,
  MailboxView,
  QueryHandle,
  QuerySnapshot,
} from "./queries";

describe("withOptimisticChanges", () => {
  it("shows a submitted star in open views before the engine answers", async () => {
    const fake = createFakeClient();
    const client = withOptimisticChanges(fake.client);
    const mailbox = client.observeMailbox(QUERY);
    const conversation = client.observeConversation(KEY, PAGE);
    let notifications = 0;
    mailbox.subscribe(() => notifications++);

    const submitted = client.submitConversations(starCommand(true));

    expect(mailbox.getSnapshot().data?.conversations[0].starred).toBe(true);
    expect(mailbox.getSnapshot().data?.conversations[1].starred).toBe(false);
    expect(conversation.getSnapshot().data?.messages[0].metadata.starred).toBe(
      true,
    );
    expect(notifications).toBe(1);
    expect(mailbox.getSnapshot()).toBe(mailbox.getSnapshot());

    fake.publishMailbox(mailboxView({ starred: true }));
    fake.admit({ status: "rejected", code: "queue_full" });
    await submitted;
    expect(mailbox.getSnapshot().data?.conversations[0].starred).toBe(true);
  });

  it("reverts the view when the engine rejects the change", async () => {
    const fake = createFakeClient();
    const client = withOptimisticChanges(fake.client);
    const mailbox = client.observeMailbox(QUERY);

    const submitted = client.submitConversations(starCommand(true));
    expect(mailbox.getSnapshot().data?.conversations[0].starred).toBe(true);

    fake.admit({ status: "rejected", code: "queue_full" });
    await submitted;
    expect(mailbox.getSnapshot().data?.conversations[0].starred).toBe(false);
  });

  it("stops notifying a handle once it is closed", async () => {
    const fake = createFakeClient();
    const client = withOptimisticChanges(fake.client);
    const mailbox = client.observeMailbox(QUERY);
    let notifications = 0;
    mailbox.subscribe(() => notifications++);
    mailbox.close();

    const submitted = client.submitConversations(starCommand(true));
    fake.admit({ status: "rejected", code: "queue_full" });
    await submitted;

    expect(notifications).toBe(0);
  });

  it("keeps the change over engine snapshots published while it is admitted", async () => {
    const fake = createFakeClient();
    const client = withOptimisticChanges(fake.client);
    const mailbox = client.observeMailbox(QUERY);

    const submitted = client.submitConversations({
      ...starCommand(true),
      change: { kind: "set_read", read: true },
    });
    fake.publishMailbox(mailboxView({ unread: true, subject: "Refreshed" }));

    const [summary] = mailbox.getSnapshot().data?.conversations ?? [];
    expect(summary.subject).toBe("Refreshed");
    expect(summary.unread).toBe(false);

    fake.admit({ status: "rejected", code: "queue_full" });
    await submitted;
  });
});

const ACCOUNT_ID = "account-1";
const KEY = { accountId: ACCOUNT_ID, conversationId: "thread-1" };
const QUERY = {
  accountIds: [ACCOUNT_ID],
  predicate: { kind: "mailbox" as const, mailbox: "inbox" as const },
  order: "newest_first" as const,
  pageSize: 50,
  after: null,
};
const PAGE = { after: null, pageSize: 50 };

function starCommand(starred: boolean): SubmitConversationCommand {
  return {
    accountId: ACCOUNT_ID,
    commandId: "command-1",
    conversations: [KEY],
    change: { kind: "set_starred", starred },
    observedRevision: { databaseEpoch: "db", sequence: 1 },
  };
}

function createFakeClient() {
  const mailbox = observable(mailboxView({}));
  const conversation = observable(conversationView());
  let admit: (admission: Admission) => void = () => undefined;
  const client = {
    observeMailbox: () => mailbox.handle,
    observeConversation: () => conversation.handle,
    submitConversations: () =>
      new Promise<Admission>((resolve) => {
        admit = resolve;
      }),
  } as unknown as MailClient;
  return {
    client,
    publishMailbox: mailbox.publish,
    admit: (admission: Admission) => admit(admission),
  };
}

function observable<T>(data: T) {
  let snapshot = readySnapshot(data);
  const listeners = new Set<() => void>();
  const handle: QueryHandle<T> = {
    getSnapshot: () => snapshot,
    subscribe(listener) {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    close: () => listeners.clear(),
  };
  return {
    handle,
    publish(next: T) {
      snapshot = readySnapshot(next);
      for (const listener of listeners) listener();
    },
  };
}

function readySnapshot<T>(data: T): QuerySnapshot<T> {
  return {
    status: "ready",
    revision: { databaseEpoch: "db", sequence: 1 },
    data,
    refreshing: false,
    error: null,
  };
}

function mailboxView(overrides: Partial<ConversationSummary>): MailboxView {
  return {
    conversations: [
      summary({ key: KEY, ...overrides }),
      summary({ key: { accountId: ACCOUNT_ID, conversationId: "thread-2" } }),
    ],
    counts: {
      matchingConversations: 2,
      unreadConversations: 0,
      extent: "local_coverage",
    },
    nextPage: null,
    coverage: [],
  };
}

function summary(
  overrides: Partial<ConversationSummary> & Pick<ConversationSummary, "key">,
): ConversationSummary {
  return {
    subject: "Hello",
    preview: "",
    from: "a@example.com",
    to: "b@example.com",
    senders: [],
    latestMessageAtMs: 0,
    unread: false,
    starred: false,
    hasAttachments: false,
    labelIds: [],
    roles: ["inbox"],
    pendingOperationIds: [],
    ...overrides,
  };
}

function conversationView(): ConversationView {
  const metadata: MessageMetadata = {
    subject: "Hello",
    preview: "",
    from: "a@example.com",
    to: [],
    cc: [],
    receivedAtMs: 0,
    read: true,
    starred: false,
    folderId: null,
    labelIds: [],
    categoryIds: [],
    roles: ["inbox"],
    hasAttachments: false,
  };
  return {
    key: KEY,
    messages: [
      {
        key: { accountId: ACCOUNT_ID, messageId: "message-1" },
        metadata,
        content: { status: "not_requested" },
        pendingOperationIds: [],
      },
    ],
    nextPage: null,
    coverage: [],
  };
}
