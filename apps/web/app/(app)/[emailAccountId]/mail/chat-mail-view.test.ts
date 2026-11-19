import { describe, expect, it } from "vitest";
import { buildChatMailView } from "@/app/(app)/[emailAccountId]/mail/chat-mail-view";

describe("buildChatMailView", () => {
  it("names split labels and lists only selected threads this account can act on", () => {
    const mailView = buildChatMailView({
      emailAccountId: "account-1",
      isAllAccounts: true,
      searchQuery: null,
      scope: null,
      activeSplit: {
        id: "split-1",
        name: "Receipts",
        matchAll: true,
        filters: [{ kind: "LABEL", value: "Label_1" }],
      },
      userLabels: { Label_1: { id: "Label_1", name: "Receipts" } },
      selectedTargets: [
        {
          messages: [{ id: "message-1" }, { id: "draft-1" }],
          selection: { emailAccountId: "account-1", threadId: "thread-1" },
        },
        {
          messages: [{ id: "message-2" }],
          selection: { emailAccountId: "account-2", threadId: "thread-2" },
        },
      ],
      hiddenDraftMessageIds: ["draft-1"],
    });

    expect(mailView).toEqual({
      view: {
        kind: "split",
        name: "Receipts",
        matchAll: true,
        filters: [{ kind: "LABEL", value: "Receipts" }],
      },
      allAccounts: true,
      selectedCount: 2,
      selectedThreads: [{ threadId: "thread-1", messageId: "message-1" }],
    });
  });

  it("describes a search over any split or scope", () => {
    const mailView = buildChatMailView({
      emailAccountId: "account-1",
      isAllAccounts: false,
      searchQuery: "from:bob",
      scope: { labelId: "Label_1", folderId: null, type: null, title: "Work" },
      activeSplit: undefined,
      userLabels: {},
      selectedTargets: [],
      hiddenDraftMessageIds: [],
    });

    expect(mailView.view).toEqual({ kind: "search", query: "from:bob" });
  });
});
