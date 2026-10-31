import { NextRequest } from "next/server";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { createScopedLogger } from "@/utils/logger";
import prisma from "@/utils/__mocks__/prisma";
import { createEmailProvider } from "@/utils/email/provider";
import { EMAIL_ACCOUNT_HEADER } from "@/utils/config";
import { GET } from "./route";

vi.mock("@/utils/prisma");
vi.mock("@/utils/email/provider", () => ({ createEmailProvider: vi.fn() }));
vi.mock("@/utils/middleware", () => ({
  withAuth:
    (_scope: string, handler: (request: NextRequest) => unknown) =>
    (request: NextRequest) => {
      Object.assign(request, {
        auth: { userId: "user-id" },
        logger: createScopedLogger("attachment-test"),
      });
      return handler(request);
    },
}));

const getAttachmentStream = vi.fn();

beforeEach(() => {
  vi.clearAllMocks();
  prisma.emailAccount.findUnique.mockResolvedValue({
    id: "account-id",
    account: { provider: "google" },
  } as never);
  vi.mocked(createEmailProvider).mockResolvedValue({
    getAttachmentStream,
  } as never);
});

describe("attachment download", () => {
  it.each([
    "image/svg+xml",
    "text/html",
    "application/xhtml+xml",
    "image/png",
    "application/pdf",
  ])("streams downloads without trusting the requested %s content type", async (mimeType) => {
    const bytes = new TextEncoder().encode("synthetic attachment bytes");
    getAttachmentStream.mockResolvedValue(
      new ReadableStream({
        start(controller) {
          controller.enqueue(bytes);
          controller.close();
        },
      }),
    );
    const request = attachmentRequest();
    request.nextUrl.searchParams.set("mimeType", mimeType);
    const response = await GET(new NextRequest(request.nextUrl), {} as never);
    expect(response.headers.get("content-type")).toBe(
      "application/octet-stream",
    );
    expect(response.headers.get("content-disposition")).toContain(
      "attachment;",
    );
    expect(new Uint8Array(await response.arrayBuffer())).toEqual(bytes);
  });

  it("checks account ownership before streaming a native browser download", async () => {
    const cancel = vi.fn();
    getAttachmentStream.mockResolvedValue(
      new ReadableStream({
        start(controller) {
          controller.enqueue(new Uint8Array([1, 2, 3]));
        },
        cancel,
      }),
    );
    const request = attachmentRequest();
    const response = await GET(request, {} as never);
    expect(prisma.emailAccount.findUnique).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: "account-id", userId: "user-id" },
      }),
    );
    expect(getAttachmentStream).toHaveBeenCalledWith(
      "message-id",
      "attachment-id",
      request.signal,
    );
    const reader = response.body!.getReader();
    expect((await reader.read()).value).toEqual(new Uint8Array([1, 2, 3]));
    await reader.cancel();
    expect(cancel).toHaveBeenCalled();
    expect(response.headers.get("cache-control")).toBe("private, no-store");
  });

  it("does not create a provider for an account the user does not own", async () => {
    prisma.emailAccount.findUnique.mockResolvedValue(null);
    expect((await GET(attachmentRequest(), {} as never)).status).toBe(403);
    expect(createEmailProvider).not.toHaveBeenCalled();
  });

  it("rejects missing account identity without fetching attachment data", async () => {
    const request = attachmentRequest();
    request.nextUrl.searchParams.delete("emailAccountId");
    expect(
      (await GET(new NextRequest(request.nextUrl), {} as never)).status,
    ).toBe(400);
    expect(createEmailProvider).not.toHaveBeenCalled();
  });

  it("preserves header-based downloads and safely encodes Unicode filenames", async () => {
    getAttachmentStream.mockResolvedValue(
      new ReadableStream({
        start(c) {
          c.close();
        },
      }),
    );
    const request = attachmentRequest('résumé"\r\nInjected: value.pdf');
    request.headers.set(EMAIL_ACCOUNT_HEADER, "header-account");
    const response = await GET(request, {} as never);
    expect(prisma.emailAccount.findUnique).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: "header-account", userId: "user-id" },
      }),
    );
    expect(response.headers.get("content-disposition")).toContain(
      "filename*=UTF-8''r%C3%A9sum%C3%A9",
    );
    expect(response.headers.get("content-disposition")).not.toMatch(/[\r\n]/);
    expect(response.headers.get("x-content-type-options")).toBe("nosniff");
  });
});

function attachmentRequest(filename = "report.pdf") {
  const query = new URLSearchParams({
    emailAccountId: "account-id",
    messageId: "message-id",
    attachmentId: "attachment-id",
    mimeType: "application/pdf",
    filename,
  });
  return new NextRequest(`http://localhost/api/messages/attachment?${query}`);
}
