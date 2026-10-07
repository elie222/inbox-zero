import { NextRequest } from "next/server";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { NewsletterStatus } from "@/generated/prisma/enums";

const { mockSetStatus, mockArchiveExisting, mockEmailProvider } = vi.hoisted(
  () => ({
    mockSetStatus: vi.fn(),
    mockArchiveExisting: vi.fn(),
    mockEmailProvider: { name: "google" },
  }),
);

vi.mock("@/utils/senders/unsubscribe", () => ({
  setSenderStatusWithAutoArchive: mockSetStatus,
}));
vi.mock("@/utils/senders/archive-existing", () => ({
  archiveExistingSenderMail: mockArchiveExisting,
}));
vi.mock("@/utils/middleware", async () => {
  const { createWithEmailProviderTestMiddleware } = await vi.importActual<
    typeof import("@/__tests__/helpers")
  >("@/__tests__/helpers");

  return createWithEmailProviderTestMiddleware(mockEmailProvider);
});

import { POST } from "./route";

function post(body: unknown) {
  return POST(
    new NextRequest("http://localhost/api/user/senders/status", {
      method: "POST",
      body: JSON.stringify(body),
    }),
    {} as never,
  );
}

describe("POST /api/user/senders/status", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockSetStatus.mockResolvedValue({
      senderEmail: "news@example.com",
      status: NewsletterStatus.AUTO_ARCHIVED,
      autoArchived: true,
    });
    mockArchiveExisting.mockResolvedValue("queued");
  });

  it("leaves existing mail alone unless archiveExisting is set", async () => {
    const response = await post({
      senderEmail: "news@example.com",
      status: NewsletterStatus.AUTO_ARCHIVED,
    });

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({
      senderEmail: "news@example.com",
      status: NewsletterStatus.AUTO_ARCHIVED,
      autoArchived: true,
    });
    expect(mockArchiveExisting).not.toHaveBeenCalled();
  });

  it("archives existing mail when asked and reports whether it was queued", async () => {
    const response = await post({
      senderEmail: "news@example.com",
      status: NewsletterStatus.AUTO_ARCHIVED,
      archiveExisting: true,
    });

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({
      senderEmail: "news@example.com",
      status: NewsletterStatus.AUTO_ARCHIVED,
      autoArchived: true,
      archiveExisting: "queued",
    });
    expect(mockArchiveExisting).toHaveBeenCalledWith(
      expect.objectContaining({
        emailAccountId: "email-account-1",
        senderEmail: "news@example.com",
        ownerEmail: "user@example.com",
        emailProvider: mockEmailProvider,
      }),
    );
  });

  it("rejects archiveExisting unless the sender is being auto-archived", async () => {
    const response = await post({
      senderEmail: "news@example.com",
      status: NewsletterStatus.APPROVED,
      archiveExisting: true,
    });

    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toEqual({
      error: "archiveExisting requires AUTO_ARCHIVED status",
      isKnownError: true,
    });
    expect(mockSetStatus).not.toHaveBeenCalled();
    expect(mockArchiveExisting).not.toHaveBeenCalled();
  });

  it("still sets auto-archive when the backlog archive fails", async () => {
    mockArchiveExisting.mockRejectedValue(new Error("archive failed"));

    await expect(
      post({
        senderEmail: "news@example.com",
        status: NewsletterStatus.AUTO_ARCHIVED,
        archiveExisting: true,
      }),
    ).rejects.toThrow("archive failed");
    expect(mockSetStatus).toHaveBeenCalled();
  });

  it("does not archive existing mail when the status write fails", async () => {
    mockSetStatus.mockRejectedValue(new Error("provider down"));

    await expect(
      post({
        senderEmail: "news@example.com",
        status: NewsletterStatus.AUTO_ARCHIVED,
        archiveExisting: true,
      }),
    ).rejects.toThrow("provider down");
    expect(mockArchiveExisting).not.toHaveBeenCalled();
  });

  it("approves a sender", async () => {
    mockSetStatus.mockResolvedValue({
      senderEmail: "news@example.com",
      status: NewsletterStatus.APPROVED,
      autoArchived: false,
    });

    const response = await post({
      senderEmail: "news@example.com",
      status: NewsletterStatus.APPROVED,
    });

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toMatchObject({
      status: NewsletterStatus.APPROVED,
    });
    expect(mockArchiveExisting).not.toHaveBeenCalled();
  });
});
