import { beforeEach, describe, expect, it, vi } from "vitest";
import { createScopedLogger } from "@/utils/logger";
import { DRAFT_ATTACHMENT_DIRECT_UPLOAD_LIMIT_BYTES } from "@/utils/email/draft-attachment-upload";
import type { OutlookClient } from "@/utils/outlook/client";
import {
  addOutlookDraftAttachment,
  createOutlookDraftAttachmentUploadSession,
  listOutlookDraftAttachments,
  removeOutlookDraftAttachment,
} from "./draft-attachments";

const logger = createScopedLogger("outlook-draft-attachments-test");
const api = vi.fn();
const request = {
  post: vi.fn(),
  get: vi.fn(),
  delete: vi.fn(),
  select: vi.fn(),
};
const client = { getClient: () => ({ api }) } as unknown as OutlookClient;

const smallFile = {
  id: "file-1",
  filename: "notes.txt",
  mimeType: "text/plain",
  size: 5,
  disposition: "attachment" as const,
};

describe("Outlook draft attachments", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    api.mockReturnValue(request);
    request.select.mockReturnValue(request);
  });

  it("posts a small file to the draft as one attachment", async () => {
    request.post.mockResolvedValue({ id: "graph-att-1" });
    const id = await addOutlookDraftAttachment({
      client,
      draftId: "draft-1",
      attachment: { ...smallFile, content: Buffer.from("notes") },
      logger,
    });
    expect(id).toBe("graph-att-1");
    expect(api).toHaveBeenCalledWith("/me/messages/draft-1/attachments");
    expect(request.post).toHaveBeenCalledWith({
      "@odata.type": "#microsoft.graph.fileAttachment",
      name: "notes.txt",
      contentType: "text/plain",
      contentBytes: Buffer.from("notes").toString("base64"),
    });
  });

  it("marks an inline image so the body can reference it", async () => {
    request.post.mockResolvedValue({ id: "graph-att-2" });
    await addOutlookDraftAttachment({
      client,
      draftId: "draft-1",
      attachment: {
        ...smallFile,
        filename: "photo.png",
        mimeType: "image/png",
        disposition: "inline",
        contentId: "photo@inboxzero.local",
        content: Buffer.from("png"),
      },
      logger,
    });
    expect(request.post).toHaveBeenCalledWith(
      expect.objectContaining({
        isInline: true,
        contentId: "photo@inboxzero.local",
      }),
    );
  });

  it("refuses to post a file that needs an upload session", async () => {
    await expect(
      addOutlookDraftAttachment({
        client,
        draftId: "draft-1",
        attachment: {
          ...smallFile,
          size: DRAFT_ATTACHMENT_DIRECT_UPLOAD_LIMIT_BYTES,
          content: Buffer.alloc(DRAFT_ATTACHMENT_DIRECT_UPLOAD_LIMIT_BYTES),
        },
        logger,
      }),
    ).rejects.toThrow("too large");
    expect(request.post).not.toHaveBeenCalled();
  });

  it("opens an upload session for a large file and returns only its URL", async () => {
    request.post.mockResolvedValue({
      uploadUrl: "https://outlook.office.com/upload/session-1",
    });
    const size = DRAFT_ATTACHMENT_DIRECT_UPLOAD_LIMIT_BYTES + 1;
    await expect(
      createOutlookDraftAttachmentUploadSession({
        client,
        draftId: "draft-1",
        attachment: { ...smallFile, size },
        logger,
      }),
    ).resolves.toBe("https://outlook.office.com/upload/session-1");
    expect(api).toHaveBeenCalledWith(
      "/me/messages/draft-1/attachments/createUploadSession",
    );
    expect(request.post).toHaveBeenCalledWith({
      AttachmentItem: {
        attachmentType: "file",
        name: "notes.txt",
        contentType: "text/plain",
        size,
      },
    });
  });

  it("does not open an upload session for a small file", async () => {
    await expect(
      createOutlookDraftAttachmentUploadSession({
        client,
        draftId: "draft-1",
        attachment: smallFile,
        logger,
      }),
    ).rejects.toThrow("small enough");
    expect(request.post).not.toHaveBeenCalled();
  });

  it("treats removing an attachment that is already gone as done", async () => {
    request.delete.mockRejectedValue(
      Object.assign(new Error("Not found"), {
        statusCode: 404,
        code: "ErrorItemNotFound",
      }),
    );
    await expect(
      removeOutlookDraftAttachment({
        client,
        draftId: "draft-1",
        attachmentId: "graph-att-1",
        logger,
      }),
    ).resolves.toBeUndefined();
  });

  it("lists attachments without downloading their bytes", async () => {
    request.get.mockResolvedValue({
      value: [
        {
          id: "graph-att-1",
          name: "photo.png",
          contentType: "image/png",
          size: 10,
          isInline: true,
          contentId: "photo@inboxzero.local",
        },
      ],
    });
    await expect(
      listOutlookDraftAttachments({ client, draftId: "draft-1", logger }),
    ).resolves.toEqual([
      {
        id: "graph-att-1",
        filename: "photo.png",
        mimeType: "image/png",
        size: 10,
        disposition: "inline",
        contentId: "photo@inboxzero.local",
        messageId: "draft-1",
        providerAttachmentId: "graph-att-1",
      },
    ]);
    expect(request.select).toHaveBeenCalledWith(
      expect.not.stringContaining("contentBytes"),
    );
  });
});
