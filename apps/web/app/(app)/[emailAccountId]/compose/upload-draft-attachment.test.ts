import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { EMAIL_ACCOUNT_HEADER } from "@/utils/config";
import { DRAFT_ATTACHMENT_DIRECT_UPLOAD_LIMIT_BYTES } from "@/utils/email/draft-attachment-upload";
import { uploadDraftAttachment } from "./upload-draft-attachment";

const startUpload = vi.hoisted(() => vi.fn());
vi.mock("@/utils/actions/draft-attachments", () => ({
  startDraftAttachmentUploadAction: startUpload,
  removeDraftAttachmentAction: vi.fn(),
}));

const fetchMock = vi.fn();
const largeSize = DRAFT_ATTACHMENT_DIRECT_UPLOAD_LIMIT_BYTES + 10;

describe("uploadDraftAttachment", () => {
  beforeEach(() => {
    vi.resetAllMocks();
    vi.stubGlobal("fetch", fetchMock);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("sends a small file to our server in one request", async () => {
    fetchMock.mockResolvedValue(
      Response.json({
        attachmentId: "file-1",
        messageId: "message-2",
        attachments: [],
      }),
    );
    const result = await uploadDraftAttachment({
      emailAccountId: "account-1",
      draftId: "draft-1",
      file: new Blob(["notes"]),
      attachment: metadata(5),
    });
    expect(result.attachmentId).toBe("file-1");
    expect(startUpload).not.toHaveBeenCalled();
    const [url, init] = fetchMock.mock.calls[0]!;
    expect(url).toMatch(/^\/api\/user\/drafts\/draft-1\/attachments\?/);
    expect(new Headers(init.headers).get(EMAIL_ACCOUNT_HEADER)).toBe(
      "account-1",
    );
  });

  it("uploads a large Outlook file straight to Microsoft without our credentials", async () => {
    startUpload.mockResolvedValue({
      data: {
        type: "provider-url",
        uploadUrl: "https://outlook.office.com/upload/session-1",
        chunkBytes: 4 * 1024 * 1024,
      },
    });
    const existing = listedAttachment("forwarded-1");
    fetchMock
      .mockResolvedValueOnce(
        Response.json({ messageId: "draft-1", attachments: [existing] }),
      )
      .mockResolvedValueOnce(new Response(null, { status: 201 }))
      .mockResolvedValueOnce(
        Response.json({
          messageId: "draft-1",
          attachments: [existing, listedAttachment("graph-att-1")],
        }),
      );
    const result = await uploadDraftAttachment({
      emailAccountId: "account-1",
      draftId: "draft-1",
      file: new Blob([new Uint8Array(largeSize)]),
      attachment: metadata(largeSize),
    });
    expect(result).toMatchObject({
      attachmentId: "graph-att-1",
      messageId: "draft-1",
    });
    const [url, init] = fetchMock.mock.calls[1]!;
    expect(url).toBe("https://outlook.office.com/upload/session-1");
    const headers = new Headers(init.headers);
    expect(headers.get("authorization")).toBeNull();
    expect(headers.get(EMAIL_ACCOUNT_HEADER)).toBeNull();
    expect(headers.get("content-range")).toBe(
      `bytes 0-${largeSize - 1}/${largeSize}`,
    );
  });

  it("fills a Gmail template with the file and uploads it through our proxy", async () => {
    const head =
      'Content-Type: multipart/mixed; boundary="b"\r\n\r\n--b\r\nContent-Type: text/plain\r\n\r\nBody\r\n--b\r\nContent-Type: application/octet-stream; name=big.bin\r\nContent-Disposition: attachment; filename=big.bin\r\nContent-Transfer-Encoding: base64\r\n\r\n';
    const tail = "\r\n--b--\r\n";
    const encodedLength = Math.ceil(largeSize / 3) * 4;
    const totalBytes =
      head.length +
      encodedLength +
      2 * (Math.ceil(encodedLength / 76) - 1) +
      tail.length;
    startUpload.mockResolvedValue({
      data: {
        type: "gmail-message",
        uploadId: "upload-1",
        totalBytes,
        chunkBytes: 4 * 1024 * 1024,
        parts: [
          { type: "text", text: head },
          { type: "attachment", attachmentId: "file-1", size: largeSize },
          { type: "text", text: tail },
        ],
      },
    });
    const uploaded: Blob[] = [];
    fetchMock.mockImplementation(async (_url: string, init: RequestInit) => {
      uploaded.push(init.body as Blob);
      const range = new Headers(init.headers).get("content-range")!;
      const end = Number(range.match(/-(\d+)\//)![1]);
      return end + 1 < totalBytes
        ? Response.json({ status: "incomplete", nextOffset: end + 1 })
        : Response.json({
            status: "complete",
            attachmentId: "file-1",
            messageId: "message-2",
            attachments: [],
          });
    });
    const bytes = Uint8Array.from({ length: largeSize }, (_, i) => i % 251);

    const result = await uploadDraftAttachment({
      emailAccountId: "account-1",
      draftId: "draft-1",
      file: new Blob([bytes]),
      attachment: { ...metadata(largeSize), filename: "big.bin" },
    });

    expect(result).toMatchObject({
      attachmentId: "file-1",
      messageId: "message-2",
    });
    expect(
      fetchMock.mock.calls.every(([url]) =>
        String(url).startsWith(
          "/api/user/drafts/draft-1/attachments/uploads/upload-1",
        ),
      ),
    ).toBe(true);
    const message = await new Blob(uploaded).text();
    expect(message.length).toBe(totalBytes);
    expect(message.startsWith(head) && message.endsWith(tail)).toBe(true);
    const encoded = message.slice(head.length, message.length - tail.length);
    expect(
      encoded
        .split("\r\n")
        .every((line, index, lines) =>
          index === lines.length - 1 ? line.length <= 76 : line.length === 76,
        ),
    ).toBe(true);
    expect(
      Buffer.from(encoded.replaceAll("\r\n", ""), "base64").equals(
        Buffer.from(bytes),
      ),
    ).toBe(true);
  });
});

function metadata(size: number) {
  return {
    id: "file-1",
    filename: "notes.txt",
    mimeType: "text/plain",
    size,
    disposition: "attachment" as const,
  };
}

function listedAttachment(id: string) {
  return {
    id,
    filename: `${id}.bin`,
    mimeType: "application/octet-stream",
    size: 10,
    disposition: "attachment",
    messageId: "draft-1",
    providerAttachmentId: id,
  };
}
