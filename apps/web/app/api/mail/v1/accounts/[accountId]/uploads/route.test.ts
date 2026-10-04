import { NextRequest } from "next/server";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { createScopedLogger } from "@/utils/logger";
import { admitAccountUpload } from "@/utils/mail-api/upload-blobs";
import { POST } from "./route";

vi.mock("@/utils/mail-api/upload-blobs", () => ({
  admitAccountUpload: vi.fn(),
}));
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
          logger: createScopedLogger("test"),
        }),
        context,
      ),
}));

describe("inline upload admission", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(admitAccountUpload).mockResolvedValue({
      status: "admitted",
      blobId: "file-1",
    });
  });

  it.each([
    "x".repeat(256),
    "logo id",
    "logo\tid",
    "<logo>",
    "logo\n",
    "logo\0",
  ])("rejects a content ID the composer cannot send before persisting it: %j", async (contentId) => {
    const response = await admit(contentId);
    expect(response.status).toBe(400);
    expect(admitAccountUpload).not.toHaveBeenCalled();
  });

  it.each([
    "logo@example.test",
    "x".repeat(255),
  ])("retains a valid content ID through upload admission: %j", async (contentId) => {
    expect((await admit(contentId)).status).toBe(200);
    expect(admitAccountUpload).toHaveBeenCalledWith(
      "acc-1",
      expect.objectContaining({ disposition: "inline", contentId }),
    );
  });
});

function admit(contentId: string) {
  return POST(
    new NextRequest("http://localhost/api/mail/v1/accounts/acc-1/uploads", {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "X-Email-Account-ID": "acc-1",
      },
      body: JSON.stringify({
        protocolVersion: 1,
        requestId: "request-1",
        session: { accountId: "acc-1", generation: "generation-1" },
        uploadId: "file-1",
        sizeBytes: 4,
        checksum: "checksum",
        filename: "logo.png",
        contentType: "image/png",
        disposition: "inline",
        contentId,
      }),
    }),
    { params: Promise.resolve({ accountId: "acc-1" }) },
  );
}
