import { describe, expect, it } from "vitest";
import {
  conversationLabelIds,
  conversationSummaryToListThread,
} from "./list-thread";

describe("conversationSummaryToListThread", () => {
  it("projects inbox unread labels from roles and flags", () => {
    const thread = conversationSummaryToListThread(summary());
    expect(thread.messages[0]?.labelIds).toEqual([
      "INBOX",
      "UNREAD",
      "Label_project",
    ]);
    expect(thread.messages[0]?.headers.from).toBe("Ada <ada@example.com>");
  });

  it("keeps recipients so draft and sent rows can name the other party", () => {
    const thread = conversationSummaryToListThread(
      summary({
        from: "me@example.com",
        to: "Jordan Example <jordan@example.com>",
        senders: ["me@example.com"],
        roles: ["draft"],
      }),
    );
    expect(thread.messages[0]?.headers).toMatchObject({
      from: "me@example.com",
      to: "Jordan Example <jordan@example.com>",
    });
    expect(thread.messages[0]?.labelIds).toContain("DRAFT");
  });

  it("projects every conversation sender so mixed threads can name both sides", () => {
    const thread = conversationSummaryToListThread(
      summary({
        from: "me@example.com",
        to: "Dana Example <dana@example.com>",
        senders: ["Dana Example <dana@example.com>", "me@example.com"],
      }),
    );
    expect(thread.messages.map((message) => message.headers.from)).toEqual([
      "Dana Example <dana@example.com>",
      "me@example.com",
    ]);
    expect(thread.messages).toHaveLength(2);
  });

  it("attaches combined-account identity when provided", () => {
    const account = {
      id: "acc-2",
      email: "two@example.com",
      name: null,
      image: null,
    };
    const thread = conversationSummaryToListThread(summary(), account);
    expect(thread).toMatchObject({ account });
  });
});

describe("conversationLabelIds", () => {
  it("does not invent unread or starred labels", () => {
    expect(
      conversationLabelIds(
        summary({ unread: false, starred: false, labelIds: [] }),
      ),
    ).toEqual(["INBOX"]);
  });
});

function summary(
  overrides: Partial<Parameters<typeof conversationLabelIds>[0]> = {},
) {
  return {
    key: { accountId: "acc-1", conversationId: "c-1" },
    subject: "Hello",
    preview: "Hi",
    from: "Ada <ada@example.com>",
    to: "me@example.com",
    senders: ["Ada <ada@example.com>"],
    latestMessageAtMs: 1_700_000_000_000,
    unread: true,
    starred: false,
    labelIds: ["Label_project"],
    roles: ["inbox" as const],
    pendingOperationIds: [],
    ...overrides,
  };
}
