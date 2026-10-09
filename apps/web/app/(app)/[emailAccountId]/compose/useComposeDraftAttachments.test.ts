// @vitest-environment jsdom
import { renderHook, waitFor } from "@testing-library/react";
import { beforeEach, expect, it, vi } from "vitest";
import type { StoredReplyDraft } from "@/utils/mail-engine/reply-drafts";
import { fetchDraftAttachments } from "./upload-draft-attachment";
import { useComposeDraftAttachments } from "./useComposeDraftAttachments";

vi.mock("./upload-draft-attachment", () => ({
  fetchDraftAttachments: vi.fn(),
  readDraftAttachmentBytes: vi.fn(),
  resolveDraftId: vi.fn(),
}));

beforeEach(() => {
  vi.clearAllMocks();
});

// The mailbox is the truth for files already on the draft.
it("lists the mailbox draft's files for a draft that kept references", async () => {
  vi.mocked(fetchDraftAttachments).mockResolvedValue({
    messageId: "draft-message-1",
    attachments: [
      {
        id: "file-1",
        filename: "report.pdf",
        mimeType: "application/pdf",
        size: 1200,
        disposition: "attachment",
        messageId: "draft-message-1",
        providerAttachmentId: "provider-file-1",
      },
    ],
  });

  const { result } = renderHook(() =>
    useComposeDraftAttachments({
      emailAccountId: "account-1",
      sessionKey: "account-1:thread-1:message-1:reply",
      storedDraft: storedDraft({
        providerDraftId: "draft-1",
        attachments: [
          {
            id: "local-1",
            filename: "report.pdf",
            mimeType: "application/pdf",
            size: 1200,
            disposition: "attachment",
            draftAttachmentId: "file-1",
          },
        ],
      }),
      loadMailboxDraft: false,
      enabled: true,
    }),
  );

  await waitFor(() => expect(result.current.isLoading).toBe(false));
  expect(fetchDraftAttachments).toHaveBeenCalledWith(
    expect.objectContaining({
      emailAccountId: "account-1",
      draftId: "draft-1",
    }),
  );
  expect(result.current.draftId).toBe("draft-1");
  expect(result.current.attachments).toEqual([
    expect.objectContaining({
      filename: "report.pdf",
      draftAttachmentId: "file-1",
      status: "uploaded",
    }),
  ]);
});

// A draft with no files opens at once rather than waiting on the mailbox.
it("does not ask the mailbox for a draft without files", () => {
  const { result } = renderHook(() =>
    useComposeDraftAttachments({
      emailAccountId: "account-1",
      sessionKey: "account-1:thread-1:message-1:reply",
      storedDraft: storedDraft({ providerDraftId: "draft-1", attachments: [] }),
      loadMailboxDraft: false,
      enabled: true,
    }),
  );

  expect(result.current.isLoading).toBe(false);
  expect(result.current.attachments).toEqual([]);
  expect(fetchDraftAttachments).not.toHaveBeenCalled();
});

function storedDraft(
  content: Partial<NonNullable<StoredReplyDraft["content"]>>,
): StoredReplyDraft {
  return {
    emailAccountId: "account-1",
    threadId: "thread-1",
    messageId: "message-1:reply",
    revision: 1,
    updatedAt: 1,
    content: {
      values: { to: "ada@example.com", subject: "Hello" },
      draft: {
        editableHtml: "<p>Hello</p>",
        mode: "original",
        quotedHtml: "",
        signatureHtml: "",
      },
      preservedBlocks: [],
      attachments: [],
      ...content,
    },
  };
}
