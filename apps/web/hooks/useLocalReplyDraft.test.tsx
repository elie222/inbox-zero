// @vitest-environment jsdom

import { cleanup, renderHook, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import {
  clearLocalReplyDrafts,
  createReplyDraftWriter,
  type ReplyDraftIdentity,
} from "@/utils/mail-engine/reply-drafts";
import { useLocalReplyDraft } from "./useLocalReplyDraft";

const identity: ReplyDraftIdentity = {
  emailAccountId: "account-1",
  threadId: "thread-1",
  messageId: "outgoing:operation-1:reply",
};

describe("useLocalReplyDraft", () => {
  afterEach(() => {
    cleanup();
    clearLocalReplyDrafts();
  });

  it("keeps the loaded draft when the reply target's message id changes", async () => {
    await createReplyDraftWriter(identity).save({
      values: { to: "person@example.com", subject: "Reply" },
      draft: {
        editableHtml: "<p>Still writing</p>",
        mode: "original",
        quotedHtml: "",
        signatureHtml: "",
      },
      preservedBlocks: [],
      attachments: [],
    });

    const { result, rerender } = renderHook(
      ({ targetMessageId }) =>
        useLocalReplyDraft(
          identity,
          { ...identity, messageId: targetMessageId },
          "reply",
        ),
      { initialProps: { targetMessageId: "outgoing:operation-1" } },
    );
    await waitFor(() => expect(result.current.isLoading).toBe(false));
    const loaded = result.current.draft;
    expect(loaded?.revision).toBe(1);

    // A sent reply's optimistic copy is replaced by the provider's message.
    rerender({ targetMessageId: "provider-message-1" });

    expect(result.current.isLoading).toBe(false);
    expect(result.current.draft).toBe(loaded);
  });
});
