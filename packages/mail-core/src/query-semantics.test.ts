import { describe, expect, it } from "vitest";
import {
  conversationMatchesPredicate,
  type EffectiveMessage,
} from "./query-semantics";

describe("mailbox predicates", () => {
  it("treats archive as a conversation with no inbox, trash, or spam members", () => {
    expect(
      conversationMatchesPredicate(
        [message({ roles: ["sent"] }), message({ roles: [] })],
        { kind: "mailbox", mailbox: "archive" },
      ),
    ).toBe(true);
    expect(
      conversationMatchesPredicate(
        [message({ roles: ["inbox"] }), message({ roles: ["sent"] })],
        { kind: "mailbox", mailbox: "archive" },
      ),
    ).toBe(false);
  });

  it("matches provider draft-role messages, not local composition drafts", () => {
    expect(
      conversationMatchesPredicate([message({ roles: ["draft"] })], {
        kind: "mailbox",
        mailbox: "drafts",
      }),
    ).toBe(true);
  });

  it("matches snoozed mail until the timestamp elapses", () => {
    expect(
      conversationMatchesPredicate(
        [message({ roles: ["inbox"], snoozedUntilMs: Date.now() + 60_000 })],
        { kind: "mailbox", mailbox: "snoozed" },
      ),
    ).toBe(true);
    expect(
      conversationMatchesPredicate(
        [message({ roles: ["inbox"], snoozedUntilMs: Date.now() - 1 })],
        { kind: "mailbox", mailbox: "snoozed" },
      ),
    ).toBe(false);
  });
});

function message(
  fields: Partial<EffectiveMessage> & { roles: EffectiveMessage["roles"] },
): EffectiveMessage {
  return {
    accountId: "acc-1",
    messageId: "m1",
    conversationId: "c1",
    subject: "Subject",
    preview: "Preview",
    from: "ada@example.com",
    to: ["me@example.com"],
    cc: [],
    receivedAtMs: 1,
    read: false,
    starred: false,
    folderId: "inbox",
    inboxSection: null,
    labelIds: [],
    categoryIds: [],
    hasAttachments: false,
    pendingOperationIds: [],
    ...fields,
  };
}
