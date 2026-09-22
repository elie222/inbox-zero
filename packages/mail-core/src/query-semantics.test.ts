import { describe, expect, it } from "vitest";
import type { EffectiveMessage } from "./query-semantics";
import {
  conversationIsUnread,
  conversationMatchesPredicate,
  extractTextPredicates,
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

  it("matches Outlook inbox sections without treating them as categories", () => {
    expect(
      messageMatchesPredicate(
        { ...inboxUnread, inboxSection: "focused", categoryIds: [] },
        { kind: "inbox_section", section: "focused" },
      ),
    ).toBe(true);
    expect(
      messageMatchesPredicate(
        { ...inboxUnread, inboxSection: "other", categoryIds: ["focused"] },
        { kind: "inbox_section", section: "focused" },
      ),
    ).toBe(false);
  });

  it("scopes membership predicates to the requested account", () => {
    const predicate = {
      kind: "membership" as const,
      membership: "label" as const,
      id: "shared-id",
      accountId: "a1",
    };
    expect(
      messageMatchesPredicate(
        { ...inboxUnread, accountId: "a1", labelIds: ["shared-id"] },
        predicate,
      ),
    ).toBe(true);
    expect(
      messageMatchesPredicate(
        { ...inboxUnread, accountId: "a2", labelIds: ["shared-id"] },
        predicate,
      ),
    ).toBe(false);
  });
});

describe("extractTextPredicates", () => {
  it("collects nested text clauses for provider search", () => {
    expect(
      extractTextPredicates({
        kind: "all",
        predicates: [
          { kind: "role", role: "inbox" },
          {
            kind: "text",
            field: "any",
            value: "invoice",
            match: "phrase",
          },
        ],
      }),
    ).toEqual([
      { kind: "text", field: "any", value: "invoice", match: "phrase" },
    ]);
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
