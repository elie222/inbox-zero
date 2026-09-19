import { NextRequest } from "next/server";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { createScopedLogger } from "@/utils/logger";
import { GET } from "./route";

vi.mock("server-only", () => ({}));

const getAttachmentStream = vi.fn();

vi.mock("@/utils/middleware", () => ({
  withEmailProvider:
    (
      _name: string,
      handler: (
        request: NextRequest & Record<string, unknown>,
        context: { params: Promise<{ accountId: string }> },
      ) => Promise<Response>,
    ) =>
    (
      request: NextRequest,
      context: { params: Promise<{ accountId: string }> },
    ) =>
      handler(
        Object.assign(request, {
          auth: { emailAccountId: "acc-1", userId: "user-1" },
          emailProvider: {
            name: "google",
            localMailSyncStrategy: "history",
            getAttachmentStream,
          },
          logger: createScopedLogger("test"),
        }),
        context,
      ),
}));

describe("GET /attachment-content", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("cancels the provider stream when the client aborts", async () => {
    const cancel = vi.fn();
    getAttachmentStream.mockResolvedValue(
      new ReadableStream({
        start(controller) {
          controller.enqueue(new Uint8Array([1, 2, 3]));
        },
        cancel,
      }),
    );
    const response = await GET(
      new NextRequest(
        "http://localhost/api/mail/v1/accounts/acc-1/attachment-content?messageId=m1&attachmentId=a1",
      ),
      { params: Promise.resolve({ accountId: "acc-1" }) } as never,
    );
    expect(response.headers.get("content-type")).toBe(
      "application/octet-stream",
    );
    const reader = response.body!.getReader();
    expect((await reader.read()).value).toEqual(new Uint8Array([1, 2, 3]));
    await reader.cancel();
    expect(cancel).toHaveBeenCalled();
  });

  it("returns not_found for a missing provider attachment", async () => {
    getAttachmentStream.mockRejectedValue(
      Object.assign(new Error("Unable to stream attachment"), { status: 404 }),
    );
    const response = await GET(
      new NextRequest(
        "http://localhost/api/mail/v1/accounts/acc-1/attachment-content?messageId=missing&attachmentId=a1",
      ),
      { params: Promise.resolve({ accountId: "acc-1" }) } as never,
    );
    expect(response.status).toBe(404);
    await expect(response.json()).resolves.toMatchObject({
      error: { code: "not_found", retryable: false },
    });
  });
});
