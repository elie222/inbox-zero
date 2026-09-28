// @vitest-environment jsdom

import { act, render, renderHook } from "@testing-library/react";
import { useImperativeHandle, useRef, type Ref } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { useReplyDraftPersistence } from "./useReplyDraftPersistence";
import type { ReplyDraftContent } from "@/utils/mail-engine/reply-drafts";

const { save, clear } = vi.hoisted(() => ({
  save: vi.fn(),
  clear: vi.fn(),
}));

vi.mock("@/utils/mail-engine/reply-drafts", async (importOriginal) => ({
  ...(await importOriginal<
    typeof import("@/utils/mail-engine/reply-drafts")
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

  it("reports a failed save to a flush waiting on it", async () => {
    let rejectSave!: (error: Error) => void;
    save.mockReturnValueOnce(
      new Promise((_, reject) => {
        rejectSave = reject;
      }),
    );
    const { result } = renderHook(() =>
      useReplyDraftPersistence({ identity, getContent: () => content }),
    );

    act(() => result.current.capture());
    const inFlight = result.current.flush();
    const waiting = result.current.flush();
    rejectSave(new Error("Draft changed in another tab"));

    await act(async () => {
      await expect(inFlight).resolves.toBe(false);
      await expect(waiting).resolves.toBe(false);
    });
  });

  it("flushes the latest draft when the composer closes before the debounce", async () => {
    vi.useFakeTimers();
    save.mockResolvedValue({});
    const { result, unmount } = renderHook(() =>
      useReplyDraftPersistence({
        identity: {
          emailAccountId: "account",
          threadId: "compose:new-message",
          messageId: "compose:new-message",
        },
        getContent: () => content,
      }),
    );

    act(() => result.current.capture());
    unmount();
    await act(() => vi.advanceTimersByTimeAsync(0));

    expect(save).toHaveBeenCalledWith(content);
  });

  it("reads the editor once per debounced save instead of on every keystroke", async () => {
    vi.useFakeTimers();
    save.mockResolvedValue({});
    const getContent = vi.fn(() => content);
    const { result, unmount } = renderHook(() =>
      useReplyDraftPersistence({ identity, getContent }),
    );

    for (let keystroke = 0; keystroke < 20; keystroke++) {
      act(() => result.current.capture());
    }
    expect(getContent).not.toHaveBeenCalled();

    await act(() => vi.advanceTimersByTimeAsync(300));
    expect(getContent).toHaveBeenCalledOnce();
    expect(save).toHaveBeenCalledOnce();
    unmount();
  });

  it("saves text typed right before the composer closes", async () => {
    vi.useFakeTimers();
    save.mockResolvedValue({});
    let capture!: () => void;
    const { rerender, unmount } = render(
      <Composer text="Hi" onCapture={(next) => (capture = next)} />,
    );
    rerender(
      <Composer
        text="Hi, see you soon"
        onCapture={(next) => (capture = next)}
      />,
    );
    act(() => capture());
    unmount();
    await act(() => vi.advanceTimersByTimeAsync(0));

    expect(save).toHaveBeenCalledExactlyOnceWith(
      expect.objectContaining({
        draft: expect.objectContaining({
          editableHtml: "<p>Hi, see you soon</p>",
        }),
      }),
    );
  });
});

const identity = {
  emailAccountId: "account",
  threadId: "thread",
  messageId: "message",
};

function Composer({
  text,
  onCapture,
}: {
  text: string;
  onCapture: (capture: () => void) => void;
}) {
  const editorRef = useRef<{ getHtml: () => string }>(null);
  const { capture } = useReplyDraftPersistence({
    identity,
    getContent: () =>
      editorRef.current
        ? {
            ...content,
            draft: {
              ...content.draft,
              editableHtml: editorRef.current.getHtml(),
            },
          }
        : undefined,
  });
  onCapture(capture);
  return <Editor ref={editorRef} text={text} />;
}

function Editor({
  ref,
  text,
}: {
  ref: Ref<{ getHtml: () => string }>;
  text: string;
}) {
  useImperativeHandle(ref, () => ({ getHtml: () => `<p>${text}</p>` }), [text]);
  return null;
}
