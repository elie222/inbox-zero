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

function createThread(labelIds: string[]): ListThread {
  return {
    id: "thread",
    messageIds: ["message-one", "message-two"],
    snippet: "snippet",
    plan: undefined,
    plans: [],
    messages: [
      {
        id: "message-one",
        threadId: "thread",
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
