import { NextRequest } from "next/server";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { ZodError } from "zod";
import { NewsletterStatus } from "@/generated/prisma/enums";
import { BULK_SENDER_ACTION_LIMIT } from "@/utils/actions/unsubscriber.validation";

const { mockApply, mockEmailProvider } = vi.hoisted(() => ({
  mockApply: vi.fn(),
  mockEmailProvider: { name: "google" },
}));

vi.mock("@/utils/senders/bulk-actions", async () => {
  const actual = await vi.importActual<
    typeof import("@/utils/senders/bulk-actions")
  >("@/utils/senders/bulk-actions");
  return {
    ...actual,
    applySenderBulkActions: mockApply,
  };
});
vi.mock("@/utils/middleware", async () => {
  const { createWithEmailProviderTestMiddleware } = await vi.importActual<
    typeof import("@/__tests__/helpers")
  >("@/__tests__/helpers");

  return createWithEmailProviderTestMiddleware(mockEmailProvider);
});

import { POST } from "./route";

function post(body: unknown) {
  return POST(
    new NextRequest("http://localhost/api/user/senders/bulk", {
      method: "POST",
      body: JSON.stringify(body),
    }),
    {} as never,
  );
}

describe("POST /api/user/senders/bulk", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockApply.mockResolvedValue([
      {
        senderEmail: "news@example.com",
        ok: true,
        status: NewsletterStatus.UNSUBSCRIBED,
      },
      {
        senderEmail: "ok@example.com",
        ok: true,
        status: NewsletterStatus.APPROVED,
      },
    ]);
  });

  it("returns one result per action", async () => {
    const response = await post({
      actions: [
        { senderEmail: "news@example.com", action: "unsubscribe" },
        { senderEmail: "ok@example.com", action: "approved" },
      ],
    });

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({
      results: [
        {
          senderEmail: "news@example.com",
          ok: true,
          status: NewsletterStatus.UNSUBSCRIBED,
        },
        {
          senderEmail: "ok@example.com",
          ok: true,
          status: NewsletterStatus.APPROVED,
        },
      ],
    });
    expect(mockApply).toHaveBeenCalledWith(
      expect.objectContaining({
        emailAccountId: "email-account-1",
        actions: [
          { senderEmail: "news@example.com", action: "unsubscribe" },
          { senderEmail: "ok@example.com", action: "approved" },
        ],
      }),
    );
  });

  it("rejects a batch over the action limit", async () => {
    const actions = Array.from(
      { length: BULK_SENDER_ACTION_LIMIT + 1 },
      (_, index) => ({
        senderEmail: `sender-${index}@example.com`,
        action: "clear" as const,
      }),
    );

    await expect(post({ actions })).rejects.toBeInstanceOf(ZodError);
    expect(mockApply).not.toHaveBeenCalled();
  });

  it("rejects malformed JSON", async () => {
    const response = await POST(
      new NextRequest("http://localhost/api/user/senders/bulk", {
        method: "POST",
        body: "{",
      }),
      {} as never,
    );

    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toEqual({
      error: "Invalid JSON body",
      isKnownError: true,
    });
    expect(mockApply).not.toHaveBeenCalled();
  });
});
