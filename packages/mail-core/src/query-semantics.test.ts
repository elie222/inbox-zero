import { describe, expect, it } from "vitest";
import type { EffectiveMessage } from "./query-semantics";
import {
  conversationIsUnread,
  conversationMatchesPredicate,
  messageMatchesPredicate,
} from "./query-semantics";

const inboxUnread: EffectiveMessage = {
  accountId: "a1",
  messageId: "m1",
  conversationId: "c1",
  subject: "Hello",
  preview: "World",
  from: "Ada Lovelace <ada@example.com>",
  to: ["me@example.com"],
  cc: [],
  receivedAtMs: 1000,
  read: false,
  starred: false,
  folderId: "inbox",
  labelIds: ["INBOX"],
  categoryIds: [],
  roles: ["inbox"],
  hasAttachments: false,
  pendingOperationIds: [],
};

const archivedRead: EffectiveMessage = {
  ...inboxUnread,
  messageId: "m2",
  read: true,
  roles: [],
  labelIds: [],
};

describe("messageMatchesPredicate", () => {
  it("requires every clause of an all-predicate on the same message", () => {
    const predicate = {
      kind: "all" as const,
      predicates: [
        { kind: "role" as const, role: "inbox" as const },
        { kind: "read" as const, value: false },
      ],
    };
    expect(messageMatchesPredicate(inboxUnread, predicate)).toBe(true);
    expect(messageMatchesPredicate(archivedRead, predicate)).toBe(false);
    expect(
      conversationMatchesPredicate([inboxUnread, archivedRead], predicate),
    ).toBe(true);
    expect(
      conversationMatchesPredicate(
        [
          { ...inboxUnread, read: true },
          { ...archivedRead, read: false, roles: [] },
        ],
        predicate,
      ),
    ).toBe(false);
  });

  it("matches address and domain filters", () => {
    expect(
      messageMatchesPredicate(inboxUnread, {
        kind: "address",
        field: "from",
        value: "ada@example.com",
        match: "address",
      }),
    ).toBe(true);
    expect(
      messageMatchesPredicate(inboxUnread, {
        kind: "address",
        field: "from",
        value: "example.com",
        match: "domain",
      }),
    ).toBe(true);
    expect(
      messageMatchesPredicate(
        { ...inboxUnread, from: "ada@example.com" },
        {
          kind: "address",
          field: "from",
          value: "ada@example.com",
          match: "address",
        },
      ),
    ).toBe(true);
  });
});

describe("conversation unread count rule", () => {
  it("counts a conversation unread only when a matching message is unread", () => {
    const inbox = { kind: "role" as const, role: "inbox" as const };
    expect(conversationIsUnread([inboxUnread, archivedRead], inbox)).toBe(true);
    expect(conversationIsUnread([{ ...inboxUnread, read: true }], inbox)).toBe(
      false,
    );
  });
});
