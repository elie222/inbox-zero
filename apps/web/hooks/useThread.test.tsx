// @vitest-environment jsdom

import { renderHook, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { ConversationView } from "@inboxzero/mail-core/ports/mail-store";
import type { QuerySnapshot } from "@inboxzero/mail-core/queries";
import { useThread } from "./useThread";

const mail = vi.hoisted(() => ({
  client: {
    observeConversation: vi.fn(),
    ensureMessageContent: vi.fn(),
    requestSync: vi.fn(),
  },
}));

vi.mock("@inboxzero/mail-react/MailEngineProvider", () => ({
  useOptionalMailClient: () => mail.client,
}));
vi.mock("@/providers/EmailAccountProvider", () => ({
  useAccount: () => ({ emailAccountId: "account" }),
}));

describe("useThread", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mail.client.ensureMessageContent.mockResolvedValue({ status: "scheduled" });
    mail.client.requestSync.mockResolvedValue({ status: "scheduled" });
  });

  it("projects an engine conversation onto the reader thread", async () => {
    const snapshot = readySnapshot(view());
    mail.client.observeConversation.mockReturnValue(handle(snapshot));
    const { result } = renderHook(() =>
      useThread({ id: "c-1" }, { includeDrafts: true, localMail: true }),
    );
    await waitFor(() => expect(result.current.data?.thread.id).toBe("c-1"));
    expect(result.current.data?.thread.messages[0]?.textPlain).toBe("Hi there");
    expect(result.current.isLoading).toBe(false);
    expect(result.current.localAvailability?.missingBodyIds.size).toBe(0);
  });

  it("requests missing bodies and reports them as unavailable", async () => {
    const conversation = view({
      messages: [
        message({
          content: { status: "not_requested" },
        }),
      ],
    });
    mail.client.observeConversation.mockReturnValue(
      handle(readySnapshot(conversation)),
    );
    const { result } = renderHook(() => useThread({ id: "c-1" }));
    await waitFor(() =>
      expect(result.current.localAvailability?.missingBodyIds.has("m-1")).toBe(
        true,
      ),
    );
    expect(mail.client.ensureMessageContent).toHaveBeenCalledWith({
      accountId: "account",
      messageId: "m-1",
    });
  });

  it("does not load a reader without a thread id", () => {
    const { result } = renderHook(() => useThread({ id: null }));
    expect(result.current.data).toBeUndefined();
    expect(result.current.isLoading).toBe(false);
    expect(mail.client.observeConversation).not.toHaveBeenCalled();
  });
});

function handle(snapshot: QuerySnapshot<ConversationView>) {
  return {
    getSnapshot: () => snapshot,
    subscribe: (listener: () => void) => {
      listener();
      return () => undefined;
    },
    close: () => undefined,
  };
}

function readySnapshot(
  data: ConversationView,
): QuerySnapshot<ConversationView> {
  return {
    status: "ready",
    revision: { databaseEpoch: "epoch", sequence: 1 },
    data,
    refreshing: false,
    error: null,
  };
}

function view(overrides: Partial<ConversationView> = {}): ConversationView {
  return {
    key: { accountId: "account", conversationId: "c-1" },
    messages: [message()],
    nextPage: null,
    coverage: [
      {
        accountId: "account",
        scopeId: "account",
        metadata: "complete",
        content: "partial",
        indexedContent: "partial",
        lastCompletedSyncAtMs: 1,
      },
    ],
    ...overrides,
  };
}

function message(
  overrides: Partial<ConversationView["messages"][number]> = {},
): ConversationView["messages"][number] {
  return {
    key: { accountId: "account", messageId: "m-1" },
    metadata: {
      subject: "Hello",
      preview: "Hi there",
      from: "Ada <ada@example.com>",
      to: ["user@example.com"],
      cc: [],
      receivedAtMs: 1_700_000_000_000,
      read: false,
      starred: false,
      folderId: null,
      labelIds: [],
      categoryIds: [],
      roles: ["inbox"],
      hasAttachments: false,
    },
    content: { status: "available", html: null, text: "Hi there" },
    pendingOperationIds: [],
    ...overrides,
  };
}
