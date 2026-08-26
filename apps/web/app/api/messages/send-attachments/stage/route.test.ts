import { NextRequest } from "next/server";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { POST } from "./route";

const staging = vi.hoisted(() => ({
  stageEmailAttachments: vi.fn(),
}));

vi.mock("@/utils/email/email-attachment-staging", () => ({
  ...staging,
  EmailAttachmentStageConflictError: class EmailAttachmentStageConflictError extends Error {},
  EmailAttachmentStageUnavailableError: class EmailAttachmentStageUnavailableError extends Error {},
}));
vi.mock("@/utils/middleware", async () => {
  const { createWithEmailAccountTestMiddleware } = await vi.importActual<
    typeof import("@/__tests__/helpers")
  >("@/__tests__/helpers");

  return createWithEmailAccountTestMiddleware({
    auth: {
      userId: "user-1",
      emailAccountId: "account-1",
      email: "user@example.com",
    },
  });
});

describe("POST /api/messages/send-attachments/stage", () => {
  beforeEach(() => vi.clearAllMocks());

  it("passes only the authenticated account context to staging", async () => {
    staging.stageEmailAttachments.mockResolvedValue({ mode: "direct" });

    const response = await post(stageBody());

    await expect(response.json()).resolves.toEqual({ mode: "direct" });
    expect(staging.stageEmailAttachments).toHaveBeenCalledWith({
      emailAccountId: "account-1",
      input: stageBody(),
    });
  });

  it("rejects malformed aggregate metadata before creating intents", async () => {
    const body = stageBody();
    body.attachments[0].size = 20 * 1024 * 1024;

    await expect(post(body)).rejects.toThrow(
      "Attachments must be 10 MB or smaller.",
    );
    expect(staging.stageEmailAttachments).not.toHaveBeenCalled();
  });
});

function post(body: unknown) {
  return POST(
    new NextRequest("http://localhost/api/messages/send-attachments/stage", {
      method: "POST",
      body: JSON.stringify(body),
      headers: { "content-type": "application/json" },
    }),
    { params: Promise.resolve({}) },
  );
}

function stageBody() {
  return {
    mutationId: "41ec6d2b-d0e8-4f75-924a-f6f4e5bab4cf",
    queuedAt: 1_788_000_000_000,
    attachments: [
      {
        id: "attachment-1",
        filename: "notes.txt",
        mimeType: "text/plain",
        size: 5,
        disposition: "attachment" as const,
      },
    ],
  };
}
