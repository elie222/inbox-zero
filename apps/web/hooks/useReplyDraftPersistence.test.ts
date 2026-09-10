// @vitest-environment jsdom

import { act, renderHook } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { useReplyDraftPersistence } from "./useReplyDraftPersistence";
import type { ReplyDraftContent } from "@/utils/email-cache/reply-drafts";

const { save, clear } = vi.hoisted(() => ({
  save: vi.fn(),
  clear: vi.fn(),
}));

vi.mock("@/utils/email-cache/reply-drafts", async (importOriginal) => ({
  ...(await importOriginal<
    typeof import("@/utils/email-cache/reply-drafts")
  >()),
  createReplyDraftWriter: () => ({ save, clear }),
}));

const content: ReplyDraftContent = {
  values: { to: "person@example.com", subject: "Reply" },
  draft: {
    editableHtml: "<p>Keep this draft</p>",
    mode: "rich",
    quotedHtml: "",
    signatureHtml: "",
    unsupported: [],
  },
  preservedBlocks: [],
  attachments: [],
};

describe("useReplyDraftPersistence", () => {
  afterEach(() => {
    vi.useRealTimers();
    vi.clearAllMocks();
  });

  it("retries an unchanged snapshot after a save failure", async () => {
    vi.useFakeTimers();
    save
      .mockRejectedValueOnce(new Error("Storage failed"))
      .mockResolvedValue({});
    const { result } = renderHook(() =>
      useReplyDraftPersistence({
        identity: {
          emailAccountId: "account",
          threadId: "thread",
          messageId: "message",
        },
        getContent: () => content,
      }),
    );

    act(() => result.current.capture());
    await act(() => vi.advanceTimersByTimeAsync(300));
    expect(save).toHaveBeenCalledTimes(1);

    act(() => result.current.capture());
    await act(() => vi.advanceTimersByTimeAsync(300));
    expect(save).toHaveBeenCalledTimes(2);
  });
});
