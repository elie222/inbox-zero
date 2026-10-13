import { NextRequest } from "next/server";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { createTestLogger } from "@/__tests__/helpers";
import { MAX_DELIVERY_ATTACHMENT_BYTES } from "@/utils/ai/assistant/attachment-delivery";

const { getMessage, getAttachment, createProvider } = vi.hoisted(() => ({
  getMessage: vi.fn(),
  getAttachment: vi.fn(),
  createProvider: vi.fn(),
}));
vi.mock("server-only", () => ({}));
vi.mock("@/utils/email/provider", () => ({
  createEmailProvider: createProvider,
}));
vi.mock("@/utils/api-middleware", () => ({
  withAccountApiKey: (
    _scope: string,
    _permissions: string[],
    handler: unknown,
  ) => handler,
}));
import { GET } from "./route";

describe("assistant attachment download", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    createProvider.mockResolvedValue({ getMessage, getAttachment });
    getMessage.mockResolvedValue({
      id: "message",
      attachments: [
        {
          attachmentId: "file",
          filename: "report.pdf",
          mimeType: "application/pdf",
          size: 4,
        },
      ],
    });
    getAttachment.mockResolvedValue({
      data: Buffer.from("file").toString("base64"),
      size: 4,
    });
  });

  it("downloads original bytes only from the key's mailbox", async () => {
    const response = await GET(request(), { params: Promise.resolve({}) });
    expect(await response.text()).toBe("file");
    expect(createProvider).toHaveBeenCalledWith(
      expect.objectContaining({ emailAccountId: "key-account" }),
    );
    expect(response.headers.get("content-type")).toBe(
      "application/octet-stream",
    );
    expect(response.headers.get("content-disposition")).toContain("report.pdf");
  });

  it("does not fetch an attachment absent from the selected message", async () => {
    getMessage.mockResolvedValue({ id: "message", attachments: [] });
    await expect(
      GET(request(), { params: Promise.resolve({}) }),
    ).rejects.toThrow("Attachment not found");
    expect(getAttachment).not.toHaveBeenCalled();
  });

  it("checks actual byte length even when metadata understates file size", async () => {
    getAttachment.mockResolvedValue({
      data: Buffer.alloc(MAX_DELIVERY_ATTACHMENT_BYTES + 1).toString("base64"),
      size: 4,
    });
    await expect(
      GET(request(), { params: Promise.resolve({}) }),
    ).rejects.toThrow("20 MB");
  });
});

function request() {
  return Object.assign(
    new NextRequest(
      "http://localhost/api/v1/assistant/attachment?messageId=message&attachmentId=file&emailAccountId=other",
    ),
    {
      apiAuth: { emailAccountId: "key-account", provider: "icloud" },
      logger: createTestLogger(),
    },
  );
}
