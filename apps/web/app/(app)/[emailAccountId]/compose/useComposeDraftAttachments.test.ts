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

// A send restored for editing keeps its mailbox draft but not the list of
// files on it, so the composer must reopen with the mailbox's files.
it("lists the mailbox draft's files for a restored draft that kept none", async () => {
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
      storedDraft: storedDraft({ providerDraftId: "draft-1", attachments: [] }),
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

it("does not ask the mailbox when the draft has never been saved there", () => {
  const { result } = renderHook(() =>
    useComposeDraftAttachments({
      emailAccountId: "account-1",
      sessionKey: "account-1:thread-1:message-1:reply",
      storedDraft: storedDraft({ attachments: [] }),
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
