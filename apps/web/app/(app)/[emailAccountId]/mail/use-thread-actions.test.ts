// @vitest-environment jsdom

import { act, renderHook } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { ListThread } from "./types";
import { useThreadActions } from "./use-thread-actions";
import { admissionRejectionCopy } from "@/utils/mail-engine/admission-notice";

const notifications = vi.hoisted(() => ({
  error: vi.fn(),
  success: vi.fn(),
}));
const mail = vi.hoisted(() => ({
  client: {
    cancelOperation: vi.fn(),
    getDiagnostics: vi.fn(),
    submitConversations: vi.fn(),
  },
}));

vi.mock("sonner", () => ({ toast: notifications }));
vi.mock("@/components/Toast", () => ({ toastUndo: vi.fn() }));
vi.mock("@inboxzero/mail-react/MailEngineProvider", () => ({
  useOptionalMailClient: () => mail.client,
}));

describe("useThreadActions", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mail.client.getDiagnostics.mockResolvedValue({ revision: 1 });
    mail.client.submitConversations.mockResolvedValue({ status: "queued" });
    mail.client.cancelOperation.mockResolvedValue({ status: "cancelled" });
  });

  it("archives through the engine with the observed revision", async () => {
    const { result } = renderActions();
    await act(() => result.current.archive(["thread"]));
    expect(mail.client.submitConversations).toHaveBeenCalledWith({
      accountId: "account",
      commandId: expect.any(String),
      conversations: [{ accountId: "account", conversationId: "thread" }],
      change: { kind: "archive" },
      observedRevision: 1,
    });
  });

  it("archives a multi-thread selection as one engine command", async () => {
    const threads = [
      createThread(["INBOX"], "one"),
      createThread(["INBOX"], "two"),
    ];
    const { result } = renderActions({ threads });
    let archived: string[] = [];
    await act(async () => {
      archived = await result.current.archive(threads.map((t) => t.id));
    });
    expect(archived).toHaveLength(2);
    expect(mail.client.submitConversations).toHaveBeenCalledTimes(1);
    expect(mail.client.submitConversations).toHaveBeenCalledWith(
      expect.objectContaining({
        conversations: [
          { accountId: "account", conversationId: "one" },
          { accountId: "account", conversationId: "two" },
        ],
      }),
    );
  });

  it("submits one command per account for a combined inbox selection", async () => {
    const threads = [
      { ...createThread(["INBOX"], "shared"), account: { id: "work" } },
      { ...createThread(["INBOX"], "shared"), account: { id: "home" } },
    ] as unknown as ListThread[];
    const { result } = renderActions({ threads });
    let archived: string[] = [];
    await act(async () => {
      archived = await result.current.archive(["work:shared", "home:shared"]);
    });
    expect(archived).toEqual(["work:shared", "home:shared"]);
    expect(
      mail.client.submitConversations.mock.calls.map(([command]) => ({
        accountId: command.accountId,
        conversations: command.conversations,
      })),
    ).toEqual([
      {
        accountId: "work",
        conversations: [{ accountId: "work", conversationId: "shared" }],
      },
      {
        accountId: "home",
        conversations: [{ accountId: "home", conversationId: "shared" }],
      },
    ]);

    await act(() => result.current.undo());
    expect(
      mail.client.cancelOperation.mock.calls.map(([key]) => key.accountId),
    ).toEqual(["work", "home"]);
  });

  it("undoes an already-running multi-thread archive with one unarchive command", async () => {
    mail.client.cancelOperation.mockResolvedValue({ status: "too_late" });
    const threads = [
      createThread(["INBOX"], "one"),
      createThread(["INBOX"], "two"),
    ];
    const { result } = renderActions({ threads });
    await act(() => result.current.archive(threads.map((t) => t.id)));
    mail.client.submitConversations.mockClear();
    let restored: string[] = [];
    await act(async () => {
      restored = await result.current.undo();
    });
    expect(restored).toHaveLength(2);
    expect(mail.client.cancelOperation).toHaveBeenCalledTimes(1);
    expect(mail.client.submitConversations).toHaveBeenCalledTimes(1);
    expect(mail.client.submitConversations).toHaveBeenCalledWith(
      expect.objectContaining({
        change: { kind: "unarchive" },
        conversations: [
          { accountId: "account", conversationId: "one" },
          { accountId: "account", conversationId: "two" },
        ],
      }),
    );
  });

  it("moves an archived thread to the inbox and undoes it by archiving again", async () => {
    mail.client.cancelOperation.mockResolvedValue({ status: "too_late" });
    const { result } = renderActions({ threads: [createThread(["SENT"])] });
    await act(() => result.current.moveToInbox(["thread"]));
    expect(mail.client.submitConversations).toHaveBeenCalledWith(
      expect.objectContaining({ change: { kind: "unarchive" } }),
    );
    mail.client.submitConversations.mockClear();
    await act(() => result.current.undo());
    expect(mail.client.submitConversations).toHaveBeenCalledWith(
      expect.objectContaining({ change: { kind: "archive" } }),
    );
  });

  it("does not archive a missing row", async () => {
    const { result } = renderActions({ threads: [] });
    await act(() => result.current.archive(["missing-thread"]));
    expect(mail.client.submitConversations).not.toHaveBeenCalled();
    expect(notifications.error).toHaveBeenCalledWith(
      "Couldn't queue archiving",
    );
  });

  it("explains a full command queue instead of a generic archive failure", async () => {
    mail.client.submitConversations.mockResolvedValue({
      status: "rejected",
      code: "queue_full",
    });
    const { result } = renderActions();
    await act(() => result.current.archive(["thread"]));
    expect(notifications.error).toHaveBeenCalledWith(
      admissionRejectionCopy("queue_full"),
    );
  });

  it("cancels an in-flight archive on undo", async () => {
    const { result } = renderActions();
    await act(() => result.current.archive(["thread"]));
    await act(() => result.current.undo());
    expect(mail.client.cancelOperation).toHaveBeenCalledWith({
      accountId: "account",
      operationId: expect.any(String),
    });
  });
});

function renderActions({
  threads = [createThread(["INBOX", "UNREAD"])],
}: {
  threads?: ListThread[];
} = {}) {
  return renderHook(() =>
    useThreadActions({
      emailAccountId: "account",
      threads,
    }),
  );
}

function createThread(labelIds: string[], id = "thread"): ListThread {
  return {
    id,
    messageIds: [`${id}-message`],
    snippet: "snippet",
    plan: undefined,
    plans: [],
    messages: [
      {
        id: `${id}-message`,
        threadId: id,
        snippet: "snippet",
        subject: "Subject",
        date: "0",
        internalDate: "0",
        labelIds,
        headers: { subject: "Subject" },
      },
    ],
  };
}
