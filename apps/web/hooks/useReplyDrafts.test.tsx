// @vitest-environment jsdom

import { act, renderHook, waitFor } from "@testing-library/react";
import type { ReactNode } from "react";
import { SWRConfig } from "swr";
import { describe, expect, it, vi } from "vitest";
import type { StoredReplyDraft } from "@/utils/mail-engine/reply-drafts";
import { useReplyDrafts } from "./useReplyDrafts";

const { getReplyDrafts } = vi.hoisted(() => ({ getReplyDrafts: vi.fn() }));

vi.mock("@/utils/mail-engine/reply-drafts", () => ({
  getReplyDrafts,
  subscribeToReplyDrafts: () => () => {},
}));
vi.mock("@inboxzero/mail-react/MailEngineProvider", () => ({
  useOptionalMailClient: () => ({}),
}));

describe("useReplyDrafts", () => {
  // The thread hides every mailbox draft while the lookup loads, so a new
  // message arriving mid-reply would unmount the draft being typed in.
  it("keeps the loaded drafts while a changed message list is looked up", async () => {
    const draft = { messageId: "first:reply" } as StoredReplyDraft;
    getReplyDrafts.mockResolvedValueOnce([draft]);
    const { result, rerender } = renderHook(
      ({ messageIds }) => useReplyDrafts("account", "thread", messageIds),
      { initialProps: { messageIds: ["first"] }, wrapper },
    );
    await waitFor(() => expect(result.current.isLoading).toBe(false));
    expect(result.current.drafts).toEqual([draft]);

    let resolveNext: (drafts: StoredReplyDraft[]) => void = () => {};
    getReplyDrafts.mockReturnValueOnce(
      new Promise((resolve) => {
        resolveNext = resolve;
      }),
    );
    rerender({ messageIds: ["first", "second"] });

    expect(result.current.isLoading).toBe(false);
    expect(result.current.drafts).toEqual([draft]);

    await act(async () => resolveNext([draft]));
    expect(result.current.drafts).toEqual([draft]);
  });
});

function wrapper({ children }: { children: ReactNode }) {
  return (
    <SWRConfig value={{ provider: () => new Map(), dedupingInterval: 0 }}>
      {children}
    </SWRConfig>
  );
}
